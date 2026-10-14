#!/usr/bin/env node
/* Math Factory CLI
 *   npm run factory -- build plinko          build + exact + simulate + verify every variant, write models/
 *   npm run factory -- build all --rounds 1000000
 *   npm run factory -- exact plinko          exact RTP table only (no files written)
 * A variant is written only if it passes every check; the manifest records the checks it passed. */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FairStream, newServerSeed } from '../server/rng/fair.js';
import { simulate, writeModel, pct } from './lib.js';
import * as plinko from './games/plinko.js';
import * as hilo from './games/hilo.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAMES = { plinko, hilo };

function checkVariant(game, variant, model, rounds) {
  const g = GAMES[game], combos = g.combos(model), checks = [], rows = [];
  const fail = [];
  for (const c of combos) {
    const exact = c.rtpPpm / 1e6;
    const sim = simulate({ engine: g.engine, model, params: g.engine.validate(c.params, model), rounds });
    const se = c.sd / Math.sqrt(rounds), z = Math.abs(sim.rtp - exact) / (se || 1);
    rows.push({ ...c, exact, sim, z });
    if (!c.size || !c.symmetric) fail.push(`${c.label}: table shape`);
    if (Math.abs(exact - variant.target) > variant.tolerance) fail.push(`${c.label}: exact RTP ${pct(exact)} is outside ${pct(variant.target)} ± ${pct(variant.tolerance, 2)}`);
    if (z > 4) fail.push(`${c.label}: simulation ${pct(sim.rtp)} is ${z.toFixed(1)} standard errors from the exact ${pct(exact)}`);
    if (c.maxMult100 > model.maxMult100) fail.push(`${c.label}: max multiplier above the declared maximum`);
  }
  // determinism: the same seed must give the same round, twice
  const seed = newServerSeed(), c0 = combos[0];
  const a = g.engine.play({ model, params: g.engine.validate(c0.params, model), betMinor: 10000, rng: new FairStream(seed, 'factory', 1) });
  const b = g.engine.play({ model, params: g.engine.validate(c0.params, model), betMinor: 10000, rng: new FairStream(seed, 'factory', 1) });
  if (JSON.stringify(a) !== JSON.stringify(b)) fail.push('engine is not deterministic for a fixed seed');
  checks.push('table shape', `exact RTP within ±${pct(variant.tolerance, 2)} of ${pct(variant.target)}`, `Monte Carlo ${rounds.toLocaleString('en-US')} rounds per combination within 4 SE of exact`, 'max multiplier declared', 'deterministic replay');
  return { ok: fail.length === 0, fail, checks, rows };
}

function report(game, variant, model, res) {
  const lines = [
    `# ${game} · variant ${variant.id} · v${model.version}`, '',
    `Target RTP ${pct(variant.target)} ± ${pct(variant.tolerance, 2)}${variant.note ? ` — ${variant.note}` : ''}. Result: **${res.ok ? 'PASS' : 'FAIL'}**.`, '',
    '| combination | exact RTP | simulated RTP | 99% CI | hit rate | sd | max × |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...res.rows.map(r => `| ${r.label} | ${pct(r.exact)} | ${pct(r.sim.rtp)} | ${pct(r.sim.ci99[0], 2)} – ${pct(r.sim.ci99[1], 2)} | ${pct(r.sim.hitRate, 1)} | ${r.sd.toFixed(2)} | ${r.maxMult100 / 100} |`),
    '', `Checks: ${res.checks.join(' · ')}.`, ...(res.fail.length ? ['', 'Failures:', ...res.fail.map(f => `- ${f}`)] : []), ''
  ];
  return lines.join('\n');
}

const [cmd = 'build', which = 'all', ...rest] = process.argv.slice(2);
const roundsArg = rest.includes('--rounds') ? Number(rest[rest.indexOf('--rounds') + 1]) : null;
const games = which === 'all' ? Object.keys(GAMES) : [which];
let failed = 0;
for (const game of games) {
  if (!GAMES[game]) { console.error(`unknown game ${game}`); process.exit(2); }
  const cfg = JSON.parse(readFileSync(join(ROOT, 'factory', 'configs', `${game}.json`), 'utf8'));
  for (const variant of cfg.variants) {
    const model = GAMES[game].build(variant, cfg.version);
    if (cmd === 'exact') {
      for (const c of GAMES[game].combos(model)) console.log(`${game}/${variant.id}  ${c.label.padEnd(18)} ${pct(c.rtpPpm / 1e6)}`);
      continue;
    }
    const rounds = roundsArg || cfg.rounds;
    const t0 = Date.now();
    const res = checkVariant(game, variant, model, rounds);
    const text = report(game, variant, model, res);
    if (res.ok) {
      const { sha256 } = writeModel(join(ROOT, 'models'), model, { verified: true, checks: res.checks, report: text });
      console.log(`✔ ${game}/${variant.id}@${model.version}  min RTP ${pct(model.rtpPpm / 1e6)}  sha256 ${sha256.slice(0, 12)}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    } else {
      failed++;
      console.log(`✘ ${game}/${variant.id}@${model.version} NOT written:\n  - ${res.fail.join('\n  - ')}`);
    }
  }
}
process.exit(failed ? 1 : 0);
