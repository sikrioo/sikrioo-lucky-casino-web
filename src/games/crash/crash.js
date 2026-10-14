/* ===== LUCKY CRASH =====
 * The crash point is drawn the moment the bet goes in (config.js has the maths); the rocket then just flies
 * until it reaches it. CASH OUT pays the multiplier on screen, AUTO pays exactly the target. */
import { CHIPS, AUTO, crashPoint, multAt, timeFor } from './config.js';

(() => {
  const $ = id => document.getElementById(id);
  const fmt = n => n.toLocaleString('en-US');
  const isMono = () => Casino.theme === '74';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fx = m => '×' + (m >= 1000 ? Math.floor(m).toLocaleString('en-US') : m.toFixed(2));

  /* ---------- settings ---------- */
  let saved = {}; try { saved = JSON.parse(localStorage.getItem('casino-crash')) || {}; } catch (e) {}
  let bet = CHIPS.includes(saved.bet) ? saved.bet : 25;
  let autoI = Number.isInteger(saved.autoI) && AUTO[saved.autoI] !== undefined ? saved.autoI : 0;
  const save = () => { try { localStorage.setItem('casino-crash', JSON.stringify({ bet, autoI })); } catch (e) {} };

  /* ---------- round state ---------- */
  // phase: idle → count (lift-off) → fly → crashed → idle
  let phase = 'idle', t0 = 0, X = 1, m = 1, crashedAt = 0, live = null, frac = 0;
  let shown = null;            // last round's curve, kept on screen until the next launch: { X, cashed }
  const hist = [], stats = { rounds: 0, staked: 0, back: 0 };
  let sparks = [], nextBeep = 1.5;
  const COUNT_MS = 900;

  /* ---------- sound ---------- */
  const sfx = {
    chip() { if (isMono()) Casino.noise(0, .02, .18, 2500); else { Casino.tone(1200, 0, .05, 'triangle', .07, 900); Casino.tone(1800, .03, .04, 'triangle', .04); } },
    lift() { if (isMono()) Casino.noise(0, .5, .12, 900); else { Casino.tone(110, 0, .8, 'sawtooth', .04, 440); Casino.noise(0, .7, .1, 1200); } },
    beep(i) { if (isMono()) Casino.tone(1400 + i * 60, 0, .05, 'sine', .05); else Casino.tone(660 + i * 70, 0, .06, 'square', .025); },
    cash() { if (isMono()) { Casino.tone(1568, 0, .5, 'sine', .1); Casino.tone(2093, .08, .5, 'sine', .07); }
             else [784, 1047, 1319, 1568].forEach((f, i) => Casino.tone(f, i * .06, .14, 'square', .05)); },
    boom() { Casino.noise(0, .6, .35, isMono() ? 700 : 400); Casino.tone(90, 0, .5, 'sine', .3, 40); }
  };

  /* ---------- game flow ---------- */
  const msgEl = $('crMsg'), bigEl = $('crBig'), subEl = $('crSub');
  const msg = t => { msgEl.textContent = t; };
  const autoX = () => AUTO[autoI];

  function launch() {
    if (phase !== 'idle') return;
    if (bet > Casino.bank) { Casino.toast('뱅크롤이 부족해요 · 로비 ATM'); return; }
    Casino.audio();
    Casino.setBank(Casino.bank - bet); Casino.wager(bet, 'crash');
    live = { bet, cashed: 0 };
    stats.rounds++; stats.staked += bet;
    const u = (Casino.rnd(4294967295) + 1) / 4294967296;            // (0, 1]
    X = crashPoint(u);
    m = 1; sparks = []; nextBeep = 1.5; shown = null;
    phase = 'count'; t0 = performance.now();
    bigEl.className = 'cr-big count'; bigEl.textContent = 'LIFT-OFF';
    subEl.textContent = autoX() ? `AUTO ${fx(autoX())}` : '';
    msg(`$${fmt(bet)} 베팅 · 터지기 전에 CASH OUT!`);
    sfx.lift(); refresh(); run();
  }

  function payout(mult) {
    const owed = live.bet * mult + frac, pay = Math.floor(owed);
    frac = owed - pay;
    if (pay) Casino.setBank(Casino.bank + pay);
    stats.back += live.bet * mult;
    return live.bet * mult;
  }
  function cashOut(at) {
    if (!live || live.cashed || phase !== 'fly') return;
    const mult = Math.min(at, X);
    live.cashed = mult;
    const won = payout(mult);
    bigEl.classList.add('cashed');
    subEl.textContent = `CASHED ${fx(mult)} · +$${fmt(Math.floor(won - live.bet))}`;
    msg(`${fx(mult)} 캐시아웃 · $${fmt(Math.floor(won))} 받음`);
    sfx.cash();
    if (mult >= 10) Casino.coinRain(mult >= 50 ? 60 : 24);
    refresh();
  }

  function crash() {
    m = X; phase = 'crashed'; crashedAt = performance.now();
    shown = { X, cashed: live ? live.cashed : 0 };
    hist.unshift(X); if (hist.length > 24) hist.pop();
    bigEl.className = 'cr-big crashed'; bigEl.textContent = fx(X);
    if (live && !live.cashed) {
      subEl.textContent = X <= 1 ? 'INSTANT BUST' : 'BUSTED';
      msg(X <= 1 ? `발사하자마자 ${fx(X)}에서 터졌어요 · −$${fmt(live.bet)}` : `${fx(X)}에서 터졌어요 · −$${fmt(live.bet)}`);
    } else if (live) {
      msg(`로켓은 ${fx(X)}에서 터졌어요 · 당신은 ${fx(live.cashed)}에 탈출`);
    }
    if (!reduced()) {
      const tip = tipPos();
      for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 120; sparks.push({ x: tip.x, y: tip.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1 }); }
    }
    sfx.boom(); renderHist(); refresh();
  }

  function finish() {        // back to betting
    phase = 'idle'; live = null; refresh();
    if (!bigEl.classList.contains('crashed')) { bigEl.className = 'cr-big'; bigEl.textContent = '×1.00'; subEl.textContent = ''; }
  }

  function update(now) {
    if (phase === 'count' && now - t0 >= COUNT_MS) {
      phase = 'fly'; t0 = now; bigEl.className = 'cr-big fly';
      if (X <= 1) { crash(); return; }
      refresh();                                   // CASH OUT becomes live
    }
    if (phase === 'fly') {
      const sec = (now - t0) / 1000;
      let next = multAt(sec);
      const target = live && !live.cashed && autoX() ? autoX() : 0;
      if (target && next >= target && target <= X) { m = target; cashOut(target); }   // auto pays the target exactly
      if (next >= X) { m = X; crash(); return; }
      m = Math.floor(next * 100) / 100;
      bigEl.textContent = fx(m);
      if (m >= nextBeep) { sfx.beep(Math.min(12, Math.log2(nextBeep) * 3 | 0)); nextBeep = nextBeep < 2 ? 2 : nextBeep < 3 ? 3 : nextBeep < 5 ? 5 : nextBeep * 2; }
      $('crGoS').textContent = live && !live.cashed ? '$' + fmt(Math.floor(live.bet * m)) : '';
    }
    if (phase === 'crashed' && now - crashedAt > 1500) finish();
  }

  /* ---------- drawing ---------- */
  const cv = $('crCanvas'), ctx = cv.getContext('2d');
  const W = 360, H = 240, PL = 42, PR = 14, PT = 14, PB = 24;
  let scale = 1, last = 0;
  const over = () => phase === 'crashed' || (phase === 'idle' && shown);      // a finished round is on screen
  const flightSec = () => phase === 'fly' ? (performance.now() - t0) / 1000 : over() ? timeFor(X) : 0;
  function axes() {
    const sec = flightSec(), cur = over() ? X : phase === 'fly' ? m : 1;
    const tMax = Math.max(8, sec * 1.18), mMax = Math.max(2, 1 + (cur - 1) * 1.28);
    return { tMax, mMax, px: s => PL + s / tMax * (W - PL - PR), py: v => H - PB - (v - 1) / (mMax - 1) * (H - PT - PB) };
  }
  function tipPos() {
    const a = axes(), sec = flightSec();
    return { x: a.px(sec), y: a.py(over() ? X : m) };
  }
  const niceStep = (span, n) => { const raw = span / n, p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 5, 10].map(k => k * p).find(s => s >= raw); };

  function draw(now = performance.now(), dt = 0) {
    const mono = isMono(), a = axes();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    // backdrop + grid
    if (mono) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
    else {
      const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#12052a'); bg.addColorStop(1, '#05010d');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 40; i++) { const x = (i * 97 + 13) % W, y = (i * 53 + 7) % (H - PB); ctx.fillStyle = `rgba(255,255,255,${.15 + (i % 3) * .1})`; ctx.fillRect(x, y, 1, 1); }
    }
    ctx.font = mono ? '700 9px "Space Mono",monospace' : '14px "VT323",monospace';
    ctx.lineWidth = 1;
    const ys = niceStep(a.mMax - 1, 4);
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let v = 1; v <= a.mMax + 1e-9; v += ys) {
      const y = a.py(v);
      ctx.strokeStyle = mono ? 'rgba(0,0,0,.15)' : 'rgba(160,107,255,.18)';
      ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
      ctx.fillStyle = mono ? '#000' : '#bfaecc'; ctx.fillText(v.toFixed(v < 10 && ys < 1 ? 1 : 0) + '×', PL - 4, y);
    }
    const xs = niceStep(a.tMax, 5);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let s = 0; s <= a.tMax + 1e-9; s += xs) { ctx.fillStyle = mono ? '#000' : '#bfaecc'; ctx.fillText(s + 's', a.px(s), H - PB + 6); }
    ctx.strokeStyle = mono ? '#000' : 'rgba(233,227,255,.5)'; ctx.lineWidth = mono ? 2 : 1.2;
    ctx.beginPath(); ctx.moveTo(PL, PT); ctx.lineTo(PL, H - PB); ctx.lineTo(W - PR, H - PB); ctx.stroke();

    // the curve
    if (phase === 'fly' || over()) {
      const sec = flightSec(), top = over() ? X : m;
      const busted = over();
      if (sec > 0) {
        const N = 64, pts = [];
        for (let i = 0; i <= N; i++) { const s = sec * i / N; pts.push([a.px(s), a.py(Math.min(top, multAt(s)))]); }
        if (!mono) {
          const fill = ctx.createLinearGradient(0, PT, 0, H - PB);
          fill.addColorStop(0, busted ? 'rgba(255,40,60,.35)' : 'rgba(255,45,149,.35)'); fill.addColorStop(1, 'rgba(255,45,149,0)');
          ctx.beginPath(); ctx.moveTo(PL, H - PB); pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(pts[N][0], H - PB); ctx.closePath();
          ctx.fillStyle = fill; ctx.fill();
        } else {
          ctx.save(); ctx.beginPath(); ctx.moveTo(PL, H - PB); pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(pts[N][0], H - PB); ctx.closePath(); ctx.clip();
          ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
          for (let x = -H; x < W; x += 6) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke(); }
          ctx.restore();
        }
        ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        ctx.lineWidth = mono ? 3 : 3.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = mono ? '#000' : busted ? '#ff3b4a' : '#ff6bd5';
        if (!mono) { ctx.shadowColor = busted ? '#ff1e3c' : '#ff2d95'; ctx.shadowBlur = 12; }
        ctx.stroke(); ctx.shadowBlur = 0;
        // where you jumped out
        const cashed = live ? live.cashed : shown ? shown.cashed : 0;
        if (cashed) {
          const cx = a.px(timeFor(cashed)), cy = a.py(cashed);
          ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
          ctx.fillStyle = mono ? '#fff' : '#18e05a'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = mono ? '#000' : '#fff'; ctx.stroke();
          ctx.font = mono ? '700 10px "Space Mono",monospace' : '400 11px "Bungee",Impact,sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = mono ? '#000' : '#18e05a';
          ctx.fillText(fx(cashed), Math.min(cx + 6, W - 70), cy - 4);
        }
        if (!busted) drawRocket(pts[N][0], pts[N][1], Math.atan2(pts[N][1] - pts[N - 2][1], pts[N][0] - pts[N - 2][0]), mono, now);
      }
    }
    if (phase === 'count') {           // on the pad
      const shake = reduced() ? 0 : Math.sin(now / 30) * 1.2;
      drawRocket(PL + 6 + shake, H - PB - 4, -Math.PI / 4, mono, now);
    }
    // explosion
    if (sparks.length) {
      const d = dt / 1000;
      sparks.forEach(s => { s.x += s.vx * d; s.y += s.vy * d; s.vy += 140 * d; s.life -= d * 1.3; });
      sparks = sparks.filter(s => s.life > 0);
      sparks.forEach(s => { ctx.globalAlpha = Math.max(0, s.life); ctx.fillStyle = mono ? '#000' : s.life > .6 ? '#ffd400' : '#ff3b4a'; ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3); });
      ctx.globalAlpha = 1;
    }
  }
  function drawRocket(x, y, ang, mono, now) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const fl = 6 + (reduced() ? 0 : Math.sin(now / 40) * 2.5);
    ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(-9 - fl, 0); ctx.lineTo(-9, 3); ctx.closePath();
    ctx.fillStyle = mono ? '#000' : '#ffb000'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.quadraticCurveTo(4, -6, -8, -5); ctx.lineTo(-8, 5); ctx.quadraticCurveTo(4, 6, 10, 0); ctx.closePath();
    ctx.fillStyle = mono ? '#fff' : '#f4f7fa'; ctx.fill();
    ctx.lineWidth = mono ? 2 : 1.2; ctx.strokeStyle = mono ? '#000' : '#7d8794'; ctx.stroke();
    ctx.beginPath(); ctx.arc(2, 0, 2, 0, Math.PI * 2); ctx.fillStyle = mono ? '#000' : '#5ef2e6'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-5, -5); ctx.lineTo(-10, -9); ctx.lineTo(-8, -4); ctx.moveTo(-5, 5); ctx.lineTo(-10, 9); ctx.lineTo(-8, 4);
    ctx.strokeStyle = mono ? '#000' : '#ff2d95'; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.restore();
  }

  function resize() {
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.width * H / W * dpr);
    scale = cv.width / W; draw();
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(cv); else addEventListener('resize', resize);

  let running = false;
  function frame(now) {
    if (Casino.view !== 'crash') { running = false; return; }
    const dt = Math.min(50, now - last); last = now;
    update(now); draw(now, dt);
    if (phase !== 'idle' || sparks.length) requestAnimationFrame(frame); else { running = false; draw(now); }
  }
  function run() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }

  /* ---------- panel & controls ---------- */
  const bankLed = window.CasinoLED($('crBank'), 8);
  const goBtn = $('crGo');
  function renderHist() {
    const h = $('crHist');
    if (!hist.length) { h.innerHTML = '<span class="g-empty">아직 발사한 적이 없어요</span>'; $('crStats').innerHTML = ''; return; }
    h.innerHTML = hist.map((x, i) => `<span class="cr-h ${x >= 10 ? 'hi' : x >= 2 ? 'mid' : 'lo'}${i === 0 ? ' new' : ''}">${fx(x)}</span>`).join('');
    const net = Math.round(stats.back - stats.staked);
    $('crStats').innerHTML = stats.rounds ? `<span>판 <b>${fmt(stats.rounds)}</b></span><span>베팅 <b>$${fmt(stats.staked)}</b></span><span>손익 <b class="${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : '−'}$${fmt(Math.abs(net))}</b></span>` : '';
  }
  function refresh() {
    bankLed(Casino.bank);
    const idle = phase === 'idle' || (phase === 'crashed' && performance.now() - crashedAt > 600);
    const canCash = live && !live.cashed && (phase === 'fly' || phase === 'count');
    goBtn.classList.toggle('cash', !!canCash);
    const riding = live && live.cashed && phase === 'fly';     // already out, the rocket is still going
    $('crGoL').textContent = canCash ? 'CASH OUT' : riding ? 'CASHED' : 'BET';
    $('crGoS').textContent = canCash ? '$' + fmt(Math.floor(live.bet * m)) : riding ? fx(live.cashed) : '$' + fmt(bet);
    goBtn.disabled = !(idle || canCash) || (canCash && phase === 'count');
    $('crAutoV').textContent = autoX() ? fx(autoX()) : 'OFF';
    const lock = !(phase === 'idle' || phase === 'crashed');
    $('crAutoDn').disabled = lock || autoI === 0; $('crAutoUp').disabled = lock || autoI === AUTO.length - 1;
    document.querySelectorAll('#crChips .bchip').forEach(b => b.disabled = lock);
    syncChips();
  }
  const syncChips = window.CasinoChipTray($('crChips'), CHIPS, () => bet, v => {
    if (phase === 'count' || phase === 'fly') return;
    bet = v; save(); sfx.chip(); refresh();
  });
  function press() {
    if (live && !live.cashed && phase === 'fly') { cashOut(m); return; }
    if (phase === 'crashed') finish();
    if (phase === 'idle') launch();
  }
  goBtn.addEventListener('click', press);
  const stepAuto = d => { if (phase === 'count' || phase === 'fly') return; autoI = Math.max(0, Math.min(AUTO.length - 1, autoI + d)); save(); sfx.chip(); refresh(); };
  $('crAutoDn').addEventListener('click', () => stepAuto(-1));
  $('crAutoUp').addEventListener('click', () => stepAuto(1));
  addEventListener('keydown', e => {
    if (Casino.view !== 'crash' || e.repeat || e.target.closest?.('button,input')) return;
    if (e.code === 'Space') { e.preventDefault(); press(); }
  });
  setInterval(() => { if (Casino.view === 'crash' && phase === 'crashed') refresh(); }, 250);

  Casino.onBank(() => { if (Casino.view === 'crash') bankLed(Casino.bank); });
  Casino.onTheme(() => { if (Casino.view === 'crash') draw(); });
  renderHist(); refresh();

  // balancing hook: draw n crash points with the real RNG and report what a fixed target would have returned
  window.__crash = {
    get state() { return { phase, X, m, live, frac, bet, auto: autoX(), stats: { ...stats } }; },
    sample(n, target = 2) {
      let back = 0, busts = 0;
      for (let i = 0; i < n; i++) { const x = crashPoint((Casino.rnd(4294967295) + 1) / 4294967296); if (x >= target) back += target; if (x <= 1) busts++; }
      return { rtp: back / n, instantBust: busts / n };
    }
  };

  Casino.register('crash', {
    title: () => isMono() ? 'lucky crash — cash out in time' : 'LUCKY CRASH — Ride · Cash out',
    enter() { resize(); refresh(); draw(); if (phase !== 'idle') run(); },
    canLeave: () => !(live && !live.cashed && (phase === 'count' || phase === 'fly')),
    leave() { if (phase !== 'idle') { if (phase === 'count' || phase === 'fly') { hist.unshift(X); renderHist(); } phase = 'idle'; live = null; shown = null; sparks = []; bigEl.className = 'cr-big'; bigEl.textContent = '×1.00'; subEl.textContent = ''; refresh(); } }
  });
})();
