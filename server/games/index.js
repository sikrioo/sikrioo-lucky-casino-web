import * as plinko from './plinko.js';
import * as hilo from './hilo.js';

/** every engine: validate(params, model) · betOf(params, betMinor) · rtpPpm(model, params) · play({ model, params, betMinor, rng }) */
export const ENGINES = Object.freeze({ plinko, hilo });
