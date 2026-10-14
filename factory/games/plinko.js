/* Plinko models. The 97% variant IS the table the browser already uses (src/games/plinko/config.js);
 * the other variants scale it and are re-checked exactly. */
import { ROWS, RISKS, TABLES } from '../../src/games/plinko/config.js';
import * as engine from '../../server/games/plinko.js';
import { exactPpm, choose } from '../lib.js';

export { engine };

function tableRtp(n, mult100s) {
  return exactPpm(mult100s.map((m, k) => ({ num: choose(n, k), den: 2n ** BigInt(n), value100: m })));
}

/** multipliers stay readable: ×0.01 steps under ×10, ×0.1 under ×100, ×1 under ×1000, ×10 above */
const stepOf = m100 => m100 < 1000 ? 1 : m100 < 10000 ? 10 : m100 < 100000 ? 100 : 1000;
const nice = m100 => { const s = stepOf(m100); return Math.max(1, Math.floor(m100 / s) * s); };
/** edge → centre must never increase (the edges pay the most) */
const monotone = t => { const h = t.slice(0, t.length / 2 + 1 | 0); return h.every((x, i) => i === 0 || x <= h[i - 1]); };

/** scale the base table so its exact RTP lands just under the target, then nudge mirrored pairs up one readable
 *  step at a time while it stays ≤ target and the shape stays monotone */
function scaledTable(n, base100, target) {
  let lo = 0.5, hi = 1.0, best = null;
  for (let i = 0; i < 60; i++) {
    const s = (lo + hi) / 2;
    const t = base100.map(m => nice(m * s));
    const r = tableRtp(n, t).ppm / 1e6;
    if (r <= target && monotone(t)) { best = t; lo = s; } else hi = s;
  }
  for (let guard = 0; guard < 2000; guard++) {
    let pick = null, pickR = tableRtp(n, best).ppm;
    for (let k = 0; k <= n / 2; k++) {
      const t = best.slice(), up = stepOf(t[k]);
      t[k] += up; if (k !== n - k) t[n - k] += up;
      if (!monotone(t)) continue;
      const r = tableRtp(n, t).ppm;
      if (r <= target * 1e6 && r > pickR) { pick = t; pickR = r; }
    }
    if (!pick) break;
    best = pick;
  }
  return best;
}

export function build(variant, version) {
  const tables = {}, rtpPpm = {};
  let minRtp = Infinity, maxMult100 = 0;
  for (const n of ROWS) {
    tables[n] = {}; rtpPpm[n] = {};
    for (const r of RISKS) {
      const base100 = TABLES[n][r].map(m => Math.round(m * 100));
      const t = variant.scale === 'base' ? base100 : scaledTable(n, base100, variant.target);
      tables[n][r] = t;
      rtpPpm[n][r] = tableRtp(n, t).ppm;
      minRtp = Math.min(minRtp, rtpPpm[n][r]); maxMult100 = Math.max(maxMult100, ...t);
    }
  }
  return { game: 'plinko', variant: variant.id, version, rtpPpm: minRtp, maxMult100, data: { rows: ROWS, risks: RISKS, tables, rtpPpm } };
}

/** every parameter combination the engine accepts, with its exact RTP */
export function combos(model) {
  const out = [];
  for (const n of model.data.rows) for (const r of model.data.risks) {
    const t = model.data.tables[n][r];
    const probs = t.map((_, k) => Number(choose(n, k)) / 2 ** n);
    const mean = probs.reduce((s, p, k) => s + p * t[k] / 100, 0);
    const sd = Math.sqrt(probs.reduce((s, p, k) => s + p * (t[k] / 100 - mean) ** 2, 0));
    out.push({ label: `${n} rows · ${r}`, params: { rows: n, risk: r }, rtpPpm: model.data.rtpPpm[n][r], sd,
      maxMult100: Math.max(...t), symmetric: t.every((m, k) => m === t[t.length - 1 - k]) && monotone(t), size: t.length === n + 1 });
  }
  return out;
}
