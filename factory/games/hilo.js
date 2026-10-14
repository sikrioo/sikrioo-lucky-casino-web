/* Hi-Lo dice models. Two dice: P(sum < 7) = P(sum > 7) = 15/36, P(7) = 6/36.
 * 'traditional' keeps the classic 1:1 / 4:1 (RTP 83.33%); the numbered variants use 2-decimal returns. */
import * as engine from '../../server/games/hilo.js';
import { exactPpm } from '../lib.js';

export { engine };
const WAYS = { low: 15n, seven: 6n, high: 15n };

export function build(variant, version) {
  let pay100;
  if (variant.id === 'traditional') pay100 = { low: 200, seven: 500, high: 200 };
  else {
    const fl = x => Math.floor(Math.round(x * 1e6) / 1e6);          // floor without float noise (0.95 × 240 = 227.999…)
    const side = fl(variant.target * 36 / 15 * 100), seven = fl(variant.target * 6 * 100);
    pay100 = { low: side, seven, high: side };
  }
  const rtpPpm = {};
  for (const s of engine.SPOTS) rtpPpm[s] = exactPpm([{ num: WAYS[s], den: 36n, value100: pay100[s] }]).ppm;
  return { game: 'hilo', variant: variant.id, version, rtpPpm: Math.min(...Object.values(rtpPpm)),
           maxMult100: Math.max(...Object.values(pay100)), data: { pay100, rtpPpm, ways: { low: 15, seven: 6, high: 15 } } };
}

export function combos(model) {
  return engine.SPOTS.map(s => {
    const p = Number(WAYS[s]) / 36, v = model.data.pay100[s] / 100, mean = p * v;
    return { label: `${s} only`, params: { bets: { low: 0, seven: 0, high: 0, [s]: 10000 } }, rtpPpm: model.data.rtpPpm[s],
             sd: Math.sqrt(p * (v - mean) ** 2 + (1 - p) * mean ** 2), maxMult100: model.data.pay100[s], symmetric: true, size: true };
  });
}
