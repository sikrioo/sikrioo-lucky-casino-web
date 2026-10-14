/* Model Registry — the only source of game maths the server will use.
 * models/<game>/<variant>/<version>/{model.json, manifest.json, report.md} are written by the Math Factory.
 * On boot every model.json is hashed and compared with its manifest; one mismatch and the server refuses to start. */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const semver = v => v.split('.').map(Number);
const newer = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]; return false; };

export class ModelIntegrityError extends Error {}

export function loadRegistry(root) {
  const models = new Map();          // `${game}/${variant}/${version}` -> model
  const latest = new Map();          // `${game}/${variant}` -> version
  if (!existsSync(root)) throw new ModelIntegrityError(`model directory not found: ${root}`);
  for (const game of readdirSync(root)) {
    for (const variant of readdirSync(join(root, game))) {
      for (const version of readdirSync(join(root, game, variant))) {
        const dir = join(root, game, variant, version);
        const manifestPath = join(dir, 'manifest.json'), modelPath = join(dir, 'model.json');
        if (!existsSync(manifestPath) || !existsSync(modelPath)) throw new ModelIntegrityError(`incomplete model at ${dir}`);
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
        const bytes = readFileSync(modelPath);
        const sha256 = createHash('sha256').update(bytes).digest('hex');
        if (sha256 !== manifest.sha256) throw new ModelIntegrityError(`hash mismatch for ${game}/${variant}/${version}: manifest ${manifest.sha256.slice(0, 12)}…, file ${sha256.slice(0, 12)}…`);
        const model = JSON.parse(bytes);
        if (model.game !== game || model.variant !== variant || model.version !== version)
          throw new ModelIntegrityError(`model id does not match its path at ${dir}`);
        if (!manifest.verified) throw new ModelIntegrityError(`model ${game}/${variant}/${version} did not pass Factory verification`);
        model.sha256 = sha256;
        models.set(`${game}/${variant}/${version}`, Object.freeze(model));
        const k = `${game}/${variant}`;
        if (!latest.has(k) || newer(version, latest.get(k))) latest.set(k, version);
      }
    }
  }
  return {
    size: models.size,
    get(game, variant, version) {
      const v = version || latest.get(`${game}/${variant}`);
      return v ? models.get(`${game}/${variant}/${v}`) || null : null;
    },
    variants(game) { return [...latest.keys()].filter(k => k.startsWith(game + '/')).map(k => k.split('/')[1]); },
    all() { return [...models.values()]; }
  };
}
