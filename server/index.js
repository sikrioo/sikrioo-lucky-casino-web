/* Boot: verify every model, compile the ruleset against them, open the ledger, listen on 127.0.0.1.
 *   npm run server                 (in-memory ledger)
 *   RGS_DB=data/casino.db npm run server   (kept on disk)
 * Game API on PORT (8787), admin console on ADMIN_PORT (8788) with RGS_ADMIN_TOKEN (a random one is printed if unset).
 * The ruleset is the last one activated in the console (kept in the db); rules/default.json only on a fresh db.
 * Any integrity problem stops the boot — the server never runs on unverified maths. */
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openDb } from './db.js';
import { loadRegistry } from './models/registry.js';
import { compileRuleset } from './rules/engine.js';
import { ENGINES } from './games/index.js';
import { createRgs } from './rgs.js';
import { createApi } from './api.js';
import { createAdmin, createAdminApi } from './admin.js';
import { now } from './db.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function boot({ modelsDir = join(ROOT, 'models'), rulesPath = join(ROOT, 'rules', 'default.json'), dbPath, port = 0,
                       adminPort = 0, adminToken = process.env.RGS_ADMIN_TOKEN || randomBytes(18).toString('base64url') } = {}) {
  const registry = loadRegistry(modelsDir);
  const db = openDb(dbPath);
  const last = db.prepare('SELECT s.json FROM ruleset_activation a JOIN ruleset s ON s.version = a.version ORDER BY a.id DESC LIMIT 1').get();
  const rules = compileRuleset(last ? last.json : readFileSync(rulesPath, 'utf8'), { registry });
  if (!last) db.prepare('INSERT INTO ruleset_activation (version, sha256, reason, actor, at) VALUES (?,?,?,?,?)').run(rules.version, rules.sha256, 'boot: rules/default.json', 'system', now());
  const rgs = createRgs({ db, registry, rules, engines: ENGINES });
  const server = createApi({ rgs, registry, engines: ENGINES });
  const admin = createAdmin({ db, rgs, registry, engines: ENGINES });
  const adminServer = createAdminApi({ admin, token: adminToken });
  const on = (srv, p) => new Promise(r => srv.listen(p, '127.0.0.1', () => r(srv.address().port)));
  return { registry, rules, db, rgs, server, admin, adminServer, adminToken,
           listen: () => on(server, port), listenAdmin: () => on(adminServer, adminPort),
           close: () => { server.close(); adminServer.close(); } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const app = boot({ port: Number(process.env.PORT || 8787), adminPort: Number(process.env.ADMIN_PORT || 8788) });
    const port = await app.listen(), aport = await app.listenAdmin();
    console.log(`LUCKY STRIP RGS · http://127.0.0.1:${port}/api · ${app.registry.size} verified models · ruleset ${app.rules.version} (${app.rules.sha256.slice(0, 12)}) · db ${process.env.RGS_DB || ':memory:'}`);
    console.log(`Admin console · http://127.0.0.1:${aport}/ · token ${process.env.RGS_ADMIN_TOKEN ? '(RGS_ADMIN_TOKEN)' : app.adminToken}`);
  } catch (e) {
    console.error(`RGS refused to start: ${e.message}`);
    process.exit(1);
  }
}
