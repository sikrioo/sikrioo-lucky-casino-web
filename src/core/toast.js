/* Casino.toast(text): a short message bubble, shared by every view. */
const layer = document.getElementById('cToast');
window.Casino.toast = (text) => {
  const t = document.createElement('div');
  t.className = 'c-toast'; t.textContent = text;
  layer.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
};
