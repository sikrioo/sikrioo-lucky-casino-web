/* Client Adapter — the one place the browser talks to the RGS.
 *
 * Local demo mode (default, and the only mode inside a claude.ai artifact): games draw their own outcomes, as before.
 * Server mode (?rgs=1, or the lobby switch when an RGS answers on /api): the server decides every outcome and owns the
 * money; the browser only animates what it was told and shows the server's balance. Games the RGS does not run yet
 * are closed in server mode, so no local outcome can touch server money. */
const C = window.Casino;
const SUPPORTED = ['lobby', 'plinko', 'hilo'];
const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''));

class RemoteError extends Error { constructor(code, message, status) { super(message); this.code = code; this.status = status; } }

const listeners = [];
const R = {
  on: false, available: false, games: {}, wallet: null, fair: null, lastNonce: 0, recent: [],
  supports: game => !R.on || SUPPORTED.includes(game),
  onChange(f) { listeners.push(f); },

  async api(method, path, body, idem) {
    const headers = { 'content-type': 'application/json' };
    const token = ls.get('casino-rgs-token');
    if (token) headers.authorization = `Bearer ${token}`;
    if (idem) headers['idempotency-key'] = idem;
    const res = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new RemoteError(json.error || 'http', json.message || `HTTP ${res.status}`, res.status);
    return json;
  },

  async probe() {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1200);
      const r = await fetch('/api/health', { signal: ctl.signal }); clearTimeout(t);
      R.available = r.ok && (await r.json()).ok === true;
    } catch (e) { R.available = false; }
    listeners.forEach(f => f());
    return R.available;
  },

  async enable() {
    if (!(await R.probe())) { C.toast && C.toast('RGS 서버에 연결할 수 없어요 · 로컬 모드로 계속'); return false; }
    try { if (ls.get('casino-rgs-token')) await R.api('GET', '/wallet'); else throw new RemoteError('unauthorized', '', 401); }
    catch (e) { if (e.status !== 401) throw e; ls.set('casino-rgs-token', (await R.api('POST', '/session', {})).token); }
    const list = await R.api('GET', '/games');
    R.games = Object.fromEntries(list.map(g => [g.game, g]));
    R.on = true; ls.set('casino-rgs', '1');
    if (!SUPPORTED.includes(C.view)) C.go('lobby');
    await R.refresh();
    listeners.forEach(f => f());
    return true;
  },
  disable() {
    R.on = false; ls.set('casino-rgs', null);
    C.reloadLocalBank();
    listeners.forEach(f => f());
  },

  async refresh() {
    R.wallet = await R.api('GET', '/wallet');
    R.fair = await R.api('GET', '/fair');
    R.showBalance(R.wallet.balanceMinor);
    return R.wallet;
  },
  /** what the screen shows; never persisted locally */
  showBalance(minor) { C.setBank(Math.floor(minor / 100)); },

  /** one round. The idempotency key is made once, so a retry after a dropped connection can never charge twice. */
  async play(game, betMinor, params) {
    const key = `${game}-${uuid()}`;
    let r;
    try { r = await R.api('POST', '/rounds', { game, betMinor, params }, key); }
    catch (e) { if (e instanceof RemoteError) throw e; r = await R.api('POST', '/rounds', { game, betMinor, params }, key); }   // network blip: same key
    R.recent.unshift({ id: r.roundId, game, seedHash: r.fair.seedHash }); if (R.recent.length > 50) R.recent.pop();
    if (r.fair.nonce > R.lastNonce) { R.lastNonce = r.fair.nonce; R.wallet = { ...(R.wallet || {}), balanceMinor: r.balanceMinor }; }
    R.fair = { ...(R.fair || {}), nonce: Math.max(R.fair?.nonce || 0, r.fair.nonce) };
    return r;
  },
  async claim() { const r = await R.api('POST', '/wallet/claim'); await R.refresh(); return Math.floor(r.claimedMinor / 100); },
  async topup() { const r = await R.api('POST', '/wallet/topup', {}, `topup-${uuid()}`); await R.refresh(); return Math.floor(r.addedMinor / 100); },
  async rotate(clientSeed) { const r = await R.api('POST', '/seeds/rotate', clientSeed ? { clientSeed } : {}); await R.refresh(); return r; },
  proof: id => R.api('GET', `/rounds/${id}/proof`),
  Error: RemoteError
};

C.remote = R;
const wanted = new URLSearchParams(location.search).get('rgs') === '1' || ls.get('casino-rgs') === '1';
R.probe().then(ok => { if (ok && wanted) R.enable().catch(e => C.toast && C.toast('RGS 연결 실패 · ' + e.message)); });
