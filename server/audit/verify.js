/* Independent re-computation of a settled round from its proof. Needs nothing from the server's database:
 * the proof (from GET /api/rounds/:id/proof after a seed rotation) and the model file it names. */
import { FairStream, commit } from '../rng/fair.js';
import { ENGINES } from '../games/index.js';

export function verifyRound(proof, model) {
  const problems = [];
  const f = proof.fair;
  if (!f.serverSeed) return { ok: false, problems: ['server seed not revealed yet — rotate seeds first'] };
  if (commit(f.serverSeed) !== f.seedHash) problems.push('sha256(serverSeed) does not match the committed seedHash');
  if (model.sha256 && model.sha256 !== proof.model.sha256) problems.push('model file hash differs from the one the round used');
  if (model.game !== proof.model.game || model.variant !== proof.model.variant || model.version !== proof.model.version) problems.push('wrong model file for this round');
  const engine = ENGINES[proof.game];
  if (!engine) return { ok: false, problems: [...problems, `no engine for ${proof.game}`] };
  const rng = new FairStream(f.serverSeed, f.clientSeed, f.nonce);
  const params = engine.validate(proof.params, model);
  const r = engine.play({ model, params, betMinor: proof.betMinor, rng });
  if (JSON.stringify(r.outcome) !== JSON.stringify(proof.outcome)) problems.push('recomputed outcome differs');
  const cap = proof.rules?.decision?.maxWinMinor;
  const expected = cap ? Math.min(cap, r.payoutMinor) : r.payoutMinor;
  if (expected !== proof.payoutMinor) problems.push(`recomputed payout ${expected} ≠ recorded ${proof.payoutMinor}`);
  if (rng.draws !== f.draws) problems.push(`random words used ${rng.draws} ≠ recorded ${f.draws}`);
  return { ok: problems.length === 0, problems, recomputed: { outcome: r.outcome, payoutMinor: expected } };
}
