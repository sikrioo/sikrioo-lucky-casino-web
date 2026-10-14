/* Admin console — operator view of the RGS, on its own port and its own token (never the game API's).
 *
 * What it can do: read everything the server knows (except a server seed that is still in use), preview and activate
 * a new ruleset (validated against the verified models, diffed against the active one, rollback = re-activate an
 * older one), correct a balance with an ADJUST ledger entry that needs a reason, and verify revealed rounds.
 * What it can NOT do, by construction: change a model (models come only from the Factory), change a settled round,
 * read an unrevealed server seed, set a balance directly, or change a player's rule inputs.
 * Every write lands in admin_audit, a hash chain: editing or deleting any row breaks every hash after it. */
import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tx, now } from './db.js';
import { RgsError } from './rgs.js';
import { compileRuleset, RuleError, OUTPUT_KEYS } from './rules/engine.js';
import { verifyRound } from './audit/verify.js';
import { TIERS, tierIndexFor } from '../src/shared/tiers.js';

const STATIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'admin');
const FILES = { '/': ['index.html', 'text/html'], '/admin.js': ['admin.js', 'text/javascript'], '/admin.css': ['admin.css', 'text/css'] };
const GENESIS = '0'.repeat(64);
const sha = s => createHash('sha256').update(s).digest('hex');

export function createAdmin({ db, rgs, registry, engines }) {
  const q = sql => db.prepare(sql);

  /* ---------- audit chain ---------- */
  function audit(action, payload, actor = 'admin') {
    const prev = q('SELECT hash FROM admin_audit ORDER BY id DESC LIMIT 1').get()?.hash || GENESIS;
    const at = now(), body = JSON.stringify(payload);
    const hash = sha(`${prev}|${at}|${actor}|${action}|${body}`);
    q('INSERT INTO admin_audit (at, actor, action, payload_json, prev_hash, hash) VALUES (?,?,?,?,?,?)').run(at, actor, action, body, prev, hash);
    return hash;
  }
  function auditLog(limit = 200) {
    const all = q('SELECT * FROM admin_audit ORDER BY id').all();
    let prev = GENESIS, brokenAt = null;
    for (const r of all) {
      const ok = r.prev_hash === prev && r.hash === sha(`${r.prev_hash}|${r.at}|${r.actor}|${r.action}|${r.payload_json}`);
      if (!ok && brokenAt === null) brokenAt = r.id;
      prev = r.hash;
    }
    return { intact: brokenAt === null, brokenAt, count: all.length,
             rows: all.slice(-limit).reverse().map(r => ({ id: r.id, at: r.at, actor: r.actor, action: r.action, payload: JSON.parse(r.payload_json), hash: r.hash })) };
  }

  /* ---------- overview ---------- */
  function overview() {
    const games = q(`SELECT game, model_variant AS variant, model_version AS version, COUNT(*) AS rounds,
        SUM(bet_minor) AS bet, SUM(payout_minor) AS paid,
        SUM(bet_minor * CAST(json_extract(response_json, '$.model.rtpPpm') AS REAL)) / 1e6 AS expected,
        SUM(1.0 * payout_minor / bet_minor) AS s1, SUM((1.0 * payout_minor / bet_minor) * (1.0 * payout_minor / bet_minor)) AS s2
      FROM round GROUP BY game, model_variant, model_version ORDER BY game, model_variant`).all().map(r => {
      const mean = r.s1 / r.rounds, sd = Math.sqrt(Math.max(0, r.s2 / r.rounds - mean * mean)), se = sd / Math.sqrt(r.rounds);
      const observed = r.paid / r.bet, theory = r.expected / r.bet;
      return { game: r.game, variant: r.variant, version: r.version, rounds: r.rounds, betMinor: r.bet, paidMinor: r.paid,
               observed, theory, band: 1.96 * se, alert: r.rounds >= 1000 && Math.abs(observed - theory) > 4 * se };
    });
    const t = q(`SELECT (SELECT COUNT(*) FROM player) AS players, (SELECT COUNT(*) FROM round) AS rounds,
        (SELECT COALESCE(SUM(balance_minor),0) FROM wallet_account) AS balance, (SELECT COALESCE(SUM(vault_ucent),0) FROM wallet_account) AS vault,
        (SELECT COALESCE(SUM(bet_minor - payout_minor),0) FROM round) AS ggr`).get();
    const off = rgs.reconcile().filter(r => r.balanceDiff || r.vaultDiff);
    const rules = rgs.activeRules();
    const used = Object.fromEntries(q('SELECT game || \'/\' || model_variant || \'/\' || model_version AS k, COUNT(*) AS n FROM round GROUP BY k').all().map(r => [r.k, r.n]));
    return {
      totals: { players: t.players, rounds: t.rounds, balanceMinor: t.balance, vaultMinor: Math.floor(t.vault / 1e6), ggrMinor: t.ggr },
      ledger: { ok: off.length === 0, mismatches: off.slice(0, 20) },
      ruleset: { version: rules.version, sha256: rules.sha256 },
      games,
      models: registry.all().map(m => ({ game: m.game, variant: m.variant, version: m.version, rtpPpm: m.rtpPpm, maxMult100: m.maxMult100,
                                         sha256: m.sha256, rounds: used[`${m.game}/${m.variant}/${m.version}`] || 0 }))
        .sort((a, b) => a.game.localeCompare(b.game) || b.rtpPpm - a.rtpPpm)
    };
  }

  /* ---------- rulesets ---------- */
  function rulesState() {
    const r = rgs.activeRules();
    const history = q(`SELECT a.id, a.version, a.sha256, a.reason, a.actor, a.at, s.json FROM ruleset_activation a
                       LEFT JOIN ruleset s ON s.version = a.version ORDER BY a.id DESC LIMIT 50`).all();
    return { active: { version: r.version, sha256: r.sha256, text: r.text }, history };
  }

  /** every input the server can actually produce, so the diff covers each case a real round could hit */
  function inputGrid(a, b) {
    const profiles = new Set(['demo', ...q('SELECT DISTINCT profile FROM player').all().map(r => r.profile)]);
    const bets = new Set();
    for (const rs of [a, b]) {
      if (rs.defaults?.minBetMinor) bets.add(rs.defaults.minBetMinor);
      for (const r of rs.rules) {
        const p = r.when?.profile; [].concat(p || []).forEach(x => profiles.add(x));
        const bm = r.when?.betMinor;
        if (bm?.gte !== undefined) { bets.add(bm.gte); if (bm.gte > 1) bets.add(bm.gte - 1); }
        if (bm?.lte !== undefined) { bets.add(bm.lte); bets.add(bm.lte + 1); }
      }
    }
    if (!bets.size) bets.add(100);
    const out = [];
    for (const profile of profiles) for (const game of Object.keys(engines)) for (const t of TIERS) for (const betMinor of [...bets].sort((x, y) => x - y))
      out.push({ profile, game, tier: t.name, betMinor });
    return out;
  }
  const pick = d => Object.fromEntries(OUTPUT_KEYS.filter(k => d[k] !== undefined).map(k => [k, d[k]]));

  function previewRules(text) {
    if (typeof text !== 'string' || !text.trim()) throw new RgsError('bad_ruleset', 'ruleset text is empty');
    let next;
    try { next = compileRuleset(text, { registry }); }
    catch (e) { return { ok: false, error: e instanceof SyntaxError ? `JSON 오류: ${e.message}` : e.message }; }
    const cur = rgs.activeRules();
    const used = q('SELECT sha256 FROM ruleset WHERE version = ?').get(next.version);
    const versionClash = used && used.sha256 !== next.sha256;
    const changes = [];
    const grid = inputGrid(JSON.parse(cur.text), JSON.parse(next.text));
    for (const input of grid) {
      const before = pick(cur.evaluate(input)), after = pick(next.evaluate(input));
      if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ input, before, after });
    }
    return { ok: !versionClash && next.sha256 !== cur.sha256, version: next.version, sha256: next.sha256, cases: grid.length,
             changed: changes.length, changes: changes.slice(0, 300),
             error: versionClash ? `버전 ${next.version}은 다른 내용으로 이미 쓰였어요 — version을 올려주세요` : next.sha256 === cur.sha256 ? '지금 적용된 룰셋과 똑같아요' : null };
  }

  function applyRules(text, reason) {
    reason = String(reason || '').trim();
    if (reason.length < 3) throw new RgsError('reason', '적용 사유를 3자 이상 적어주세요');
    const p = previewRules(text);
    if (!p.ok) throw new RgsError('bad_ruleset', p.error);
    const next = compileRuleset(text, { registry });
    const prev = rgs.activeRules();
    tx(db, () => {
      q('INSERT OR IGNORE INTO ruleset (version, sha256, json) VALUES (?,?,?)').run(next.version, next.sha256, next.text);
      q('INSERT INTO ruleset_activation (version, sha256, reason, actor, at) VALUES (?,?,?,?,?)').run(next.version, next.sha256, reason, 'admin', now());
      audit('ruleset.activate', { from: { version: prev.version, sha256: prev.sha256 }, to: { version: next.version, sha256: next.sha256 }, changed: p.changed, reason });
      rgs.setRules(next);
    });
    return { version: next.version, sha256: next.sha256, changed: p.changed };
  }

  /* ---------- rounds ---------- */
  function rounds({ player, game, id, limit = 100 }) {
    const where = [], args = [];
    if (player) { where.push('player_id = ?'); args.push(player); }
    if (game) { where.push('game = ?'); args.push(game); }
    if (id) { where.push('id LIKE ?'); args.push(id.replace(/[%_]/g, '') + '%'); }
    return q(`SELECT id, player_id AS player, game, model_variant AS variant, model_version AS version, ruleset_version AS ruleset,
                bet_minor AS betMinor, payout_minor AS payoutMinor, created_at AS at FROM round
              ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, rowid DESC LIMIT ?`).all(...args, Math.min(500, limit));
  }
  function roundDetail(id) {
    const r = q('SELECT player_id FROM round WHERE id = ?').get(id);
    if (!r) throw new RgsError('not_found', 'no such round', 404);
    const proof = rgs.proof({ id: r.player_id }, id);              // serverSeed only if already revealed
    const model = registry.get(proof.model.game, proof.model.variant, proof.model.version);
    const verification = proof.fair.serverSeed
      ? (model ? verifyRound(proof, model) : { ok: false, problems: ['이 판이 쓴 모델이 지금 레지스트리에 없어요'] })
      : { ok: null, pending: true, problems: ['서버 시드가 아직 사용 중이라 공개 전이에요 (플레이어가 시드를 교체하면 검증 가능)'] };
    return { player: r.player_id, proof, verification };
  }

  /* ---------- players ---------- */
  function players({ q: needle = '', limit = 100 }) {
    return q(`SELECT p.id, p.profile, p.wagered_minor AS wageredMinor, p.created_at AS createdAt, a.balance_minor AS balanceMinor,
                a.vault_ucent AS vaultUcent, (SELECT COUNT(*) FROM round r WHERE r.player_id = p.id) AS rounds
              FROM player p JOIN wallet_account a ON a.player_id = p.id WHERE p.id LIKE ? ORDER BY p.created_at DESC LIMIT ?`)
      .all('%' + String(needle).replace(/[%_]/g, '') + '%', Math.min(500, limit))
      .map(p => ({ ...p, tier: TIERS[tierIndexFor(p.wageredMinor / 100)].name }));
  }
  function playerDetail(id) {
    const p = q('SELECT id, profile, created_at AS createdAt FROM player WHERE id = ?').get(id);
    if (!p) throw new RgsError('not_found', 'no such player', 404);
    const ledger = rgs.reconcile().find(r => r.player === id);
    return { ...p, wallet: rgs.wallet({ id }, 100), ledgerOk: !ledger.balanceDiff && !ledger.vaultDiff };
  }

  /** a correction is a new ledger entry with a reason — the balance is never written directly */
  function adjust(id, { amountMinor, reason }, idemKey) {
    if (!idemKey || !/^[\w.:-]{8,128}$/.test(idemKey)) throw new RgsError('idempotency_key', 'Idempotency-Key header is required');
    const amount = Number(amountMinor);
    reason = String(reason || '').trim();
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100000000) throw new RgsError('bad_amount', '금액은 0이 아닌 정수 센트, ±$1,000,000 이내');
    if (reason.length < 3 || reason.length > 300) throw new RgsError('reason', '사유를 3–300자로 적어주세요');
    const key = `admin:${idemKey}`;
    return tx(db, () => {
      const done = q('SELECT * FROM wallet_txn WHERE idem_key = ?').get(key);
      if (done) return { amountMinor: done.amount_minor, balanceMinor: done.balance_after, replayed: true };
      const a = q('SELECT * FROM wallet_account WHERE player_id = ?').get(id);
      if (!a) throw new RgsError('not_found', 'no such player', 404);
      const bal = a.balance_minor + amount;
      if (bal < 0) throw new RgsError('negative_balance', `잔액(${a.balance_minor}¢)보다 많이 차감할 수 없어요`);
      q('UPDATE wallet_account SET balance_minor = ?, version = version + 1 WHERE player_id = ?').run(bal, id);
      const t = q('INSERT INTO wallet_txn (player_id, round_id, kind, amount_minor, amount_ucent, balance_after, idem_key, created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, null, 'ADJUST', amount, 0, bal, key, now());
      audit('wallet.adjust', { player: id, amountMinor: amount, balanceBefore: a.balance_minor, balanceAfter: bal, txn: Number(t.lastInsertRowid), reason });
      return { amountMinor: amount, balanceMinor: bal };
    });
  }

  return { audit, auditLog, overview, rulesState, previewRules, applyRules, rounds, roundDetail, players, playerDetail, adjust };
}

export function createAdminApi({ admin, token }) {
  if (!token || token.length < 16) throw new Error('admin token must be at least 16 characters');
  const want = Buffer.from(sha(token));
  const authed = h => { const got = (h || '').replace(/^Bearer\s+/i, ''); return got && timingSafeEqual(Buffer.from(sha(got)), want); };
  const routes = [
    ['GET', /^\/admin\/api\/overview$/, () => admin.overview()],
    ['GET', /^\/admin\/api\/rules$/, () => admin.rulesState()],
    ['POST', /^\/admin\/api\/rules\/preview$/, ({ body }) => admin.previewRules(body.text)],
    ['POST', /^\/admin\/api\/rules\/apply$/, ({ body }) => admin.applyRules(body.text, body.reason)],
    ['GET', /^\/admin\/api\/rounds$/, ({ url }) => admin.rounds(Object.fromEntries(url.searchParams))],
    ['GET', /^\/admin\/api\/rounds\/([\w-]+)$/, ({ m }) => admin.roundDetail(m[1])],
    ['GET', /^\/admin\/api\/players$/, ({ url }) => admin.players(Object.fromEntries(url.searchParams))],
    ['GET', /^\/admin\/api\/players\/([\w-]+)$/, ({ m }) => admin.playerDetail(m[1])],
    ['POST', /^\/admin\/api\/players\/([\w-]+)\/adjust$/, ({ m, body, idem }) => admin.adjust(m[1], body, idem)],
    ['GET', /^\/admin\/api\/audit$/, () => admin.auditLog()]
  ];
  return createServer(async (req, res) => {
    const send = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
    try {
      const url = new URL(req.url, 'http://local');
      if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
      const file = req.method === 'GET' && FILES[url.pathname];
      if (file) {
        res.writeHead(200, { 'content-type': `${file[1]}; charset=utf-8`, 'cache-control': 'no-store', 'x-frame-options': 'DENY',
          'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" });
        return res.end(readFileSync(join(STATIC, file[0])));
      }
      const route = routes.find(([mm, re]) => mm === req.method && re.test(url.pathname));
      if (!route) return send(404, { error: 'not_found', message: `${req.method} ${url.pathname}` });
      if (!authed(req.headers.authorization)) return send(401, { error: 'unauthorized', message: 'admin token required' });
      let body = {};
      if (req.method === 'POST') {
        const chunks = []; let size = 0;
        for await (const c of req) { size += c.length; if (size > 256 * 1024) return send(413, { error: 'too_large', message: 'body too large' }); chunks.push(c); }
        try { body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}; } catch { return send(400, { error: 'bad_json', message: 'body is not JSON' }); }
      }
      send(200, await route[2]({ body, url, m: url.pathname.match(route[1]), idem: req.headers['idempotency-key'] }));
    } catch (e) {
      if (e instanceof RgsError) return send(e.status, { error: e.code, message: e.message });
      if (e instanceof RuleError) return send(400, { error: 'rule', message: e.message });
      console.error(e);
      send(500, { error: 'internal', message: 'internal error' });
    }
  });
}
