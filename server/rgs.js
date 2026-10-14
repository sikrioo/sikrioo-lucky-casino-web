/* RGS core: players, wallet ledger, rounds. Every money movement is one row in wallet_txn, inside the same SQLite
 * transaction as the round it belongs to. A repeated request with the same Idempotency-Key returns the stored
 * response and moves no money. */
import { randomUUID, randomBytes } from 'node:crypto';
import { tx, now } from './db.js';
import { FairStream, newServerSeed, newClientSeed, commit } from './rng/fair.js';
import { TIERS, tierIndexFor } from '../src/shared/tiers.js';

export class RgsError extends Error { constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; } }

export function createRgs({ db, registry, rules, engines, startingBalanceMinor = 100000 }) {
  const q = sql => db.prepare(sql);
  const getPlayerByToken = q('SELECT * FROM player WHERE token = ?');
  const getPlayer = q('SELECT * FROM player WHERE id = ?');
  const getAccount = q('SELECT * FROM wallet_account WHERE player_id = ?');
  const setAccount = q('UPDATE wallet_account SET balance_minor = ?, vault_ucent = ?, version = version + 1 WHERE player_id = ?');
  const addTxn = q('INSERT INTO wallet_txn (player_id, round_id, kind, amount_minor, amount_ucent, balance_after, idem_key, created_at) VALUES (?,?,?,?,?,?,?,?)');
  const findTxnByIdem = q('SELECT * FROM wallet_txn WHERE idem_key = ?');
  const findRoundByIdem = q('SELECT response_json FROM round WHERE player_id = ? AND idem_key = ?');
  const getRound = q('SELECT * FROM round WHERE id = ?');
  const getRoundRng = q('SELECT * FROM round_rng WHERE round_id = ?');
  const getEvents = q('SELECT seq, type, json FROM round_event WHERE round_id = ? ORDER BY seq');

  // remember every model the server ever loaded, so a round always names a model the db knows
  const insModel = q('INSERT OR IGNORE INTO model (game, variant, version, sha256, rtp_ppm, max_mult100, loaded_at) VALUES (?,?,?,?,?,?,?)');
  for (const m of registry.all()) insModel.run(m.game, m.variant, m.version, m.sha256, m.rtpPpm, m.maxMult100, now());
  q('INSERT OR IGNORE INTO ruleset (version, sha256, json) VALUES (?,?,?)').run(rules.version, rules.sha256, rules.text);

  const tierOf = p => TIERS[tierIndexFor(p.wagered_minor / 100)];

  function createPlayer(profile = 'demo') {
    const id = 'p_' + randomUUID().slice(0, 8), token = randomBytes(24).toString('base64url');
    tx(db, () => {
      q('INSERT INTO player (id, token, profile, server_seed, client_seed, nonce, created_at) VALUES (?,?,?,?,?,0,?)').run(id, token, profile, newServerSeed(), newClientSeed(), now());
      q('INSERT INTO wallet_account (player_id, balance_minor, vault_ucent) VALUES (?, ?, 0)').run(id, startingBalanceMinor);
      addTxn.run(id, null, 'TOPUP', startingBalanceMinor, 0, startingBalanceMinor, null, now());
    });
    return { id, token };
  }

  function auth(token) {
    const p = token && getPlayerByToken.get(token);
    if (!p) throw new RgsError('unauthorized', 'missing or unknown session token', 401);
    return p;
  }

  /** the business-rule decision for this player + game, with the verified model it points at */
  function decide(player, game, betMinor = 0) {
    if (!engines[game]) throw new RgsError('unknown_game', `no engine for '${game}'`, 404);
    const decision = rules.evaluate({ profile: player.profile, game, tier: tierOf(player).name, betMinor });
    if (decision.enabled === false) throw new RgsError('game_disabled', `${game} is disabled by rule ${decision.fieldFrom.enabled}`, 403);
    const model = registry.get(game, decision.model);
    if (!model) throw new RgsError('no_model', `rules chose ${game}/${decision.model}, which is not a verified model`, 500);
    return { decision, model };
  }

  function wallet(player, limit = 20) {
    const a = getAccount.get(player.id), t = tierOf(getPlayer.get(player.id));
    return {
      balanceMinor: a.balance_minor, vaultUcent: a.vault_ucent, vaultMinor: Math.floor(a.vault_ucent / 1e6),
      wageredMinor: getPlayer.get(player.id).wagered_minor, tier: t.name, atmFloorMinor: t.atm * 100,
      txns: q('SELECT id, round_id AS roundId, kind, amount_minor AS amountMinor, amount_ucent AS amountUcent, balance_after AS balanceAfter, created_at AS at FROM wallet_txn WHERE player_id = ? ORDER BY id DESC LIMIT ?').all(player.id, limit)
    };
  }

  function playRound(player, body, idemKey) {
    if (!idemKey || !/^[\w.:-]{8,128}$/.test(idemKey)) throw new RgsError('idempotency_key', 'Idempotency-Key header (8–128 chars) is required');
    const replay = findRoundByIdem.get(player.id, idemKey);
    if (replay) return { ...JSON.parse(replay.response_json), replayed: true };

    return tx(db, () => {
      const again = findRoundByIdem.get(player.id, idemKey);              // re-check inside the transaction
      if (again) return { ...JSON.parse(again.response_json), replayed: true };
      const p = getPlayer.get(player.id);
      const game = body?.game, engine = engines[game];
      if (!engine) throw new RgsError('unknown_game', `no engine for '${game}'`, 404);
      const betMinor = Number(body.betMinor);
      if (!Number.isInteger(betMinor) || betMinor <= 0) throw new RgsError('bad_bet', 'betMinor must be a positive integer (cents)');

      // 1. business rules pick the model and limits — before any randomness exists for this round
      const { decision, model } = decide(p, game, betMinor);
      let params;
      try { params = engine.validate(body.params || {}, model); } catch (e) { throw new RgsError('bad_params', e.message); }
      if (engine.betOf(params, betMinor) !== betMinor) throw new RgsError('bad_bet', 'betMinor does not match the bets in params');
      if (decision.minBetMinor && betMinor < decision.minBetMinor) throw new RgsError('bet_limit', `minimum bet is ${decision.minBetMinor} cents`);
      if (decision.maxBetMinor && betMinor > decision.maxBetMinor) throw new RgsError('bet_limit', `maximum bet is ${decision.maxBetMinor} cents`);

      // 2. debit
      const acct = getAccount.get(p.id);
      if (acct.balance_minor < betMinor) throw new RgsError('insufficient_funds', 'balance is lower than the bet', 402);
      const roundId = 'r_' + randomUUID();
      let balance = acct.balance_minor - betMinor;
      addTxn.run(p.id, roundId, 'BET', -betMinor, 0, balance, `${p.id}:${idemKey}:bet`, now());

      // 3. the outcome — from the committed seed and the verified model only
      const nonce = p.nonce + 1;
      const rng = new FairStream(p.server_seed, p.client_seed, nonce);
      const result = engine.play({ model, params, betMinor, rng });
      let payoutMinor = result.payoutMinor, capped = false;
      if (decision.maxWinMinor && payoutMinor > decision.maxWinMinor) { payoutMinor = decision.maxWinMinor; capped = true; }

      // 4. settle + rakeback (a share of the theoretical edge of exactly this model and these params)
      if (payoutMinor > 0) { balance += payoutMinor; addTxn.run(p.id, roundId, 'WIN', payoutMinor, 0, balance, `${p.id}:${idemKey}:win`, now()); }
      const rtp = engine.rtpPpm(model, params);
      const share = decision.rakebackShare ?? tierOf(p).rakebackShare;
      const rakeUcent = Number(BigInt(betMinor) * BigInt(Math.max(0, 1e6 - rtp)) * BigInt(Math.round(share * 1e6)) / 1000000n);
      if (rakeUcent > 0) addTxn.run(p.id, roundId, 'RAKEBACK', 0, rakeUcent, balance, `${p.id}:${idemKey}:rake`, now());
      setAccount.run(balance, acct.vault_ucent + rakeUcent, p.id);
      q('UPDATE player SET nonce = ?, wagered_minor = wagered_minor + ? WHERE id = ?').run(nonce, betMinor, p.id);

      const seedHash = commit(p.server_seed);
      const response = {
        roundId, game, status: 'settled', betMinor, payoutMinor, capped,
        balanceAfterBetMinor: acct.balance_minor - betMinor, balanceMinor: balance, rakebackUcent: rakeUcent,
        params, outcome: result.outcome,
        model: { variant: model.variant, version: model.version, sha256: model.sha256, rtpPpm: rtp },
        rules: { ruleset: decision.ruleset, ruleIds: decision.ruleIds },
        fair: { seedHash, clientSeed: p.client_seed, nonce }
      };
      q(`INSERT INTO round (id, player_id, game, idem_key, model_variant, model_version, model_sha256, ruleset_version, ruleset_sha256,
          decision_json, bet_minor, payout_minor, status, params_json, outcome_json, response_json, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(roundId, p.id, game, idemKey, model.variant, model.version, model.sha256, rules.version, rules.sha256,
          JSON.stringify(decision), betMinor, payoutMinor, 'settled', JSON.stringify(params), JSON.stringify(result.outcome), JSON.stringify(response), now());
      q('INSERT INTO round_rng (round_id, seed_hash, client_seed, nonce, draws) VALUES (?,?,?,?,?)').run(roundId, seedHash, p.client_seed, nonce, rng.draws);
      const ev = q('INSERT INTO round_event (round_id, seq, type, json) VALUES (?,?,?,?)');
      result.events.forEach((e, i) => ev.run(roundId, i, e.type, JSON.stringify(e)));
      return response;
    });
  }

  function round(player, id) {
    const r = getRound.get(id);
    if (!r || r.player_id !== player.id) throw new RgsError('not_found', 'no such round', 404);
    return { ...JSON.parse(r.response_json), events: getEvents.all(id).map(e => JSON.parse(e.json)) };
  }

  /** everything needed to recompute a round; the server seed only once it has been rotated out */
  function proof(player, id) {
    const r = getRound.get(id);
    if (!r || r.player_id !== player.id) throw new RgsError('not_found', 'no such round', 404);
    const rng = getRoundRng.get(id);
    const hist = q('SELECT server_seed FROM seed_history WHERE player_id = ? AND seed_hash = ?').get(player.id, rng.seed_hash);
    return {
      roundId: id, game: r.game, betMinor: r.bet_minor, payoutMinor: r.payout_minor, params: JSON.parse(r.params_json), outcome: JSON.parse(r.outcome_json),
      model: { game: r.game, variant: r.model_variant, version: r.model_version, sha256: r.model_sha256 },
      rules: { version: r.ruleset_version, sha256: r.ruleset_sha256, decision: JSON.parse(r.decision_json) },
      fair: { seedHash: rng.seed_hash, clientSeed: rng.client_seed, nonce: rng.nonce, draws: rng.draws, serverSeed: hist ? hist.server_seed : null },
      howToVerify: hist ? 'sha256(serverSeed) must equal seedHash; replay the engine with FairStream(serverSeed, clientSeed, nonce) and the named model'
                        : 'the server seed is still in use — rotate seeds (POST /api/seeds/rotate) to reveal it, then verify'
    };
  }

  function rotateSeed(player, clientSeed) {
    if (clientSeed !== undefined && !/^[\w-]{1,64}$/.test(clientSeed)) throw new RgsError('bad_seed', 'clientSeed: 1–64 letters, digits, _ or -');
    return tx(db, () => {
      const p = getPlayer.get(player.id);
      const first = q('SELECT MIN(nonce) AS n FROM round_rng WHERE seed_hash = ?').get(commit(p.server_seed)).n ?? p.nonce + 1;
      q('INSERT INTO seed_history (player_id, server_seed, seed_hash, client_seed, first_nonce, last_nonce, revealed_at) VALUES (?,?,?,?,?,?,?)')
        .run(p.id, p.server_seed, commit(p.server_seed), p.client_seed, first, p.nonce, now());
      const next = newServerSeed(), cs = clientSeed ?? newClientSeed();
      q('UPDATE player SET server_seed = ?, client_seed = ? WHERE id = ?').run(next, cs, p.id);
      return { revealed: { serverSeed: p.server_seed, seedHash: commit(p.server_seed), clientSeed: p.client_seed, lastNonce: p.nonce }, next: { seedHash: commit(next), clientSeed: cs } };
    });
  }

  function fairState(player) {
    const p = getPlayer.get(player.id);
    return { seedHash: commit(p.server_seed), clientSeed: p.client_seed, nonce: p.nonce };
  }

  /** ATM: tops the balance up to the tier floor, only when below it */
  function topup(player, idemKey) {
    return tx(db, () => {
      if (idemKey) { const t = findTxnByIdem.get(`${player.id}:${idemKey}:topup`); if (t) return { addedMinor: t.amount_minor, balanceMinor: t.balance_after, replayed: true }; }
      const p = getPlayer.get(player.id), a = getAccount.get(p.id), floor = tierOf(p).atm * 100;
      const add = floor - a.balance_minor;
      if (add <= 0) return { addedMinor: 0, balanceMinor: a.balance_minor };
      setAccount.run(floor, a.vault_ucent, p.id);
      addTxn.run(p.id, null, 'TOPUP', add, 0, floor, idemKey ? `${p.id}:${idemKey}:topup` : null, now());
      return { addedMinor: add, balanceMinor: floor };
    });
  }

  /** pays the whole cents in the rakeback vault into the balance */
  function claim(player) {
    return tx(db, () => {
      const a = getAccount.get(player.id), cents = Math.floor(a.vault_ucent / 1e6);
      if (cents <= 0) return { claimedMinor: 0, balanceMinor: a.balance_minor };
      const bal = a.balance_minor + cents;
      setAccount.run(bal, a.vault_ucent - cents * 1e6, player.id);
      addTxn.run(player.id, null, 'CLAIM', cents, -cents * 1e6, bal, null, now());
      return { claimedMinor: cents, balanceMinor: bal };
    });
  }

  /** books must balance: start + topups + wins + claims − bets = balance, for every player */
  function reconcile() {
    const rows = q(`SELECT a.player_id, a.balance_minor, a.vault_ucent,
        (SELECT COALESCE(SUM(amount_minor), 0) FROM wallet_txn t WHERE t.player_id = a.player_id) AS ledger_minor,
        (SELECT COALESCE(SUM(amount_ucent), 0) FROM wallet_txn t WHERE t.player_id = a.player_id) AS ledger_ucent
      FROM wallet_account a`).all();
    return rows.map(r => ({ player: r.player_id, balanceDiff: r.balance_minor - r.ledger_minor, vaultDiff: r.vault_ucent - r.ledger_ucent }));
  }

  return { createPlayer, auth, decide, wallet, playRound, round, proof, rotateSeed, fairState, topup, claim, reconcile };
}
