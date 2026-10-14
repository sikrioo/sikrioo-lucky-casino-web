/* RGS admin console — plain JS, talks only to /admin/api on its own port. Every value from the server is escaped. */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
class Raw { constructor(s) { this.s = s; } }
const raw = s => new Raw(s);
const H = (str, ...vals) => raw(str.reduce((o, s, i) => o + s + (i < vals.length ? fmtVal(vals[i]) : ''), ''));
const fmtVal = v => v instanceof Raw ? v.s : Array.isArray(v) ? v.map(fmtVal).join('') : esc(v);
const put = (el, h) => { (typeof el === 'string' ? $(el) : el).innerHTML = h.s; };

const usd = minor => (minor < 0 ? '−$' : '$') + (Math.abs(minor) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (x, d = 2) => (x * 100).toFixed(d) + '%';
const short = s => String(s || '').slice(0, 12);
const when = iso => { if (!iso) return ''; const d = new Date(iso), z = n => String(n).padStart(2, '0'); return `${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`; };
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);

let token = sessionStorage.getItem('rgs-admin-token') || '';
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200); }

async function api(method, path, body, idem) {
  const res = await fetch('/admin/api' + path, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(idem && { 'idempotency-key': idem }) },
    body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) { logout(); throw new Error('토큰이 맞지 않아요'); }
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
  return json;
}

/* ---------- login / tabs ---------- */
function logout() { token = ''; sessionStorage.removeItem('rgs-admin-token'); $('#app').hidden = true; $('#login').hidden = false; }
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  token = $('#tokenInput').value.trim();
  try { await api('GET', '/overview'); sessionStorage.setItem('rgs-admin-token', token); start(); }
  catch (err) { $('#loginErr').textContent = err.message; $('#loginErr').hidden = false; }
});
$('#logout').addEventListener('click', logout);

const loaders = { overview: loadOverview, rules: loadRules, rounds: loadRounds, players: loadPlayers, audit: loadAudit };
function show(tab) {
  if (!loaders[tab]) tab = 'overview';
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('[data-view]').forEach(s => (s.hidden = s.dataset.view !== tab));
  if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
  loaders[tab]().catch(e => toast(e.message));
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(b.dataset.tab); });
function start() { $('#login').hidden = true; $('#app').hidden = false; show(location.hash.slice(1)); }

const table = (cols, rows, empty = '데이터가 없어요') => H`
  <thead><tr>${cols.map(c => H`<th class="${c.num ? 'num' : ''}">${c.h}</th>`)}</tr></thead>
  <tbody>${rows.length ? rows.map(r => H`<tr ${raw(r.__attr || '')}>${cols.map(c => H`<td class="${c.num ? 'num' : ''}">${c.f(r)}</td>`)}</tr>`)
                       : H`<tr><td colspan="${cols.length}" class="empty">${empty}</td></tr>`}</tbody>`;
const pill = (ok, yes, no, warn) => H`<span class="pill ${ok ? 'ok' : warn ? 'warn' : 'bad'}">${ok ? yes : no}</span>`;

/* ---------- overview ---------- */
let gamesKnown = [];
async function loadOverview() {
  const o = await api('GET', '/overview');
  $('#rsBadge').textContent = `ruleset ${o.ruleset.version} · ${short(o.ruleset.sha256)}`;
  gamesKnown = [...new Set(o.models.map(m => m.game))];
  const t = o.totals;
  put('#tiles', H`
    <div class="tile"><div class="l">플레이어</div><div class="v">${t.players.toLocaleString()}</div></div>
    <div class="tile"><div class="l">라운드</div><div class="v">${t.rounds.toLocaleString()}</div></div>
    <div class="tile"><div class="l">하우스 GGR (베팅 − 지급)</div><div class="v">${usd(t.ggrMinor)}</div></div>
    <div class="tile"><div class="l">플레이어 잔액 합계</div><div class="v">${usd(t.balanceMinor)}</div></div>
    <div class="tile"><div class="l">레이크백 금고 합계</div><div class="v">${usd(t.vaultMinor)}</div></div>
    <div class="tile"><div class="l">원장 대사</div><div class="v">${o.ledger.ok ? pill(true, '일치') : pill(false, '', `${o.ledger.mismatches.length}명 불일치`)}</div></div>`);
  put('#rtpTbl', table([
    { h: '게임', f: r => r.game }, { h: '모델', f: r => H`<span class="mono">${r.variant} · ${r.version}</span>` },
    { h: '라운드', num: 1, f: r => r.rounds.toLocaleString() }, { h: '베팅', num: 1, f: r => usd(r.betMinor) }, { h: '지급', num: 1, f: r => usd(r.paidMinor) },
    { h: '실측 RTP', num: 1, f: r => H`${pct(r.observed)} <span class="muted">±${pct(r.band)}</span>` }, { h: '이론 RTP', num: 1, f: r => pct(r.theory, 3) },
    { h: '상태', f: r => r.rounds < 1000 ? H`<span class="muted small">표본 부족</span>` : pill(!r.alert, '정상', '이론과 4σ 이상 차이') }
  ], o.games, '아직 라운드가 없어요'));
  put('#modelTbl', table([
    { h: '게임', f: m => m.game }, { h: '변형', f: m => H`<span class="mono">${m.variant}</span>` }, { h: '버전', f: m => H`<span class="mono">${m.version}</span>` },
    { h: 'RTP (최저 조합)', num: 1, f: m => pct(m.rtpPpm / 1e6, 4) }, { h: '최대 배수', num: 1, f: m => '×' + (m.maxMult100 / 100).toLocaleString() },
    { h: '사용 라운드', num: 1, f: m => m.rounds.toLocaleString() }, { h: 'SHA-256', f: m => H`<span class="mono" title="${m.sha256}">${short(m.sha256)}…</span>` }
  ], o.models));
}

/* ---------- rules ---------- */
let previewedFor = null;
async function loadRules() {
  const r = await api('GET', '/rules');
  $('#rsActive').textContent = `적용 중: ${r.active.version} · ${short(r.active.sha256)}`;
  if (!$('#rulesText').dataset.dirty) $('#rulesText').value = JSON.stringify(JSON.parse(r.active.text), null, 2);
  put('#rsHistory', table([
    { h: '#', f: h => h.id }, { h: '버전', f: h => H`<span class="mono">${h.version}</span>` }, { h: 'SHA-256', f: h => H`<span class="mono">${short(h.sha256)}</span>` },
    { h: '사유', f: h => h.reason }, { h: '주체', f: h => h.actor }, { h: '시각', f: h => when(h.at) },
    { h: '', f: h => h.sha256 === r.active.sha256 ? H`<span class="pill ok">적용 중</span>` : H`<button class="btn" data-load="${h.id}">불러오기</button>` }
  ], r.history));
  $('#rsHistory').onclick = e => {
    const b = e.target.closest('[data-load]'); if (!b) return;
    const h = r.history.find(x => String(x.id) === b.dataset.load);
    $('#rulesText').value = JSON.stringify(JSON.parse(h.json), null, 2); $('#rulesText').dataset.dirty = '1';
    $('#applyReason').value = `롤백: ${h.version}`; invalidate(); toast(`${h.version}을 불러왔어요 · 미리보기 후 적용하세요`);
  };
}
function invalidate() { previewedFor = null; $('#applyBtn').disabled = true; }
$('#rulesText').addEventListener('input', () => { $('#rulesText').dataset.dirty = '1'; invalidate(); });

const fieldLabel = { model: '모델', minBetMinor: '최소 베팅', maxBetMinor: '최대 베팅', maxWinMinor: '최대 당첨', rakebackShare: '레이크백 비율', enabled: '활성' };
const fieldVal = (k, v) => v === undefined ? '—' : /Minor$/.test(k) ? usd(v) : k === 'rakebackShare' ? pct(v, 0) : String(v);
$('#previewBtn').addEventListener('click', async () => {
  const text = $('#rulesText').value;
  try {
    const p = await api('POST', '/rules/preview', { text });
    if (p.error && !p.version) { put('#previewOut', H`<h3>${pill(false, '', '검증 실패')}</h3><pre>${p.error}</pre>`); return invalidate(); }
    // same profile + game + change → one line, with the tiers and bet points it covers
    const groups = new Map();
    for (const c of p.changes) {
      const keys = [...new Set([...Object.keys(c.before), ...Object.keys(c.after)])].filter(k => JSON.stringify(c.before[k]) !== JSON.stringify(c.after[k]));
      const sig = JSON.stringify([c.input.profile, c.input.game, keys.map(k => [k, c.before[k], c.after[k]])]);
      const g = groups.get(sig) || { profile: c.input.profile, game: c.input.game, keys, c, tiers: new Set(), bets: new Set() };
      g.tiers.add(c.input.tier); g.bets.add(c.input.betMinor); groups.set(sig, g);
    }
    const tierText = t => t.size === 6 ? '전체' : [...t].join(', ');
    const betText = b => { const v = [...b].sort((x, y) => x - y); return v.length > 2 ? `${usd(v[0])} ~ ${usd(v[v.length - 1])}` : v.map(usd).join(', '); };
    const rows = [...groups.values()];
    put('#previewOut', H`
      <h3>${p.ok ? pill(true, '검증 통과') : pill(false, '', '적용 불가')} <span class="mono">${p.version} · ${short(p.sha256)}</span></h3>
      ${p.error ? H`<p class="err">${p.error}</p>` : ''}
      <p>실제 라운드가 만들 수 있는 입력 조합 <b>${p.cases.toLocaleString()}</b>개 중 <b>${p.changed.toLocaleString()}</b>개의 결과가 바뀌어요.</p>
      ${rows.length ? H`<div class="tbl-wrap"><table>${table([
        { h: 'profile', f: g => g.profile }, { h: 'game', f: g => g.game }, { h: 'tier', f: g => tierText(g.tiers) }, { h: '베팅 구간', f: g => betText(g.bets) },
        { h: '변화', f: g => g.keys.map(k => H`<div class="chg">${fieldLabel[k] || k}: ${fieldVal(k, g.c.before[k])} → <b>${fieldVal(k, g.c.after[k])}</b></div>`) }
      ], rows)}</table></div>${p.changed > p.changes.length ? H`<p class="muted small">앞의 ${p.changes.length}개 조합만 묶어서 표시</p>` : ''}` : ''}`);
    previewedFor = p.ok ? text : null;
    $('#applyBtn').disabled = !p.ok;
  } catch (e) { toast(e.message); }
});
$('#applyBtn').addEventListener('click', async () => {
  const text = $('#rulesText').value, reason = $('#applyReason').value.trim();
  if (text !== previewedFor) return toast('먼저 미리보기를 다시 돌려주세요');
  if (reason.length < 3) return toast('적용 사유를 3자 이상 적어주세요');
  if (!confirm('이 룰셋을 적용할까요? 다음 판부터 반영돼요.')) return;
  try {
    const r = await api('POST', '/rules/apply', { text, reason });
    toast(`룰셋 ${r.version} 적용 · ${r.changed}개 조합 변경`);
    delete $('#rulesText').dataset.dirty; $('#applyReason').value = ''; invalidate();
    put('#previewOut', H`<span class="muted">적용했어요.</span>`);
    $('#rsBadge').textContent = `ruleset ${r.version} · ${short(r.sha256)}`;
    loadRules();
  } catch (e) { toast(e.message); }
});

/* ---------- rounds ---------- */
async function loadRounds(filter) {
  const sel = $('#roundFilter select');
  if (sel.options.length === 1) { if (!gamesKnown.length) await loadOverview(); gamesKnown.forEach(g => sel.add(new Option(g, g))); }
  const f = filter || Object.fromEntries(new FormData($('#roundFilter')));
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const rows = await api('GET', '/rounds' + (qs ? '?' + qs : ''));
  put('#roundTbl', table([
    { h: '시각', f: r => when(r.at) }, { h: '라운드', f: r => H`<span class="mono">${short(r.id)}…</span>` }, { h: '플레이어', f: r => H`<span class="mono">${r.player}</span>` },
    { h: '게임', f: r => r.game }, { h: '모델', f: r => H`<span class="mono">${r.variant}</span>` }, { h: '룰셋', f: r => H`<span class="mono">${r.ruleset}</span>` },
    { h: '베팅', num: 1, f: r => usd(r.betMinor) }, { h: '지급', num: 1, f: r => usd(r.payoutMinor) }
  ], rows.map(r => ({ ...r, __attr: `data-id="${esc(r.id)}"` })), '조건에 맞는 라운드가 없어요'));
}
$('#roundFilter').addEventListener('submit', e => { e.preventDefault(); loadRounds().catch(err => toast(err.message)); });
$('#roundTbl').addEventListener('click', async e => {
  const tr = e.target.closest('tr[data-id]'); if (!tr) return;
  document.querySelectorAll('#roundTbl tr.sel').forEach(x => x.classList.remove('sel')); tr.classList.add('sel');
  try {
    const d = await api('GET', '/rounds/' + tr.dataset.id), p = d.proof, v = d.verification, dec = p.rules.decision;
    put('#roundDetail', H`
      <h3 class="mono">${p.roundId}</h3>
      <dl class="kv">
        <dt>플레이어</dt><dd class="mono">${d.player}</dd><dt>게임</dt><dd>${p.game}</dd>
        <dt>베팅 / 지급</dt><dd>${usd(p.betMinor)} / ${usd(p.payoutMinor)}</dd>
        <dt>모델</dt><dd class="mono">${p.model.variant} · ${p.model.version} · ${short(p.model.sha256)}</dd>
        <dt>룰셋</dt><dd class="mono">${p.rules.version} · ${short(p.rules.sha256)}</dd>
      </dl>
      <h4>룰 결정 근거</h4>
      <dl class="kv">${Object.entries(dec.fieldFrom || {}).map(([k, id]) => H`<dt>${fieldLabel[k] || k}</dt><dd>${fieldVal(k, dec[k])} <span class="muted">← ${id}</span></dd>`)}
        ${Object.keys(dec.fieldFrom || {}).length ? '' : H`<dt>전부</dt><dd class="muted">defaults</dd>`}</dl>
      <h4>공정성 검증</h4>
      <p>${v.pending ? H`<span class="pill warn">공개 전</span>` : pill(v.ok, '재계산 일치', '불일치')}</p>
      ${v.problems.length ? H`<pre>${v.problems.join('\n')}</pre>` : ''}
      <dl class="kv"><dt>seed hash</dt><dd class="mono">${p.fair.seedHash}</dd><dt>client seed</dt><dd class="mono">${p.fair.clientSeed}</dd>
        <dt>nonce · draws</dt><dd class="mono">${p.fair.nonce} · ${p.fair.draws}</dd></dl>
      <h4>파라미터 · 결과</h4><pre>${JSON.stringify({ params: p.params, outcome: p.outcome }, null, 2)}</pre>`);
  } catch (err) { toast(err.message); }
});

/* ---------- players ---------- */
async function loadPlayers() {
  const f = Object.fromEntries(new FormData($('#playerFilter')));
  const rows = await api('GET', '/players' + (f.q ? '?q=' + encodeURIComponent(f.q) : ''));
  put('#playerTbl', table([
    { h: '플레이어', f: p => H`<span class="mono">${p.id}</span>` }, { h: 'profile', f: p => p.profile }, { h: '등급', f: p => p.tier },
    { h: '잔액', num: 1, f: p => usd(p.balanceMinor) }, { h: '누적 베팅', num: 1, f: p => usd(p.wageredMinor) }, { h: '라운드', num: 1, f: p => p.rounds.toLocaleString() },
    { h: '생성', f: p => when(p.createdAt) }
  ], rows.map(p => ({ ...p, __attr: `data-id="${esc(p.id)}"` })), '플레이어가 없어요'));
}
$('#playerFilter').addEventListener('submit', e => { e.preventDefault(); loadPlayers().catch(err => toast(err.message)); });
$('#playerTbl').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-id]'); if (!tr) return;
  document.querySelectorAll('#playerTbl tr.sel').forEach(x => x.classList.remove('sel')); tr.classList.add('sel');
  openPlayer(tr.dataset.id);
});
async function openPlayer(id) {
  try {
    const p = await api('GET', '/players/' + encodeURIComponent(id)), w = p.wallet;
    put('#playerDetail', H`
      <h3 class="mono">${p.id}</h3>
      <dl class="kv">
        <dt>profile</dt><dd>${p.profile} <span class="muted small">(룰 입력 · 콘솔에서 변경 불가)</span></dd><dt>등급</dt><dd>${w.tier}</dd>
        <dt>잔액</dt><dd><b>${usd(w.balanceMinor)}</b></dd><dt>레이크백 금고</dt><dd>${usd(w.vaultMinor)}</dd>
        <dt>누적 베팅</dt><dd>${usd(w.wageredMinor)}</dd><dt>원장 대사</dt><dd>${pill(p.ledgerOk, '일치', '불일치')}</dd>
      </dl>
      <p><button class="btn" id="seeRounds">이 플레이어 라운드 보기</button></p>
      <h4>잔액 정정 (ADJUST)</h4>
      <p class="muted small">잔액을 직접 고치지 않고 사유가 붙은 원장 거래를 하나 추가해요. 감사 로그에 남아요.</p>
      <form id="adjForm" class="adjust">
        <input name="amount" type="number" step="0.01" placeholder="± 금액 ($)" required>
        <input name="reason" placeholder="사유 (필수)" required minlength="3" maxlength="300">
        <button class="btn danger">정정</button>
      </form>
      <h4>원장 (최근 100건)</h4>
      <div class="tbl-wrap"><table>${table([
        { h: '#', f: t => t.id }, { h: '종류', f: t => t.kind }, { h: '금액', num: 1, f: t => t.amountUcent && !t.amountMinor ? H`<span class="muted">금고 +${(t.amountUcent / 1e6).toFixed(4)}¢</span>` : usd(t.amountMinor) },
        { h: '잔액', num: 1, f: t => usd(t.balanceAfter) }, { h: '시각', f: t => when(t.at) }
      ], w.txns)}</table></div>`);
    $('#seeRounds').onclick = () => { show('rounds'); $('#roundFilter [name=player]').value = p.id; loadRounds({ player: p.id }); };
    const idem = uuid();                               // one key per form instance: a double click cannot post twice
    $('#adjForm').onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target)), amountMinor = Math.round(Number(f.amount) * 100);
      if (!amountMinor) return toast('0이 아닌 금액을 넣어주세요');
      if (!confirm(`${p.id} 잔액을 ${usd(amountMinor)} 정정할까요?\n사유: ${f.reason}`)) return;
      try { const r = await api('POST', `/players/${encodeURIComponent(p.id)}/adjust`, { amountMinor, reason: f.reason }, 'adj-' + idem);
            toast(`정정 완료 · 잔액 ${usd(r.balanceMinor)}`); openPlayer(p.id); loadPlayers(); }
      catch (err) { toast(err.message); }
    };
  } catch (err) { toast(err.message); }
}

/* ---------- audit ---------- */
const actionLabel = { 'ruleset.activate': '룰셋 적용', 'wallet.adjust': '잔액 정정' };
function auditSummary(r) {
  const p = r.payload;
  if (r.action === 'ruleset.activate') return H`${p.from.version} → <b>${p.to.version}</b> · ${p.changed}개 조합 변경 · ${p.reason}`;
  if (r.action === 'wallet.adjust') return H`<span class="mono">${p.player}</span> ${usd(p.amountMinor)} (${usd(p.balanceBefore)} → ${usd(p.balanceAfter)}) · ${p.reason}`;
  return JSON.stringify(p);
}
async function loadAudit() {
  const a = await api('GET', '/audit');
  put('#chainState', a.intact ? H`<span class="pill ok">체인 무결 · ${a.count}건</span>` : H`<span class="pill bad">체인 깨짐 · #${a.brokenAt}부터</span>`);
  put('#auditTbl', table([
    { h: '#', f: r => r.id }, { h: '시각', f: r => when(r.at) }, { h: '주체', f: r => r.actor }, { h: '작업', f: r => actionLabel[r.action] || r.action },
    { h: '내용', f: auditSummary }, { h: 'hash', f: r => H`<span class="mono" title="${r.hash}">${short(r.hash)}</span>` }
  ], a.rows, '아직 기록이 없어요'));
}

if (token) api('GET', '/overview').then(start, () => logout()); else logout();
