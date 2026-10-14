/* ===== HI-LO DICE ===== */
(() => {
  const $ = id => document.getElementById(id);
  const fmt = n => n.toLocaleString('en-US');
  const isMono = () => Casino.theme === '74';
  const bankLed = window.CasinoLED($('hlBank'), 8);
  const sumLed = window.CasinoLED($('hlSum'), 2);
  const CHIPS = [5, 25, 100, 500, 1000, 5000, 25000];
  const PAY = { low: 2, seven: 5, high: 2 };  // total returned per unit bet (1:1, 4:1, 1:1)
  const NAME = { low: 'UNDER 7', seven: 'SEVEN', high: 'OVER 7' };
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  const ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
  let sel = 25, rolling = false, last = null;
  const bets = { low: 0, seven: 0, high: 0 };
  const hist = [], counts = { low: 0, seven: 0, high: 0 };
  const msgEl = $('hlMsg');
  const msg = t => { msgEl.textContent = t; };

  const sfx = {
    chip() { if (isMono()) Casino.noise(0, .02, .18, 2500); else { Casino.tone(1200, 0, .05, 'triangle', .07, 900); Casino.tone(1800, .03, .04, 'triangle', .04); } },
    rattle() { for (let i = 0; i < 9; i++) Casino.noise(i * .07, .04, .16, isMono() ? 1800 : 2600); },
    land() { Casino.noise(0, .06, .3, 500); Casino.tone(90, 0, .1, 'sine', .25); Casino.noise(.12, .05, .2, 500); },
    win() { if (isMono()) Casino.tone(1568, 0, .9, 'sine', .12); else [523, 659, 784, 1047].forEach((f, i) => Casino.tone(f, i * .08, .14, 'square', .05)); },
    seven() { if (isMono()) for (let i = 0; i < 6; i++) Casino.tone(i % 2 ? 1760 : 1568, i * .14, .5, 'sine', .1);
              else [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => { Casino.tone(f, i * .1, .15, 'square', .05); Casino.tone(f / 2, i * .1, .15, 'triangle', .05); }); },
    lose() { if (isMono()) Casino.noise(0, .22, .15, 300); else Casino.tone(220, 0, .28, 'sawtooth', .05, 90); }
  };

  // build dice
  const dice = [$('die1'), $('die2')].map(el => {
    for (let f = 1; f <= 6; f++) {
      const face = document.createElement('div'); face.className = 'face f' + f;
      for (let i = 0; i < 9; i++) { const p = document.createElement('i'); if (!PIPS[f].includes(i)) p.className = 'x'; face.appendChild(p); }
      el.appendChild(face);
    }
    return { el, kx: 0, ky: 0, v: 1 };
  });
  function setDie(d, v, spin) {
    if (spin) { d.kx += 2 + Casino.rnd(3); d.ky += 2 + Casino.rnd(3); }
    const [fx, fy] = ROT[v];
    d.el.style.transform = `rotateX(${d.kx * 360 + fx}deg) rotateY(${d.ky * 360 + fy}deg)`;
    d.v = v;
    if (spin) { d.el.classList.remove('hop'); void d.el.offsetWidth; d.el.classList.add('hop'); }
  }
  dice.forEach(d => { d.el.style.transition = 'none'; setDie(d, 1 + Casino.rnd(6), false); void d.el.offsetWidth; d.el.style.transition = ''; });
  sumLed(dice[0].v + dice[1].v);

  const spotEl = s => document.querySelector(`#hlView .hl-spot[data-spot="${s}"]`);
  const total = () => bets.low + bets.seven + bets.high;
  function chipFor(amount) { let v = CHIPS[0]; CHIPS.forEach(c => { if (c <= amount) v = c; }); return v; }
  function renderSpot(s) {
    const el = spotEl(s), stack = el.querySelector('.hl-stack');
    el.querySelector('.hl-amt').textContent = bets[s] ? '$' + fmt(bets[s]) : '';
    if (!bets[s]) stack.innerHTML = '';
  }
  function addChipVisual(s, v) {
    const stack = spotEl(s).querySelector('.hl-stack');
    const c = document.createElement('span'); c.className = 'bchip'; c.dataset.val = v;
    c.textContent = v >= 1000 ? (v / 1000) + 'K' : v;
    c.style.setProperty('--i', Math.min(stack.childElementCount, 8));
    stack.appendChild(c);
  }
  function refresh() {
    bankLed(Casino.bank);
    $('hlRoll').disabled = rolling || total() === 0;
    $('hlClear').disabled = rolling || total() === 0;
    $('hlRebet').disabled = rolling || !last || total() > 0;
    document.querySelectorAll('#hlView .hl-spot').forEach(b => b.disabled = rolling);
    document.querySelectorAll('#hlChips .bchip').forEach(b => b.disabled = rolling);
    syncChips();
  }
  const syncChips = window.CasinoChipTray($('hlChips'), CHIPS, () => sel, (v) => { if (rolling) return; sel = v; sfx.chip(); syncChips(); });

  function place(s, v) {
    if (v > Casino.bank) { Casino.toast('뱅크롤이 부족해요 · 로비 ATM'); return false; }
    Casino.setBank(Casino.bank - v); bets[s] += v;
    addChipVisual(s, v); renderSpot(s); return true;
  }
  document.querySelectorAll('#hlView .hl-spot').forEach(b => b.addEventListener('click', () => {
    if (rolling) return;
    Casino.audio();
    clearResult();
    if (place(b.dataset.spot, sel)) { sfx.chip(); msg(`총 베팅 $${fmt(total())}`); }
    refresh();
  }));
  function refundAll() {
    const t = total(); if (t) Casino.setBank(Casino.bank + t);
    ['low', 'seven', 'high'].forEach(s => { bets[s] = 0; renderSpot(s); });
  }
  function clearResult() { document.querySelectorAll('#hlView .hl-spot').forEach(b => b.classList.remove('win', 'lose', 'dim')); }
  $('hlClear').onclick = () => { if (rolling) return; refundAll(); msg('베팅을 지웠어요'); refresh(); };
  $('hlRebet').onclick = () => {
    if (rolling || !last) return;
    const need = last.low + last.seven + last.high;
    if (need > Casino.bank) { Casino.toast('뱅크롤이 부족해요'); return; }
    clearResult();
    ['low', 'seven', 'high'].forEach(s => { if (last[s]) { Casino.setBank(Casino.bank - last[s]); bets[s] = last[s]; addChipVisual(s, chipFor(last[s])); renderSpot(s); } });
    sfx.chip(); msg(`총 베팅 $${fmt(total())}`); refresh();
  };

  function renderHist() {
    const h = $('hlHist');
    if (!hist.length) { h.innerHTML = '<span class="g-empty">아직 굴리지 않았어요</span>'; $('hlStats').innerHTML = ''; return; }
    h.innerHTML = hist.map((t, i) => `<span class="hl-h ${t < 7 ? 'lo' : t > 7 ? 'hi' : 'sv'}${i === 0 ? ' new' : ''}">${t}</span>`).join('');
    const n = counts.low + counts.seven + counts.high;
    $('hlStats').innerHTML = `<span>LOW <b>${counts.low}</b></span><span>7 <b>${counts.seven}</b></span><span>HIGH <b>${counts.high}</b></span><span>${n}판</span>`;
  }

  $('hlRoll').onclick = () => {
    if (rolling) return;
    if (!total()) { Casino.toast('먼저 베팅하세요'); return; }
    Casino.audio();
    rolling = true; clearResult(); refresh();
    last = { ...bets }; Casino.wager(total(), 'hilo');
    msg('ROLLING…'); sfx.rattle();
    const a = 1 + Casino.rnd(6), b = 1 + Casino.rnd(6);
    setDie(dice[0], a, true); setTimeout(() => setDie(dice[1], b, true), 90);
    setTimeout(() => {
      sfx.land();
      const t = a + b, win = t < 7 ? 'low' : t > 7 ? 'high' : 'seven';
      counts[win]++; hist.unshift(t); if (hist.length > 16) hist.pop();
      sumLed(t); renderHist();
      let pay = 0;
      ['low', 'seven', 'high'].forEach(s => {
        const el = spotEl(s);
        if (s === win) { el.classList.add('win'); if (bets[s]) pay += bets[s] * PAY[s]; }
        else { el.classList.add(bets[s] ? 'lose' : 'dim'); }
      });
      const staked = total(), net = pay - staked;
      if (pay) Casino.setBank(Casino.bank + pay);
      if (pay && win === 'seven') { sfx.seven(); Casino.coinRain(Math.min(60, 16 + bets.seven / 50 | 0)); }
      else if (pay) sfx.win(); else sfx.lose();
      msg(`${a} + ${b} = ${t} · ${NAME[win]} · ${net > 0 ? '+$' + fmt(net) : net < 0 ? '−$' + fmt(-net) : '본전'}`);
      setTimeout(() => {
        ['low', 'seven', 'high'].forEach(s => { bets[s] = 0; renderSpot(s); });
        rolling = false; refresh();
      }, 1600);
      bankLed(Casino.bank);
    }, 1340);
  };
  Casino.onBank(() => { if (Casino.view === 'hilo') bankLed(Casino.bank); });
  renderHist(); refresh();

  Casino.register('hilo', {
    title: () => isMono() ? 'hi–lo dice — under/over 7' : 'HI-LO DICE — Under · Seven · Over',
    enter() { refresh(); },
    canLeave: () => !rolling,
    leave() { refundAll(); clearResult(); msg('칩을 고르고 LOW · 7 · HIGH에 거세요'); }
  });
})();
