window.Casino = (() => {
  const MAX = 99999999;
  let bank = 1000, theme = '86', muted = false, view = 'lobby';
  try {
    const v = localStorage.getItem('casino-bank');
    const old = localStorage.getItem('lucky7-credits');
    if (v !== null && !isNaN(+v)) bank = +v;
    else if (old !== null && !isNaN(+old)) bank = +old;
    theme = localStorage.getItem('lucky7-theme') === '74' ? '74' : '86';
    muted = localStorage.getItem('casino-muted') === '1';
  } catch (e) {}
  const themeL = [], soundL = [], bankL = [], games = {};
  const save = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const C = {
    MAX,
    get bank() { return bank; },
    setBank(v) {
      bank = Math.max(0, Math.min(MAX, Math.floor(v)));
      save('casino-bank', String(bank));
      bankL.forEach(f => f(bank));
    },
    onBank(f) { bankL.push(f); },
    get theme() { return theme; },
    setTheme(t) {
      theme = t === '74' ? '74' : '86';
      save('lucky7-theme', theme);
      document.body.classList.toggle('mono', theme === '74');
      themeL.forEach(f => f());
      C.updateTitle();
    },
    onTheme(f) { themeL.push(f); },
    get muted() { return muted; },
    setMuted(m) { muted = !!m; save('casino-muted', muted ? '1' : '0'); soundL.forEach(f => f()); },
    onSound(f) { soundL.push(f); },
    get view() { return view; },
    register(name, api) { games[name] = api; },
    updateTitle() {
      const g = games[view];
      document.title = g && g.title ? g.title() : (theme === '74' ? 'lucky strip — casino · est. 1974' : 'LUCKY STRIP — Hotel & Casino');
    },
    go(name) {
      const target = name && name !== 'lobby' && games[name] ? name : 'lobby';
      const hash = target === 'lobby' ? '' : '#' + target;
      if (location.hash.replace('#', '') !== hash.replace('#', '')) {
        try { history.pushState(null, '', hash || location.pathname + location.search); } catch (e) { location.hash = hash; }
      }
      C.route();
    },
    route() {
      const h = location.hash.replace('#', '');
      const target = h && h !== 'lobby' && games[h] ? h : 'lobby';      // any game that called Casino.register()
      if (target === view && document.body.classList.contains('v-' + view)) return;
      const cur = games[view];
      if (cur && cur.canLeave && !cur.canLeave()) {
        try { history.replaceState(null, '', view === 'lobby' ? location.pathname + location.search : '#' + view); } catch (e) {}
        if (C.toast) C.toast('게임이 끝난 뒤에 이동할 수 있어요');
        return;
      }
      if (cur && cur.leave) cur.leave();
      view = target;
      [...document.body.classList].filter(c => c.startsWith('v-') || c === 'sheet').forEach(c => document.body.classList.remove(c));
      document.body.classList.add('v-' + view);
      window.scrollTo(0, 0);
      const g = games[view];
      if (g && g.enter) g.enter();
      C.updateTitle();
    }
  };
  let ac = null;
  C.audio = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (ac && ac.state === 'suspended') ac.resume(); return ac; };
  C.tone = (f, t0, dur, type = 'square', vol = .06, slide) => {
    const a = C.audio(); if (!a || muted) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + t0;
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .02);
  };
  C.noise = (t0, dur, vol = .15, freq = 800) => {
    const a = C.audio(); if (!a || muted) return;
    const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime + t0;
    f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = vol; s.buffer = buf;
    s.connect(f).connect(g).connect(a.destination); s.start(t);
  };
  C.coinRain = (n) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div'); c.className = 'coin';
      c.style.left = Math.random() * 100 + 'vw'; c.style.animationDuration = (1.4 + Math.random() * 1.6) + 's'; c.style.animationDelay = (Math.random() * 1.2) + 's';
      document.body.appendChild(c); setTimeout(() => c.remove(), 4500);
    }
  };
  C.rnd = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  document.body.classList.toggle('mono', theme === '74');
  addEventListener('popstate', () => C.route());
  addEventListener('hashchange', () => C.route());
  return C;
})();
