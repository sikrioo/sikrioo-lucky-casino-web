/* PLINKO engine. One fair coin per row decides the path; the slot index is the number of "right" bounces.
 * Model data: tables[rows][risk] = multipliers ×100 (integers), rtpPpm[rows][risk] = exact RTP in ppm. */
export const id = 'plinko';

export function validate(params, model) {
  const rows = Number(params?.rows), risk = params?.risk;
  if (!model.data.tables[rows]) throw new Error(`rows must be one of ${Object.keys(model.data.tables).join(', ')}`);
  if (!model.data.tables[rows][risk]) throw new Error(`risk must be one of ${Object.keys(model.data.tables[rows]).join(', ')}`);
  return { rows, risk };
}

export function betOf(params, betMinor) { return betMinor; }

export function rtpPpm(model, params) { return model.data.rtpPpm[params.rows][params.risk]; }

/** decides the whole round; pure function of (model, params, bet, rng) */
export function play({ model, params, betMinor, rng }) {
  const path = [];
  for (let i = 0; i < params.rows; i++) path.push(rng.int(2));
  const slot = path.reduce((a, b) => a + b, 0);
  const mult100 = model.data.tables[params.rows][params.risk][slot];
  const payoutMinor = Math.floor(betMinor * mult100 / 100);
  return { outcome: { path, slot, mult100 }, payoutMinor, events: [{ type: 'drop', path, slot }, { type: 'land', slot, mult100 }] };
}
