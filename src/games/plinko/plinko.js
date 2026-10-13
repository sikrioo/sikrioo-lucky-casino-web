/* ===== LUCKY PLINKO =====
 * The outcome is decided the way real plinko games do it: one fair coin per row (Casino.rnd), so the slot
 * distribution is exactly binomial and the RTP is exactly what config.js says. The ball's flight is then
 * animated along that path — hop to a peg, bounce, hop to the next — rather than left to a physics engine,
 * whose results could not be guaranteed fair. */
import { ROWS, RISKS, RISK_NAME, CHIPS, TABLES } from './config.js';

(() => {
  const $ = id => document.getElementById(id);
  const fmt = n => n.toLocaleString('en-US');
  const isMono = () => Casino.theme === '74';
  const fmtMult = m => m >= 1000 ? (m / 1000) + 'K' : String(m);
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- settings ---------- */
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('casino-plinko')) || {}; } catch (e) {}
  let rows = ROWS.includes(saved.rows) ? saved.rows : 12;
  let risk = RISKS.includes(saved.risk) ? saved.risk : 'mid';
  let bet = CHIPS.includes(saved.bet) ? saved.bet : 25;
  const save = () => { try { localStorage.setItem('casino-plinko', JSON.stringify({ rows, risk, bet })); } catch (e) {} };
  const table = () => TABLES[rows][risk];

  /* ---------- board geometry (logical units) ---------- */
  const W = 360, H = 400;
  let G = null;
  function geometry(n) {
    const sp = Math.min(30, (W - 24) / (n + 2));
    const slotH = Math.max(22, sp * .9);
    const dy = Math.min(sp * 1.35, (H - 70 - slotH) / (n - 1 + .8));
    const total = (n - 1) * dy + dy * .8 + slotH;
    const top = Math.max(44, (H - total) / 2 + 16);
    const g = {
      n, sp, dy, slotH, top, cx: W / 2,
      pegR: Math.max(2.2, sp * .11), ballR: sp * .27,
      slotTop: top + (n - 1) * dy + dy * .8
    };
    g.pegX = (i, j) => g.cx + (j - (i + 2) / 2) * sp;
    g.pegY = i => top + i * dy;
    g.slotX = k => g.cx + (k - n / 2) * sp;
    return g;
  }

  /* ---------- state ---------- */
  const balls = [];              // in flight
  const pegFlash = new Map();    // "i,j" -> time of last hit
  const slotFlash = new Map();   // k -> time of last landing
  const floats = [];             // rising "+×3" labels
  const hist = [];               // last multipliers
  let auto = null, frac = 0;     // auto-drop timer · fractional winnings not yet paid (bank is whole dollars)
  const stats = { balls: 0, staked: 0, back: 0 };

  /* ---------- sound ---------- */
  let lastTick = 0;
  const sfx = {
    chip() { if (isMono()) Casino.noise(0, .02, .18, 2500); else { Casino.tone(1200, 0, .05, 'triangle', .07, 900); Casino.tone(1800, .03, .04, 'triangle', .04); } },
    drop() { if (isMono()) Casino.noise(0, .03, .12, 1600); else Casino.tone(880, 0, .07, 'square', .03, 1320); },
    tick(i) {
      const now = performance.now(); if (now - lastTick < 28) return; lastTick = now;
      if (isMono()) Casino.noise(0, .012, .07, 3000 + i * 60);
      else Casino.tone(520 + i * 42, 0, .035, 'triangle', .025);
    },
    land(m) {
      if (m >= 10) {
        if (isMono()) for (let i = 0; i < 5; i++) Casino.tone(i % 2 ? 1760 : 1568, i * .12, .4, 'sine', .09);
        else [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { Casino.tone(f, i * .07, .14, 'square', .05); Casino.tone(f / 2, i * .07, .14, 'triangle', .04); });
      } else if (m >= 1) {
        if (isMono()) Casino.tone(1318, 0, .25, 'sine', .08);
        else { Casino.tone(784, 0, .08, 'square', .04); Casino.tone(1175, .06, .12, 'square', .04); }
      } else {
        if (isMono()) Casino.noise(0, .06, .1, 500); else Casino.tone(196, 0, .12, 'triangle', .05, 150);
      }
    }
  };

  /* ---------- dropping ---------- */
  const msgEl = $('pkMsg');
  const msg = t => { msgEl.textContent = t; };
  const jit = s => (Math.random() - .5) * s;                       // cosmetic wobble only

  function makeBall() {
    const g = G, n = g.n;
    let r = 0;
    const pts = [{ x: g.cx + jit(g.sp * .3), y: g.top - g.dy * 1.6 }], hits = [];
    for (let i = 0; i < n; i++) {
      const j = r + 1;                                               // peg this ball strikes on row i
      pts.push({ x: g.pegX(i, j) + jit(g.sp * .12), y: g.pegY(i) - g.pegR - g.ballR * .85 });
      hits.push([i, j]);
      r += Casino.rnd(2);                                            // the fair coin: 0 = left, 1 = right
    }
    pts.push({ x: g.slotX(r) + jit(g.sp * .15), y: g.slotTop + g.slotH * .42 });
    return { pts, hits, seg: 0, t: 0, k: r, trail: [], hop: 95 + g.dy * 3 };
  }

  function drop() {
    if (bet > Casino.bank) { Casino.toast('뱅크롤이 부족해요 · 로비 ATM'); stopAuto(); return false; }
    Casino.audio();
    Casino.setBank(Casino.bank - bet);
    const b = makeBall(); b.bet = bet; b.n = rows; b.risk = risk;
    balls.push(b);
    stats.balls++; stats.staked += bet;
    sfx.drop(); refresh(); run();
    return true;
  }

  function land(b) {
    const mult = TABLES[b.n][b.risk][b.k];
    const owed = b.bet * mult + frac, pay = Math.floor(owed);
    frac = owed - pay;
    if (pay) Casino.setBank(Casino.bank + pay);
    stats.back += b.bet * mult;
    slotFlash.set(b.k, performance.now());
    floats.push({ x: G.slotX(b.k), y: G.slotTop - 4, t0: performance.now(), text: '×' + fmtMult(mult), m: mult });
    hist.unshift(mult); if (hist.length > 24) hist.pop();
    sfx.land(mult);
    if (mult >= 100) Casino.coinRain(60); else if (mult >= 10) Casino.coinRain(18);
    const net = b.bet * mult - b.bet;
    msg(`×${fmtMult(mult)} · ${net > 0 ? '+$' + fmt(Math.round(net)) : net < 0 ? '−$' + fmt(Math.round(-net)) : '본전'}`);
    renderHist();
  }

  function stopAuto() {
    if (auto) { clearInterval(auto.id); auto = null; }
    refresh();
  }
  function startAuto(n = 10) {
    if (auto) { stopAuto(); return; }
    if (bet > Casino.bank) { Casino.toast('뱅크롤이 부족해요 · 로비 ATM'); return; }
    auto = { left: n, id: 0 };
    const step = () => {
      if (!auto) return;
      if (Casino.view !== 'plinko' || !drop()) { stopAuto(); return; }
      if (--auto.left <= 0) stopAuto(); else refresh();
    };
    step();
    if (auto) auto.id = setInterval(step, 210);
  }

  /* ---------- animation ---------- */
  function update(now, ms) {
    for (let bi = balls.length - 1; bi >= 0; bi--) {
      const b = balls[bi];
      const dur = b.seg === 0 ? 260 : b.hop;
      b.t += ms / dur;
      while (b.t >= 1) {
        b.t -= 1; b.seg++;
        if (b.seg <= b.hits.length) {                               // arrived on a peg
          const [i, j] = b.hits[b.seg - 1];
          pegFlash.set(i + ',' + j, now); sfx.tick(i);
        }
        if (b.seg >= b.pts.length - 1) { land(b); balls.splice(bi, 1); break; }
      }
    }
    for (let i = floats.length - 1; i >= 0; i--) if (now - floats[i].t0 > 1100) floats.splice(i, 1);
    if (!balls.length && !auto) refresh();
  }
  function ballPos(b) {
    const A = b.pts[b.seg], B = b.pts[Math.min(b.seg + 1, b.pts.length - 1)], t = Math.min(1, b.t);
    const D = B.y - A.y;
    if (b.seg === 0) return { x: A.x + (B.x - A.x) * t, y: A.y + D * t * t };      // first fall from the gate
    // off a peg: a little hop up and sideways, then gravity takes it to the next peg
    return { x: A.x + (B.x - A.x) * t, y: A.y + D * (-.6 * t + 1.6 * t * t) };
  }

  /* ---------- drawing ---------- */
  const cv = $('pkCanvas'), ctx = cv.getContext('2d');
  let scale = 1;
  function slotColor(m, max) {
    if (m < 1) return ['#3b2a5c', '#c9b8ff'];
    const t = Math.min(1, Math.log(m) / Math.log(max));
    const stops = [[255, 212, 0], [255, 138, 0], [255, 45, 149], [255, 30, 60]];
    const f = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(f)), u = f - i;
    const c = stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * u));
    return [`rgb(${c})`, '#1a0610'];
  }
  function rr(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function draw(now = performance.now()) {
    const g = G, m = isMono(), tb = table(), max = tb[0];
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // backdrop
    if (m) {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,.14)';
      for (let y = 7; y < H; y += 14) for (let x = 7; x < W; x += 14) ctx.fillRect(x, y, 1.3, 1.3);
    } else {
      const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1b0838'); bg.addColorStop(1, '#0a0216');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W / 2, H * .45, 10, W / 2, H * .45, W * .7);
      glow.addColorStop(0, 'rgba(255,45,149,.14)'); glow.addColorStop(1, 'rgba(255,45,149,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    }
    // gate
    ctx.fillStyle = m ? '#000' : '#5ef2e6';
    if (!m) { ctx.shadowColor = '#23d5c8'; ctx.shadowBlur = 8; }
    rr(g.cx - g.sp * .9, g.top - g.dy * 2.1, g.sp * 1.8, 4, 2); ctx.fill();
    ctx.shadowBlur = 0;
    // pegs
    for (let i = 0; i < g.n; i++) for (let j = 0; j < i + 3; j++) {
      const x = g.pegX(i, j), y = g.pegY(i), h = pegFlash.get(i + ',' + j), a = h ? Math.max(0, 1 - (now - h) / 260) : 0;
      ctx.beginPath(); ctx.arc(x, y, g.pegR * (1 + a * .7), 0, Math.PI * 2);
      if (m) { ctx.fillStyle = '#000'; ctx.fill(); }
      else {
        ctx.fillStyle = a ? `rgba(255,${Math.round(255 - a * 120)},${Math.round(255 - a * 60)},1)` : '#e9e3ff';
        if (a) { ctx.shadowColor = '#ff2d95'; ctx.shadowBlur = 12 * a; }
        ctx.fill(); ctx.shadowBlur = 0;
      }
    }
    // slots
    const fs = Math.max(7, Math.min(13, g.sp * .42));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let k = 0; k <= g.n; k++) {
      const mult = tb[k], x = g.slotX(k), w = g.sp - 3, h = slotFlash.get(k), a = h ? Math.max(0, 1 - (now - h) / 420) : 0;
      const y = g.slotTop + a * 5;
      if (m) {
        const dark = mult >= 1;
        ctx.fillStyle = dark ? '#000' : '#fff'; rr(x - w / 2, y, w, g.slotH, 2); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#000'; ctx.stroke();
        if (mult >= 10) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; rr(x - w / 2 + 2.5, y + 2.5, w - 5, g.slotH - 5, 1); ctx.stroke(); }
        if (a) { ctx.fillStyle = `rgba(${dark ? '255,255,255' : '0,0,0'},${a * .45})`; rr(x - w / 2, y, w, g.slotH, 2); ctx.fill(); }
        ctx.fillStyle = dark ? '#fff' : '#000'; ctx.font = `700 ${fs * .92}px "Space Mono",monospace`;
      } else {
        const [bgc, fg] = slotColor(mult, max);
        ctx.fillStyle = bgc;
        if (a) { ctx.shadowColor = bgc; ctx.shadowBlur = 16 * a; }
        rr(x - w / 2, y, w, g.slotH, 4); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,.25)'; rr(x - w / 2 + 1, y + 1, w - 2, g.slotH * .35, 3); ctx.fill();
        ctx.fillStyle = fg; ctx.font = `400 ${fs}px "Bungee",Impact,sans-serif`;
      }
      ctx.fillText(fmtMult(mult), x, y + g.slotH / 2 + 1, w - 2);
    }
    // balls
    for (const b of balls) {
      const p = ballPos(b);
      if (!m && !reduced()) {
        b.trail.push(p); if (b.trail.length > 7) b.trail.shift();
        b.trail.forEach((q, i) => { ctx.beginPath(); ctx.arc(q.x, q.y, g.ballR * (i + 1) / 9, 0, Math.PI * 2); ctx.fillStyle = `rgba(255,45,149,${(i + 1) / 30})`; ctx.fill(); });
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, g.ballR, 0, Math.PI * 2);
      if (m) { ctx.fillStyle = '#000'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke(); }
      else {
        const gr = ctx.createRadialGradient(p.x - g.ballR * .35, p.y - g.ballR * .4, g.ballR * .1, p.x, p.y, g.ballR);
        gr.addColorStop(0, '#fff'); gr.addColorStop(.45, '#ff9ad5'); gr.addColorStop(1, '#d6127a');
        ctx.fillStyle = gr; ctx.shadowColor = '#ff2d95'; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0;
      }
    }
    // rising labels
    for (const f of floats) {
      const u = (now - f.t0) / 1100;
      ctx.globalAlpha = Math.max(0, 1 - u);
      ctx.font = m ? `700 13px "Space Mono",monospace` : `400 15px "Bungee",Impact,sans-serif`;
      ctx.fillStyle = m ? '#000' : f.m >= 1 ? '#ffd400' : '#c9b8ff';
      if (!m) { ctx.shadowColor = '#000'; ctx.shadowBlur = 4; }
      ctx.fillText(f.text, f.x, f.y - u * 34);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
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
    if (Casino.view !== 'plinko') { running = false; return; }
    const ms = Math.min(50, now - last); last = now;
    update(now, ms); draw(now);
    if (balls.length || floats.length || auto || now - Math.max(0, ...slotFlash.values(), ...pegFlash.values()) < 500) requestAnimationFrame(frame);
    else { running = false; draw(now); }
  }
  function run() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }

  /* ---------- panel ---------- */
  const bankLed = window.CasinoLED($('pkBank'), 8);
  function renderHist() {
    const h = $('pkHist');
    if (!hist.length) { h.innerHTML = '<span class="g-empty">아직 떨어뜨린 공이 없어요</span>'; $('pkStats').innerHTML = ''; return; }
    h.innerHTML = hist.map((m, i) => `<span class="pk-h ${m >= 10 ? 'big' : m >= 1 ? 'win' : 'lose'}${i === 0 ? ' new' : ''}">×${fmtMult(m)}</span>`).join('');
    const net = Math.round(stats.back - stats.staked);
    $('pkStats').innerHTML = `<span>공 <b>${fmt(stats.balls)}</b></span><span>베팅 <b>$${fmt(stats.staked)}</b></span><span>손익 <b class="${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : '−'}$${fmt(Math.abs(net))}</b></span>`;
  }

  function refresh() {
    bankLed(Casino.bank);
    const busy = balls.length > 0 || !!auto;
    document.querySelectorAll('#pkRows button').forEach(b => { const on = +b.dataset.rows === rows; b.setAttribute('aria-checked', on); b.disabled = busy && !on; });
    document.querySelectorAll('#pkRisk button').forEach(b => { const on = b.dataset.risk === risk; b.setAttribute('aria-checked', on); b.disabled = busy && !on; });
    $('pkDropS').textContent = '$' + fmt(bet);
    $('pkAutoL').textContent = auto ? 'STOP' : 'AUTO ×10';
    $('pkAutoS').textContent = auto ? `${auto.left}개 남음` : '$' + fmt(bet * 10);
    $('pkAuto').classList.toggle('on', !!auto);
    document.querySelectorAll('#pkChips .bchip').forEach(b => b.disabled = !!auto);
    syncChips();
  }
  const syncChips = window.CasinoChipTray($('pkChips'), CHIPS, () => bet, v => {
    if (auto) return;
    bet = v; save(); sfx.chip(); refresh();
  });

  function setBoard(n, r) {
    if (balls.length || auto) { Casino.toast('공이 다 떨어진 뒤에 바꿀 수 있어요'); return; }
    rows = n; risk = r; G = geometry(rows); save();
    const tb = table();
    msg(`${rows}줄 · ${RISK_NAME[risk]} · 최대 ×${fmtMult(tb[0])}`);
    sfx.chip(); refresh(); draw();
  }
  $('pkRows').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !b.disabled) setBoard(+b.dataset.rows, risk); });
  $('pkRisk').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !b.disabled) setBoard(rows, b.dataset.risk); });
  $('pkDrop').addEventListener('click', () => { if (!auto) drop(); });
  $('pkAuto').addEventListener('click', () => startAuto(10));
  addEventListener('keydown', e => {
    if (Casino.view !== 'plinko' || e.repeat || e.target.closest?.('button,input')) return;
    if (e.code === 'Space') { e.preventDefault(); if (!auto) drop(); }
  });

  Casino.onBank(() => { if (Casino.view === 'plinko') bankLed(Casino.bank); });
  Casino.onTheme(() => { if (Casino.view === 'plinko') draw(); });

  G = geometry(rows);
  renderHist(); refresh();

  // debug / balancing hooks (headless): draw n outcomes with the real coin and report the empirical RTP
  window.__plinko = {
    get state() { return { rows, risk, bet, balls: balls.length, auto: !!auto, frac, stats: { ...stats } }; },
    sample(n, r = rows, k = risk) {
      let back = 0; const counts = new Array(r + 1).fill(0);
      for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < r; j++) s += Casino.rnd(2); counts[s]++; back += TABLES[r][k][s]; }
      return { rtp: back / n, counts };
    }
  };

  Casino.register('plinko', {
    title: () => isMono() ? 'lucky plinko — 50:50 pegs' : 'LUCKY PLINKO — Drop · Bounce · Win',
    enter() { resize(); refresh(); draw(); },
    canLeave: () => !balls.length && !auto,
    leave() { stopAuto(); }
  });
})();
