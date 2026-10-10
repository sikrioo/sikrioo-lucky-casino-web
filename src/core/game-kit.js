(() => {
  const syncSubs = () => document.querySelectorAll('[data-sub]').forEach(el => {
    const [d, m] = el.dataset.sub.split('|'); el.textContent = Casino.theme === '74' ? m : d;
  });
  Casino.onTheme(syncSubs); syncSubs();
  document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => Casino.go('lobby')));
  window.CasinoChipTray = (el, values, getSel, onPick) => {
    el.innerHTML = '';
    values.forEach(v => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'bchip'; b.dataset.val = v;
      b.textContent = v >= 1000 ? (v / 1000) + 'K' : v;
      b.setAttribute('aria-label', `${v} 칩`);
      b.addEventListener('click', () => onPick(v, b));
      el.appendChild(b);
    });
    return () => el.querySelectorAll('.bchip').forEach(b => b.classList.toggle('selected', +b.dataset.val === getSel()));
  };
})();
