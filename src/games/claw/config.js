/* LUCKY CLAW — static data: cabinet geometry, prize tiers & shapes, claw sizes.
 * Tuning that the simulator changes at runtime (grip force, strength odds…) lives in claw.js. */

// world (logical units)
export const W = 360, H = 430, RAIL = 22, HOME_Y = RAIL + 30, FLOOR = 412;
export const CHUTE_R = 84, WALL_R = 90, WALL_TOP = 268, PIT_L = 94, PIT_R = W - 6;

export const SIZES = {
  S:  { w: 36, h: 32, taps: 3, name: 'SMALL',   feel: '가벼움',      table: [[3, 45], [4, 30], [6, 18], [10, 7]] },
  M:  { w: 48, h: 40, taps: 4, name: 'MEDIUM',  feel: '보통',        table: [[3, 40], [6, 30], [12, 20], [22, 10]] },
  L:  { w: 60, h: 50, taps: 5, name: 'LARGE',   feel: '무거움',      table: [[8, 40], [15, 30], [30, 20], [70, 10]] },
  XL: { w: 70, h: 58, taps: 6, name: 'JACKPOT', feel: '밀어 떨어뜨리기', table: [[30, 45], [60, 30], [150, 18], [400, 7]] }
};
export const KEYS = ['S', 'M', 'L', 'XL'];
export const RAR = ['COMMON', 'RARE', 'EPIC', 'LEGEND'];
export const RC = ['#c9d1db', '#5ef2e6', '#ff6bd5', '#ffd400'];
export const BOXC = { S: ['#a6fff6', '#1fb6c9', '#ffffff'], M: ['#ffb3ea', '#d6248f', '#ffffff'], L: ['#cdb3ff', '#6a3fae', '#ffd400'], XL: ['#fff2a0', '#d99a00', '#c8102e'] };
export const CHIPS = [5, 25, 100, 500, 1000, 5000, 25000];

export const CLAWS = {
  S: { scale: .8,  open: 27, name: 'SMALL',  bonus: 1, tag: '작은 상품용', fit: ['S', 'M'] },
  M: { scale: .9,  open: 34, name: 'MEDIUM', bonus: 1, tag: 'MEDIUM까지', fit: ['S', 'M'] },
  L: { scale: 1,   open: 42, name: 'LARGE',  bonus: 1, tag: '전부 도전',  fit: ['S', 'M', 'L', 'XL'] }
};
export const BASE_ARM = [[0, 0], [14, 13], [13, 33], [8, 37]];   // upper link, near-vertical grip pad, small hook — right arm, shoulder-local, closed pose

// a prize = a value tier (colour, payout) × a shape (how it behaves under the claw)
export const KINDS = [
  { id: 'boxS',  shape: 'box',  k: 'S',  w: 36, h: 32, mix: .20 },
  { id: 'ballS', shape: 'ball', k: 'S',  r: 17,        mix: .12 },
  { id: 'boxM',  shape: 'box',  k: 'M',  w: 48, h: 40, mix: .12 },
  { id: 'ballM', shape: 'ball', k: 'M',  r: 22,        mix: .07 },
  { id: 'canM',  shape: 'can',  k: 'M',  w: 30, h: 50, mix: .08 },
  { id: 'hexM',  shape: 'hex',  k: 'M',  r: 24,        mix: .07 },
  { id: 'boxL',  shape: 'box',  k: 'L',  w: 60, h: 50, mix: .09 },
  { id: 'canL',  shape: 'can',  k: 'L',  w: 38, h: 64, mix: .06 },
  { id: 'hexL',  shape: 'hex',  k: 'L',  r: 31,        mix: .07 },
  { id: 'boxXL', shape: 'box',  k: 'XL', w: 70, h: 58, mix: .10 }
];
KINDS.forEach(d => { if (d.r) { d.w = d.h = d.r * 2; } });
export const KIND = Object.fromEntries(KINDS.map(d => [d.id, d]));
export const SHAPE_NAME = { box: 'BOX', ball: 'CAPSULE', can: 'CAN', hex: 'GEM' };

export const DENS = { S: .0012, M: .0014, L: .0013, XL: .0021 };
