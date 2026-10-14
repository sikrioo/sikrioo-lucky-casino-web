/* HI-LO DICE engine (under / seven / over with two dice). One round can carry bets on several spots.
 * Model data: pay100 = { low, seven, high } total return per unit ×100; prob = { low: 15/36, seven: 6/36, high: 15/36 }. */
export const id = 'hilo';
export const SPOTS = ['low', 'seven', 'high'];

export function validate(params, model) {
  const bets = params?.bets || {};
  const out = {};
  for (const s of SPOTS) {
    const v = bets[s] ?? 0;
    if (!Number.isInteger(v) || v < 0) throw new Error(`bets.${s} must be a non-negative integer (cents)`);
    out[s] = v;
  }
  for (const k of Object.keys(bets)) if (!SPOTS.includes(k)) throw new Error(`unknown spot '${k}'`);
  if (out.low + out.seven + out.high <= 0) throw new Error('place at least one bet');
  return { bets: out };
}

/** the round's stake is the sum of the spot bets; the client's betMinor must match it */
export function betOf(params) { return params.bets.low + params.bets.seven + params.bets.high; }

/** bet-weighted exact RTP of this combination of spots */
export function rtpPpm(model, params) {
  const total = betOf(params);
  return Math.floor(SPOTS.reduce((s, k) => s + params.bets[k] * model.data.rtpPpm[k], 0) / total);
}

export const spotOf = sum => sum < 7 ? 'low' : sum > 7 ? 'high' : 'seven';

export function play({ model, params, rng }) {
  const a = 1 + rng.int(6), b = 1 + rng.int(6), sum = a + b, win = spotOf(sum);
  const stake = params.bets[win];
  const payoutMinor = Math.floor(stake * model.data.pay100[win] / 100);
  return { outcome: { dice: [a, b], sum, win, pay100: model.data.pay100[win] }, payoutMinor, events: [{ type: 'roll', dice: [a, b] }, { type: 'settle', win }] };
}
