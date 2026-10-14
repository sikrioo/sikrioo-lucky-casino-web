/* ===== PERFECT STOP ===== */
(() => {
  const $ = id => document.getElementById(id);
  const fmt = n => n.toLocaleString('en-US');
  const isMono = () => Casino.theme === '74';
  const LED = window.CasinoLED;
  const bankLed = LED($('twBank'), 8);
  const tS = LED($('twTS'), 2, { zero: true }), tM = LED($('twTM'), 3, { zero: true });
  const cS = LED($('twCS'), 2, { zero: true, noRoll: true }), cM = LED($('twCM'), 3, { zero: true, noRoll: true });
  const betLed = LED($('twBet'), 7);
  const CHIPS = [5, 25, 100, 500, 1000, 5000, 25000];

  const MODES = {
    show:  { name: 'SHOW',  range: 40,  hideAt: Infinity,
             tiers: [[0, 20, 'PERFECT'], [5, 5, 'GREAT'], [15, 2, 'GOOD'], [30, 1, 'SAFE']] },
    blind: { name: 'BLIND', range: 320, hideAt: 2000,
             tiers: [[10, 30, 'PERFECT'], [30, 10, 'GREAT'], [80, 4, 'GOOD'], [150, 2, 'NICE'], [250, 1, 'SAFE']] }
  };
  let st = {}; try { st = JSON.parse(localStorage.getItem('casino-tw')) || {}; } catch (e) {}
  let mode = MODES[st.mode] ? st.mode : 'show';
  let bet = typeof st.bet === 'number' ? st.bet : 100;
  let sel = 100, phase = 'idle', target = 0, t0 = 0, raf = 0, hidden = false, lastSec = -1;
  const hist = [];
  const save = () => { try { localStorage.setItem('casino-tw', JSON.stringify({ mode, bet })); } catch (e) {} };

  const screen = $('twScreen'), verdict = $('twVerdict'), btn = $('twBtn'), btnLabel = $('twBtnLabel'), marker = $('twMarker');

  const sfx = {
    start() { if (isMono()) { Casino.noise(0, .02, .2, 3000); Casino.tone(1800, 0, .05, 'sine', .05); } else Casino.tone(880, 0, .08, 'square', .05, 1320); },
    tick()  { if (isMono()) Casino.noise(0, .01, .1, 4000); else Casino.tone(1500, 0, .02, 'square', .025); },
    stop()  { if (isMono()) { Casino.noise(0, .05, .35, 400); Casino.tone(70, 0, .1, 'sine', .3); } else { Casino.noise(0, .06, .25, 700); Casino.tone(110, 0, .1, 'sine', .25); } },
    win()   { if (isMono()) Casino.tone(1568, 0, 1, 'sine', .12); else [523, 659, 784, 1047].forEach((f, i) => Casino.tone(f, i * .08, .14, 'square', .05)); },
    perfect() {
      if (isMono()) for (let i = 0; i < 6; i++) Casino.tone(i % 2 ? 1760 : 1568, i * .14, .5, 'sine', .1);
      else [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => { Casino.tone(f, i * .1, .15, 'square', .05); Casino.tone(f / 2, i * .1, .15, 'triangle', .05); });
    },
    push()  { Casino.tone(440, 0, .12, 'sine', .07); Casino.tone(440, .14, .12, 'sine', .07); },
    lose()  { if (isMono()) Casino.noise(0, .25, .15, 300); else Casino.tone(220, 0, .3, 'sawtooth', .05, 90); },
    chip()  { if (isMono()) Casino.noise(0, .02, .18, 2500); else Casino.tone(1200, 0, .05, 'triangle', .07, 900); }
  };

  const showTime = ms => { ms = Math.max(0, Math.round(ms)); cS(Math.floor(ms / 1000) % 100); cM(ms % 1000); };
  const showTarget = () => { tS(Math.floor(target / 1000)); tM(target % 1000); };
  const newTarget = () => { target = 3000 + Casino.rnd(7000); showTarget(); };

  function renderZones() {
    const m = MODES[mode], z = $('twZones');
    const colors = isMono() ? ['#000', '#444', '#777', '#aaa', '#d4d4d4'] : ['#ff6bd5', '#ffd400', '#7cff6b', '#5ef2e6', '#2a6cf0'];
    z.innerHTML = '';
    [...m.tiers].reverse().forEach((t, ri) => {
      const idx = m.tiers.length - 1 - ri, w = Math.max(.8, t[0] / m.range * 100);
      const i = document.createElement('i');
      i.style.left = (50 - w / 2) + '%'; i.style.width = w + '%';
      i.style.background = colors[idx]; i.style.opacity = isMono() ? 1 : (.35 + .65 * (1 - idx / m.tiers.length));
      z.appendChild(i);
    });
    $('twTickL').textContent = `−${m.range}ms`; $('twTickR').textContent = `+${m.range}ms`;
  }
  function renderRows(hitIdx) {
    const m = MODES[mode];
    $('twModeName').textContent = m.name;
    const rows = m.tiers.map((t, i) => `<div class="tw-row${i === hitIdx ? ' hit' : ''}"><span class="t">${t[2]}</span><span class="r">${t[0] === 0 ? '±0ms' : '≤ ±' + t[0] + 'ms'}</span><span class="m">×${t[1]}</span></div>`);
    rows.push(`<div class="tw-row${hitIdx === -1 ? ' hit' : ''}"><span class="t">MISS</span><span class="r">그 외</span><span class="m">×0</span></div>`);
    $('twRows').innerHTML = rows.join('');
  }
  function renderHist() {
    const h = $('twHist');
    if (!hist.length) { h.innerHTML = '<span class="g-empty">아직 기록이 없어요</span>'; return; }
    h.innerHTML = hist.map(x => `<span class="tw-h ${x.c}">${x.t}</span>`).join('');
  }
  function refresh() {
    bankLed(Casino.bank); betLed(bet);
    const busy = phase === 'running';
    document.querySelectorAll('#twView .tw-mode').forEach(b => { b.classList.toggle('on', b.dataset.mode === mode); b.disabled = busy; });
    document.querySelectorAll('#twChips .bchip, #twClear, #twX2').forEach(b => b.disabled = busy);
    syncChips();
  }
  const syncChips = window.CasinoChipTray($('twChips'), CHIPS, () => sel, (v) => {
    if (phase === 'running') return;
    sel = v;
    if (bet + v > Casino.bank) { Casino.toast('뱅크롤보다 많이 걸 수 없어요'); syncChips(); return; }
    bet += v; sfx.chip(); save(); refresh();
  });

  function setBtn(kind, label) { btn.classList.remove('ready', 'next'); if (kind) btn.classList.add(kind); btnLabel.textContent = label; }

  function start(ts) {
    if (bet <= 0) { Casino.toast('먼저 베팅하세요'); return; }
    if (bet > Casino.bank) { Casino.toast('뱅크롤이 부족해요 · 로비 ATM'); return; }
    Casino.setBank(Casino.bank - bet); Casino.wager(bet, 'stopwatch');
    phase = 'running'; t0 = ts; hidden = false; lastSec = 0;
    screen.classList.add('running'); screen.classList.remove('blind');
    marker.classList.remove('show'); verdict.className = 'tw-verdict'; verdict.innerHTML = '<em>' + (mode === 'blind' ? '2초 후 화면이 꺼져요' : '목표에서 멈추세요') + '</em>';
    renderRows(null); setBtn('', 'STOP'); sfx.start(); refresh();
    const m = MODES[mode];
    const loop = () => {
      const el = performance.now() - t0;
      if (!hidden && el >= m.hideAt) { hidden = true; screen.classList.add('blind'); }
      if (!hidden) showTime(el);
      const sec = Math.floor(el / 1000);
      if (mode === 'show' && sec !== lastSec) { lastSec = sec; if (sec > 0) sfx.tick(); }
      if (el > target + 3000) { stop(t0 + el, true); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function stop(ts, timeout) {
    cancelAnimationFrame(raf);
    const el = Math.max(0, ts - t0);
    phase = 'result';
    screen.classList.remove('running', 'blind');
    showTime(el); sfx.stop();
    const m = MODES[mode];
    const err = Math.round(el) - target, a = Math.abs(err);
    const idx = timeout ? -1 : m.tiers.findIndex(t => a <= t[0]);
    const tier = idx >= 0 ? m.tiers[idx] : null;
    const payout = tier ? Math.floor(bet * tier[1]) : 0;
    if (payout) Casino.setBank(Casino.bank + payout);
    const net = payout - bet;
    const dir = err < 0 ? '빠름 · EARLY' : err > 0 ? '늦음 · LATE' : '정확히 일치';
    const sign = err > 0 ? '+' : err < 0 ? '−' : '±';
    const kind = !tier ? 'lose' : tier[1] > 1 ? (idx === 0 ? 'perfect' : 'win') : 'push';
    verdict.className = 'tw-verdict ' + kind;
    verdict.innerHTML = `<b>${timeout ? 'TIME OUT' : tier ? tier[2] : 'MISS'}</b>` +
      `<em>${sign}${(a / 1000).toFixed(3)}s ${dir}</em>` +
      `<span>${tier ? '×' + tier[1] + ' · ' : ''}${net > 0 ? '+$' + fmt(net) : net < 0 ? '−$' + fmt(-net) : '본전'}</span>`;
    const pos = 50 + err / m.range * 50;
    marker.style.left = Math.max(0, Math.min(100, pos)) + '%';
    marker.classList.toggle('out', pos < 0 || pos > 100);
    marker.classList.add('show');
    renderRows(idx);
    hist.unshift({ t: (timeout ? 'T/O' : (err > 0 ? '+' : '') + err + 'ms'), c: kind === 'lose' ? 'l' : kind === 'push' ? 'p' : 'w' });
    if (hist.length > 12) hist.pop();
    renderHist();
    if (kind === 'perfect') { sfx.perfect(); Casino.coinRain(50); }
    else if (kind === 'win') { sfx.win(); if (tier[1] >= 5) Casino.coinRain(24); }
    else if (kind === 'push') sfx.push(); else sfx.lose();
    setBtn('next', 'NEXT');
    if (bet > Casino.bank) bet = Math.min(bet, Casino.bank);
    save(); refresh();
  }

  function next() {
    phase = 'idle'; newTarget(); showTime(0);
    marker.classList.remove('show'); renderRows(null);
    verdict.className = 'tw-verdict'; verdict.innerHTML = '목표 시간을 확인하고 START';
    setBtn('ready', 'START'); refresh();
  }

  function act(ts) {
    Casino.audio();
    if (!ts || Math.abs(ts - performance.now()) > 2000) ts = performance.now();
    btn.classList.add('press'); setTimeout(() => btn.classList.remove('press'), 90);
    if (phase === 'idle') start(ts);
    else if (phase === 'running') stop(ts, false);
    else next();
  }
  btn.addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); act(e.timeStamp); });
  btn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); act(e.timeStamp); } });
  addEventListener('keydown', e => {
    if (Casino.view !== 'stopwatch' || e.code !== 'Space' || e.repeat) return;
    e.preventDefault(); act(e.timeStamp);
  });
  document.querySelectorAll('#twView .tw-mode').forEach(b => b.addEventListener('click', () => {
    if (phase === 'running') return;
    mode = b.dataset.mode; save(); sfx.chip();
    renderZones(); renderRows(null); marker.classList.remove('show'); refresh();
  }));
  $('twClear').onclick = () => { if (phase === 'running') return; bet = 0; save(); refresh(); };
  $('twX2').onclick = () => {
    if (phase === 'running') return;
    if (bet * 2 > Casino.bank) { Casino.toast('뱅크롤보다 많이 걸 수 없어요'); return; }
    bet = Math.max(bet * 2, 5); save(); sfx.chip(); refresh();
  };
  Casino.onBank(() => { if (Casino.view === 'stopwatch') bankLed(Casino.bank); });
  Casino.onTheme(() => { renderZones(); });

  newTarget(); showTime(0); renderZones(); renderRows(null); renderHist(); setBtn('ready', 'START'); refresh();

  Casino.register('stopwatch', {
    title: () => isMono() ? 'perfect stop — precision' : 'PERFECT STOP — Stop the clock',
    enter() { if (bet > Casino.bank) bet = Casino.bank; refresh(); },
    canLeave: () => phase !== 'running',
    leave() { if (phase === 'result') next(); }
  });
})();
