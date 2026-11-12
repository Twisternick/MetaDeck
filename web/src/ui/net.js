// The connection to the MetaDeck server's matchmaking socket (/ws, see server/lobby.mjs). There is
// one shared connection. It says hello with the player's token, kept per tab in sessionStorage so a
// refresh rejoins a running match, and reconnects on its own when the connection drops.
//
// Listeners get every server message, plus { t: 'status', status } when the connection changes:
// 'connecting' | 'online' | 'retrying' | 'offline'.

const TOKEN_KEY = 'metadeck.netToken';
const IN_MATCH_KEY = 'metadeck.netInMatch';

const listeners = new Set();
let ws = null;
let status = 'offline';
let name = '';
let wanted = false;
let retries = 0;
let retryTimer = null;

const session = {
  get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { value === null ? sessionStorage.removeItem(key) : sessionStorage.setItem(key, value); } catch { /* storage unavailable */ } },
};

export const net = {
  get status() { return status; },
  connect(playerName) {
    name = playerName;
    wanted = true;
    if (!ws) open();
  },
  disconnect() {
    wanted = false;
    clearTimeout(retryTimer);
    const sock = ws;
    ws = null;
    sock?.close();
    setStatus('offline');
  },
  send(msg) {
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  // Whether this tab was in an online match, so a reload can go straight back to it.
  get inMatch() { return session.get(IN_MATCH_KEY) === '1'; },
  set inMatch(value) { session.set(IN_MATCH_KEY, value ? '1' : null); },
};

function open() {
  clearTimeout(retryTimer);
  setStatus(retries ? 'retrying' : 'connecting');
  let sock;
  try {
    sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  } catch {
    return scheduleRetry();
  }
  ws = sock;
  sock.onopen = () => sock.send(JSON.stringify({ t: 'hello', token: session.get(TOKEN_KEY), name }));
  sock.onmessage = e => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.t === 'welcome') {
      session.set(TOKEN_KEY, msg.token);
      retries = 0;
      setStatus('online');
    }
    emit(msg);
  };
  sock.onclose = () => {
    if (ws !== sock) return;
    ws = null;
    if (wanted) scheduleRetry();
  };
}

function scheduleRetry() {
  retries++;
  // After a few failures with no server at all, say so (static hosting has no /ws), but keep trying.
  setStatus(retries > 3 ? 'offline' : 'retrying');
  retryTimer = setTimeout(open, Math.min(8000, 400 * 2 ** retries));
}

function setStatus(next) {
  if (next === status) return;
  status = next;
  emit({ t: 'status', status });
}

function emit(msg) {
  for (const fn of [...listeners]) fn(msg);
}
