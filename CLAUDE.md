# LUCKY STRIP — notes for Claude

Browser casino (lobby + slot, blackjack, perfect stop, hi-lo dice, lucky claw, lucky plinko, lucky crash). Vanilla JS + CSS, bundled by Vite
into ONE self-contained `dist/index.html` (vite-plugin-singlefile) that is published as a claude.ai artifact.
The owner talks in Korean; reply in informal, direct Korean.

## Commands
- `npm run dev` — dev server; `npm run build` — single-file build in `dist/`

## Architecture rules
- `src/main.js` import order IS the runtime order (CSS cascade + script execution). Core first, boot last.
- Games are IIFE modules that talk only through globals: `window.Casino` (bank, theme, sound, router, toast),
  `window.CasinoLED`, `window.CasinoChipTray`. Money only via `Casino.bank` / `Casino.setBank()`.
- Router is registration-driven: `Casino.register(name, { title, enter, canLeave, leave })` makes `#name` routable.
  Each game's CSS shows its own view: `body.v-<name> #<viewId>{display:block}`.
- Every screen must work in both themes: '86 deluxe and '74 mono (`body.mono …`, `Casino.theme === '74'`).
- HTML partials are inlined with `<!-- @include path -->` in `index.html` (custom plugin in `vite.config.js`).
- Blackjack initialises on `DOMContentLoaded`; the boot route in `main.js` must stay after it.
- Every game calls `Casino.wager(amount, name)` when money is put at risk (not on refundable chip placement).
  That drives VIP XP, rakeback and the per-game stats in the lobby (core/vip.js). Never pay rakeback any other way.

## LUCKY CLAW
- Matter.js 0.20.0 (npm). 2D only; arms collide with prizes, not with the pit floor.
- Grip is an explicit Coulomb model: a two-point joint holds a prize while 2·μ·N ≥ weight, otherwise it slides.
  Fingers stop at contact (tendon target clamps to the contact angle); squeeze comes from the motor goal.
- Per-play claw strength (μ) is the payout control — `STR_STRONG`, `STR_MID`, `MU_MIN/MAX`, `GRIP_N`.
- Balance with the headless simulator in the browser console: `__claw.simulate(n, { pick: 'smart' })`.
  Results are noisy — use ≥3,000 plays per configuration and many short independent runs (fresh piles).
- `config.js` = static data, `art.js` = pure SVG builders; everything stateful is in `claw.js`.

## LUCKY PLINKO
- Outcome = one fair coin per row (`Casino.rnd(2)`), decided at drop; the flight is a scripted hop animation.
  Never hand the outcome to a physics engine — the binomial odds are what make the RTP exact.
- Tables live in `config.js` as half-rows (edge → centre), mirrored; keep every table's `rtpOf` ≈ 0.97.
- Bank is whole dollars: fractional winnings accumulate in `frac` and are paid when they reach $1.
- Shared chip styles apply to any `.gview`; new games get them for free.

## LUCKY CRASH
- Crash point drawn at bet time: X = floor(0.97/u, 0.01), u ∈ (0,1] → P(X ≥ x) = 0.97/x, so every cash-out target has RTP 97%.
- Auto cash-out pays exactly the target; manual pays the on-screen multiplier (floored to 0.01, always < X).
- Can't leave while a bet is riding; after cashing out the rocket keeps flying and leaving is allowed.

## RGS (server/, factory/, models/, rules/)
- Server decides outcomes; rules choose only a verified model + limits BEFORE randomness. Rule inputs are a closed set
  (profile, game, mode, tier, betMinor) — never add player results, balance history or anything about the round.
- Never edit models/ by hand: change factory/configs or factory/games, run `npm run factory -- build <game>`.
  A model the Factory did not verify, or whose bytes changed, stops the server from booting (by design).
- Engines in server/games/ are shared by the server, the Factory simulator and the audit replay; keep them pure
  functions of (model, params, bet, rng). Money is integer cents; rakeback vault is micro-cents.
- Every round: one SQLite transaction, Idempotency-Key required, proof replayable (`server/audit/verify.js`, `src/core/verify.js`).
- `npm test` must pass. Server mode only opens games listed in SUPPORTED (src/core/remote.js).

## Verifying changes
Run `npm test`. Build, then drive `dist/index.html` with Playwright (Chromium is at /opt/pw-browsers in Claude sessions):
no page errors, every view in both themes, a slot spin, a blackjack deal, a claw grab, and screenshots.
