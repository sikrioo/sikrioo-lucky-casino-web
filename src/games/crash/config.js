/* LUCKY CRASH — the maths.
 * The crash point X is drawn so that P(X ≥ x) = (1 − EDGE) / x for every x ≥ 1 (and X = 1.00 — an instant bust —
 * with probability EDGE). Cashing out at any target x therefore returns x · (1 − EDGE) / x = 1 − EDGE on average:
 * the RTP is the same 97% whatever the player does, early or late. */

export const EDGE = 0.03;          // house edge → RTP 97%
export const MAX_X = 10000;        // the rocket always comes down eventually
export const GROWTH = 0.14;        // multiplier = e^(GROWTH · seconds): ×2 at ~5 s, ×10 at ~16 s, ×100 at ~33 s
export const CHIPS = [5, 25, 100, 500, 1000, 5000, 25000];
export const AUTO = [0, 1.2, 1.5, 2, 3, 5, 10, 25, 100];   // 0 = manual only

/** u in (0, 1] → crash point, floored to 0.01 (flooring keeps P(X ≥ x) exact for every 0.01 step) */
export function crashPoint(u) {
  const x = (1 - EDGE) / u;
  return Math.min(MAX_X, Math.max(1, Math.floor(x * 100) / 100));
}
export const multAt = sec => Math.exp(GROWTH * sec);
export const timeFor = m => Math.log(m) / GROWTH;
