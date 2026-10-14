/* VIP tiers — shared by the browser (local demo mode) and the RGS server.
 * xp = total wagered in dollars. rakebackShare = the share of the house's theoretical edge given back:
 *   rakeback = wager × (1 − model RTP) × rakebackShare
 * so effective RTP stays below 100% for every game and every tier. atm = the floor the ATM tops the bankroll up to. */
export const TIERS = Object.freeze([
  { name: 'BRONZE',   mono: 'bronze',   xp: 0,       atm: 1000,  rakebackShare: 0.05, color: '#d08a4a' },
  { name: 'SILVER',   mono: 'silver',   xp: 5000,    atm: 2000,  rakebackShare: 0.08, color: '#dfe5ec' },
  { name: 'GOLD',     mono: 'gold',     xp: 25000,   atm: 5000,  rakebackShare: 0.12, color: '#ffd400' },
  { name: 'PLATINUM', mono: 'platinum', xp: 100000,  atm: 10000, rakebackShare: 0.16, color: '#5ef2e6' },
  { name: 'DIAMOND',  mono: 'diamond',  xp: 500000,  atm: 25000, rakebackShare: 0.20, color: '#a06bff' },
  { name: 'BLACK',    mono: 'black',    xp: 2500000, atm: 50000, rakebackShare: 0.25, color: '#ff2d95' }
].map(Object.freeze));

export const tierIndexFor = xpDollars => { let i = 0; TIERS.forEach((t, k) => { if (xpDollars >= t.xp) i = k; }); return i; };

/** theoretical RTP per game in local demo mode (the server uses the exact RTP of the model each round used).
 *  Games whose RTP is not yet computed use 0.97 — the smallest edge, so rakeback is never over-paid. */
export const LOCAL_RTP = Object.freeze({ plinko: 0.969, crash: 0.97, hilo: 0.8333, blackjack: 0.995, slot: 0.97, claw: 0.97, stopwatch: 0.97 });
