import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { FairStream, commit } from '../server/rng/fair.js';

const SEED = 'a'.repeat(64);
/** chi-square critical value at p = 0.001 (Wilson–Hilferty) */
const crit = df => { const z = 3.0902; return df * (1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df))) ** 3; };
const chi2 = (counts, expected) => counts.reduce((s, c, i) => s + (c - expected[i]) ** 2 / expected[i], 0);

test('same seed, client seed and nonce give the same stream; any change gives another', () => {
  const a = new FairStream(SEED, 'c', 1), b = new FairStream(SEED, 'c', 1), c = new FairStream(SEED, 'c', 2), d = new FairStream(SEED, 'd', 1);
  const take = s => Array.from({ length: 20 }, () => s.uint32());
  const x = take(a);
  assert.deepEqual(x, take(b));
  assert.notDeepEqual(x, take(c));
  assert.notDeepEqual(x, take(d));
});

test('known vector: the stream is HMAC-SHA256(serverSeed, "client:nonce:block"), read big-endian', () => {
  const s = new FairStream(SEED, 'client', 7);
  const block0 = createHmac('sha256', SEED).update('client:7:0').digest(), block1 = createHmac('sha256', SEED).update('client:7:1').digest();
  for (let i = 0; i < 8; i++) assert.equal(s.uint32(), block0.readUInt32BE(i * 4));
  assert.equal(s.uint32(), block1.readUInt32BE(0));
  assert.equal(commit(SEED), createHash('sha256').update(SEED).digest('hex'));
});

for (const n of [3, 6, 7, 37, 52]) {
  test(`int(${n}) is uniform — 1,000,000 draws, chi-square p > 0.001`, () => {
    const s = new FairStream(SEED, 'bias', n), N = 1000000, counts = new Array(n).fill(0);
    for (let i = 0; i < N; i++) counts[s.int(n)]++;
    const x2 = chi2(counts, new Array(n).fill(N / n));
    assert.ok(x2 < crit(n - 1), `chi2 ${x2.toFixed(1)} ≥ ${crit(n - 1).toFixed(1)}`);
  });
}

test('rejection sampling: a word in the biased tail is thrown away, not folded back', () => {
  const s = new FairStream(SEED, 'tail', 1);
  const words = [2 ** 32 - 1, 5];                // 2^32 − 1 is in the tail for n = 3 (2^32 mod 3 = 1)
  s.uint32 = () => words.shift();
  assert.equal(s.int(3), 5 % 3);                 // the tail word would have given (2^32 − 1) mod 3 = 0
});

test('weighted(): observed frequencies match integer weights (1,000,000 draws)', () => {
  const w = [1, 8, 28, 56, 70, 56, 28, 8, 1];   // binomial(8)
  const s = new FairStream(SEED, 'w', 1), N = 1000000, counts = new Array(w.length).fill(0), total = 256;
  for (let i = 0; i < N; i++) counts[s.weighted(w)]++;
  const x2 = chi2(counts, w.map(x => N * x / total));
  assert.ok(x2 < crit(w.length - 1), `chi2 ${x2.toFixed(1)}`);
});

test('bad inputs are refused', () => {
  const s = new FairStream(SEED, 'x', 1);
  assert.throws(() => s.int(0)); assert.throws(() => s.int(1.5)); assert.throws(() => s.weighted([1, -1]));
  assert.throws(() => new FairStream('nothex', 'x', 1));
});
