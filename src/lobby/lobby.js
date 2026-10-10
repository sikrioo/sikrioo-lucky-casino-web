(() => {
  const led = window.CasinoLED(document.getElementById('lobbySeg'), 8);
  const show = () => led(Casino.bank);
  Casino.onBank(() => { if (Casino.view === 'lobby') show(); });

  // marquee bulbs
  const bulbs = [];
  ['signBulbsTop', 'signBulbsBot'].forEach(id => {
    const el = document.getElementById(id);
    for (let i = 0; i < 18; i++) { const b = document.createElement('i'); b.className = 'bulb'; el.appendChild(b); bulbs.push(b); }
  });
  let t = 0;
  setInterval(() => {
    if (Casino.view !== 'lobby' || Casino.theme === '74') return;
    t++;
    bulbs.forEach((b, i) => b.classList.toggle('on', (i + t) % 3 === 0));
  }, 140);

  document.querySelectorAll('.game[data-go]').forEach(b => b.addEventListener('click', () => Casino.go(b.dataset.go)));

  document.getElementById('lbAtm').onclick = () => {
    if (Casino.bank + 1000 > Casino.MAX) { Casino.toast('한도에 도달했어요'); return; }
    Casino.setBank(Casino.bank + 1000);
    Casino.toast('ATM · +1,000');
  };

  const themeBtn = document.getElementById('lbTheme'), soundBtn = document.getElementById('lbSound');
  const syncTheme = () => { themeBtn.textContent = Casino.theme === '74' ? '’86 디럭스' : '’74 모노'; };
  const syncSound = () => { soundBtn.textContent = Casino.muted ? '소리 끔' : '소리 켬'; };
  themeBtn.onclick = () => Casino.setTheme(Casino.theme === '74' ? '86' : '74');
  soundBtn.onclick = () => Casino.setMuted(!Casino.muted);
  Casino.onTheme(syncTheme); Casino.onSound(syncSound);
  syncTheme(); syncSound(); show();

  Casino.register('lobby', { enter: show });
})();
