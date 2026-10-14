/* LUCKY STRIP — entry point.
 * Order matters: styles cascade in this order, and each game registers itself on window.Casino,
 * so core comes first and the boot step (first route) comes last. */

// ---- styles (same order as the original single file)
import './styles/base.css';
import './games/slot/slot.css';
import './styles/views.css';
import './lobby/lobby.css';
import './games/blackjack/blackjack.css';
import './styles/game-shell.css';
import './games/stopwatch/stopwatch.css';
import './games/hilo/hilo.css';
import './styles/games-mono.css';
import './games/claw/claw.css';
import './games/plinko/plinko.css';
import './games/crash/crash.css';

// ---- core
import './core/casino.js';          // window.Casino: bank, theme, sound, router
import './core/led.js';             // window.CasinoLED: 7-segment / drum counters
import './core/toast.js';           // Casino.toast
import './core/vip.js';             // Casino.wager / VIP tiers / rakeback / ATM floor / collection
import './core/remote.js';          // Casino.remote: RGS server mode (local demo mode when no server)
import './games/slot/slot.js';
import './lobby/lobby.js';
// ---- games
import './games/blackjack/blackjack.js';
import './core/game-kit.js';        // window.CasinoChipTray + shared game-shell bits
import './games/stopwatch/stopwatch.js';
import './games/hilo/hilo.js';
import './games/claw/claw.js';
import './games/plinko/plinko.js';
import './games/crash/crash.js';

// ---- boot: route once every game has finished its own DOMContentLoaded setup
const go = () => { Casino.route(); Casino.updateTitle(); };
if (document.readyState === 'complete') go();
else document.addEventListener('DOMContentLoaded', go);
