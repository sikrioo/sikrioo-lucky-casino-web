import { KINDS, RAR, RC, SIZES, SHAPE_NAME } from '../games/claw/config.js';
import { shapeIcon } from '../games/claw/art.js';

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

  /* ---------- ATM: tops the bankroll up to the VIP tier's floor ---------- */
  const fmt = n => n.toLocaleString('en-US');
  const atmBtn = document.getElementById('lbAtm'), atmNote = document.getElementById('lbAtmNote');
  const syncAtm = () => {
    const floor = Casino.atmFloor(), short = floor - Casino.bank;
    atmBtn.textContent = short > 0 ? `ATM +$${fmt(short)}` : 'ATM';
    atmBtn.disabled = short <= 0;
    atmNote.textContent = short > 0 ? `ATM은 잔액을 $${fmt(floor)}까지 채워줘요` : `모든 게임이 같은 자금을 써요 · ATM은 $${fmt(floor)} 아래일 때만`;
  };
  atmBtn.onclick = () => {
    const add = Casino.useAtm();
    if (add) Casino.toast(`ATM · +$${fmt(add)}`); else Casino.toast(`ATM은 잔액이 $${fmt(Casino.atmFloor())} 아래일 때만 써요`);
    syncAtm();
  };

  /* ---------- VIP card ---------- */
  const $ = id => document.getElementById(id);
  const tierName = t => Casino.theme === '74' ? t.mono : t.name;
  function renderVip() {
    const v = Casino.vipInfo(), t = v.tier;
    $('vipLv').textContent = v.level;
    $('vipTier').textContent = tierName(t);
    $('vipCard').style.setProperty('--tc', t.color);
    $('vipFill').style.width = (v.progress * 100).toFixed(1) + '%';
    $('vipBar').setAttribute('aria-valuenow', Math.round(v.progress * 100));
    $('vipNext').textContent = v.next ? `다음 등급 ${tierName(v.next)}까지 $${fmt(Math.ceil(v.toNext))} 베팅` : '최고 등급이에요';
    $('vipPerks').textContent = `레이크백 ${+(t.rake * 100).toFixed(1)}% · ATM $${fmt(t.atm)}`;
    const vault = Math.floor(v.vault * 100) / 100;
    $('vipVault').textContent = '$' + (vault < 100 ? vault.toFixed(2) : fmt(Math.floor(vault)));
    $('vipClaim').disabled = v.vault < 1;
    renderStats(v);
    syncAtm();
  }
  $('vipClaim').onclick = () => {
    const pay = Casino.claimVault();
    if (pay) { Casino.toast(`VIP 금고 · +$${fmt(pay)}`); Casino.coinRain(Math.min(40, 8 + pay / 50 | 0)); }
  };

  /* ---------- play stats ---------- */
  const GAME_NAMES = { slot: 'LUCKY 7', blackjack: 'BLACKJACK', stopwatch: 'STOPWATCH', hilo: 'HI-LO', claw: 'CLAW', plinko: 'PLINKO', crash: 'CRASH' };
  function renderStats(v) {
    const rows = Object.entries(v.byGame).filter(([k]) => GAME_NAMES[k]).sort((a, b) => b[1] - a[1]);
    $('psTotal').textContent = '$' + fmt(Math.floor(v.xp));
    if (!rows.length) { $('psRows').innerHTML = '<span class="ps-empty">아직 플레이 기록이 없어요</span>'; return; }
    const max = rows[0][1];
    $('psRows').innerHTML = rows.map(([k, n]) => `<div class="ps-row"><span class="ps-n">${GAME_NAMES[k]}</span><span class="ps-bar"><i style="width:${(n / max * 100).toFixed(1)}%"></i></span><span class="ps-v">$${fmt(Math.floor(n))}</span></div>`).join('');
  }

  /* ---------- collection (LUCKY CLAW prizes × rarity) ---------- */
  function renderColl() {
    const m = Casino.theme === '74', got = Casino.collection();
    let have = 0;
    const cells = [];
    for (let r = 0; r < RAR.length; r++) {
      cells.push(`<span class="coll-rar" style="--rc:${RC[r]}">${RAR[r][0]}</span>`);
      for (const d of KINDS) {
        const n = got[`${d.shape}${d.k}:${r}`] || 0;
        if (n) have++;
        const label = `${RAR[r]} ${SIZES[d.k].name} ${SHAPE_NAME[d.shape]}${n ? ` · ${n}개` : ' · 미획득'}`;
        cells.push(`<span class="coll-cell${n ? ' got' : ''}" style="--rc:${RC[r]}" title="${label}" aria-label="${label}">${shapeIcon(d, m)}${n > 1 ? `<b>${n}</b>` : ''}</span>`);
      }
    }
    $('collGrid').innerHTML = cells.join('');
    $('collCount').textContent = `${have} / ${RAR.length * KINDS.length}`;
  }

  Casino.onVip(() => { if (Casino.view === 'lobby') renderVip(); });
  Casino.onCollect(() => { if (Casino.view === 'lobby') renderColl(); });
  Casino.onBank(() => { if (Casino.view === 'lobby') syncAtm(); });
  Casino.onTheme(() => { renderVip(); renderColl(); });

  const themeBtn = document.getElementById('lbTheme'), soundBtn = document.getElementById('lbSound');
  const syncTheme = () => { themeBtn.textContent = Casino.theme === '74' ? '’86 디럭스' : '’74 모노'; };
  const syncSound = () => { soundBtn.textContent = Casino.muted ? '소리 끔' : '소리 켬'; };
  themeBtn.onclick = () => Casino.setTheme(Casino.theme === '74' ? '86' : '74');
  soundBtn.onclick = () => Casino.setMuted(!Casino.muted);
  Casino.onTheme(syncTheme); Casino.onSound(syncSound);
  syncTheme(); syncSound(); show();

  renderVip(); renderColl();
  Casino.register('lobby', { enter() { show(); renderVip(); renderColl(); } });
})();
