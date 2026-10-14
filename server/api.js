/* Game API — plain node:http, JSON in and out, bound to 127.0.0.1 only. */
import { createServer } from 'node:http';
import { RgsError } from './rgs.js';
import { RuleError } from './rules/engine.js';

const MAX_BODY = 64 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new RgsError('too_large', 'request body too large', 413)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks))); } catch { reject(new RgsError('bad_json', 'body is not JSON')); } });
    req.on('error', reject);
  });
}

export function createApi({ rgs, registry, engines }) {
  const routes = [
    ['GET', /^\/api\/health$/, () => ({ ok: true, models: registry.size })],
    ['POST', /^\/api\/session$/, async ({ body }) => rgs.createPlayer(body.profile === 'demo' || !body.profile ? 'demo' : String(body.profile))],
    ['GET', /^\/api\/games$/, ({ player }) => Object.keys(engines).map(game => {
      const { decision, model } = rgs.decide(player, game);
      return { game, model: { variant: model.variant, version: model.version, sha256: model.sha256, rtpPpm: model.rtpPpm, data: model.data },
               limits: { minBetMinor: decision.minBetMinor ?? null, maxBetMinor: decision.maxBetMinor ?? null, maxWinMinor: decision.maxWinMinor ?? null },
               rules: { ruleIds: decision.ruleIds, ruleset: decision.ruleset } };
    })],
    ['GET', /^\/api\/wallet$/, ({ player }) => rgs.wallet(player)],
    ['POST', /^\/api\/wallet\/topup$/, ({ player, idem }) => rgs.topup(player, idem)],
    ['POST', /^\/api\/wallet\/claim$/, ({ player }) => rgs.claim(player)],
    ['GET', /^\/api\/fair$/, ({ player }) => rgs.fairState(player)],
    ['POST', /^\/api\/seeds\/rotate$/, ({ player, body }) => rgs.rotateSeed(player, body.clientSeed)],
    ['POST', /^\/api\/rounds$/, ({ player, body, idem }) => rgs.playRound(player, body, idem)],
    ['GET', /^\/api\/rounds\/([\w-]+)$/, ({ player, m }) => rgs.round(player, m[1])],
    ['GET', /^\/api\/rounds\/([\w-]+)\/proof$/, ({ player, m }) => rgs.proof(player, m[1])]
  ];

  return createServer(async (req, res) => {
    const send = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
    try {
      const url = new URL(req.url, 'http://local');
      const route = routes.find(([m, re]) => m === req.method && re.test(url.pathname));
      if (!route) return send(404, { error: 'not_found', message: `${req.method} ${url.pathname}` });
      const m = url.pathname.match(route[1]);
      const body = req.method === 'POST' ? await readJson(req) : {};
      const isPublic = /session|health/.test(route[1].source);
      const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const player = isPublic ? null : rgs.auth(token);
      const out = await route[2]({ player, body, m, idem: req.headers['idempotency-key'], url });
      send(200, out);
    } catch (e) {
      if (e instanceof RgsError) return send(e.status, { error: e.code, message: e.message });
      if (e instanceof RuleError) return send(400, { error: 'rule', message: e.message });
      console.error(e);
      send(500, { error: 'internal', message: 'internal error' });
    }
  });
}
