/* Math Factory helpers: exact rational arithmetic, Monte Carlo with the real engines, model writing. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { FairStream } from '../server/rng/fair.js';

/** exact expectation Σ p_i · v_i with p_i = num_i / den as BigInt; returns ppm (floored) and the exact fraction */
export function exactPpm(terms /* [{ num: BigInt, den: BigInt, value100: int }] */) {
  // common denominator: den × 100
  let N = 0n, D = 1n;
  for (const t of terms) {
    const n = t.num * BigInt(t.value100), d = t.den * 100n;
    N = N * d + n * D; D = D * d;
    const g = gcd(N, D); N /= g; D /= g;
  }
  return { ppm: Number(N * 1000000n / D), num: N, den: D, value: Number(N) / Number(D) };
}
const gcd = (a, b) => { a = a < 0n ? -a : a; while (b) [a, b] = [b, a % b]; return a; };
export const choose = (n, k) => { let c = 1n; for (let i = 1n; i <= BigInt(k); i++) c = c * (BigInt(n) - BigInt(k) + i) / i; return c; };

/** Monte Carlo with the production engine and the production RNG (fresh random seeds) */
export function simulate({ engine, model, params, betMinor = 10000, rounds }) {
  let sum = 0, sum2 = 0, hits = 0, maxRet = 0, nonce = 0;
  let rng = null;
  for (let i = 0; i < rounds; i++) {
    if (i % 100000 === 0) { rng = null; nonce = 0; }
    const seed = rng ? null : randomBytes(32).toString('hex');
    if (seed) rng = { seed, client: randomBytes(8).toString('hex') };
    const stream = new FairStream(rng.seed, rng.client, ++nonce);
    const r = engine.play({ model, params, betMinor, rng: stream });
    const ret = r.payoutMinor / betMinor;
    sum += ret; sum2 += ret * ret; if (ret > 0) hits++; if (ret > maxRet) maxRet = ret;
  }
  const mean = sum / rounds, sd = Math.sqrt(Math.max(0, sum2 / rounds - mean * mean));
  const half = 2.576 * sd / Math.sqrt(rounds);                 // 99% confidence interval
  return { rounds, rtp: mean, ci99: [mean - half, mean + half], sd, hitRate: hits / rounds, maxReturn: maxRet };
}

/** writes models/<game>/<variant>/<version>/{model.json, manifest.json, report.md} */
export function writeModel(root, model, { verified, checks, report }) {
  const dir = join(root, model.game, model.variant, model.version);
  mkdirSync(dir, { recursive: true });
  const bytes = JSON.stringify(model, null, 2) + '\n';
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  writeFileSync(join(dir, 'model.json'), bytes);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    game: model.game, variant: model.variant, version: model.version, sha256, verified,
    rtpPpm: model.rtpPpm, maxMult100: model.maxMult100, checks, factory: 'lucky-strip-factory/1'
  }, null, 2) + '\n');
  writeFileSync(join(dir, 'report.md'), report);
  return { dir, sha256 };
}

export const pct = (x, d = 3) => (x * 100).toFixed(d) + '%';
