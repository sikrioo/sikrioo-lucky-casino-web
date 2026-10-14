/* SQLite storage (Node's built-in node:sqlite). ':memory:' by default; set RGS_DB=data/casino.db to keep data.
 * Money is always an integer number of cents (`*_minor`); the rakeback vault is kept in micro-cents (`*_ucent`)
 * so tiny shares of small bets are not rounded away. */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS player (
  id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, profile TEXT NOT NULL DEFAULT 'demo',
  server_seed TEXT NOT NULL, client_seed TEXT NOT NULL, nonce INTEGER NOT NULL DEFAULT 0,
  wagered_minor INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS seed_history (
  player_id TEXT NOT NULL, server_seed TEXT NOT NULL, seed_hash TEXT NOT NULL, client_seed TEXT NOT NULL,
  first_nonce INTEGER NOT NULL, last_nonce INTEGER NOT NULL, revealed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wallet_account (
  player_id TEXT PRIMARY KEY, balance_minor INTEGER NOT NULL CHECK (balance_minor >= 0),
  vault_ucent INTEGER NOT NULL DEFAULT 0 CHECK (vault_ucent >= 0), version INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS wallet_txn (
  id INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, round_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('BET','WIN','REFUND','RAKEBACK','CLAIM','TOPUP')),
  amount_minor INTEGER NOT NULL, amount_ucent INTEGER NOT NULL DEFAULT 0,
  balance_after INTEGER NOT NULL, idem_key TEXT UNIQUE, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS model (
  game TEXT NOT NULL, variant TEXT NOT NULL, version TEXT NOT NULL, sha256 TEXT NOT NULL,
  rtp_ppm INTEGER NOT NULL, max_mult100 INTEGER NOT NULL, loaded_at TEXT NOT NULL,
  UNIQUE (game, variant, version)
);
CREATE TABLE IF NOT EXISTS ruleset (version TEXT UNIQUE NOT NULL, sha256 TEXT NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS round (
  id TEXT PRIMARY KEY, player_id TEXT NOT NULL, game TEXT NOT NULL, idem_key TEXT NOT NULL,
  model_variant TEXT NOT NULL, model_version TEXT NOT NULL, model_sha256 TEXT NOT NULL,
  ruleset_version TEXT NOT NULL, ruleset_sha256 TEXT NOT NULL, decision_json TEXT NOT NULL,
  bet_minor INTEGER NOT NULL, payout_minor INTEGER NOT NULL, status TEXT NOT NULL,
  params_json TEXT NOT NULL, outcome_json TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE (player_id, idem_key)
);
CREATE TABLE IF NOT EXISTS round_rng (
  round_id TEXT PRIMARY KEY, seed_hash TEXT NOT NULL, client_seed TEXT NOT NULL, nonce INTEGER NOT NULL, draws INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS round_event (
  round_id TEXT NOT NULL, seq INTEGER NOT NULL, type TEXT NOT NULL, json TEXT NOT NULL, UNIQUE (round_id, seq)
);
`;

export function openDb(path = process.env.RGS_DB || ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

/** run fn inside one transaction; any throw rolls everything back */
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

export const now = () => new Date().toISOString();
