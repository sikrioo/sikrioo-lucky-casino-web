/* LUCKY PLINKO — payout tables.
 * Every peg sends the ball left or right with a fair 50:50 coin, so after n rows it lands in slot k
 * with probability C(n,k) / 2^n. RTP = Σ P(k) · multiplier(k) — exact, no simulation needed.
 * All nine tables sit between 96.7% and 97.1% (checked by rtpOf below and by the test in README). */

export const ROWS = [8, 12, 16];
export const RISKS = ['low', 'mid', 'high'];
export const RISK_NAME = { low: 'LOW', mid: 'MID', high: 'HIGH' };
export const CHIPS = [5, 25, 100, 500, 1000, 5000, 25000];

// half tables, edge → centre; the full row is mirrored
const HALF = {
  8: {
    low:  [5.6, 2.1, 1.2, 0.9, 0.5],
    mid:  [13, 3.5, 1.4, 0.6, 0.3],
    high: [29, 4, 1.4, 0.3, 0.2]
  },
  12: {
    low:  [10, 6, 3.5, 1.9, 1.1, 0.6, 0.5],
    mid:  [35, 10, 5, 2.5, 1, 0.4, 0.3],
    high: [170, 17, 7, 2.5, 0.7, 0.2, 0.2]
  },
  16: {
    low:  [16, 10, 7, 4.5, 2.5, 1.6, 0.9, 0.6, 0.4],
    mid:  [110, 25, 15, 9, 4, 1.6, 0.6, 0.3, 0.3],
    high: [1000, 55, 25, 11, 4.5, 1.3, 0.4, 0.2, 0.2]
  }
};

export const TABLES = {};
for (const n of ROWS) {
  TABLES[n] = {};
  for (const r of RISKS) {
    const h = HALF[n][r];
    TABLES[n][r] = [...h, ...h.slice(0, -1).reverse()];        // length n + 1
  }
}

function choose(n, k) { let c = 1; for (let i = 1; i <= k; i++) c = c * (n - k + i) / i; return c; }
export const probOf = (n, k) => choose(n, k) / 2 ** n;
export const rtpOf = (n, risk) => TABLES[n][risk].reduce((s, m, k) => s + probOf(n, k) * m, 0);
