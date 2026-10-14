/* VIP club + collection — the progress that ties every game together.
 *
 * Casino.wager(amount, game)  every game calls this when money is actually put at risk (a spin, a deal, a drop…).
 *   · XP = total wagered, so the tier reflects how much you have played, not how lucky you were.
 *   · Each tier gives rakeback: a share of the house's theoretical edge on every wager, wager × (1 − RTP) × share,
 *     into the VIP vault (claimable in the lobby) — effective RTP never reaches 100%. Tiers live in shared/tiers.js.
 *   · In RGS server mode all of this is the server's: these functions read and call the server instead.
 *   · Each tier raises the ATM floor: the ATM only tops the bankroll UP to that amount, and only when you are below it.
 * Casino.collect(key)         records a collectible (LUCKY CLAW prizes: "<kind>:<rarity>").
 */
import { TIERS, tierIndexFor, LOCAL_RTP } from '../shared/tiers.js';

const C = window.Casino;
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' ? v : d; } catch (e) { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

const vip = Object.assign({ xp: 0, vault: 0, claimed: 0, atm: 0, byGame: {} }, load('casino-vip', {}));
const coll = load('casino-collection', {});
const vipL = [], collL = [];

const tierIndex = tierIndexFor;
const remoteOn = () => C.remote && C.remote.on;

C.TIERS = TIERS;
C.vipInfo = () => {
  const w = remoteOn() && C.remote.wallet;
  const xp = w ? w.wageredMinor / 100 : vip.xp, vault = w ? w.vaultUcent / 1e8 : vip.vault;
  const i = tierIndex(xp), t = TIERS[i], next = TIERS[i + 1] || null;
  return {
    level: i + 1, tier: t, next, xp, vault, claimed: vip.claimed, atmUses: vip.atm, byGame: w ? {} : { ...vip.byGame }, server: !!w,
    progress: next ? (xp - t.xp) / (next.xp - t.xp) : 1, toNext: next ? next.xp - xp : 0
  };
};
C.onVip = f => vipL.push(f);
const emit = () => { store('casino-vip', vip); vipL.forEach(f => f(C.vipInfo())); };
C.vipChanged = () => vipL.forEach(f => f(C.vipInfo()));

C.wager = (amount, game = '?') => {
  if (!(amount > 0) || remoteOn()) return;              // the RGS books server-mode wagers itself
  const before = tierIndex(vip.xp);
  vip.xp += amount;
  vip.byGame[game] = (vip.byGame[game] || 0) + amount;
  vip.vault += amount * (1 - (LOCAL_RTP[game] ?? 0.97)) * TIERS[before].rakebackShare;
  const after = tierIndex(vip.xp);
  emit();
  if (after > before) {
    const t = TIERS[after];
    if (C.toast) C.toast(`VIP ${C.theme === '74' ? t.mono : t.name} 달성! · 레이크백 하우스 몫의 ${Math.round(t.rakebackShare * 100)}% · ATM $${t.atm.toLocaleString('en-US')}`);
    C.coinRain(40);
    if (C.theme === '74') [1568, 2093, 2637].forEach((f, k) => C.tone(f, k * .12, .5, 'sine', .08));
    else [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, k) => C.tone(f, k * .07, .16, 'square', .05));
  }
};

/** pays out the whole dollars in the vault (cents stay for next time); returns what was paid */
C.claimVault = () => {
  if (remoteOn()) return C.remote.claim().then(p => { emit(); return p; });
  const pay = Math.floor(vip.vault);
  if (pay <= 0) return 0;
  vip.vault -= pay; vip.claimed += pay;
  C.setBank(C.bank + pay);
  emit();
  return pay;
};

/** the ATM tops the bankroll up to the tier's floor; returns the amount added (0 if already at/above it) */
C.atmFloor = () => TIERS[tierIndex(C.vipInfo().xp)].atm;
C.useAtm = () => {
  if (remoteOn()) return C.remote.topup().then(a => { emit(); return a; });
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
