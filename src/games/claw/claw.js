import Matter from 'matter-js';
import { BASE_ARM, BOXC, CHIPS, CHUTE_R, CLAWS, DENS, FLOOR, H, HOME_Y, KEYS, KIND, KINDS, PIT_L, PIT_R, RAIL, RAR, RC, SHAPE_NAME, SIZES, W, WALL_R, WALL_TOP } from './config.js';
import { boxSVG, shapeIcon, gachaSVG, gachaShapeSVG, gemSVG, clawIcon } from './art.js';

(() => {
  const $ = id => document.getElementById(id);
  const fmt = n => n.toLocaleString('en-US');
  const isMono = () => Casino.theme === '74';
  const rand = () => Casino.rnd(1000000) / 1000000;

  const HOME_X = 42, MAX_X = W - 16, MOVE_MS = 20000;
  // grip state: a squeezed prize is tied to the head by a stiff two-point joint; slipping moves the joint down the pads
  let phiGoal = 0, gripLog = null, hold = null, holdN = 0;
  function holdOn(b) {
    const cons = [-1, 1].map(s => {
      const a = { x: s * 8, y: b.position.y - hub.position.y };
      const wx = hub.position.x + a.x, wy = hub.position.y + a.y;
      const [lx, ly] = rot(wx - b.position.x, wy - b.position.y, -b.angle);
      const c = Constraint.create({ bodyA: hub, pointA: a, bodyB: b, pointB: { x: lx, y: ly }, length: 0, stiffness: .5, damping: .1 });
      c.a0 = a.y; return c;
    });
    Composite.add(world, cons);
    hold = { b, cons, v: 0, slide: 0, rel0: b.position.y - hub.position.y, phiC: ((armL.angle - hub.angle) - (armR.angle - hub.angle)) / 2 }; holdN++;
    if (gripLog) gripLog.push(['on', phase, b.k]);
  }
  function holdOff() {
    if (!hold) return;
    Composite.remove(world, hold.cons);
    // the pads let go: no kick from squeezed-in contacts — the prize keeps the head's motion and passes the fingers
    const b = hold.b;
    Body.setVelocity(b, { x: hub.velocity.x, y: Math.max(b.velocity.y, hub.velocity.y) }); Body.setAngularVelocity(b, 0);
    if (b.collisionFilter.mask !== 0) { b.collisionFilter = { group: 0, category: 0x0040, mask: 0xFFFFFFFF }; b.ghost = 24; }
    if (gripLog) gripLog.push(['off', phase, Math.round(hold.slide)]);
    hold = null;
  }
  // physical tuning (balanced with the built-in simulator; __claw.tune() changes these)
  let gripDbg = null, GRIP_N = 1.5, OPEN_SPREAD = 42, BOX_COUNT = 12, LINK_K = .08, BOX_FRICTION = .9, GRIP_K = .4, MU_MIN = .3, MU_MAX = 1.6, STR_STRONG = .08, STR_MID = .25, TOP_MIN = .7;


  let saved = {}; try { saved = JSON.parse(localStorage.getItem('casino-claw')) || {}; } catch (e) {}
  let price = CHIPS.includes(saved.price) ? saved.price : 100;
  const hist = Array.isArray(saved.hist) ? saved.hist.slice(0, 14) : [];
  const save = () => { try { localStorage.setItem('casino-claw', JSON.stringify({ price, hist, claw: clawSize })); } catch (e) {} };

  const cv = $('clCanvas'), ctx = cv.getContext('2d');
  let scale = 1;
  const bankLed = window.CasinoLED($('clBank'), 8);
  const timeLed = window.CasinoLED($('clTime'), 2);
  const priceLed = window.CasinoLED($('clPrice'), 6);
  const msgEl = $('clMsg');
  const msg = t => { msgEl.textContent = t; };

  /* ---------- physics world (Matter.js) ---------- */
  const { Engine, Bodies, Body, Composite, Constraint, Query, Sleeping, Events } = Matter;
  const engine = Engine.create({ enableSleeping: true, positionIterations: 12, velocityIterations: 10, constraintIterations: 6 });
  engine.gravity.y = 1.15;
  const world = engine.world;
  const SUB = 2, STEP = 1000 / 60 / SUB;
  const wallOpt = { isStatic: true, friction: .9, frictionStatic: 1, restitution: 0 };
  Composite.add(world, [
    Bodies.rectangle((WALL_R + W + 40) / 2, FLOOR + 30, W + 40 - WALL_R, 60, { ...wallOpt, collisionFilter: { category: 0x0008, mask: 0xFFFFFFFF } }), // pit floor (ends exactly at the divider)
    Bodies.rectangle(W + 30, H / 2, 60, H * 3, wallOpt),                                    // right wall
    Bodies.rectangle(-30, H / 2, 60, H * 3, wallOpt),                                       // chute outer wall
    Bodies.rectangle((CHUTE_R + WALL_R) / 2, (WALL_TOP + H + 80) / 2, WALL_R - CHUTE_R, H + 80 - WALL_TOP, wallOpt) // divider
  ]);

  // while the machine is being shaken a guard rises above the divider, so nothing can be jolted into the prize hole
  const guard = Bodies.rectangle((CHUTE_R + WALL_R) / 2, (WALL_TOP + 40) / 2, WALL_R - CHUTE_R + 4, WALL_TOP - 40, { ...wallOpt });
  let guardUp = false;
  const setGuard = on => { if (on === guardUp) return; guardUp = on; if (on) Composite.add(world, guard); else Composite.remove(world, guard); };

  /* ---------- the crane: carriage → rope → heavy head → jointed arms pulled by tendons ---------- */
  const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  const PIVOT = RAIL + 6, HOME_L = 22;
  // collision categories: walls 0x01 · floor 0x08 · boxes 0x20 (0x10 marks the box under the claw — bookkeeping only).
  // Pure 2D: the arms collide with every prize. Only the pit floor is skipped, so arm tips don't scrape it.
  const CAT_BOX = 0x0020, CAT_FOCUS = 0x0010;
  const GRIPPING = new Set(['close', 'lift', 'carry', 'settle']);
  const CLAW_F = { group: -1, category: 0x0002, mask: 0x0001 | CAT_BOX | CAT_FOCUS };
  const HEAD_MASK = 0x0001 | CAT_BOX | CAT_FOCUS;
  const carriage = Bodies.circle(HOME_X, PIVOT, 3, { isStatic: true, collisionFilter: { group: -1, category: 0x0004, mask: 0 } });
  const hub = Bodies.rectangle(HOME_X, PIVOT + HOME_L + 7, 26, 15, { density: .04, friction: .7, frictionAir: .03, restitution: 0, collisionFilter: { group: -1, category: 0x0002, mask: HEAD_MASK } });
  // three claw sizes: the whole arm linkage is scaled, and the open width is set per size
  let clawSize = 'L', ARM_PTS, SHOULDER, TENDON_A = [0, 6], TENDON_P;
  function setGeometry(k) {
    const c = CLAWS[k], f = c.scale;
    clawSize = k;
    ARM_PTS = BASE_ARM.map(([x, y]) => [x * f, y * f]);   // the whole finger is scaled
    SHOULDER = [13 * f, -4 * f]; TENDON_A = [0, 6 * f];      // the head is scaled with it
    TENDON_P = [13 * f, 29 * f];
    OPEN_SPREAD = c.open;                                  // half the opening, at the grip pads
  }
  setGeometry('L');
  const armAngle = (side, phi) => side > 0 ? -phi : phi;     // phi > 0 opens the claw
  function makeArm(side) {
    const parts = [];
    for (let i = 0; i < ARM_PTS.length - 1; i++) {
      const [x1, y1] = ARM_PTS[i], [x2, y2] = ARM_PTS[i + 1];
      const ax = x1 * side, bx = x2 * side, len = Math.hypot(bx - ax, y2 - y1);
      parts.push(Bodies.rectangle((ax + bx) / 2, (y1 + y2) / 2, len + 4, 5, {
        angle: Math.atan2(y2 - y1, bx - ax), density: .016, friction: 1, frictionStatic: 2, restitution: 0, collisionFilter: CLAW_F
      }));
    }
    const body = Body.create({ parts, friction: 1, frictionStatic: 2, frictionAir: .03, restitution: 0, collisionFilter: CLAW_F });
    body.c0 = { x: body.position.x, y: body.position.y };
    body.side = side;
    return body;
  }
  let armL, armR, arms, pins = [], tendons = [];
  const spreadOf = phi => SHOULDER[0] + rot(ARM_PTS[2][0], ARM_PTS[2][1], -phi)[0];
  function phiFor(spread) {
    let lo = -.8, hi = 1.1;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (spreadOf(mid) < spread) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  let PHI_REST, PHI_MOVE, PHI_SHUT, PHI_MIN, PHI_OPEN, PHI_MAX;
  function setPhis() {
    const f = CLAWS[clawSize].scale;
    PHI_REST = phiFor(13 + 2 * f); PHI_MOVE = phiFor(15 + 3 * f); PHI_SHUT = phiFor(4); PHI_MIN = PHI_SHUT - .12;
    PHI_OPEN = phiFor(OPEN_SPREAD); PHI_MAX = PHI_OPEN + .2;
  }
  function poseArm(arm, rel) {                       // put an arm on its shoulder at a hub-relative angle
    const a = hub.angle + rel;
    const [sx, sy] = rot(arm.side * SHOULDER[0], SHOULDER[1], hub.angle);
    const [cx, cy] = rot(arm.c0.x, arm.c0.y, a);
    Body.setAngle(arm, a);
    Body.setPosition(arm, { x: hub.position.x + sx + cx, y: hub.position.y + sy + cy });
    Body.setVelocity(arm, hub.velocity); Body.setAngularVelocity(arm, hub.angularVelocity);
  }
  function tendonLen(side, phi) {
    const [px, py] = rot(side * TENDON_P[0], TENDON_P[1], armAngle(side, phi));
    return Math.hypot(side * SHOULDER[0] + px - TENDON_A[0], SHOULDER[1] + py - TENDON_A[1]);
  }
  function buildArms() {                           // (re)build the arm linkage for the current claw size
    if (arms) Composite.remove(world, [...arms, ...pins, ...tendons]);
    setPhis();
    armL = makeArm(-1); armR = makeArm(1); arms = [armL, armR];
    arms.forEach(a => poseArm(a, armAngle(a.side, PHI_REST)));
    pins = arms.map(arm => {
      const [x, y] = rot(-arm.c0.x, -arm.c0.y, arm.angle);
      return Constraint.create({ bodyA: hub, pointA: { x: arm.side * SHOULDER[0], y: SHOULDER[1] }, bodyB: arm, pointB: { x, y }, length: 0, stiffness: .95, damping: .1 });
    });
    tendons = arms.map(arm => {
      const [x, y] = rot(arm.side * TENDON_P[0] - arm.c0.x, TENDON_P[1] - arm.c0.y, arm.angle);
      return Constraint.create({ bodyA: hub, pointA: { x: TENDON_A[0], y: TENDON_A[1] }, bodyB: arm, pointB: { x, y }, length: tendonLen(arm.side, PHI_REST), stiffness: .3, damping: .1 });
    });
    Composite.add(world, [armL, armR, ...pins, ...tendons]);
  }
  buildArms();
  // two parallel cables (a trapeze): the head swings like a pendulum but stays level
  const CABLE = 9;
  const ropes = [-1, 1].map(s => Constraint.create({ bodyA: carriage, pointA: { x: s * CABLE, y: 0 }, bodyB: hub, pointB: { x: s * CABLE, y: -7 }, length: HOME_L, stiffness: .95, damping: .02 }));
  Composite.add(world, [carriage, hub, ...ropes]);

  const hubTop = (s = 0) => { const [x, y] = rot(s * CABLE, -7 * hubF, hub.angle); return { x: hub.position.x + x, y: hub.position.y + y }; };
  const cableDist = s => { const t = hubTop(s); return Math.hypot(t.x - (carriage.position.x + s * CABLE), t.y - carriage.position.y); };
  const ropeDist = () => Math.max(cableDist(-1), cableDist(1));
  let ropeL = HOME_L, taut = true;
  Events.on(engine, 'beforeUpdate', () => {        // a rope can pull but never push: go slack when the head rests on something
    // both cables share one winch drum: they go slack or taut together (with hysteresis)
    const d = ropeDist();
    if (taut && d < ropeL - 1.2) taut = false; else if (!taut && d > ropeL - .3) taut = true;
    ropes.forEach(r => { r.length = ropeL; r.stiffness = taut ? .95 : 0; });
    // the cable plate keeps the head roughly level: it can tilt, but it is pulled back and can't flip
    Body.setAngularVelocity(hub, hub.angularVelocity * .92 - hub.angle * .012);
    // guide frame: past ~25° of cable swing, sideways motion is braked
    const sw = Math.atan2(hub.position.x - carriage.position.x, Math.max(1, hub.position.y - carriage.position.y));
    if (Math.abs(sw) > .3) Body.setVelocity(hub, { x: hub.velocity.x * (Math.sign(hub.velocity.x) === Math.sign(sw) ? .8 : .97), y: hub.velocity.y });
    for (const b of boxes) if (b.ghost && --b.ghost === 0 && b.collisionFilter.category === 0x0040) b.collisionFilter = { group: 0, category: CAT_BOX, mask: 0xFFFFFFFF };
    for (const b of boxes) if (b.speed > 18) Body.setVelocity(b, { x: b.velocity.x * .7, y: b.velocity.y * .7 });
  });
  // both arms hang off one linkage: couple their swing speeds (soft, velocity-level — no teleporting)
  Events.on(engine, 'afterUpdate', () => {
    const phiL = armL.angle - hub.angle, phiR = -(armR.angle - hub.angle), diff = phiL - phiR;
    const wL = armL.angularVelocity - hub.angularVelocity, wR = -(armR.angularVelocity - hub.angularVelocity), w = (wL + wR) / 2;
    let wl = w - diff * LINK_K, wr = w + diff * LINK_K;
    // hard stops: an arm can't swing past fully-open or fully-shut
    const lim = (p, wv) => p > PHI_MAX ? Math.min(wv, -(p - PHI_MAX) * .5) : p < PHI_MIN ? Math.max(wv, (PHI_MIN - p) * .5) : wv;
    wl = lim(phiL, wl); wr = lim(phiR, wr);
    Body.setAngularVelocity(armL, hub.angularVelocity + wl);
    Body.setAngularVelocity(armR, hub.angularVelocity - wr);
    // if a violent knock still drives an arm past its stop, the stop wins
    for (const [arm, p] of [[armL, phiL], [armR, phiR]]) {
      if (p > PHI_MAX + .08 || p < PHI_MIN - .08 || !isFinite(p)) {
        const c = Math.max(PHI_MIN, Math.min(PHI_MAX, isFinite(p) ? p : PHI_REST));
        poseArm(arm, armAngle(arm.side, c));
      }
    }
    // Coulomb friction at the grip pads (explicit, because Matter's contact friction can't hold a squeezed load):
    // the tendons squeeze with a force N that grows with how far the arms are held open from their target;
    // each pad can carry up to mu·N, so two pads hold a prize while 2·mu·N >= its weight — otherwise it slides.
    gripDbg = null;
    if (GRIPPING.has(phase)) {
      const phiAct = ((armL.angle - hub.angle) - (armR.angle - hub.angle)) / 2;
      const sq = Math.max(0, Math.min(1, (phiAct - phiGoal) / .25));      // how hard the motor is still pulling past the contact
      const mu = armL.friction, g = engine.gravity.y * engine.gravity.scale * STEP * STEP;   // px per step²
      const aL = armWorldPts(armL), aR = armWorldPts(armR);
      if (!hold && sq > .2 && phiAct - phiCmd > .08) {             // the fingers are actually blocked by something
        // force closure: the two fingers must press on the prize from opposite sides (contact normals mostly sideways),
        // not just rest on its top
        const nl = contactNormals(armL), nr = contactNormals(armR);
        for (const [b, ln] of nl) {
          const rn = nr.get(b);
          if (!rn) continue;
         
          if (Math.abs(ln.x) > .45 && Math.abs(rn.x) > .45 && Math.sign(ln.x) !== Math.sign(rn.x)) { holdOn(b); break; }
        }
      }
      if (hold) {
        const b = hold.b;
        const cap = 2 * mu * GRIP_N * sq / b.mass;                 // what the two pads can carry, in units of the prize's weight
        // the prize slides down the pads only while its weight beats the friction
        // (while it still sits on something — during the squeeze — there is nothing to slide: the floor carries it)
        if (phase === 'close') hold.v = 0;
        else hold.v = cap >= 1 ? Math.max(0, hold.v - (cap - 1) * g) : hold.v + (1 - cap) * g;
        hold.slide += hold.v;
        hold.cons.forEach(c => { c.pointA = { x: c.pointA.x, y: c.a0 + hold.slide }; });
        const hookY = Math.max(aL[3][1], aR[3][1]) - hub.position.y;
        // it's gone once its top has slid past the hook tips, or a knock tore it out of the pads
        gripDbg = { sq: +sq.toFixed(2), cap: +cap.toFixed(2), m: +b.mass.toFixed(2), slide: +hold.slide.toFixed(1) };
        if (b.bounds.min.y - hub.position.y > hookY || Math.hypot(b.position.x - hub.position.x, b.position.y - hub.position.y - hold.rel0 - hold.slide) > 28) holdOff();
      }
    } else if (hold) holdOff();
    // the head's underside is a soft stop: a squeezed prize can't ride up into it
    if (hub.collisionFilter.mask === 0) {
      const under = hub.position.y + 7.5 * hubF;
      for (const b of boxes) {
        if (Math.abs(b.position.x - hub.position.x) > b.w / 2 + 13 * hubF) continue;
        const top = b.bounds.min.y;
        if (top < under && b.position.y > hub.position.y) {          // hard stop: a prize can't pass into the head
          Body.setPosition(b, { x: b.position.x, y: b.position.y + (under - top) });
          Body.setVelocity(b, { x: b.velocity.x, y: Math.max(b.velocity.y, hub.velocity.y) });
        }
      }
    }
  });
  function armWorldPts(arm) {
    return ARM_PTS.map(([x, y]) => { const [rx, ry] = rot(arm.side * x - arm.c0.x, y - arm.c0.y, arm.angle); return [arm.position.x + rx, arm.position.y + ry]; });
  }
  function resetClaw(x) {                          // teleport the whole crane (used when the page starts and by the simulator)
    holdOff();
    clawX = x; vx = 0; ropeL = HOME_L;
    Body.setPosition(carriage, { x, y: PIVOT });
    Body.setAngle(hub, 0); Body.setPosition(hub, { x, y: PIVOT + HOME_L + 7 });
    Body.setVelocity(hub, { x: 0, y: 0 }); Body.setAngularVelocity(hub, 0);
    phiCmd = phiCmd || PHI_REST;
    arms.forEach(a => poseArm(a, armAngle(a.side, phiCmd)));
    headSolid(true);
  }
  let hubF = 1;
  const HUB_MASS = hub.mass;
  function setClaw(k) {                            // swap the claw head (only between plays)
    if (!CLAWS[k] || k === clawSize) return;
    setGeometry(k);
    const f = CLAWS[k].scale;
    Body.setAngle(hub, 0); Body.scale(hub, f / hubF, f / hubF); Body.setMass(hub, HUB_MASS); hubF = f;
    ropes.forEach((r, i) => { r.pointB = { x: r.pointB.x, y: -7 * f }; });
    buildArms(); phiCmd = PHI_REST; resetClaw(clawX);
  }
  // the head lands on things while dropping; from the squeeze on, the prize is held by the arms alone
  function headSolid(on) { hub.collisionFilter = { group: -1, category: 0x0002, mask: on ? HEAD_MASK : 0 }; }
  let focus = null, supports = [];
  const solidFor = (b, on) => { if (b.collisionFilter.mask !== 0) b.collisionFilter = { group: 0, category: on ? CAT_FOCUS : CAT_BOX, mask: 0xFFFFFFFF }; };
  function setFocus(b) {
    // the arms touch the box they straddle, plus whatever it rests on (prongs can't reach under a prize sitting on others)
    const sup = b ? engine.pairs.list.filter(p => p.isActive).map(p => p.bodyA.parent === b ? p.bodyB.parent : p.bodyB.parent === b ? p.bodyA.parent : null)
      .filter(o => o && boxes.includes(o) && o.position.y > b.position.y + 4) : [];
    if (focus === b && sup.length === supports.length && sup.every(o => supports.includes(o))) return;
    [focus, ...supports].forEach(o => o && boxes.includes(o) && solidFor(o, false));
    focus = b || null; supports = sup;
    [focus, ...supports].forEach(o => o && solidFor(o, true));
    if (focus) Sleeping.set(focus, false);
  }

  /* ---------- state ---------- */
  let boxes = [], uid = 0;
  let phase = 'idle', pt = 0, clawX = HOME_X, dir = 0, vx = 0;
  let phiCmd = PHI_REST, gripK = .3;
  let grip0 = .3, gripTop = .3, strength = 1, liftFrom = 0, slackT = 0, maxL = 300;
  let cand = null, candY = 0, lifted = false, slipped = false, playPrizes = 0;
  let timeLeft = 0, lastSec = -1, motorT = 0, acc = 0, landT = 0;
  let refillT = 0, playPrice = price, G = null;
  let quiet = false, sim = null;
  const queue = [];

  /* ---------- sound ---------- */
  const T = (...a) => { if (!quiet) Casino.tone(...a); }, N = (...a) => { if (!quiet) Casino.noise(...a); };
  const sfx = {
    coin()  { if (isMono()) { N(0, .02, .2, 3000); N(.08, .03, .25, 900); } else { T(988, 0, .05, 'square', .04); T(1319, .05, .09, 'square', .04); } },
    motor() { if (isMono()) N(0, .06, .05, 260); else T(72, 0, .1, 'sawtooth', .018); },
    warn()  { T(isMono() ? 2000 : 1200, 0, .05, isMono() ? 'sine' : 'square', .04); },
    drop()  { T(320, 0, .7, isMono() ? 'sine' : 'triangle', .035, 110); },
    grab()  { N(0, .06, .3, 450); T(85, 0, .1, 'sine', .25); },
    lift()  { T(110, 0, .7, isMono() ? 'sine' : 'triangle', .035, 300); },
    slip()  { T(420, 0, .35, isMono() ? 'sine' : 'sawtooth', .04, 140); },
    land(v) { N(0, .04, Math.min(.22, .04 + v * .025), 380); },
    release() { N(0, .05, .2, 1200); },
    chute() { N(0, .12, .35, 300); T(58, 0, .14, 'sine', .3); },
    tap(i)  { if (isMono()) { N(0, .03, .3, 900 + i * 300); T(600 + i * 160, 0, .06, 'sine', .06); } else { T(300 + i * 120, 0, .08, 'square', .05); N(0, .04, .18, 1600); } },
    open(r) {
      const mono = isMono();
      const seq = [[784, 1047], [659, 784, 1047], [523, 659, 784, 1047, 1319], [523, 659, 784, 1047, 784, 1047, 1319, 1568]][r];
      seq.forEach((f, i) => { T(f, i * (mono ? .14 : .09), mono ? .5 : .14, mono ? 'sine' : 'square', mono ? .09 : .05); if (!mono && r === 3) T(f / 2, i * .09, .14, 'triangle', .05); });
    },
    buzz()  { if (isMono()) N(0, .2, .15, 300); else T(110, 0, .25, 'sawtooth', .05, 90); },
    thump(p) { N(0, .18, .3 * p + .1, 160); T(55, 0, .2, 'sine', .35 * p); N(.05, .12, .15 * p, 900); }
  };

  /* ---------- pit ---------- */
  function pickKind() {                       // restock like an operator: keep the prize mix steady
    const n = boxes.length + 1, tot = KINDS.reduce((a, d) => a + d.mix, 0);
    const w = KINDS.map(d => [d, Math.max(.02, d.mix / tot * n - boxes.filter(b => b.kind === d.id).length + d.mix / tot)]);
    let r = rand() * w.reduce((a, b) => a + b[1], 0);
    for (const [d, v] of w) if ((r -= v) < 0) return d;
    return KINDS[0];
  }
  function makePrize(d, x, y, angle = 0) {
    const opt = { angle, density: DENS[d.k], friction: BOX_FRICTION, frictionStatic: 1.2, frictionAir: .012, restitution: .06,
      collisionFilter: { group: 0, category: CAT_BOX, mask: 0xFFFFFFFF } };
    let b;
    if (d.shape === 'ball') b = Bodies.circle(x, y, d.r, { ...opt, restitution: .3, frictionAir: .008 });
    else if (d.shape === 'hex') b = Bodies.polygon(x, y, 6, d.r, opt);
    else if (d.shape === 'can') b = Bodies.rectangle(x, y, d.w, d.h, { ...opt, chamfer: { radius: 5 } });
    else b = Bodies.rectangle(x, y, d.w, d.h, { ...opt, chamfer: { radius: 3 } });
    b.k = d.k; b.kind = d.id; b.shape = d.shape; b.w = d.w; b.h = d.h; b.r = d.r || 0; b.uid = ++uid;
    boxes.push(b); Composite.add(world, b);
    return b;
  }
  function spawn(y) {
    if (boxes.length >= 18) return;
    const d = pickKind();
    const x = PIT_L + 26 + d.w / 2 + rand() * (PIT_R - PIT_L - 26 - d.w);
    makePrize(d, x, y - d.h / 2, (rand() - .5) * .5);
  }
  const boxTop = b => b.bounds.min.y;
  function findTarget(x = clawX) {
    if (x < WALL_R + 2) return null;
    const hits = Query.ray(boxes, { x, y: PIVOT + 40 }, { x, y: FLOOR }, 1);
    let best = null;
    for (const h of hits) for (const p of [h.bodyA, h.bodyB]) { const b = p.parent || p; if (boxes.includes(b) && (!best || boxTop(b) < boxTop(best))) best = b; }
    return best;
  }
  function isBlocked(t) {
    for (const p of engine.pairs.list) {
      if (!p.isActive) continue;
      const a = p.bodyA.parent, c = p.bodyB.parent;
      const o = a === t ? c : c === t ? a : null;
      if (o && boxes.includes(o) && o.position.y < t.position.y - t.h * .35) return true;
    }
    return false;
  }

  function physicsStep(ms) {
    acc += ms;
    let n = 0;
    while (acc >= STEP && n < 8) {
      const before = landT <= 0 && !quiet ? new Map(boxes.map(b => [b, b.velocity.y])) : null;
      Engine.update(engine, STEP);
      acc -= STEP; n++;
      if (before) for (const b of boxes) { const v0 = before.get(b); if (v0 > 2.5 && b.velocity.y < v0 * .4) { sfx.land(v0); landT = 90; break; } }
    }
    landT -= ms;
    // anything whose centre is inside the prize hole drops straight through (a box can't jam the chute)
    for (const b of boxes) if (b.bounds.max.x < CHUTE_R + 6 && b.position.y > WALL_TOP + 10 && b.collisionFilter.mask !== 0) {
      b.collisionFilter = { group: 0, category: CAT_BOX, mask: 0 }; Sleeping.set(b, false);
    }
    const gone = boxes.filter(b => b.position.y > H + 60);
    if (gone.length) {
      boxes = boxes.filter(b => !gone.includes(b));
      gone.forEach(b => { Composite.remove(world, b); onChute(b); });
    }
  }

  // settle the starting pile off-screen
  for (let i = 0; i < BOX_COUNT; i++) spawn(-40 - i * 70);
  quiet = true; for (let i = 0; i < 1600; i++) Engine.update(engine, STEP); quiet = false;
  boxes.filter(b => b.position.y > H + 60).forEach(b => Composite.remove(world, b));
  boxes = boxes.filter(b => b.position.y <= H + 60);
  resetClaw(HOME_X);

  /* ---------- claw strength (like a real machine's payout setting) ---------- */
  let rollStrength = function () {
    const r = rand();
    strength = r < STR_STRONG ? .8 + rand() * .2 : r < STR_STRONG + STR_MID ? .45 + rand() * .35 : rand() * .45;
    grip0 = MU_MIN + (MU_MAX - MU_MIN) * strength;              // grip-pad friction this play
    gripTop = grip0 * (TOP_MIN + rand() * (1 - TOP_MIN));       // the claw goes limp once it's up top
  };

  /* ---------- state machine ---------- */
  const setPhase = p => { phase = p; pt = 0; };
  function grip(phiT, k, rate, dt, mu = .4) {
    phiGoal = phiT;
    // once the fingers are pressed on a prize they stop there: the motor's pull becomes squeeze, not more travel
    const tgt = hold && phiT < hold.phiC ? Math.max(phiT, hold.phiC - .03) : phiT;
    phiCmd += Math.max(-rate * dt, Math.min(rate * dt, tgt - phiCmd));
    gripK = k;
    tendons.forEach((t, i) => { t.length = tendonLen(arms[i].side, phiCmd); t.stiffness = k; });
    arms.forEach(a => { a.friction = mu; a.parts.forEach(p => p.friction = mu); });
  }
  function play() {
    if (phase !== 'idle' || G || queue.length) return;
    Casino.audio();
    if (price > Casino.bank) { Casino.toast('뱅크롤이 부족해요 · 로비 ATM'); sfx.buzz(); return; }
    Casino.setBank(Casino.bank - price);
    playPrice = price; startPlay();
    sfx.coin(); msg('◀ ▶ 로 맞추고 DROP'); refresh();
  }
  function startPlay() {
    rollStrength();
    cand = null; lifted = false; slipped = false; playPrizes = 0;
    timeLeft = MOVE_MS; lastSec = -1;
    setPhase('move');
  }
  const shakeCost = () => Math.max(1, Math.round(price / 2));
  function shake() {
    if (phase !== 'idle' || G || queue.length) return;
    Casino.audio();
    const cost = shakeCost();
    if (cost > Casino.bank) { Casino.toast('뱅크롤이 부족해요 · 로비 ATM'); sfx.buzz(); return; }
    Casino.setBank(Casino.bank - cost);
    setGuard(true); setPhase('shake'); joltN = 0;
    msg('덜컹덜컹!'); refresh();
  }
  let joltN = 0;
  function jolt(power) {                       // a kick to the cabinet: light prizes hop high, heavy ones barely move
    for (const b of boxes) {
      if (b.position.x < WALL_R) continue;
      const f = Math.max(.45, Math.min(1.45, 1.6 / Math.sqrt(b.mass))) * power;
      Sleeping.set(b, false);
      Body.setVelocity(b, { x: b.velocity.x + (rand() - .5) * 4.2 * f, y: b.velocity.y - (2.4 + rand() * 3.6) * f });
      Body.setAngularVelocity(b, b.angularVelocity + (rand() - .5) * .28 * f);
    }
    const gl = cv.parentElement; gl.classList.remove('jolt'); void gl.offsetWidth; gl.classList.add('jolt');
    sfx.thump(power);
  }
  function startDrop() {
    if (phase !== 'move') return;
    dir = 0; syncArrows();
    maxL = (clawX < WALL_R + 16 ? WALL_TOP - 80 : FLOOR - 48) - PIVOT;   // over the chute wall the head stops above it; beside it the fingers just bump it
    slackT = 0;
    setPhase('drop'); timeLed(0); sfx.drop(); msg('DROP!'); refresh();
  }
  function startClose() { setPhase('close'); setFocus(focus); sfx.grab(); }
  function contactNormals(arm) {                   // prize -> contact normal (pointing from the finger into the prize)
    const m = new Map();
    for (const c of Query.collides(arm, boxes)) {
      const pa = c.bodyA.parent, flip = boxes.includes(pa);
      const b = flip ? pa : c.bodyB.parent;
      const n = flip ? { x: -c.normal.x, y: -c.normal.y } : c.normal;
      const o = m.get(b);
      if (!o || Math.abs(n.x) > Math.abs(o.x)) m.set(b, n);
    }
    return m;
  }
  function touching(arm) {
    return Query.collides(arm, boxes).map(c => { const a = c.bodyA.parent, b = c.bodyB.parent; return boxes.includes(a) ? a : b; });
  }
  function startLift() {
    liftFrom = ropeL; headSolid(false);
    const l = touching(armL), r = touching(armR);
    cand = l.find(b => r.includes(b)) || focus;             // a prize squeezed between both arms, else the one below
    supports.forEach(o => boxes.includes(o) && solidFor(o, false)); supports = [];
    candY = cand ? cand.position.y : 0;
    setPhase('lift'); sfx.lift();
  }
  function maybeOpen() { if (!G && queue.length && phase === 'idle') openGacha(queue.shift()); }
  function onChute(b) {
    playPrizes++;
    if (sim) { sim.prizes.push(b.k); sim.kinds.push(b.kind); spawn(-30); return; }
    sfx.chute();
    setTimeout(() => spawn(-30), 600);
    queue.push({ k: b.k, shape: b.shape, price: playPrice, bonus: CLAWS[clawSize].bonus });
    if (phase !== 'release' && phase !== 'settle') msg('보너스! 밀려서 떨어졌다');
    setTimeout(maybeOpen, 380);
  }
  function trackLift() {
    if (!cand) return;
    if (!lifted && cand.position.y < candY - 14) { lifted = true; msg('들렸다!'); }
    if (lifted && !slipped && boxes.includes(cand) && cand.position.y > hub.position.y + 85 && cand.velocity.y > 1) {
      slipped = true; sfx.slip(); msg('미끄러졌다!');
    }
  }
  const calm = () => Math.abs(hub.angularVelocity) < .012 && Math.abs(hub.velocity.x) < .25;

  function update(ms) {
    const dt = ms / 16.667; pt += ms;
    switch (phase) {
      case 'idle':
        grip(PHI_REST, .3, .08, dt);
        refillT -= ms;
        if (refillT <= 0 && boxes.length < BOX_COUNT && !G && !queue.length) { spawn(-30); refillT = 700; }
        break;
      case 'shake': {
        grip(PHI_REST, .3, .08, dt);
        const beats = [0, 230, 460];
        while (joltN < beats.length && pt >= beats[joltN]) { jolt([1, .75, .5][joltN]); joltN++; }
        const still = boxes.every(b => b.speed < .6 || b.position.x < WALL_R);
        if (pt > 1300 && (still || pt > 3200)) { setGuard(false); setPhase('idle'); msg('섞였다! 다시 노려보세요'); refresh(); }
        break;
      }
      case 'move': {
        timeLeft -= ms;
        vx += (dir * 1.75 - vx) * Math.min(1, .2 * dt);
        const nx = Math.max(HOME_X, Math.min(MAX_X, clawX + vx * dt));
        if (nx === clawX && vx !== 0) vx = 0;
        clawX = nx;
        if (dir) { motorT -= ms; if (motorT <= 0) { sfx.motor(); motorT = 110; } }
        grip(PHI_MOVE, .3, .08, dt);
        const sec = Math.max(0, Math.ceil(timeLeft / 1000));
        if (sec !== lastSec) { lastSec = sec; timeLed(sec); if (sec <= 5 && sec > 0) sfx.warn(); }
        if (timeLeft <= 0) startDrop();
        break;
      }
      case 'drop':
        if (pt < 320) { grip(PHI_OPEN, .35, .12, dt); break; }
        grip(PHI_OPEN, .35, .12, dt);
        setFocus(findTarget(hub.position.x));
        ropeL = Math.min(maxL, ropeL + 2.3 * dt, ropeDist() + 6);                 // winch never runs far ahead of the head
        slackT = ropeDist() < ropeL - 4 && hub.velocity.y < .35 ? slackT + ms : 0;  // slack sensor: the head is resting on something
        if (slackT > 150 || ropeL >= maxL) { ropeL = Math.min(ropeL, ropeDist() + 1.5); startClose(); }
        break;
      case 'close':
        ropeL = Math.min(ropeL, ropeDist() + .5);          // winch takes up slack while the claw squeezes
        grip(PHI_SHUT, GRIP_K, .04, dt, grip0);
        if (pt > 700) startLift();
        break;
      case 'lift': {
        ropeL = Math.max(HOME_L, ropeL - Math.min(1.5, .3 + pt / 500) * dt);   // winch ramps up gently
        const u = (liftFrom - ropeL) / Math.max(1, liftFrom - HOME_L);
        grip(PHI_SHUT, GRIP_K, .04, dt, u < .4 ? grip0 : grip0 + (gripTop - grip0) * Math.min(1, (u - .4) / .4));
        trackLift();
        if (ropeL <= HOME_L) setPhase('carry');
        break;
      }
      case 'carry': {
        const want = -Math.min(2.4, (clawX - HOME_X) * .06 + .25);
        vx += (want - vx) * Math.min(1, .15 * dt);
        clawX = Math.max(HOME_X, clawX + vx * dt);
        grip(PHI_SHUT, GRIP_K, .04, dt, gripTop);
        trackLift();
        if (clawX <= HOME_X) { clawX = HOME_X; vx = 0; setPhase('settle'); }
        break;
      }
      case 'settle':   // wait for the swing to die down — but a machine won't wait forever
        grip(PHI_SHUT, GRIP_K, .04, dt, gripTop);
        trackLift();
        if (pt > 1500 || (pt > 300 && calm())) { setPhase('release'); sfx.release(); }
        break;
      case 'release':
        if (pt < 700) grip(PHI_OPEN, .35, .1, dt); else grip(PHI_REST, .3, .06, dt);
        if (pt > 1300) {
          if (boxes.some(b => b.position.x < WALL_R) && pt < 3500) break;   // prize still tumbling into the chute
          setPhase('idle'); headSolid(true); setFocus(null);
          if (sim) break;
          if (queue.length) { setTimeout(maybeOpen, 200); refresh(); break; }
          if (!G) msg(slipped ? '아깝다! 미끄러졌다' : lifted ? '아깝다! 벽에 걸렸어요' : '놓쳤다… 다시 도전');
          refresh();
        }
        break;
    }
    if (phase !== 'move' && phase !== 'carry') vx = 0;
    Body.setPosition(carriage, { x: clawX, y: PIVOT });
    physicsStep(ms);
  }

  /* ---------- headless simulator for balancing ---------- */
  function simulate(n, { aim = 3, pick = 'any' } = {}) {
    const out = { byKind: {}, log: [], plays: 0, wins: { S: 0, M: 0, L: 0, XL: 0 }, tries: { S: 0, M: 0, L: 0, XL: 0 }, payout: 0, lifted: 0, slipped: 0 };
    const EM = Object.fromEntries(KEYS.map(k => [k, SIZES[k].table.reduce((a, [m, w]) => a + m * w / 100, 0)]));
    quiet = true;
    for (let i = 0; i < n; i++) {
      let pool = boxes.filter(b => b.position.x > PIT_L + 10 && b.position.x < PIT_R - 10 && !isBlocked(b) && (pick === 'any' || pick === 'smart' || b.k === pick));
      if (!pool.length) { for (let j = 0; j < 60; j++) update(16.667); continue; }
      if (pick === 'smart') {                // a thoughtful player: go for prizes that fit the claw, with room beside them for the arms
        const fit = pool.filter(b => CLAWS[clawSize].fit.includes(b.k));
        if (fit.length) pool = fit;
        const room = b => {
          let g = 99;
          for (const o of boxes) {
            if (o === b || o.bounds.max.y < b.bounds.min.y - 4 || o.bounds.min.y > b.bounds.min.y + b.h * .6) continue;
            const gap = o.position.x > b.position.x ? o.bounds.min.x - b.bounds.max.x : b.bounds.min.x - o.bounds.max.x;
            g = Math.min(g, gap);
          }
          return g;
        };
        pool = pool.map(b => [b, room(b) + rand() * 6]).sort((a, c) => c[1] - a[1]).slice(0, 3).map(x => x[0]);
      }
      const t = pool[Math.floor(rand() * pool.length)];
      const g = (rand() + rand() + rand() - 1.5) * 2 * aim;           // ~normal aim error
      resetClaw(Math.max(HOME_X, Math.min(MAX_X, t.position.x + g)));
      for (let j = 0; j < 20; j++) update(16.667);
      sim = { prizes: [], kinds: [] };
      startPlay(); startDrop();
      let minY = 1e9, cand0 = null, phaseAtMin = '', relAtClose = null, landInfo = null, lostAt = '';
      for (let j = 0; j < 1400 && phase !== 'idle'; j++) {
        update(16.667);
        if (phase === 'close' && !landInfo) {
          const hubOn = Query.collides(hub, boxes).map(c => (c.bodyA.parent === hub ? c.bodyB : c.bodyA).parent);
          landInfo = { headOnTarget: hubOn.includes(t), headOn: hubOn.length, armsOn: [...new Set([...touching(armL), ...touching(armR)])].map(b => b === t ? 'T' : b.k).join(''),
            gap: Math.round(boxTop(t) - (hub.position.y + 7.5 * hubF)), dx: Math.round(hub.position.x - t.position.x) };
        }
        if (phase === 'lift' && !cand0) { cand0 = cand; relAtClose = +(armL.angle - hub.angle).toFixed(2); }
        if (cand0 && cand0.position.y < minY) { minY = cand0.position.y; phaseAtMin = phase; }
        if (cand0 && !lostAt && candY - minY > 150 && Math.hypot(cand0.position.x - hub.position.x, cand0.position.y - hub.position.y) > 70) lostAt = phase + '@' + Math.round(cand0.position.x) + ',' + Math.round(pt);
      }
      if (out.log) out.log.push({ t: t.k, ...landInfo, cand: cand0 && cand0.k, same: cand0 === t, rel: relAtClose, rise: cand0 ? Math.round(candY - minY) : 0, at: phaseAtMin, lostAt, prize: sim.prizes.join('') });
      out.plays++; out.tries[t.k]++;
      if (lifted) out.lifted++; if (slipped) out.slipped++;
      if (sim.prizes.includes(t.k)) out.wins[t.k]++;
      sim.prizes.forEach(k => { out.payout += EM[k] * CLAWS[clawSize].bonus; });
      sim.kinds.forEach(id => { out.byKind[id] = (out.byKind[id] || 0) + 1; });
      sim = null;
      for (let j = 0; j < 90; j++) update(16.667);
      resetClaw(HOME_X);
    }
    quiet = false; sim = null; setPhase('idle');
    out.holdN = holdN; holdN = 0;
    out.rtp = +(out.payout / Math.max(1, out.plays)).toFixed(3);
    out.rate = Object.fromEntries(KEYS.map(k => [k, out.tries[k] ? +(out.wins[k] / out.tries[k]).toFixed(2) : null]));
    return out;
  }


  /* ---------- drawing ---------- */
  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function bow(cx, cy, s, fill, stroke) {
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 1.2;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.ellipse(cx + side * s * .6, cy - s * .32, s * .62, s * .36, side * -.5, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(cx, cy - s * .18, s * .28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  function sparkle(x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.fill();
  }
  function drawBox(b, m) {
    const { w, h, k } = b, x = -w / 2, y = -h / 2, r = 3;
    ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
    if (m) {
      ctx.fillStyle = k === 'XL' ? '#000' : '#fff'; rr(x, y, w, h, r); ctx.fill();
      if (k === 'L') {
        ctx.save(); rr(x, y, w, h, r); ctx.clip(); ctx.fillStyle = '#000';
        for (let yy = y + 2, row = 0; yy < y + h; yy += 5, row++) for (let xx = x + 2 + (row % 2) * 2.5; xx < x + w; xx += 5) ctx.fillRect(xx, yy, 1.4, 1.4);
        ctx.restore();
      }
      const bw = Math.max(4, w * .15);
      if (k === 'S') { ctx.fillStyle = '#000'; ctx.fillRect(-2, y, 4, h); }
      else {
        ctx.fillStyle = k === 'M' ? '#000' : '#fff';
        ctx.fillRect(-bw / 2, y, bw, h); ctx.fillRect(x, -bw / 2, w, bw);
        if (k === 'L') { ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2; ctx.strokeRect(-bw / 2, y, bw, h); ctx.strokeRect(x, -bw / 2, w, bw); }
      }
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2.2; rr(x, y, w, h, r); ctx.stroke();
      bow(0, y, Math.max(5, w * .14), '#fff', '#000');
    } else {
      const c = BOXC[k], g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
      ctx.fillStyle = g; rr(x, y, w, h, r); ctx.fill();
      const bw = Math.max(4, w * .16);
      ctx.fillStyle = c[2]; ctx.fillRect(-bw / 2, y, bw, h); ctx.fillRect(x, -bw / 2, w, bw);
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x + 3, y + 2, w * .32, 2);
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5; rr(x, y, w, h, r); ctx.stroke();
      if (k === 'XL') { ctx.fillStyle = '#fff'; sparkle(x + w - 9, y + 9, 4 + Math.sin(performance.now() / 200) * 1.2); }
      bow(0, y, Math.max(5, w * .14), c[2], 'rgba(0,0,0,.4)');
    }
    ctx.restore();
  }
  function drawPrize(b, m) {
    if (b.shape === 'ball') drawBall(b, m);
    else if (b.shape === 'can') drawCan(b, m);
    else if (b.shape === 'hex') drawHex(b, m);
    else drawBox(b, m);
  }
  function drawBall(b, m) {                       // a gacha capsule: coloured dome over a clear base
    const r = b.r, c = BOXC[b.k];
    ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.save(); ctx.clip();
    if (m) {
      ctx.fillStyle = '#fff'; ctx.fillRect(-r, 0, 2 * r, r);
      ctx.fillStyle = b.k === 'M' ? '#000' : '#fff'; ctx.fillRect(-r, -r, 2 * r, r);
      if (b.k === 'S') { ctx.fillStyle = '#000'; for (let x = -r; x < r; x += 6) ctx.fillRect(x, -r, 2.4, r); }
      ctx.fillStyle = '#000'; ctx.fillRect(-r, -1.8, 2 * r, 3.6);
    } else {
      const g = ctx.createLinearGradient(0, -r, 0, 0); g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
      ctx.fillStyle = g; ctx.fillRect(-r, -r, 2 * r, r);
      const g2 = ctx.createLinearGradient(0, 0, 0, r); g2.addColorStop(0, 'rgba(240,244,250,.92)'); g2.addColorStop(1, 'rgba(170,180,195,.92)');
      ctx.fillStyle = g2; ctx.fillRect(-r, 0, 2 * r, r);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(-r, -1.6, 2 * r, 3.2);
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.ellipse(-r * .38, -r * .5, r * .28, r * .14, -.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = m ? '#000' : 'rgba(0,0,0,.45)'; ctx.lineWidth = m ? 2.2 : 1.5;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  function drawCan(b, m) {                        // a tin can seen from the side: rims, label band, shine
    const { w, h } = b, c = BOXC[b.k], x = -w / 2, y = -h / 2, ry = w * .16;
    ctx.save(); ctx.translate(b.position.x, b.position.y); ctx.rotate(b.angle);
    if (m) {
      ctx.fillStyle = '#fff'; rr(x, y, w, h, 5); ctx.fill();
      ctx.fillStyle = b.k === 'L' ? '#000' : '#fff';
      ctx.fillRect(x, y + h * .3, w, h * .4);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.4;
      if (b.k !== 'L') for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x, y + h * .3 + i * h * .1); ctx.lineTo(x + w, y + h * .3 + i * h * .1); ctx.stroke(); }
      ctx.strokeRect(x, y + h * .3, w, h * .4);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2.2; rr(x, y, w, h, 5); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, y + ry * .7, w / 2 - 2, ry * .7, 0, 0, Math.PI * 2); ctx.stroke();
    } else {
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, c[1]); g.addColorStop(.35, c[0]); g.addColorStop(.5, '#fff'); g.addColorStop(.65, c[0]); g.addColorStop(1, c[1]);
      ctx.fillStyle = g; rr(x, y, w, h, 5); ctx.fill();
      ctx.fillStyle = c[2]; ctx.fillRect(x, y + h * .32, w, h * .36);
      ctx.fillStyle = BOXC[b.k][1]; ctx.font = `700 ${Math.round(w * .32)}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('★', 0, 1);
      const rim = ctx.createLinearGradient(x, 0, x + w, 0); rim.addColorStop(0, '#7d8794'); rim.addColorStop(.5, '#f4f7fa'); rim.addColorStop(1, '#7d8794');
      ctx.fillStyle = rim; ctx.fillRect(x, y, w, 4); ctx.fillRect(x, y + h - 4, w, 4);
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5; rr(x, y, w, h, 5); ctx.stroke();
    }
    ctx.restore();
  }
  function drawHex(b, m) {                        // a faceted gem case, drawn straight from the physics vertices
    const v = b.vertices, cx = b.position.x, cy = b.position.y, c = BOXC[b.k];
    const inner = v.map(p => ({ x: cx + (p.x - cx) * .55, y: cy + (p.y - cy) * .55 }));
    const poly = pts => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); };
    if (m) {
      const dark = b.k === 'L';
      ctx.fillStyle = dark ? '#000' : '#fff'; poly(v); ctx.fill();
      ctx.fillStyle = dark ? '#fff' : '#000'; poly(inner); ctx.fill();
      ctx.strokeStyle = dark ? '#fff' : '#000'; ctx.lineWidth = 1.3;
      v.forEach((p, i) => { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(inner[i].x, inner[i].y); ctx.stroke(); });
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2.2; poly(v); ctx.stroke();
    } else {
      const g = ctx.createLinearGradient(cx, cy - b.r, cx, cy + b.r); g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
      ctx.fillStyle = g; poly(v); ctx.fill();
      v.forEach((p, i) => {                      // facets: alternate light and dark
        const q = v[(i + 1) % v.length], qi = inner[(i + 1) % v.length];
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.12)';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.lineTo(qi.x, qi.y); ctx.lineTo(inner[i].x, inner[i].y); ctx.closePath(); ctx.fill();
      });
      const gi = ctx.createLinearGradient(cx, cy - b.r * .55, cx, cy + b.r * .55); gi.addColorStop(0, '#fff'); gi.addColorStop(1, c[0]);
      ctx.fillStyle = gi; poly(inner); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.5; poly(v); ctx.stroke();
      ctx.fillStyle = '#fff'; sparkle(cx + b.r * .2, cy - b.r * .15, 3 + Math.sin(performance.now() / 260 + b.uid) * 1.2);
    }
  }
  function drawClaw(m) {
    const dark = m ? '#000' : '#2a2f36';
    const path = pts => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const arm of arms) {
      const a = armWorldPts(arm);
      path(a); ctx.strokeStyle = dark; ctx.lineWidth = m ? 4.5 : 6.5; ctx.stroke();
      if (!m) { path(a); ctx.strokeStyle = '#f4f7fa'; ctx.lineWidth = 3; ctx.stroke(); }
    }
    ctx.save(); ctx.translate(hub.position.x, hub.position.y); ctx.rotate(hub.angle); ctx.scale(hubF, hubF);
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, 14); ctx.strokeStyle = dark; ctx.lineWidth = m ? 4 : 5; ctx.stroke();
    if (m) { ctx.fillStyle = '#000'; rr(-13, -8, 26, 15, 3); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-7, -2, 14, 2); }
    else {
      const g = ctx.createLinearGradient(-13, 0, 13, 0);
      g.addColorStop(0, '#6b7584'); g.addColorStop(.4, '#f4f7fa'); g.addColorStop(1, '#8a94a1');
      ctx.fillStyle = g; rr(-13, -8, 26, 15, 5); ctx.fill();
      ctx.fillStyle = (phase === 'move' && Math.floor(performance.now() / 250) % 2) ? '#ff3b2f' : '#7a0610';
      ctx.beginPath(); ctx.arc(0, -1, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  function draw() {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const m = isMono();
    if (m) {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,.16)';
      for (let y = 8; y < FLOOR; y += 14) for (let x = 8; x < W; x += 14) ctx.fillRect(x, y, 1.4, 1.4);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#2a0d45'); g.addColorStop(1, '#14051f');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,107,213,.07)'; ctx.lineWidth = 1;
      for (let i = -H; i < W; i += 24) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); }
      ctx.save(); ctx.font = '400 34px Yellowtail, cursive'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(94,242,230,.2)'; ctx.shadowColor = '#23d5c8'; ctx.shadowBlur = 14;
      ctx.fillText('Lucky Claw', (WALL_R + W) / 2, 132); ctx.restore();
    }
    if (m) {
      ctx.save(); ctx.beginPath(); ctx.rect(WALL_R, FLOOR, W - WALL_R, H - FLOOR); ctx.clip();
      ctx.fillStyle = '#fff'; ctx.fillRect(WALL_R, FLOOR, W - WALL_R, H - FLOOR);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2;
      for (let i = WALL_R - 30; i < W; i += 6) { ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i + 20, FLOOR); ctx.stroke(); }
      ctx.restore(); ctx.fillStyle = '#000'; ctx.fillRect(WALL_R, FLOOR - 1.5, W - WALL_R, 3);
    } else {
      const g = ctx.createLinearGradient(0, FLOOR, 0, H); g.addColorStop(0, '#c2185b'); g.addColorStop(1, '#5a0a30');
      ctx.fillStyle = g; ctx.fillRect(WALL_R, FLOOR, W - WALL_R, H - FLOOR);
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(WALL_R, FLOOR, W - WALL_R, 1.5);
    }
    const cy = WALL_TOP + 20;
    ctx.textAlign = 'center';
    if (m) {
      ctx.fillStyle = '#000'; ctx.fillRect(0, cy, CHUTE_R, H - cy);
      ctx.fillStyle = '#fff'; ctx.font = '700 10px "Space Mono", monospace'; ctx.fillText('PRIZE ↓', CHUTE_R / 2, cy + 20);
    } else {
      const g = ctx.createLinearGradient(0, cy, 0, H); g.addColorStop(0, '#000'); g.addColorStop(1, '#1a0010');
      ctx.fillStyle = g; ctx.fillRect(0, cy, CHUTE_R, H - cy);
      ctx.save(); ctx.strokeStyle = '#ffd400'; ctx.lineWidth = 2; ctx.shadowColor = '#ffd400'; ctx.shadowBlur = 10;
      ctx.strokeRect(4, cy + 3, CHUTE_R - 8, H - cy); ctx.restore();
      ctx.fillStyle = '#ffd400'; ctx.font = '400 13px Bungee, Impact, sans-serif'; ctx.fillText('PRIZE', CHUTE_R / 2, cy + 24);
      ctx.font = '14px sans-serif'; ctx.fillText('▼', CHUTE_R / 2, cy + 44);
    }
    for (const b of boxes) drawPrize(b, m);
    if (guardUp) {                                 // shake guard above the divider
      if (m) { ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.strokeRect(CHUTE_R - 2, 40, WALL_R - CHUTE_R + 4, WALL_TOP - 40); ctx.restore(); }
      else { ctx.fillStyle = 'rgba(255,138,0,.25)'; ctx.fillRect(CHUTE_R - 2, 40, WALL_R - CHUTE_R + 4, WALL_TOP - 40); ctx.fillStyle = 'rgba(255,138,0,.9)'; ctx.fillRect(CHUTE_R - 2, 40, WALL_R - CHUTE_R + 4, 2); }
    }
    if (m) { ctx.fillStyle = '#000'; ctx.fillRect(CHUTE_R, WALL_TOP, WALL_R - CHUTE_R, H - WALL_TOP); }
    else {
      ctx.fillStyle = 'rgba(94,242,230,.22)'; ctx.fillRect(CHUTE_R, WALL_TOP, WALL_R - CHUTE_R, H - WALL_TOP);
      ctx.fillStyle = 'rgba(94,242,230,.85)'; ctx.fillRect(CHUTE_R, WALL_TOP, WALL_R - CHUTE_R, 2);
    }
    if (m) { ctx.fillStyle = '#000'; ctx.fillRect(0, RAIL - 3, W, 6); }
    else {
      const g = ctx.createLinearGradient(0, RAIL - 5, 0, RAIL + 5);
      g.addColorStop(0, '#fff'); g.addColorStop(.45, '#9aa3b0'); g.addColorStop(.55, '#5b6572'); g.addColorStop(1, '#e3e8ee');
      ctx.fillStyle = g; ctx.fillRect(0, RAIL - 5, W, 10);
    }
    ctx.strokeStyle = m ? '#000' : '#c9d1db'; ctx.lineWidth = m ? 1.6 : 2;
    for (const sd of [-1, 1]) {
      const t = hubTop(sd), cx0 = clawX + sd * CABLE, slack = cableDist(sd) < ropeL - 1.5;
      ctx.beginPath(); ctx.moveTo(cx0, PIVOT);
      if (slack) ctx.quadraticCurveTo((cx0 + t.x) / 2 + sd * 6, (PIVOT + t.y) / 2 + 8, t.x, t.y); else ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }
    if (m) { ctx.fillStyle = '#000'; rr(clawX - 14, RAIL - 8, 28, 16, 2); ctx.fill(); }
    else { ctx.fillStyle = '#c8102e'; rr(clawX - 14, RAIL - 8, 28, 16, 4); ctx.fill(); ctx.strokeStyle = '#e9edf2'; ctx.lineWidth = 1.5; ctx.stroke(); }
    if (phase === 'move') {
      const t = findTarget();
      ctx.save(); ctx.setLineDash([3, 4]);
      ctx.globalAlpha = Math.max(.25, 1 - Math.abs(hub.position.x - clawX) / 10); ctx.strokeStyle = m ? 'rgba(0,0,0,.4)' : 'rgba(255,212,0,.55)'; ctx.lineWidth = 1.2;
      let endY = clawX < WALL_R ? WALL_TOP : FLOOR;
      if (t) endY = boxTop(t);
      ctx.beginPath(); ctx.moveTo(clawX, hub.position.y + 52); ctx.lineTo(clawX, endY); ctx.stroke(); ctx.restore();
    }
    drawClaw(m);
    if (!m) {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, 'rgba(255,255,255,.10)'); g.addColorStop(.3, 'rgba(255,255,255,0)');
      g.addColorStop(.62, 'rgba(255,255,255,0)'); g.addColorStop(.7, 'rgba(255,255,255,.06)'); g.addColorStop(.78, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
  }
  function resize() {
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.width * H / W * dpr);
    scale = cv.width / W; draw();
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv); else addEventListener('resize', resize);

  let running = false, last = 0;
  function frame(now) {
    if (Casino.view !== 'claw') { running = false; return; }
    const ms = Math.min(50, now - last); last = now;
    update(ms); draw();
    requestAnimationFrame(frame);
  }
  function run() { if (running) return; running = true; last = performance.now(); acc = 0; requestAnimationFrame(frame); }


  /* ---------- bulbs ---------- */
  const bulbs = [];
  { const el = $('clBulbs'); for (let i = 0; i < 16; i++) { const b = document.createElement('i'); b.className = 'bulb'; el.appendChild(b); bulbs.push(b); } }
  let bt = 0;
  setInterval(() => {
    if (Casino.view !== 'claw' || isMono()) return;
    bt++;
    const fast = phase !== 'idle' || G;
    bulbs.forEach((b, i) => b.classList.toggle('on', fast ? (i + bt) % 2 === 0 : (i + Math.floor(bt / 2)) % 4 === 0));
  }, 120);

  /* ---------- prize table / history ---------- */
  function renderRows() {
    const m = isMono();
    $('clRows').innerHTML = KEYS.map(k => {
      const S = SIZES[k], kinds = KINDS.filter(d => d.k === k);
      return `<div class="cl-row"><span class="cl-ics">${kinds.map(d => shapeIcon(d, m)).join('')}</span><span class="cl-t"><span class="n">${S.name}</span><span class="g">${S.feel} · 탭 ${S.taps}번</span></span><span class="p">${S.table.map(t => '×' + t[0]).join(' ')}</span></div>`;
    }).join('');
  }
  function renderHist() {
    const h = $('clHist');
    if (!hist.length) { h.innerHTML = '<span class="g-empty">아직 연 상자가 없어요</span>'; return; }
    h.innerHTML = hist.map(x => `<span class="cl-h r${x.r}" style="--rc:${RC[x.r]}">${x.k}${x.s && x.s !== 'box' ? ' ' + ({ ball: '●', can: '▮', hex: '⬢' })[x.s] : ''} ×${x.m}</span>`).join('');
  }

  /* ---------- gacha opener ---------- */
  const stage = $('gStage'), gWrap = $('gBoxWrap'), gPrize = $('gPrize'), gFx = $('gFx'), gDots = $('gDots'), gHint = $('gHint'), gCollect = $('gCollect'), gacha = $('gacha');
  function confetti(n, color) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const m = isMono(), pal = m ? ['#000', '#fff'] : [color, '#fff', '#ffd400', '#5ef2e6', '#ff6bd5'];
    for (let i = 0; i < n; i++) {
      const d = document.createElement('i'); d.className = 'conf';
      const a = rand() * Math.PI * 2, dist = 90 + rand() * 140;
      d.style.setProperty('--dx', Math.cos(a) * dist + 'px'); d.style.setProperty('--dy', (Math.sin(a) * dist - 40) + 'px');
      d.style.setProperty('--r', (rand() * 720 - 360) + 'deg'); d.style.background = pal[i % pal.length];
      d.style.animationDelay = (rand() * .12) + 's';
      gFx.appendChild(d); setTimeout(() => d.remove(), 1500);
    }
  }
  function openGacha(item) {
    const k = item.k, S = SIZES[k];
    let r = rand() * 100, idx = 0;
    for (let i = 0; i < S.table.length; i++) { if ((r -= S.table[i][1]) < 0) { idx = i; break; } }
    G = { k, shape: item.shape || 'box', idx, mult: S.table[idx][0], taps: 0, need: S.taps, done: false, price: item.price, bonus: item.bonus || 1 };
    gWrap.innerHTML = gachaSVG(k, isMono(), G.shape);
    gPrize.className = 'gacha-prize'; gPrize.innerHTML = '';
    stage.className = 'gacha-stage';
    stage.style.setProperty('--go', 0); stage.style.setProperty('--gc', '#fff8c0'); stage.style.removeProperty('--cc');
    $('gTier').textContent = `${S.name} ${SHAPE_NAME[G.shape]}`;
    $('gTier').style.setProperty('--tc', isMono() ? '#000' : BOXC[k][1]);
    gDots.innerHTML = '<i></i>'.repeat(S.taps);
    gHint.hidden = false; gHint.textContent = 'TAP!';
    gCollect.hidden = true;
    gacha.hidden = false;
    refresh();
    setTimeout(() => stage.focus({ preventScroll: true, focusVisible: false }), 50);
  }
  function tapG() {
    if (!G || G.done) return;
    Casino.audio();
    G.taps++;
    stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
    const n = Math.ceil(G.taps / G.need * 6);
    gWrap.querySelectorAll('.crack').forEach((c, i) => c.classList.toggle('on', i < n));
    [...gDots.children].forEach((d, i) => d.classList.toggle('on', i < G.taps));
    stage.style.setProperty('--go', (G.taps / G.need * .85).toFixed(2));
    if (G.taps === G.need - 1 && !isMono()) {
      stage.style.setProperty('--gc', RC[G.idx]);
      gWrap.querySelectorAll('.crack').forEach(c => c.style.setProperty('--cc', RC[G.idx]));
    }
    sfx.tap(G.taps);
    gHint.textContent = G.taps === G.need - 1 ? 'ONE MORE!' : 'TAP!';
    if (G.taps >= G.need) reveal();
  }
  function reveal() {
    G.done = true;
    stage.classList.add('open');
    gHint.hidden = true;
    const eff = Math.round(G.mult * G.bonus * 10) / 10, payout = Math.floor(G.price * eff), net = payout - G.price;
    gPrize.style.setProperty('--rc', RC[G.idx]);
    gPrize.innerHTML = `${gemSVG(G.idx)}<span class="gp-r">${RAR[G.idx]}</span><span class="gp-m">×${G.mult}${G.bonus > 1 ? `<small> × CLAW ${G.bonus}</small>` : ''}</span><span class="gp-a">+$${fmt(payout)} <small>(${net >= 0 ? '+' : '−'}$${fmt(Math.abs(net))})</small></span>`;
    confetti([10, 18, 30, 50][G.idx], RC[G.idx]);
    sfx.open(G.idx);
    setTimeout(() => { gPrize.classList.add('show'); }, 320);
    if (payout) Casino.setBank(Casino.bank + payout);
    if (G.idx === 3) Casino.coinRain(50); else if (G.idx === 2) Casino.coinRain(18);
    hist.unshift({ k: G.k, s: G.shape, r: G.idx, m: eff }); if (hist.length > 14) hist.pop();
    save(); renderHist();
    setTimeout(() => { gCollect.hidden = false; gCollect.focus({ preventScroll: true }); }, 800);
  }
  function collect() {
    if (!G || !G.done) return;
    gacha.hidden = true; G = null;
    if (queue.length) { msg('하나 더 있어요!'); setTimeout(() => openGacha(queue.shift()), 250); return; }
    msg('다시 도전!'); refresh();
  }
  stage.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); tapG(); });
  stage.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapG(); } });
  gCollect.addEventListener('click', collect);

  /* ---------- controls ---------- */
  const goBtn = $('clGo'), lBtn = $('clL'), rBtn = $('clR');
  const syncArrows = () => { lBtn.classList.toggle('on', dir < 0); rBtn.classList.toggle('on', dir > 0); };
  const syncChips = window.CasinoChipTray($('clChips'), CHIPS, () => price, v => {
    if (phase !== 'idle' || G) return;
    price = v; save(); Casino.tone(1200, 0, .05, 'triangle', .06, 900); refresh();
  });
  function refresh() {
    bankLed(Casino.bank); priceLed(price);
    if (phase !== 'move') timeLed(0);
    const idle = phase === 'idle' && !G && !queue.length, moving = phase === 'move';
    goBtn.classList.toggle('drop', moving);
    $('clGoL').textContent = moving ? 'DROP' : 'PLAY';
    $('clGoS').textContent = moving ? 'SPACE' : '$' + fmt(price);
    goBtn.disabled = !(idle || moving);
    $('clShake').disabled = !idle;
    $('clShakeS').textContent = '$' + fmt(shakeCost());
    lBtn.disabled = rBtn.disabled = !moving;
    document.querySelectorAll('#clChips .bchip').forEach(b => b.disabled = !idle);
    document.querySelectorAll('#clClaws .cl-claw').forEach(b => { b.disabled = !idle; b.setAttribute('aria-checked', b.dataset.k === clawSize); b.tabIndex = b.dataset.k === clawSize ? 0 : -1; });
    syncChips();
  }
  goBtn.addEventListener('click', () => { if (phase === 'idle') play(); else if (phase === 'move') startDrop(); });
  $('clShake').addEventListener('click', shake);
  const holdBtn = (btn, d) => {
    const on = e => { if (phase !== 'move') return; e.preventDefault(); Casino.audio(); dir = d; syncArrows(); try { btn.setPointerCapture(e.pointerId); } catch (_) {} };
    const off = () => { if (dir === d) { dir = 0; syncArrows(); } };
    btn.addEventListener('pointerdown', on);
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => btn.addEventListener(ev, off));
    btn.addEventListener('contextmenu', e => e.preventDefault());
  };
  holdBtn(lBtn, -1); holdBtn(rBtn, 1);
  addEventListener('keydown', e => {
    if (Casino.view !== 'claw') return;
    if (G) {
      if ((e.code === 'Space' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); if (G.done) collect(); else tapG(); }
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (phase !== 'move') return;
      e.preventDefault(); dir = e.key === 'ArrowLeft' ? -1 : 1; syncArrows();
    } else if ((e.key === 's' || e.key === 'S') && !e.repeat) {
      shake();
    } else if (e.code === 'Space' && !e.repeat) {
      if (e.target.closest && e.target.closest('button') && e.target !== document.body) return;
      e.preventDefault();
      if (phase === 'idle') play(); else if (phase === 'move') startDrop();
    }
  });
  addEventListener('keyup', e => {
    if ((e.key === 'ArrowLeft' && dir < 0) || (e.key === 'ArrowRight' && dir > 0)) { dir = 0; syncArrows(); }
  });
  Casino.onBank(() => { if (Casino.view === 'claw') bankLed(Casino.bank); });
  Casino.onTheme(() => { renderClaws(); renderRows(); draw(); if (G && !G.done) { gWrap.innerHTML = gachaSVG(G.k, isMono(), G.shape); const n = Math.ceil(G.taps / G.need * 6); gWrap.querySelectorAll('.crack').forEach((c, i) => c.classList.toggle('on', i < n)); } });

  function renderClaws() {
    const m = isMono();
    $('clClaws').innerHTML = Object.entries(CLAWS).map(([k, c]) =>
      `<button class="cl-claw" type="button" role="radio" data-k="${k}" aria-checked="${k === clawSize}" aria-label="${c.name} 집게, ${c.tag}">${clawIcon(c.scale, m)}<span class="n">${c.name}</span><span class="b">${c.tag}</span></button>`).join('');
  }
  $('clClaws').addEventListener('click', e => {
    const btn = e.target.closest('.cl-claw');
    if (!btn || btn.disabled || phase !== 'idle' || G || queue.length) return;
    const k = btn.dataset.k;
    if (k === clawSize) return;
    setClaw(k); save();
    Casino.tone(520, 0, .06, 'square', .05, 760); Casino.tone(980, .07, .06, 'square', .04);
    const c = CLAWS[k];
    msg(`${c.name} 집게 · ${k === 'L' ? '모든 상품 도전 가능' : k === 'M' ? 'MEDIUM 상품까지' : '작은 상품 위주'}${c.bonus > 1 ? ' · 상금 ×' + c.bonus : ''}`);
    refresh();
  });
  $('clClaws').addEventListener('keydown', e => {
    const ks = Object.keys(CLAWS), i = ks.indexOf(clawSize), d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const nb = $('clClaws').querySelector(`[data-k="${ks[(i + d + ks.length) % ks.length]}"]`);
    nb.click(); nb.focus();
  });
  if (CLAWS[saved.claw]) setClaw(saved.claw);
  renderClaws(); renderRows(); renderHist(); refresh();

  Casino.register('claw', {
    title: () => isMono() ? 'lucky claw — claw nº 5' : 'LUCKY CLAW — Grab · Open · Win',
    enter() { refresh(); requestAnimationFrame(() => { resize(); run(); }); },
    canLeave: () => phase === 'idle' && !G && !queue.length && !boxes.some(b => b.position.x < WALL_R),
    leave() { dir = 0; syncArrows(); }
  });
  window.__claw = {
    get state() { return { phase, clawX, hub, boxes, G, queue, lifted, slipped, strength, grip0, gripTop }; },
    play, startDrop, simulate, setClaw, claw: () => clawSize, testOpen(k, shape) { openGacha({ k, shape, price: 100 }); }, setX(x) { resetClaw(x); }, setDir(d) { dir = d; },
    scene(k, x = 220) {           // debug: a single box on the floor
      holdOff(); boxes.forEach(b => Composite.remove(world, b)); boxes = [];
      const d = KIND[k] || KIND['box' + k];
      makePrize(d, x, FLOOR - d.h / 2);
      refillT = 1e9; resetClaw(x);
    },
    grab(k, x = 220, m0 = 1, mT = m0, dx = 0) {   // debug: one headless grab of a lone prize with a fixed grip
      const old = rollStrength; rollStrength = () => { grip0 = m0; gripTop = mT; };
      this.scene(k, x); resetClaw(x + dx); quiet = true; sim = { prizes: [], kinds: [] }; gripLog = [];
      const b = boxes[0], y0 = b.position.y; let rise = 0;
      startPlay(); startDrop();
      for (let j = 0; j < 1400 && phase !== 'idle'; j++) { update(16.667); rise = Math.max(rise, y0 - b.position.y); }
      const won = sim.prizes.length > 0; sim = null; quiet = false; rollStrength = old; setPhase('idle');
      const lg = gripLog; gripLog = null; if (this.verbose) console.log(JSON.stringify(lg.slice(0, 6)));
      return won ? 'Y' : rise > 60 ? 's' : 'n';
    },
    info() { const l = touching(armL).map(b => b.k), r = touching(armR).map(b => b.k);
      return { phase, ropeL: +ropeL.toFixed(1), rd: +ropeDist().toFixed(1), hub: [+hub.position.x.toFixed(1), +hub.position.y.toFixed(1), +hub.angle.toFixed(2)], phiCmd: +phiCmd.toFixed(2),
        armRel: arms.map(a => +(a.angle - hub.angle).toFixed(2)), box: boxes[0] && [+boxes[0].position.x.toFixed(1), +boxes[0].position.y.toFixed(1)], touchL: l, touchR: r, gripK, gripDbg, phiAct: +(((armL.angle - hub.angle) - (armR.angle - hub.angle)) / 2).toFixed(2) }; },
    tune(o) { if ('GRIP_N' in o) GRIP_N = o.GRIP_N; if ('OPEN_SPREAD' in o) { OPEN_SPREAD = o.OPEN_SPREAD; PHI_OPEN = phiFor(OPEN_SPREAD); PHI_MAX = PHI_OPEN + .2; }
      if ('BOX_FRICTION' in o) { BOX_FRICTION = o.BOX_FRICTION; boxes.forEach(b => b.friction = BOX_FRICTION); }
      if ('BOX_COUNT' in o) { BOX_COUNT = o.BOX_COUNT; while (boxes.length > BOX_COUNT) { const b = boxes.pop(); Composite.remove(world, b); } while (boxes.length < BOX_COUNT) spawn(-40); quiet = true; for (let i = 0; i < 600; i++) Engine.update(engine, STEP); quiet = false; }
      ({ GRIP_K = GRIP_K, MU_MIN = MU_MIN, MU_MAX = MU_MAX, STR_STRONG = STR_STRONG, STR_MID = STR_MID, TOP_MIN = TOP_MIN } = o); return { BOX_FRICTION, GRIP_K, MU_MIN, MU_MAX, STR_STRONG, STR_MID, TOP_MIN }; },
    forceStrength(k0, kTop) { rollStrength = () => { grip0 = k0; gripTop = kTop; }; }
  };
})();
