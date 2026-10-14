/* VIP club + collection — the progress that ties every game together.
 *
 * Casino.wager(amount, game)  every game calls this when money is actually put at risk (a spin, a deal, a drop…).
 *   · XP = total wagered, so the tier reflects how much you have played, not how lucky you were.
 *   · Each tier gives rakeback: a % of every wager goes into the VIP vault, claimable in the lobby.
 *   · Each tier raises the ATM floor: the ATM only tops the bankroll UP to that amount, and only when you are below it.
 * Casino.collect(key)         records a collectible (LUCKY CLAW prizes: "<kind>:<rarity>").
 */
const TIERS = [
  { name: 'BRONZE',   mono: 'bronze',   xp: 0,         atm: 1000,  rake: .005, color: '#d08a4a' },
  { name: 'SILVER',   mono: 'silver',   xp: 5000,      atm: 2000,  rake: .01,  color: '#dfe5ec' },
  { name: 'GOLD',     mono: 'gold',     xp: 25000,     atm: 5000,  rake: .015, color: '#ffd400' },
  { name: 'PLATINUM', mono: 'platinum', xp: 100000,    atm: 10000, rake: .02,  color: '#5ef2e6' },
  { name: 'DIAMOND',  mono: 'diamond',  xp: 500000,    atm: 25000, rake: .03,  color: '#a06bff' },
  { name: 'BLACK',    mono: 'black',    xp: 2500000,   atm: 50000, rake: .04,  color: '#ff2d95' }
];

const C = window.Casino;
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' ? v : d; } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

const vip = Object.assign({ xp: 0, vault: 0, claimed: 0, atm: 0, byGame: {} }, load('casino-vip', {}));
const coll = load('casino-collection', {});
const vipL = [], collL = [];

const tierIndex = xp => { let i = 0; TIERS.forEach((t, k) => { if (xp >= t.xp) i = k; }); return i; };

C.TIERS = TIERS;
C.vipInfo = () => {
  const i = tierIndex(vip.xp), t = TIERS[i], next = TIERS[i + 1] || null;
  return {
    level: i + 1, tier: t, next, xp: vip.xp, vault: vip.vault, claimed: vip.claimed, atmUses: vip.atm, byGame: { ...vip.byGame },
    progress: next ? (vip.xp - t.xp) / (next.xp - t.xp) : 1, toNext: next ? next.xp - vip.xp : 0
  };
};
C.onVip = f => vipL.push(f);
const emit = () => { store('casino-vip', vip); vipL.forEach(f => f(C.vipInfo())); };

C.wager = (amount, game = '?') => {
  if (!(amount > 0)) return;
  const before = tierIndex(vip.xp);
  vip.xp += amount;
  vip.byGame[game] = (vip.byGame[game] || 0) + amount;
  vip.vault += amount * TIERS[before].rake;
  const after = tierIndex(vip.xp);
  emit();
  if (after > before) {
    const t = TIERS[after];
    if (C.toast) C.toast(`VIP ${C.theme === '74' ? t.mono : t.name} 달성! · 레이크백 ${t.rake * 100}% · ATM $${t.atm.toLocaleString('en-US')}`);
    C.coinRain(40);
    if (C.theme === '74') [1568, 2093, 2637].forEach((f, k) => C.tone(f, k * .12, .5, 'sine', .08));
    else [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, k) => C.tone(f, k * .07, .16, 'square', .05));
  }
};

/** pays out the whole dollars in the vault (cents stay for next time); returns what was paid */
C.claimVault = () => {
  const pay = Math.floor(vip.vault);
  if (pay <= 0) return 0;
  vip.vault -= pay; vip.claimed += pay;
  C.setBank(C.bank + pay);
  emit();
  return pay;
};

/** the ATM tops the bankroll up to the tier's floor; returns the amount added (0 if already at/above it) */
C.atmFloor = () => TIERS[tierIndex(vip.xp)].atm;
C.useAtm = () => {
  const add = C.atmFloor() - C.bank;
  if (add <= 0) return 0;
  vip.atm++;
  C.setBank(C.bank + add);
  emit();
  return add;
};

C.collection = () => ({ ...coll });
C.onCollect = f => collL.push(f);
C.collect = key => {
  const isNew = !coll[key];
  coll[key] = (coll[key] || 0) + 1;
  store('casino-collection', coll);
  collL.forEach(f => f(key, isNew));
  return isNew;
};
