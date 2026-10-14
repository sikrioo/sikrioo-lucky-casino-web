/* In-browser round verification (server mode). Recomputes a round from its proof with WebCrypto only —
 * the same HMAC-SHA256 stream and the same unbiased mapping as server/rng/fair.js — so the player does not have
 * to trust the server's word for any outcome. */
const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
const enc = new TextEncoder();
const TWO32 = 2 ** 32;

async function sha256Hex(text) { return hex(await crypto.subtle.digest('SHA-256', enc.encode(text))); }

class AsyncFair {
  constructor(serverSeed, clientSeed, nonce) { this.s = serverSeed; this.c = clientSeed; this.n = nonce; this.block = 0; this.buf = null; this.pos = 32; this.draws = 0; }
  async init() { this.key = await crypto.subtle.importKey('raw', enc.encode(this.s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return this; }
  async uint32() {
    if (this.pos >= 32) { this.buf = new DataView(await crypto.subtle.sign('HMAC', this.key, enc.encode(`${this.c}:${this.n}:${this.block++}`))); this.pos = 0; }
    const v = this.buf.getUint32(this.pos); this.pos += 4; this.draws++; return v;
  }
  async int(n) {
    if (n === 1) return 0;
    const limit = TWO32 - (TWO32 % n);
    let v; do { v = await this.uint32(); } while (v >= limit);
    return v % n;
  }
}

/** recompute one round; model = the model data the round used (from /api/games when the hash matches), optional */
export async function verifyProof(proof, model) {
  const f = proof.fair, problems = [];
  if (!f.serverSeed) return { ok: false, pending: true, problems: ['시드가 아직 공개되지 않았어요'] };
  if (await sha256Hex(f.serverSeed) !== f.seedHash) problems.push('공개된 시드의 해시가 미리 받은 해시와 달라요');
  const rng = await new AsyncFair(f.serverSeed, f.clientSeed, f.nonce).init();
  if (proof.game === 'plinko') {
    const path = [];
    for (let i = 0; i < proof.params.rows; i++) path.push(await rng.int(2));
    if (path.join('') !== proof.outcome.path.join('')) problems.push('공 경로가 다시 계산한 것과 달라요');
    if (model && model.sha256 === proof.model.sha256) {
      const slot = path.reduce((a, b) => a + b, 0), m100 = model.data.tables[proof.params.rows][proof.params.risk][slot];
      const pay = Math.floor(proof.betMinor * m100 / 100), cap = proof.rules.decision.maxWinMinor;
      if ((cap ? Math.min(cap, pay) : pay) !== proof.payoutMinor) problems.push('지급액이 모델 배당표와 달라요');
    }
  } else if (proof.game === 'hilo') {
    const a = 1 + await rng.int(6), b = 1 + await rng.int(6);
    if (a !== proof.outcome.dice[0] || b !== proof.outcome.dice[1]) problems.push('주사위 눈이 다시 계산한 것과 달라요');
    if (model && model.sha256 === proof.model.sha256) {
      const sum = a + b, win = sum < 7 ? 'low' : sum > 7 ? 'high' : 'seven';
      const pay = Math.floor(proof.params.bets[win] * model.data.pay100[win] / 100);
      if (pay !== proof.payoutMinor) problems.push('지급액이 모델 배당과 달라요');
    }
  } else return { ok: false, problems: [`${proof.game}는 아직 브라우저 검증을 지원하지 않아요`] };
  if (rng.draws !== f.draws) problems.push('사용한 난수 개수가 기록과 달라요');
  return { ok: problems.length === 0, problems };
}
