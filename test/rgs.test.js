import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { boot } from '../server/index.js';
import { verifyRound } from '../server/audit/verify.js';

let app, base;
before(async () => { app = boot(); base = `http://127.0.0.1:${await app.listen()}/api`; });
after(() => app.server.close());

const api = async (method, path, { token, body, idem } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }), ...(idem && { 'idempotency-key': idem }) }, body: body && JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
};
const session = async (profile) => (await api('POST', '/session', { body: profile ? { profile } : {} })).json.token;
const plinko = (bet = 2500, rows = 16, risk = 'high') => ({ game: 'plinko', betMinor: bet, params: { rows, risk } });

test('a plinko round: debit, outcome, credit, stored, restorable', async () => {
  const t = await session();
  const r = (await api('POST', '/rounds', { token: t, body: plinko(), idem: 'round-0001' })).json;
  assert.equal(r.status, 'settled');
  assert.equal(r.outcome.slot, r.outcome.path.reduce((a, b) => a + b, 0));
  assert.equal(r.payoutMinor, Math.floor(2500 * r.outcome.mult100 / 100));
  assert.equal(r.balanceMinor, 100000 - 2500 + r.payoutMinor);
  const again = (await api('GET', `/rounds/${r.roundId}`, { token: t })).json;
  assert.deepEqual(again.outcome, r.outcome);
  assert.equal(again.events.length, 2);
});

test('idempotency: 50 concurrent copies of one request move money once', async () => {
  const t = await session();
  const all = await Promise.all(Array.from({ length: 50 }, () => api('POST', '/rounds', { token: t, body: plinko(1000), idem: 'same-key-123' })));
  const ids = new Set(all.map(x => x.json.roundId));
  assert.equal(ids.size, 1);
  const w = (await api('GET', '/wallet', { token: t })).json;
  assert.equal(w.txns.filter(x => x.kind === 'BET').length, 1);
  assert.equal(w.balanceMinor, all[0].json.balanceMinor);
});

test('refusals: no key, bad params, insufficient funds, bet that does not match spot bets, other player’s round', async () => {
  const t = await session();
  assert.equal((await api('POST', '/rounds', { token: t, body: plinko() })).json.error, 'idempotency_key');
  assert.equal((await api('POST', '/rounds', { token: t, body: plinko(100, 10), idem: 'bad-rows-01' })).json.error, 'bad_params');
  assert.equal((await api('POST', '/rounds', { token: t, body: plinko(200000), idem: 'too-much-01' })).status, 402);
  assert.equal((await api('POST', '/rounds', { token: t, body: { game: 'hilo', betMinor: 500, params: { bets: { low: 100 } } }, idem: 'mismatch-01' })).json.error, 'bad_bet');
  const r = (await api('POST', '/rounds', { token: t, body: plinko(100), idem: 'mine-00001' })).json;
  const other = await session();
  assert.equal((await api('GET', `/rounds/${r.roundId}`, { token: other })).status, 404);
  assert.equal((await api('GET', '/wallet')).status, 401);
});

test('business rules pick the model: profile lowrtp → plinko 92, classic → hi-lo traditional', async () => {
  const low = await session('lowrtp'), classic = await session('classic');
  const a = (await api('POST', '/rounds', { token: low, body: plinko(1000, 8, 'low'), idem: 'rule-low-01' })).json;
  assert.equal(a.model.variant, '92'); assert.deepEqual(a.rules.ruleIds, ['lowrtp-plinko']);
  const b = (await api('POST', '/rounds', { token: classic, body: { game: 'hilo', betMinor: 1000, params: { bets: { seven: 1000 } } }, idem: 'rule-cls-01' })).json;
  assert.equal(b.model.variant, 'traditional');
  if (b.outcome.win === 'seven') assert.equal(b.payoutMinor, 5000);
});

test('every round replays exactly from its proof once the seed is revealed', async () => {
  const t = await session();
  const ids = [];
  for (let i = 0; i < 300; i++) {
    const body = i % 2 ? plinko(500, [8, 12, 16][i % 3], ['low', 'mid', 'high'][i % 3]) : { game: 'hilo', betMinor: 600, params: { bets: { low: 200, seven: 200, high: 200 } } };
    ids.push((await api('POST', '/rounds', { token: t, body, idem: `replay-${i}-xx` })).json.roundId);
  }
  const hidden = (await api('GET', `/rounds/${ids[0]}/proof`, { token: t })).json;
  assert.equal(hidden.fair.serverSeed, null);                 // not revealed while the seed is in use
  const rot = (await api('POST', '/seeds/rotate', { token: t, body: { clientSeed: 'my-own-seed' } })).json;
  assert.equal(rot.revealed.seedHash, hidden.fair.seedHash);
  for (const id of ids) {
    const proof = (await api('GET', `/rounds/${id}/proof`, { token: t })).json;
    const model = app.registry.get(proof.model.game, proof.model.variant, proof.model.version);
    const v = verifyRound(proof, model);
    assert.ok(v.ok, `${id}: ${v.problems.join('; ')}`);
  }
  // tampering with the recorded outcome is caught
  const p = (await api('GET', `/rounds/${ids[1]}/proof`, { token: t })).json;
  p.payoutMinor += 1;
  assert.equal(verifyRound(p, app.registry.get('plinko', p.model.variant)).ok, false);
});

test('rakeback = bet × (1 − model RTP) × tier share, and never pushes RTP over 100%', async () => {
  const t = await session();
  const r = (await api('POST', '/rounds', { token: t, body: plinko(10000, 16, 'high'), idem: 'rake-0001' })).json;
  const expected = Math.floor(10000 * (1e6 - r.model.rtpPpm) * 0.05 * 1e6 / 1e6);   // BRONZE share 5%
  assert.equal(r.rakebackUcent, expected);
  assert.ok(r.model.rtpPpm / 1e6 + (1 - r.model.rtpPpm / 1e6) * 0.25 < 1);          // even BLACK (25%) stays under 100%
});

test('ledger reconciles to the cent after 20,000 random rounds, topups and claims', () => {
  const { rgs } = app;
  const players = Array.from({ length: 5 }, (_, i) => rgs.auth(rgs.createPlayer(['demo', 'lowrtp', 'classic', 'demo', 'demo'][i]).token));
  for (let i = 0; i < 20000; i++) {
    const p = players[i % 5];
    if (i % 997 === 0) rgs.claim(p);
    if (rgs.wallet(p, 1).balanceMinor < 5000) rgs.topup(p, `topup-${i}-xx`);
    const body = i % 2 ? plinko(100 + (i % 7) * 300, [8, 12, 16][i % 3], ['low', 'mid', 'high'][(i >> 1) % 3])
                       : { game: 'hilo', betMinor: 900, params: { bets: { low: 300, seven: 300, high: 300 } } };
    try { rgs.playRound(p, body, `bulk-${i}-key`); } catch (e) { if (e.code !== 'insufficient_funds') throw e; }
  }
  for (const r of rgs.reconcile()) { assert.equal(r.balanceDiff, 0, r.player); assert.equal(r.vaultDiff, 0, r.player); }
});

test('API RTP over 60,000 real hi-lo rounds sits within 4 SE of the exact model RTP', () => {
  const { rgs } = app;
  const p = rgs.auth(rgs.createPlayer('demo').token);
  const model = app.registry.get('hilo', '97');
  let staked = 0, back = 0;
  for (let i = 0; i < 60000; i++) {
    if (rgs.wallet(p, 1).balanceMinor < 1000) rgs.topup(p);
    const r = rgs.playRound(p, { game: 'hilo', betMinor: 100, params: { bets: { low: 100 } } }, `rtp-${i}-key`);
    staked += 100; back += r.payoutMinor;
  }
  const exact = model.data.rtpPpm.low / 1e6, pWin = 15 / 36, v = model.data.pay100.low / 100;
  const sd = Math.sqrt(pWin * v * v - exact * exact), se = sd / Math.sqrt(60000);
  assert.ok(Math.abs(back / staked - exact) < 4 * se, `observed ${(back / staked).toFixed(4)} vs exact ${exact.toFixed(4)}`);
});
