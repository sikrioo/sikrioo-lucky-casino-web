import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry, ModelIntegrityError } from '../server/models/registry.js';
import { compileRuleset, RuleError, INPUT_KEYS } from '../server/rules/engine.js';
import { boot } from '../server/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const copyModels = () => { const d = mkdtempSync(join(tmpdir(), 'models-')); cpSync(join(ROOT, 'models'), d, { recursive: true }); return d; };
const RULES = JSON.parse(readFileSync(join(ROOT, 'rules', 'default.json'), 'utf8'));

test('registry loads every verified model and checks its hash', () => {
  const reg = loadRegistry(join(ROOT, 'models'));
  assert.ok(reg.size >= 7);
  assert.ok(reg.get('plinko', '97') && reg.get('hilo', 'traditional'));
});

test('one changed byte in a model file stops the boot', () => {
  const d = copyModels(), f = join(d, 'plinko', '97', '1.0.0', 'model.json');
  const before = readFileSync(f, 'utf8'), after = before.replace(/"maxMult100": (\d+)/, (_, d) => `"maxMult100": ${+d + 1}`);
  assert.notEqual(after, before);
  writeFileSync(f, after);
  assert.throws(() => loadRegistry(d), ModelIntegrityError);
  assert.throws(() => boot({ modelsDir: d }), /hash mismatch/);
});

test('a model the Factory did not verify is refused', () => {
  const d = copyModels(), m = join(d, 'hilo', '97', '1.0.0', 'manifest.json');
  const man = JSON.parse(readFileSync(m, 'utf8')); man.verified = false; writeFileSync(m, JSON.stringify(man));
  assert.throws(() => loadRegistry(d), /did not pass Factory verification/);
});

test('rules cannot read the round or the player’s results: unknown inputs are refused', () => {
  const rs = compileRuleset(RULES);
  for (const k of ['recentLosses', 'balanceMinor', 'lastResult', 'serverSeed', 'outcome'])
    assert.throws(() => rs.evaluate({ game: 'plinko', [k]: 1 }), RuleError, k);
  assert.throws(() => compileRuleset({ version: 'x', rules: [{ id: 'sneaky', when: { netLossMinor: { gte: 1 } }, then: { model: '97' } }] }), /not an allowed rule input/);
  assert.deepEqual(INPUT_KEYS, ['profile', 'game', 'mode', 'tier', 'betMinor']);
});

test('rules can only choose verified models', () => {
  const reg = loadRegistry(join(ROOT, 'models'));
  assert.throws(() => compileRuleset({ version: 'x', rules: [{ id: 'r', when: { game: 'plinko' }, then: { model: '99' } }] }, { registry: reg }), /no verified model/);
  assert.throws(() => compileRuleset({ version: 'x', rules: [{ id: 'r', then: { model: '97' } }] }, { registry: reg }), /needs a 'game' condition/);
});

test('evaluation is deterministic and per-field priority wins', () => {
  const rs = compileRuleset(RULES);
  const input = { profile: 'demo', game: 'plinko', tier: 'GOLD', betMinor: 1500000 };
  const first = JSON.stringify(rs.evaluate(input));
  for (let i = 0; i < 100000; i++) assert.equal(JSON.stringify(rs.evaluate(input)), first);
  const d = rs.evaluate(input);
  assert.equal(d.model, '97'); assert.equal(d.maxWinMinor, 500000000);
  assert.deepEqual(d.fieldFrom, { model: 'demo-plinko', maxWinMinor: 'high-roller-cap' });
  assert.equal(rs.evaluate({ profile: 'lowrtp', game: 'plinko' }).model, '92');
  assert.equal(rs.evaluate({ profile: 'classic', game: 'hilo' }).model, 'traditional');
});
