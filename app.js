'use strict';

/* ============================================================
   Soccer Stats — live game tracker (vanilla PWA)
   ============================================================ */

const HALF_SECONDS = 25 * 60;
const HALVES = 2;
const STORE_KEY = 'soccerStats.v1';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ---------------- State ---------------- */

let state = loadState();
let ui = { view: 'home', gameId: null };
let pendingPick = null; // callback for the active roster picker

function defaultState() {
  return {
    version: 1, roster: [], games: [], activeGameId: null,
    opponents: [], tournaments: [], updatedAt: 0
  };
}

function registerInto(list, name) {
  const v = (name || '').trim();
  if (v && !list.some((x) => x.toLowerCase() === v.toLowerCase())) list.push(v);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    s.roster = s.roster || [];
    s.games = s.games || [];
    s.opponents = s.opponents || [];
    s.tournaments = s.tournaments || [];
    s.updatedAt = s.updatedAt || 0;
    for (const g of s.games) {
      registerInto(s.opponents, g.opponent);
      registerInto(s.tournaments, g.tournament);
    }
    return s;
  } catch (e) {
    return defaultState();
  }
}

function save() {
  state.updatedAt = Date.now();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    /* storage full / unavailable — keep running in-memory */
  }
  scheduleCloudPush();
}

/* ---------------- Cloud sync (Cloudflare) ---------------- */

const SYNC_CODE_KEY = 'soccerStats.syncCode';
const SYNC_API = '/api/sync';
let sync = { status: 'off', lastSynced: 0, error: null };
let pushTimer = null;

function syncCode() {
  return localStorage.getItem(SYNC_CODE_KEY) || '';
}

function setSyncCode(code) {
  if (code) localStorage.setItem(SYNC_CODE_KEY, code);
  else localStorage.removeItem(SYNC_CODE_KEY);
}

function generateSyncCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const rnd = new Uint8Array(16);
  crypto.getRandomValues(rnd);
  let out = '';
  for (let i = 0; i < 16; i++) {
    out += chars[rnd[i] % chars.length];
    if (i % 4 === 3 && i < 15) out += '-';
  }
  return out;
}

function setSyncState(status, extra) {
  sync = Object.assign({ status: status, lastSynced: sync.lastSynced, error: null }, extra || {});
  if (ui.view === 'sync') render();
}

function scheduleCloudPush() {
  if (!syncCode()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(cloudPush, 1200);
}

async function cloudPush() {
  const code = syncCode();
  if (!code) return;
  setSyncState('syncing');
  try {
    const res = await fetch(SYNC_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sync-Code': code },
      body: JSON.stringify(state)
    });
    if (!res.ok) throw new Error('server returned ' + res.status);
    setSyncState('ok', { lastSynced: Date.now() });
  } catch (e) {
    setSyncState('error', { error: e.message || String(e) });
  }
}

async function cloudPull() {
  const code = syncCode();
  if (!code) return;
  setSyncState('syncing');
  try {
    const res = await fetch(SYNC_API, { headers: { 'X-Sync-Code': code } });
    if (!res.ok) throw new Error('server returned ' + res.status);
    const remote = await res.json();
    const remoteAt = (remote && remote.updatedAt) || 0;
    const localAt = state.updatedAt || 0;
    if (remote && typeof remote === 'object' && remoteAt > localAt) {
      adoptState(remote);
      setSyncState('ok', { lastSynced: Date.now() });
      render();
    } else if (localAt > remoteAt) {
      await cloudPush();
    } else {
      setSyncState('ok', { lastSynced: Date.now() });
    }
  } catch (e) {
    setSyncState('error', { error: e.message || String(e) });
  }
}

function adoptState(remote) {
  state = remote;
  state.roster = state.roster || [];
  state.games = state.games || [];
  state.opponents = state.opponents || [];
  state.tournaments = state.tournaments || [];
  state.updatedAt = state.updatedAt || 0;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) { /* ignore */ }
  if (ui.gameId && !getGame(ui.gameId)) { ui.view = 'home'; ui.gameId = null; }
}

function connectSync(code) {
  setSyncCode((code || '').trim().toLowerCase());
  setSyncState('syncing');
  cloudPull();
}

function disconnectSync() {
  setSyncCode('');
  setSyncState('off');
}

/* ---------------- Helpers ---------------- */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function fmtClock(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function getGame(id) {
  return state.games.find((g) => g.id === id) || null;
}

function activeGame() {
  if (!state.activeGameId) return null;
  const g = getGame(state.activeGameId);
  return g && g.status === 'in_progress' ? g : null;
}

function uniqueOpponents() {
  return state.opponents.slice().sort((a, b) => a.localeCompare(b));
}

function uniqueTournaments() {
  return state.tournaments.slice().sort((a, b) => a.localeCompare(b));
}

function playerById(id) {
  return state.roster.find((p) => p.id === id) || null;
}

function activeRoster() {
  return state.roster.filter((p) => !p.archived);
}

function playerBadge(p) {
  if (!p) return '?';
  if (p.number !== '' && p.number != null) return esc(p.number);
  const parts = String(p.name || '?').trim().split(/\s+/);
  return esc((parts[0][0] || '?') + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function playerLabel(id) {
  const p = playerById(id);
  if (!p) return 'Unknown player';
  const num = (p.number !== '' && p.number != null) ? `#${p.number} ` : '';
  return `${num}${p.name}`;
}

/* ---------------- Clock ---------------- */

function liveElapsed(game) {
  const c = game.clock;
  let e = c.elapsed;
  if (c.running && c.startedAt) e += (Date.now() - c.startedAt) / 1000;
  return Math.floor(e);
}

function startClock(game) {
  if (game.clock.running) return;
  game.clock.running = true;
  game.clock.startedAt = Date.now();
  save();
}

function pauseClock(game) {
  if (!game.clock.running) return;
  game.clock.elapsed = liveElapsed(game);
  game.clock.running = false;
  game.clock.startedAt = null;
  save();
}

/* ---------------- Scoring & stats ---------------- */

function usScore(game) {
  return game.events.filter((e) => e.type === 'goal').length;
}
function themScore(game) {
  return game.events.filter((e) => e.type === 'opponent_goal').length;
}
function countType(game, type) {
  return game.events.filter((e) => e.type === type).length;
}

function resultOf(game) {
  const u = usScore(game), t = themScore(game);
  if (u > t) return 'W';
  if (u < t) return 'L';
  return 'D';
}

function gameStats(game, playerId) {
  let goals = 0, assists = 0, shots = 0, saves = 0;
  for (const e of game.events) {
    if (e.type === 'goal' && e.playerId === playerId) goals++;
    if (e.type === 'goal' && e.assistId === playerId) assists++;
    if (e.type === 'shot' && e.playerId === playerId) shots++;
    if (e.type === 'save' && e.playerId === playerId) saves++;
  }
  return { goals, assists, shots, saves };
}

function seasonStats(playerId) {
  const tot = { goals: 0, assists: 0, shots: 0, saves: 0, games: 0 };
  for (const g of state.games) {
    const s = gameStats(g, playerId);
    if (s.goals || s.assists || s.shots || s.saves) tot.games++;
    tot.goals += s.goals;
    tot.assists += s.assists;
    tot.shots += s.shots;
    tot.saves += s.saves;
  }
  return tot;
}

function seasonRecord() {
  let w = 0, l = 0, d = 0, gf = 0, ga = 0;
  for (const g of state.games) {
    if (g.status !== 'finished') continue;
    const u = usScore(g), t = themScore(g);
    gf += u; ga += t;
    if (u > t) w++;
    else if (u < t) l++;
    else d++;
  }
  return { w, l, d, gf, ga };
}

/* ---------------- Mutations ---------------- */

function createGame(opponent, date, tournament) {
  const g = {
    id: uid(),
    opponent: opponent,
    date: date,
    tournament: tournament || null,
    createdAt: Date.now(),
    status: 'in_progress',
    half: 1,
    clock: { running: false, elapsed: 0, startedAt: null },
    events: [],
    finishedAt: null
  };
  state.games.push(g);
  state.activeGameId = g.id;
  registerInto(state.opponents, opponent);
  registerInto(state.tournaments, tournament);
  save();
  return g;
}

function updateGame(g, opponent, date, tournament) {
  g.opponent = opponent;
  g.date = date;
  g.tournament = tournament || null;
  registerInto(state.opponents, opponent);
  registerInto(state.tournaments, tournament);
  save();
}

function deleteGame(id) {
  state.games = state.games.filter((g) => g.id !== id);
  if (state.activeGameId === id) state.activeGameId = null;
  save();
}

function addEvent(game, type, extra) {
  const e = Object.assign({
    id: uid(),
    type: type,
    half: game.half,
    clock: liveElapsed(game),
    playerId: null,
    assistId: null,
    createdAt: Date.now()
  }, extra || {});
  game.events.push(e);
  save();
}

function deleteEvent(game, eventId) {
  game.events = game.events.filter((e) => e.id !== eventId);
  save();
}

function endHalf(game) {
  pauseClock(game);
  game.half = Math.min(HALVES, game.half + 1);
  game.clock = { running: false, elapsed: 0, startedAt: null };
  save();
}

function endGame(game) {
  pauseClock(game);
  game.status = 'finished';
  game.finishedAt = Date.now();
  if (state.activeGameId === game.id) state.activeGameId = null;
  save();
}

function addPlayer(name, number) {
  state.roster.push({ id: uid(), name: name, number: number });
  save();
}

function removePlayer(id) {
  const used = state.games.some((g) =>
    g.events.some((e) => e.playerId === id || e.assistId === id)
  );
  if (used) {
    const p = playerById(id);
    if (p) p.archived = true;
  } else {
    state.roster = state.roster.filter((p) => p.id !== id);
  }
  save();
}

/* ---------------- Navigation ---------------- */

function go(view, gameId) {
  ui.view = view;
  ui.gameId = gameId || null;
  closeModal();
  window.scrollTo(0, 0);
  render();
}

/* ---------------- Render ---------------- */

const app = document.getElementById('app');

function render() {
  let html = '';
  switch (ui.view) {
    case 'home': html = viewHome(); break;
    case 'history': html = viewHistory(); break;
    case 'roster': html = viewRoster(); break;
    case 'newgame': html = viewNewGame(); break;
    case 'editgame': html = viewEditGame(); break;
    case 'game': html = viewGame(); break;
    case 'summary': html = viewSummary(); break;
    case 'sync': html = viewSync(); break;
    default: html = viewHome();
  }
  app.innerHTML = html;
}

function tabbar(active) {
  const tab = (id, ic, label) =>
    `<button class="tab ${active === id ? 'active' : ''}" data-act="nav:${id}">
       <span class="ic">${ic}</span>${label}</button>`;
  return `<nav class="tabbar">
    ${tab('home', '&#9917;', 'Home')}
    ${tab('history', '&#128203;', 'Games')}
    ${tab('roster', '&#128101;', 'Roster')}
  </nav>`;
}

/* ----- Home ----- */

function viewHome() {
  const ag = activeGame();
  const rec = seasonRecord();
  const finished = state.games
    .filter((g) => g.status === 'finished')
    .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));

  let liveCard = '';
  if (ag) {
    liveCard = `<div class="card">
      <div class="live-head">
        <span class="live-pill"><span class="live-dot"></span>Live</span>
        ${ag.tournament ? `<span class="tourney-tag">&#127942; ${esc(ag.tournament)}</span>` : ''}
      </div>
      <div class="hero-score">
        <div class="teams">
          <div class="team-name">Our Team</div>
          <div class="team-name">${esc(ag.opponent)}</div>
        </div>
        <div class="nums">${usScore(ag)}<span class="dash">:</span>${themScore(ag)}</div>
      </div>
      <button class="btn btn-primary btn-block" data-act="resume">Resume Game &rarr;</button>
    </div>`;
  } else {
    liveCard = `<div class="card">
      <button class="btn btn-primary" data-act="go:newgame">+ Start New Game</button>
      <p class="empty" style="padding:10px 0 0">Track shots, goals, assists &amp; saves live.</p>
    </div>`;
  }

  let recordCard = '';
  if (finished.length) {
    recordCard = `<div class="card">
      <div class="card-title">Season Record</div>
      <div class="record-row">
        <div class="record-cell"><div class="big">${rec.w}</div><div class="lbl">Won</div></div>
        <div class="record-cell"><div class="big">${rec.d}</div><div class="lbl">Drawn</div></div>
        <div class="record-cell"><div class="big">${rec.l}</div><div class="lbl">Lost</div></div>
        <div class="record-cell"><div class="big">${rec.gf}-${rec.ga}</div><div class="lbl">Goals</div></div>
      </div>
    </div>`;
  }

  const recent = finished.slice(0, 5);
  let recentCard;
  if (recent.length) {
    recentCard = `<div class="card">${recent.map(gameRow).join('')}</div>`;
  } else {
    recentCard = `<div class="card"><p class="empty">No games played yet.</p></div>`;
  }

  return `
    <header class="topbar brand">
      <img src="icon.svg" alt="" />
      <h1>Soccer Stats</h1>
      <span class="spacer"></span>
      <button class="icon-btn ${sync.status === 'error' ? 'icon-btn-danger' : ''}"
        data-act="nav:sync" aria-label="Cloud sync">&#9729;&#65039;</button>
    </header>
    ${liveCard}
    ${recordCard}
    <div class="section-head">
      <h2>Recent Games</h2>
      ${finished.length > recent.length ? '<button class="link" data-act="nav:history">See all</button>' : ''}
    </div>
    ${recentCard}
    ${tabbar('home')}
  `;
}

function gameRow(g) {
  const u = usScore(g), t = themScore(g);
  let chip, chipText;
  if (g.status === 'in_progress') {
    chip = 'chip-live'; chipText = '&#9679;';
  } else {
    const r = resultOf(g);
    chip = 'chip-' + r; chipText = r;
  }
  return `<button class="game-row" data-act="open-game" data-id="${g.id}">
    <span class="result-chip ${chip}">${chipText}</span>
    <span class="info">
      <span class="opp">vs ${esc(g.opponent)}</span>
      <span class="sub">${fmtDate(g.date)}${g.tournament ? ' &middot; ' + esc(g.tournament) : ''}${g.status === 'in_progress' ? ' &middot; in progress' : ''}</span>
    </span>
    <span class="score">${u}&ndash;${t}</span>
  </button>`;
}

/* ----- History ----- */

function viewHistory() {
  const rec = seasonRecord();
  const games = state.games.slice().sort((a, b) => {
    if (a.status !== b.status) return a.status === 'in_progress' ? -1 : 1;
    return (b.finishedAt || b.createdAt) - (a.finishedAt || a.createdAt);
  });

  const list = games.length
    ? `<div class="card">${games.map(gameRow).join('')}</div>`
    : `<div class="card"><p class="empty">No games yet. Start one from the Home tab.</p></div>`;

  const recordCard = state.games.some((g) => g.status === 'finished')
    ? `<div class="card">
        <div class="card-title">Season Record</div>
        <div class="record-row">
          <div class="record-cell"><div class="big">${rec.w}</div><div class="lbl">Won</div></div>
          <div class="record-cell"><div class="big">${rec.d}</div><div class="lbl">Drawn</div></div>
          <div class="record-cell"><div class="big">${rec.l}</div><div class="lbl">Lost</div></div>
          <div class="record-cell"><div class="big">${rec.gf}-${rec.ga}</div><div class="lbl">Goals</div></div>
        </div>
      </div>`
    : '';

  return `
    <header class="topbar"><h1>Games</h1></header>
    ${recordCard}
    <div class="section-head"><h2>All Games</h2></div>
    ${list}
    ${tabbar('history')}
  `;
}

/* ----- Roster ----- */

function viewRoster() {
  const players = activeRoster().slice().sort((a, b) => {
    const an = parseInt(a.number, 10), bn = parseInt(b.number, 10);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    if (!isNaN(an)) return -1;
    if (!isNaN(bn)) return 1;
    return a.name.localeCompare(b.name);
  });

  const rows = players.map((p) => {
    const s = seasonStats(p.id);
    return `<div class="player-row">
      <span class="jersey">${playerBadge(p)}</span>
      <span class="pname">${esc(p.name)}
        <span class="pstat">&nbsp;&middot; ${s.goals}G ${s.assists}A ${s.shots}SOG ${s.saves}SV</span>
      </span>
      <button class="mini-x" data-act="remove-player" data-id="${p.id}" aria-label="Remove">&times;</button>
    </div>`;
  }).join('');

  const listCard = players.length
    ? `<div class="card">${rows}</div>`
    : `<div class="card"><p class="empty">No players yet. Add your squad below.</p></div>`;

  return `
    <header class="topbar"><h1>Roster</h1></header>
    <div class="card">
      <div class="card-title">Add Player</div>
      <div class="row-2">
        <div class="field">
          <label for="pname">Name</label>
          <input class="input" id="pname" type="text" placeholder="Player name" autocomplete="off" />
        </div>
        <div class="field w-num">
          <label for="pnum">Number</label>
          <input class="input" id="pnum" type="number" inputmode="numeric" placeholder="#" />
        </div>
      </div>
      <button class="btn btn-primary" data-act="add-player">Add Player</button>
    </div>
    <div class="section-head"><h2>Squad (${players.length})</h2></div>
    ${listCard}
    ${tabbar('roster')}
  `;
}

/* ----- New Game ----- */

function gameFormFields(g) {
  const opp = g ? esc(g.opponent) : '';
  const date = g ? g.date : todayISO();
  const tourney = g && g.tournament ? esc(g.tournament) : '';
  const isT = !!(g && g.tournament);
  const oppOptions = uniqueOpponents().map((o) => `<option value="${esc(o)}"></option>`).join('');
  const tOptions = uniqueTournaments().map((t) => `<option value="${esc(t)}"></option>`).join('');
  return `
    <div class="field">
      <label for="opp">Opponent</label>
      <input class="input" id="opp" type="text" list="opp-list"
        placeholder="e.g. Riverside FC" value="${opp}" />
      <datalist id="opp-list">${oppOptions}</datalist>
    </div>
    <div class="field">
      <label for="gdate">Date</label>
      <input class="input" id="gdate" type="date" value="${date}" />
    </div>
    <label class="check-row" for="is-tourney">
      <input type="checkbox" id="is-tourney" ${isT ? 'checked' : ''} />
      <span>This is a tournament game</span>
    </label>
    <div class="field tourney-field" id="tourney-field" ${isT ? '' : 'hidden'}>
      <label for="tourney">Tournament name</label>
      <input class="input" id="tourney" type="text" list="tourney-list"
        placeholder="e.g. Spring Cup" value="${tourney}" />
      <datalist id="tourney-list">${tOptions}</datalist>
    </div>`;
}

function viewNewGame() {
  const noPlayers = activeRoster().length === 0;
  const warn = noPlayers
    ? `<div class="card" style="border-color:var(--accent)">
        <p class="empty" style="padding:6px 0 12px">Add players to your roster before starting a game.</p>
        <button class="btn btn-ghost" data-act="nav:roster">Go to Roster</button>
      </div>`
    : '';

  return `
    <header class="topbar">
      <button class="icon-btn" data-act="back:home">&larr;</button>
      <h1>New Game</h1>
    </header>
    ${warn}
    <div class="card">
      ${gameFormFields(null)}
      <button class="btn btn-primary" data-act="start-game" ${noPlayers ? 'disabled' : ''}>
        Start Game &rarr;
      </button>
    </div>
  `;
}

function viewEditGame() {
  const g = getGame(ui.gameId);
  if (!g) return viewHistory();
  return `
    <header class="topbar">
      <button class="icon-btn" data-act="cancel-edit">&larr;</button>
      <h1>Edit Game</h1>
    </header>
    <div class="card">
      ${gameFormFields(g)}
      <button class="btn btn-primary" data-act="save-game">Save Changes</button>
      <button class="btn btn-ghost btn-block" data-act="cancel-edit">Cancel</button>
    </div>
  `;
}

/* ----- Game (live) ----- */

function viewGame() {
  const g = getGame(ui.gameId) || activeGame();
  if (!g) return viewHome();
  ui.gameId = g.id;

  const elapsed = liveElapsed(g);
  const over = elapsed >= HALF_SECONDS;
  const running = g.clock.running;
  const halfName = g.half === 1 ? '1st Half' : '2nd Half';

  const events = g.events.slice().sort((a, b) => b.createdAt - a.createdAt);
  const feed = events.length
    ? events.map(eventRow).join('')
    : `<p class="empty">No events yet. Use the buttons above to log the game.</p>`;

  const timerBtn = running
    ? `<button class="btn btn-ghost" data-act="timer-toggle">&#10073;&#10073; Pause</button>`
    : `<button class="btn btn-primary" data-act="timer-toggle">&#9654; ${g.clock.elapsed > 0 ? 'Resume' : 'Start'}</button>`;

  const halfBtn = g.half < HALVES
    ? `<button class="btn btn-ghost" data-act="end-half">End ${halfName}</button>`
    : '';

  return `
    <header class="game-head">
      <button class="icon-btn" data-act="nav:home">&larr;</button>
      <div class="gh-title">
        <span class="opp-name">vs ${esc(g.opponent)}</span>
        ${g.tournament ? `<span class="gh-tourney">&#127942; ${esc(g.tournament)}</span>` : ''}
      </div>
      <button class="icon-btn" data-act="end-game">End Game</button>
    </header>

    <div class="scoreboard">
      <div class="teams">
        <div class="team-col"><div class="tn">Our Team</div><div class="sc">${usScore(g)}</div></div>
        <div class="dash">:</div>
        <div class="team-col"><div class="tn">${esc(g.opponent)}</div><div class="sc">${themScore(g)}</div></div>
      </div>
      <div class="timer-wrap">
        <div class="half-label">${halfName}${over ? ' &middot; +Stoppage' : ''}</div>
        <div class="timer ${over ? 'overtime' : ''}" id="timer-display">${fmtClock(elapsed)}</div>
        <div class="timer-controls">
          ${timerBtn}
          ${halfBtn}
        </div>
      </div>
    </div>

    <div class="actions-grid">
      <button class="action-btn" data-act="act-shot">
        <span class="ai">&#127919;</span><span class="at">Shot on Goal</span>
        <span class="ac">${countType(g, 'shot')} logged</span>
      </button>
      <button class="action-btn action-goal" data-act="act-goal">
        <span class="ai">&#9917;</span><span class="at">Goal!</span>
        <span class="ac">${usScore(g)} scored</span>
      </button>
      <button class="action-btn action-opp" data-act="act-opp-shot">
        <span class="ai">&#127919;</span><span class="at">Opponent Shot</span>
        <span class="ac">${countType(g, 'opponent_shot')} logged</span>
      </button>
      <button class="action-btn action-opp" data-act="act-opp">
        <span class="ai">&#128683;</span><span class="at">Opponent Goal</span>
        <span class="ac">${themScore(g)} against</span>
      </button>
      <button class="action-btn action-wide" data-act="act-save">
        <span class="ai">&#129508;</span><span class="at">Save</span>
        <span class="ac">${countType(g, 'save')} logged</span>
      </button>
    </div>

    <div class="section-head"><h2>Game Feed</h2></div>
    <div class="card">${feed}</div>
  `;
}

function eventMeta(e) {
  switch (e.type) {
    case 'goal': {
      const assist = e.assistId
        ? `assist: ${esc(playerLabel(e.assistId))}`
        : 'unassisted';
      return { cls: 'edot-goal', icon: '&#9917;', title: 'Goal',
        sub: `${esc(playerLabel(e.playerId))} &middot; ${assist}` };
    }
    case 'shot':
      return { cls: 'edot-shot', icon: '&#127919;', title: 'Shot on goal',
        sub: esc(playerLabel(e.playerId)) };
    case 'save':
      return { cls: 'edot-save', icon: '&#129508;', title: 'Save',
        sub: esc(playerLabel(e.playerId)) };
    case 'opponent_goal':
      return { cls: 'edot-opp', icon: '&#128683;', title: 'Opponent goal',
        sub: 'Conceded' };
    case 'opponent_shot':
      return { cls: 'edot-opp', icon: '&#127919;', title: 'Opponent shot',
        sub: 'On goal' };
    default:
      return { cls: 'edot-shot', icon: '?', title: e.type, sub: '' };
  }
}

function eventRow(e) {
  const m = eventMeta(e);
  return `<div class="event">
    <span class="etime">H${e.half} ${fmtClock(e.clock)}</span>
    <span class="edot ${m.cls}">${m.icon}</span>
    <span class="etext">
      <span class="ttl">${m.title}</span><br />
      <span class="sub">${m.sub}</span>
    </span>
    <button class="mini-x" data-act="del-event" data-id="${e.id}" aria-label="Delete">&times;</button>
  </div>`;
}

/* ----- Summary ----- */

function viewSummary() {
  const g = getGame(ui.gameId);
  if (!g) return viewHistory();

  const u = usScore(g), t = themScore(g);
  const r = resultOf(g);
  const resultWord = { W: 'Win', L: 'Loss', D: 'Draw' }[r];
  const shots = countType(g, 'shot');
  const saves = countType(g, 'save');
  const assists = g.events.filter((e) => e.type === 'goal' && e.assistId).length;
  const attempts = shots + u;
  const conv = attempts ? Math.round((u / attempts) * 100) : 0;
  const oppShots = countType(g, 'opponent_shot');
  const oppAttempts = oppShots + t;
  const oppConv = oppAttempts ? Math.round((t / oppAttempts) * 100) : 0;

  const isLive = g.status === 'in_progress';

  // per-player table
  const rows = activeRoster()
    .map((p) => ({ p: p, s: gameStats(g, p.id) }))
    .filter((x) => x.s.goals || x.s.assists || x.s.shots || x.s.saves)
    .sort((a, b) =>
      (b.s.goals - a.s.goals) || (b.s.assists - a.s.assists) ||
      (b.s.shots - a.s.shots) || (b.s.saves - a.s.saves));

  let playerTable;
  if (rows.length) {
    playerTable = `<table class="stats">
      <thead><tr><th>Player</th><th>G</th><th>A</th><th>SOG</th><th>SV</th></tr></thead>
      <tbody>${rows.map((x) => {
        const num = (x.p.number !== '' && x.p.number != null)
          ? `<span class="pnum">#${esc(x.p.number)}</span>` : '';
        return `<tr><td>${num}${esc(x.p.name)}</td>
          <td>${x.s.goals}</td><td>${x.s.assists}</td>
          <td>${x.s.shots}</td><td>${x.s.saves}</td></tr>`;
      }).join('')}</tbody>
    </table>`;
  } else {
    playerTable = `<p class="empty">No player stats recorded.</p>`;
  }

  // timeline
  const byHalf = {};
  g.events.slice().sort((a, b) =>
    (a.half - b.half) || (a.clock - b.clock) || (a.createdAt - b.createdAt)
  ).forEach((e) => { (byHalf[e.half] = byHalf[e.half] || []).push(e); });

  let timeline = '';
  for (let h = 1; h <= HALVES; h++) {
    if (!byHalf[h]) continue;
    timeline += `<div class="timeline-half">${h === 1 ? '1st Half' : '2nd Half'}</div>`;
    timeline += byHalf[h].map(eventRowReadOnly).join('');
  }
  if (!timeline) timeline = '<p class="empty">No events recorded.</p>';

  return `
    <header class="topbar">
      <button class="icon-btn" data-act="${isLive ? 'open-game-live' : 'nav:history'}">&larr;</button>
      <h1>${isLive ? 'Live Stats' : 'Final Stats'}</h1>
      ${isLive ? '' : `
        <span class="spacer"></span>
        <button class="icon-btn" data-act="edit-game" aria-label="Edit game">&#9999;&#65039;</button>
        <button class="icon-btn icon-btn-danger" data-act="delete-game" aria-label="Delete game">&#128465;&#65039;</button>
      `}
    </header>

    <div class="result-banner banner-${r}">
      ${g.tournament ? `<div class="tourney-tag">&#127942; ${esc(g.tournament)}</div>` : ''}
      <div class="rtxt">${isLive ? 'In Progress' : resultWord}</div>
      <div class="rscore">${u} &ndash; ${t}</div>
      <div class="rsub">vs ${esc(g.opponent)} &middot; ${fmtDate(g.date)}</div>
    </div>

    <div class="card">
      <div class="card-title">Team Totals</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="v">${u}</div><div class="k">Goals</div></div>
        <div class="stat-box"><div class="v">${assists}</div><div class="k">Assists</div></div>
        <div class="stat-box"><div class="v">${shots}</div><div class="k">Shots o.G.</div></div>
        <div class="stat-box"><div class="v">${conv}%</div><div class="k">Conversion</div></div>
        <div class="stat-box"><div class="v">${saves}</div><div class="k">Saves</div></div>
        <div class="stat-box"><div class="v">${t}</div><div class="k">Conceded</div></div>
        <div class="stat-box"><div class="v">${oppShots}</div><div class="k">Opp. shots o.G.</div></div>
        <div class="stat-box"><div class="v">${oppConv}%</div><div class="k">Opp. conversion</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Player Stats</div>
      ${playerTable}
    </div>

    <div class="card">
      <div class="card-title">Timeline</div>
      ${timeline}
    </div>

    ${isLive
      ? `<button class="btn btn-primary btn-block" data-act="open-game-live">Back to Live Game</button>`
      : `<button class="btn btn-primary btn-block" data-act="nav:home">Done</button>`}
  `;
}

function eventRowReadOnly(e) {
  const m = eventMeta(e);
  return `<div class="event">
    <span class="etime">${fmtClock(e.clock)}</span>
    <span class="edot ${m.cls}">${m.icon}</span>
    <span class="etext">
      <span class="ttl">${m.title}</span><br />
      <span class="sub">${m.sub}</span>
    </span>
  </div>`;
}

/* ----- Cloud sync screen ----- */

function viewSync() {
  const code = syncCode();
  const connected = !!code;

  let statusLine = 'Connected';
  if (sync.status === 'syncing') statusLine = 'Syncing&hellip;';
  else if (sync.status === 'error') statusLine = 'Sync failed: ' + esc(sync.error || 'unknown') + ' &middot; will retry';
  else if (sync.status === 'ok') statusLine = 'Backed up ' + timeAgo(sync.lastSynced);
  const statusCls = sync.status === 'error' ? 'sync-status err' : 'sync-status';

  const body = connected
    ? `<div class="card">
        <div class="card-title">Your sync code</div>
        <div class="code-box">${esc(code)}</div>
        <div class="${statusCls}">${statusLine}</div>
        <button class="btn btn-primary" data-act="sync-now">Sync Now</button>
        <button class="btn btn-ghost btn-block" data-act="sync-disconnect">Disconnect</button>
      </div>
      <div class="card">
        <p class="empty" style="padding:4px 2px;text-align:left">
          Your stats are backed up to the cloud after every change. To load them
          on another device, open its Cloud Sync screen and enter this exact code.
          Anyone with the code can see your stats &mdash; keep it private.
        </p>
      </div>`
    : `<div class="card">
        <p class="empty" style="padding:2px 2px 14px;text-align:left">
          Back up your stats to the cloud so they survive a lost phone, and load
          them on another device with the same code.
        </p>
        <div class="field">
          <label for="synccode">Sync code</label>
          <input class="input" id="synccode" type="text" autocomplete="off"
            autocapitalize="off" spellcheck="false" placeholder="Enter or generate a code" />
        </div>
        <button class="btn btn-ghost" data-act="sync-generate">Generate a Code</button>
        <button class="btn btn-primary btn-block" data-act="sync-connect">Start Syncing</button>
        <p class="empty" style="padding:14px 2px 0;text-align:left;font-size:13px">
          This code is your password. Write it down &mdash; you'll need it to
          restore your data or sync another device. There's no way to recover it.
        </p>
      </div>`;

  return `
    <header class="topbar">
      <button class="icon-btn" data-act="nav:home">&larr;</button>
      <h1>Cloud Sync</h1>
    </header>
    ${body}
  `;
}

/* ---------------- Modal (roster picker) ---------------- */

const modalRoot = document.getElementById('modal-root');

function openPicker(opts) {
  // opts: { title, subtitle, exclude:[ids], noneLabel, onPick(idOrNull) }
  pendingPick = opts.onPick;
  const players = activeRoster()
    .filter((p) => !(opts.exclude || []).includes(p.id))
    .sort((a, b) => {
      const an = parseInt(a.number, 10), bn = parseInt(b.number, 10);
      if (!isNaN(an) && !isNaN(bn)) return an - bn;
      return String(a.name).localeCompare(String(b.name));
    });

  const noneBtn = opts.noneLabel
    ? `<button class="pick pick-none" data-act="pick" data-none="1">
         <span class="pn">${esc(opts.noneLabel)}</span></button>`
    : '';

  const grid = players.map((p) =>
    `<button class="pick" data-act="pick" data-id="${p.id}">
       <span class="jersey">${playerBadge(p)}</span>
       <span class="pn">${esc(p.name)}</span>
     </button>`).join('');

  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-act="modal-backdrop">
      <div class="modal" data-stop="1">
        <div class="modal-grip"></div>
        <h3>${esc(opts.title)}</h3>
        ${opts.subtitle ? `<div class="modal-sub">${esc(opts.subtitle)}</div>` : ''}
        <div class="picker-grid">
          ${noneBtn}
          ${grid || '<p class="empty" style="grid-column:1/-1">No players available.</p>'}
        </div>
        <button class="btn btn-ghost btn-block" data-act="modal-close">Cancel</button>
      </div>
    </div>`;
}

function closeModal() {
  modalRoot.innerHTML = '';
  pendingPick = null;
}

/* ---------------- Toast ---------------- */

let toastTimer = null;
function toast(msg) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 1700);
}

/* ---------------- Action handlers ---------------- */

function handleAct(act, target) {
  // navigation
  if (act === 'nav:home' || act === 'back:home') return go('home');
  if (act === 'nav:history') return go('history');
  if (act === 'nav:roster') return go('roster');
  if (act === 'nav:sync') return go('sync');
  if (act === 'go:newgame') return go('newgame');

  // cloud sync
  if (act === 'sync-generate') {
    const inp = document.getElementById('synccode');
    if (inp) inp.value = generateSyncCode();
    return;
  }
  if (act === 'sync-connect') {
    const inp = document.getElementById('synccode');
    const code = (inp ? inp.value : '').trim().toLowerCase();
    if (code.length < 6) { toast('Code must be at least 6 characters'); return; }
    connectSync(code);
    render();
    toast('Cloud sync turned on');
    return;
  }
  if (act === 'sync-now') {
    cloudPull();
    return render();
  }
  if (act === 'sync-disconnect') {
    if (confirm('Disconnect cloud sync on this device? Your stats stay on this phone — this only stops backing them up.')) {
      disconnectSync();
      render();
    }
    return;
  }

  if (act === 'resume') {
    const g = activeGame();
    if (g) return go('game', g.id);
    return go('home');
  }

  if (act === 'open-game') {
    const g = getGame(target.dataset.id);
    if (!g) return;
    return go(g.status === 'in_progress' ? 'game' : 'summary', g.id);
  }

  if (act === 'open-game-live') return go('game', ui.gameId);

  if (act === 'edit-game') return go('editgame', ui.gameId);
  if (act === 'cancel-edit') return go('summary', ui.gameId);

  if (act === 'delete-game') {
    const game = getGame(ui.gameId);
    if (game && confirm(`Delete the game vs ${game.opponent}? This can't be undone.`)) {
      deleteGame(game.id);
      toast('Game deleted');
      return go('history');
    }
    return;
  }

  // new game / edit game form
  if (act === 'start-game' || act === 'save-game') {
    const opp = (document.getElementById('opp').value || '').trim();
    const date = document.getElementById('gdate').value || todayISO();
    const isT = document.getElementById('is-tourney').checked;
    const tName = (document.getElementById('tourney').value || '').trim();
    if (!opp) { toast('Enter an opponent name'); return; }
    if (isT && !tName) { toast('Enter the tournament name'); return; }
    const tournament = isT ? tName : null;
    if (act === 'save-game') {
      const game = getGame(ui.gameId);
      if (!game) return go('history');
      updateGame(game, opp, date, tournament);
      toast('Game updated');
      return go('summary', game.id);
    }
    const created = createGame(opp, date, tournament);
    return go('game', created.id);
  }

  // roster
  if (act === 'add-player') {
    const nameEl = document.getElementById('pname');
    const numEl = document.getElementById('pnum');
    const name = (nameEl.value || '').trim();
    const number = (numEl.value || '').trim();
    if (!name) { toast('Enter a player name'); return; }
    addPlayer(name, number);
    render();
    const f = document.getElementById('pname');
    if (f) f.focus();
    toast(name + ' added');
    return;
  }

  if (act === 'remove-player') {
    const p = playerById(target.dataset.id);
    if (p && confirm(`Remove ${p.name} from the roster?`)) {
      removePlayer(p.id);
      render();
    }
    return;
  }

  // game controls
  const g = getGame(ui.gameId);
  if (!g) return;

  if (act === 'timer-toggle') {
    if (g.clock.running) pauseClock(g);
    else startClock(g);
    return render();
  }

  if (act === 'end-half') {
    if (confirm(`End the ${g.half === 1 ? '1st' : '2nd'} half?`)) {
      endHalf(g);
      render();
      toast('2nd half — tap Start when ready');
    }
    return;
  }

  if (act === 'end-game') {
    if (confirm('End the game and view final stats?')) {
      endGame(g);
      return go('summary', g.id);
    }
    return;
  }

  if (act === 'act-shot') {
    return openPicker({
      title: 'Shot on Goal',
      subtitle: 'Who took the shot?',
      onPick: (id) => {
        if (!id) return;
        addEvent(g, 'shot', { playerId: id });
        render();
        toast('Shot logged');
      }
    });
  }

  if (act === 'act-save') {
    return openPicker({
      title: 'Save',
      subtitle: 'Who made the save?',
      onPick: (id) => {
        if (!id) return;
        addEvent(g, 'save', { playerId: id });
        render();
        toast('Save logged');
      }
    });
  }

  if (act === 'act-goal') {
    return openPicker({
      title: 'Goal!',
      subtitle: 'Who scored?',
      onPick: (scorerId) => {
        if (!scorerId) return;
        openPicker({
          title: 'Assist',
          subtitle: 'Who set it up?',
          exclude: [scorerId],
          noneLabel: 'No assist (unassisted)',
          onPick: (assistId) => {
            addEvent(g, 'goal', { playerId: scorerId, assistId: assistId || null });
            render();
            toast('Goal! ⚽');
          }
        });
      }
    });
  }

  if (act === 'act-opp-shot') {
    addEvent(g, 'opponent_shot', {});
    render();
    toast('Opponent shot recorded');
    return;
  }

  if (act === 'act-opp') {
    addEvent(g, 'opponent_goal', {});
    render();
    toast('Opponent goal recorded');
    return;
  }

  if (act === 'del-event') {
    const e = g.events.find((x) => x.id === target.dataset.id);
    if (!e) return;
    const label = { goal: 'goal', shot: 'shot', save: 'save', opponent_goal: 'opponent goal' }[e.type];
    if (confirm(`Delete this ${label}?`)) {
      deleteEvent(g, e.id);
      render();
    }
    return;
  }
}

function handleModal(act, target) {
  if (act === 'modal-close') return closeModal();
  if (act === 'modal-backdrop') return closeModal();
  if (act === 'pick') {
    const fn = pendingPick;
    const id = target.dataset.none ? null : (target.dataset.id || null);
    closeModal();
    if (fn) fn(id);
    return;
  }
}

/* ---------------- Event wiring ---------------- */

function closestAct(el, root) {
  while (el && el !== root) {
    if (el.dataset && el.dataset.act) return el;
    el = el.parentElement;
  }
  return null;
}

app.addEventListener('click', (ev) => {
  const t = closestAct(ev.target, app);
  if (t) handleAct(t.dataset.act, t);
});

modalRoot.addEventListener('click', (ev) => {
  // ignore clicks that bubble from inside the sheet but aren't actions
  const t = closestAct(ev.target, modalRoot);
  if (t) { handleModal(t.dataset.act, t); return; }
  // backdrop click handled via data-act on backdrop element itself
});

// Submit roster / game-form inputs with Enter
app.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  const id = ev.target && ev.target.id;
  if (id === 'pname' || id === 'pnum') {
    ev.preventDefault();
    handleAct('add-player', ev.target);
  } else if (id === 'opp' || id === 'tourney') {
    ev.preventDefault();
    handleAct(ui.view === 'editgame' ? 'save-game' : 'start-game', ev.target);
  } else if (id === 'synccode') {
    ev.preventDefault();
    handleAct('sync-connect', ev.target);
  }
});

// Reveal the tournament name field when the checkbox is ticked
app.addEventListener('change', (ev) => {
  if (ev.target && ev.target.id === 'is-tourney') {
    const field = document.getElementById('tourney-field');
    if (field) field.hidden = !ev.target.checked;
    if (ev.target.checked) {
      const inp = document.getElementById('tourney');
      if (inp) inp.focus();
    }
  }
});

/* ---------------- Live timer tick ---------------- */

setInterval(() => {
  if (ui.view !== 'game') return;
  const g = getGame(ui.gameId);
  if (!g || !g.clock.running) return;
  const disp = document.getElementById('timer-display');
  if (!disp) return;
  const e = liveElapsed(g);
  disp.textContent = fmtClock(e);
  if (e >= HALF_SECONDS) disp.classList.add('overtime');
}, 500);

/* ---------------- Service worker ---------------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}

/* ---------------- Boot ---------------- */

(function init() {
  const ag = activeGame();
  if (ag) {
    ui.view = 'game';
    ui.gameId = ag.id;
  }
  if (syncCode()) sync.status = 'syncing';
  render();
  if (syncCode()) cloudPull();
})();
