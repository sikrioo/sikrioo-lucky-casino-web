/* Rule Engine — business rules choose WHICH verified model and limits a round uses, before any randomness.
 *
 * Inputs are a closed set. Nothing about the round's randomness or the player's recent wins/losses can be passed in:
 * an unknown input key, or a rule that tests one, is refused. Evaluation is a pure function of (ruleset, input).
 * For every output field the highest-priority matching rule that sets it wins; ties are broken by rule order. */
import { createHash } from 'node:crypto';

export const INPUT_KEYS = Object.freeze(['profile', 'game', 'mode', 'tier', 'betMinor']);
export const OUTPUT_KEYS = Object.freeze(['model', 'minBetMinor', 'maxBetMinor', 'maxWinMinor', 'rakebackShare', 'enabled']);

export class RuleError extends Error {}

function checkCondition(id, key, cond) {
  if (!INPUT_KEYS.includes(key)) throw new RuleError(`rule ${id}: '${key}' is not an allowed rule input (${INPUT_KEYS.join(', ')})`);
  if (key === 'betMinor') {
    if (typeof cond !== 'object' || Array.isArray(cond) || !Object.keys(cond).every(k => ['gte', 'lte'].includes(k)))
      throw new RuleError(`rule ${id}: betMinor takes { gte, lte }`);
  } else if (!(typeof cond === 'string' || (Array.isArray(cond) && cond.every(c => typeof c === 'string'))))
    throw new RuleError(`rule ${id}: '${key}' takes a string or a list of strings`);
}

export function compileRuleset(json, { registry } = {}) {
  const text = typeof json === 'string' ? json : JSON.stringify(json);
  const rs = JSON.parse(text);
  if (!rs.version || !Array.isArray(rs.rules)) throw new RuleError('ruleset needs a version and a rules list');
  const ids = new Set();
  rs.rules.forEach((r, i) => {
    if (!r.id || ids.has(r.id)) throw new RuleError(`rule #${i} needs a unique id`);
    ids.add(r.id);
    for (const [k, c] of Object.entries(r.when || {})) checkCondition(r.id, k, c);
    for (const k of Object.keys(r.then || {})) if (!OUTPUT_KEYS.includes(k)) throw new RuleError(`rule ${r.id}: unknown output '${k}'`);
    const share = r.then?.rakebackShare;
    if (share !== undefined && !(share >= 0 && share <= 1)) throw new RuleError(`rule ${r.id}: rakebackShare must be within [0, 1]`);
    if (registry && r.then?.model) {
      const game = r.when?.game;
      const games = typeof game === 'string' ? [game] : game || [];
      if (!games.length) throw new RuleError(`rule ${r.id}: choosing a model needs a 'game' condition`);
      for (const g of games) if (!registry.get(g, r.then.model)) throw new RuleError(`rule ${r.id}: no verified model ${g}/${r.then.model}`);
    }
  });
  if (registry && rs.defaults?.model) {
    const games = [...new Set(registry.all().map(m => m.game))];
    for (const g of games) if (!registry.get(g, rs.defaults.model)) throw new RuleError(`defaults.model '${rs.defaults.model}' has no verified ${g} model`);
  }
  const order = rs.rules.map((r, i) => ({ r, i })).sort((a, b) => (b.r.priority || 0) - (a.r.priority || 0) || a.i - b.i).map(x => x.r);
  const sha256 = createHash('sha256').update(text).digest('hex');

  const matches = (when = {}, input) => Object.entries(when).every(([k, c]) => {
    const v = input[k];
    if (k === 'betMinor') return (c.gte === undefined || v >= c.gte) && (c.lte === undefined || v <= c.lte);
    return Array.isArray(c) ? c.includes(v) : c === v;
  });

  return {
    version: rs.version, sha256, text,
    evaluate(input) {
      for (const k of Object.keys(input)) if (!INPUT_KEYS.includes(k)) throw new RuleError(`'${k}' is not an allowed rule input`);
      const out = { ...(rs.defaults || {}) }, from = {};
      for (const r of order) {
        if (!matches(r.when, input)) continue;
        for (const [k, v] of Object.entries(r.then || {})) if (!(k in from)) { out[k] = v; from[k] = r.id; }
      }
      return Object.freeze({ ...out, ruleIds: [...new Set(Object.values(from))], fieldFrom: from, ruleset: { version: rs.version, sha256 } });
    }
  };
}
