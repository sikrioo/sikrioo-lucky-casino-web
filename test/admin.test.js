import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from '../server/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RULES = readFileSync(join(ROOT, 'rules', 'default.json'), 'utf8');
const TOKEN = 'test-admin-token-0123456789';
let app, game, admin;
before(async () => {
  app = boot({ adminToken: TOKEN });
  game = `http://127.0.0.1:${await app.listen()}/api`;
  admin = `http://127.0.0.1:${await app.listenAdmin()}`;
});
after(() => app.close());

const call = async (base, method, path, { token, body, idem } = {}) => {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }), ...(idem && { 'idempotency-key': idem }) }, body: body && JSON.stringify(body) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, type: res.headers.get('content-type') };
};
const A = (method, path, opts = {}) => call(admin, method, '/admin/api' + path, { token: TOKEN, ...opts });
const G = (method, path, opts) => call(game, method, path, opts);
const session = async profile => (await G('POST', '/session', { body: profile ? { profile } : {} })).json;
let n = 0;
const play = (token, bet = 1000) => G('POST', '/rounds', { token, body: { game: 'plinko', betMinor: bet, params: { rows: 8, risk: 'mid' } }, idem: `adm-round-${++n}-xxxx` });
const withRule = (patch, version) => { const r = JSON.parse(RULES); r.version = version; patch(r); return JSON.stringify(r, null, 2); };

test('the console page is public, its API needs the admin token — a player token is not enough', async () => {
  const page = await call(admin, 'GET', '/');
  assert.equal(page.status, 200); assert.match(page.type, /text\/html/);
  const p = await session();
  assert.equal((await call(admin, 'GET', '/admin/api/overview')).status, 401);
  assert.equal((await call(admin, 'GET', '/admin/api/overview', { token: p.token })).status, 401);
  assert.equal((await A('GET', '/overview')).status, 200);
  assert.equal((await call(game, 'GET', '/admin/api/overview', { token: TOKEN })).status, 404);   // not on the game port at all
});

test('overview: per-model RTP, ledger in balance, models from the registry', async () => {
  const p = await session();
  for (let i = 0; i < 30; i++) await play(p.token);
  const o = (await A('GET', '/overview')).json;
  const row = o.games.find(g => g.game === 'plinko' && g.variant === '97');
  assert.ok(row.rounds >= 30);
  assert.ok(row.theory > 0.96 && row.theory < 0.98);
  assert.equal(o.ledger.ok, true);
  assert.equal(o.models.length, app.registry.size);
});

test('ruleset preview refuses bad rules and shows exactly what changes', async () => {
  const bad = await A('POST', '/rules/preview', { body: { text: withRule(r => r.rules.push({ id: 'x', when: { lastWin: 'yes' }, then: { model: '92' } }), '9.0.0') } });
  assert.equal(bad.json.ok, false); assert.match(bad.json.error, /not an allowed rule input/);
  const unverified = await A('POST', '/rules/preview', { body: { text: withRule(r => { r.rules[0].then.model = '99'; }, '9.0.1') } });
  assert.equal(unverified.json.ok, false); assert.match(unverified.json.error, /no verified model/);
  const same = await A('POST', '/rules/preview', { body: { text: RULES } });
  assert.equal(same.json.ok, false);
  const p = await A('POST', '/rules/preview', { body: { text: withRule(r => { r.rules.find(x => x.id === 'demo-plinko').then.model = '95'; }, '1.1.0') } });
  assert.equal(p.json.ok, true);
  assert.ok(p.json.changed > 0);
  assert.ok(p.json.changes.every(c => c.input.profile === 'demo' && c.input.game === 'plinko' && c.before.model === '97' && c.after.model === '95'));
});

test('apply: needs a reason, takes effect on the next round, old rounds keep their ruleset, rollback works', async () => {
  const p = await session();
  const r1 = (await play(p.token)).json;
  assert.equal(r1.model.variant, '97');
  const text = withRule(r => { r.rules.find(x => x.id === 'demo-plinko').then.model = '95'; }, '1.1.0');
  assert.equal((await A('POST', '/rules/apply', { body: { text } })).status, 400);
  const ok = await A('POST', '/rules/apply', { body: { text, reason: 'demo plinko → 95' } });
  assert.equal(ok.status, 200);
  const r2 = (await play(p.token)).json;
  assert.equal(r2.model.variant, '95'); assert.equal(r2.rules.ruleset.version, '1.1.0');
  assert.equal((await A('GET', `/rounds/${r1.roundId}`)).json.proof.rules.version, '1.0.0');
  // the same version number with other content is refused
  const clash = await A('POST', '/rules/apply', { body: { text: withRule(r => { r.rules.find(x => x.id === 'demo-plinko').then.model = '92'; }, '1.1.0'), reason: 'clash' } });
  assert.equal(clash.status, 400);
  // rollback = re-activate the earlier text
  assert.equal((await A('POST', '/rules/apply', { body: { text: RULES, reason: 'rollback' } })).status, 200);
  assert.equal((await play(p.token)).json.model.variant, '97');
  const hist = (await A('GET', '/rules')).json.history.map(h => h.version);
  assert.deepEqual(hist.slice(0, 3), ['1.0.0', '1.1.0', '1.0.0']);
});

test('adjust: a reasoned ledger entry, idempotent, never below zero, books still balance', async () => {
  const p = await session();
  const path = `/players/${p.id}/adjust`;
  assert.equal((await A('POST', path, { body: { amountMinor: 500 }, idem: 'adj-noreason-1' })).status, 400);
  assert.equal((await A('POST', path, { body: { amountMinor: 500, reason: 'goodwill' } })).status, 400);              // no idempotency key
  const a = await A('POST', path, { body: { amountMinor: 500, reason: 'goodwill' }, idem: 'adj-once-0001' });
  const b = await A('POST', path, { body: { amountMinor: 500, reason: 'goodwill' }, idem: 'adj-once-0001' });
  assert.equal(a.json.balanceMinor, 100500); assert.equal(b.json.replayed, true);
  assert.equal((await A('POST', path, { body: { amountMinor: -200000, reason: 'too much' }, idem: 'adj-neg-0001' })).json.error, 'negative_balance');
  const d = (await A('GET', `/players/${p.id}`)).json;
  assert.equal(d.wallet.balanceMinor, 100500);
  assert.equal(d.wallet.txns.filter(t => t.kind === 'ADJUST').length, 1);
  assert.equal(d.ledgerOk, true);
  assert.equal(JSON.stringify(d).includes(p.token), false);                                                         // tokens never leave
});

test('round detail never shows a server seed that is still in use; after rotation it verifies', async () => {
  const p = await session();
  const r = (await play(p.token)).json;
  const before = (await A('GET', `/rounds/${r.roundId}`)).json;
  assert.equal(before.proof.fair.serverSeed, null); assert.equal(before.verification.pending, true);
  await G('POST', '/seeds/rotate', { token: p.token, body: {} });
  const afterRot = (await A('GET', `/rounds/${r.roundId}`)).json;
  assert.equal(afterRot.verification.ok, true);
});

test('audit log is a hash chain: every console write is in it, and editing a row breaks it', async () => {
  const a = (await A('GET', '/audit')).json;
  assert.equal(a.intact, true);
  assert.ok(a.rows.some(r => r.action === 'ruleset.activate') && a.rows.some(r => r.action === 'wallet.adjust'));
  const id = a.rows.find(r => r.action === 'wallet.adjust').id;
  app.db.prepare("UPDATE admin_audit SET payload_json = replace(payload_json, 'goodwill', 'g00dwill') WHERE id = ?").run(id);
  const broken = (await A('GET', '/audit')).json;
  assert.equal(broken.intact, false); assert.equal(broken.brokenAt, id);
});

test('a restart on the same database keeps the ruleset activated in the console', async () => {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'rgs-')), 'casino.db');
  const one = boot({ dbPath, adminToken: TOKEN });
  one.admin.applyRules(withRule(r => { r.rules.find(x => x.id === 'demo-hilo').then.model = '95'; }, '2.0.0'), 'persist test');
  one.db.close();
  const two = boot({ dbPath, adminToken: TOKEN });
  assert.equal(two.rgs.activeRules().version, '2.0.0');
  two.db.close();
});
