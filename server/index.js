/* Boot: verify every model, compile the ruleset against them, open the ledger, listen on 127.0.0.1.
 *   npm run server                 (in-memory ledger)
 *   RGS_DB=data/casino.db npm run server   (kept on disk)
 * Any integrity problem stops the boot — the server never runs on unverified maths. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb } from './db.js';
import { loadRegistry } from './models/registry.js';
import { compileRuleset } from './rules/engine.js';
import { ENGINES } from './games/index.js';
import { createRgs } from './rgs.js';
import { createApi } from './api.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function boot({ modelsDir = join(ROOT, 'models'), rulesPath = join(ROOT, 'rules', 'default.json'), dbPath, port = 0 } = {}) {
  const registry = loadRegistry(modelsDir);
  const rules = compileRuleset(readFileSync(rulesPath, 'utf8'), { registry });
  const db = openDb(dbPath);
  const rgs = createRgs({ db, registry, rules, engines: ENGINES });
  const server = createApi({ rgs, registry, engines: ENGINES });
  return { registry, rules, db, rgs, server, listen: () => new Promise(r => server.listen(port, '127.0.0.1', () => r(server.address().port))) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const app = boot({ port: Number(process.env.PORT || 8787) });
    const port = await app.listen();
    console.log(`LUCKY STRIP RGS · http://127.0.0.1:${port}/api · ${app.registry.size} verified models · ruleset ${app.rules.version} (${app.rules.sha256.slice(0, 12)}) · db ${process.env.RGS_DB || ':memory:'}`);
  } catch (e) {
    console.error(`RGS refused to start: ${e.message}`);
    process.exit(1);
  }
}
