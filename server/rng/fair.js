/* Provably fair randomness.
 *
 * Every round draws from one deterministic stream:
 *   block_i = HMAC-SHA256(key = serverSeed, msg = `${clientSeed}:${nonce}:${i}`)
 * The server publishes sha256(serverSeed) BEFORE any round uses it and reveals serverSeed when the player
 * rotates seeds, so every past round can be recomputed by anyone. Nothing here uses Math.random.
 */
import { createHmac, createHash, randomBytes } from 'node:crypto';

export const newServerSeed = () => randomBytes(32).toString('hex');
export const newClientSeed = () => randomBytes(8).toString('hex');
export const commit = serverSeed => createHash('sha256').update(serverSeed).digest('hex');

const TWO32 = 2 ** 32;

export class FairStream {
  constructor(serverSeed, clientSeed, nonce) {
    if (!/^[0-9a-f]{64}$/.test(serverSeed)) throw new Error('serverSeed must be 32 bytes hex');
    this.serverSeed = serverSeed; this.clientSeed = String(clientSeed); this.nonce = nonce;
    this.block = 0; this.buf = null; this.pos = 32;
    this.draws = 0;                      // uint32 words consumed — recorded so audits can replay exactly
  }
  #refill() {
    this.buf = createHmac('sha256', this.serverSeed).update(`${this.clientSeed}:${this.nonce}:${this.block++}`).digest();
    this.pos = 0;
  }
  /** next raw 32-bit word */
  uint32() {
    if (this.pos >= 32) this.#refill();
    const v = this.buf.readUInt32BE(this.pos); this.pos += 4; this.draws++;
    return v;
  }
  /** uniform integer in [0, n) without modulo bias (rejection sampling) */
  int(n) {
    if (!Number.isInteger(n) || n < 1 || n > TWO32) throw new RangeError(`int(n): n must be an integer in [1, 2^32], got ${n}`);
    if (n === 1) return 0;
    const limit = TWO32 - (TWO32 % n);   // largest multiple of n that fits; values at or above it are thrown away
    let v;
    do { v = this.uint32(); } while (v >= limit);
    return v % n;
  }
  /** index into integer weights, chosen with probability weight / total */
  weighted(weights) {
    let total = 0;
    for (const w of weights) {
      if (!Number.isInteger(w) || w < 0) throw new RangeError('weights must be non-negative integers');
      total += w;
    }
    if (total < 1 || total > TWO32) throw new RangeError(`weights must sum to [1, 2^32], got ${total}`);
    let r = this.int(total);
    for (let i = 0; i < weights.length; i++) { if (r < weights[i]) return i; r -= weights[i]; }
    throw new Error('unreachable');
  }
}
