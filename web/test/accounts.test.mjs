// Accounts: a real HTTP server with the account API, its JSON file, and the online lobby paying rewards.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAccounts } from '../server/accounts.mjs';
import { handleAccountApi, sessionToken } from '../server/account-api.mjs';
import { acceptWebSocket } from '../server/ws.mjs';
import { createLobby } from '../server/lobby.mjs';
import { starterDecks } from '../src/data/index.js';
import { ownsDeck } from '../src/data/economy.js';

let server, base, accounts, lobby, file, dir;
const ADMIN = 'test-admin-token';

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadeck-accounts-'));
  file = path.join(dir, 'accounts.json');
  accounts = createAccounts({ file });
  lobby = createLobby({ accounts, turnMs: 2000, graceMs: 200 });
  const ctx = {
    accounts,
    sameOrigin: req => !req.headers.origin || new URL(req.headers.origin).host === req.headers.host,
    clientIp: req => req.headers['x-test-ip'] ?? '127.0.0.1',
    secure: () => false,
    testPurchases: req => req.headers['x-test-local'] === '1',
    isAdmin: req => req.headers['x-admin-token'] === ADMIN,
  };
  server = http.createServer((req, res) => {
    const route = /^\/api\/account\/([a-z]+)$/.exec(new URL(req.url, 'http://x').pathname);
    if (route) handleAccountApi(req, res, route[1], ctx); else res.writeHead(404).end();
  });
  // Node's WebSocket client can't send a cookie, so the test socket passes its session in the URL.
  server.on('upgrade', (req, socket) => acceptWebSocket(req, socket, ws => {
    ws.account = accounts.accountFor(new URL(req.url, 'http://x').searchParams.get('session') ?? sessionToken(req));
    lobby.connect(ws);
  }));
  await new Promise(r => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  lobby.close();
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// Each sign-up comes from its own address, so the per-address sign-up limit doesn't trip.
let ip = 0;
async function call(route, body, { cookie, headers = {} } = {}) {
  if (route === 'signup' && !headers['x-test-ip']) headers = { ...headers, 'x-test-ip': `10.1.0.${++ip}` };
  const res = await fetch(`${base}/api/account/${route}`, body === undefined
    ? { headers: { ...(cookie ? { cookie } : {}), ...headers } }
    : { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: JSON.stringify(body) });
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, body: await res.json(), cookie: setCookie?.split(';')[0] ?? null, setCookie };
}

let n = 0;
const fresh = () => `tester_${++n}`;

test('sign up sets an HttpOnly session cookie and starts with the free starters', async () => {
  const name = fresh();
  const r = await call('signup', { name, password: 'correct horse' });
  assert.equal(r.status, 200);
  assert.match(r.setCookie, /HttpOnly/);
  assert.match(r.setCookie, /SameSite=Strict/);
  assert.equal(r.body.name, name);
  assert.equal(r.body.profile.gold, 300);
  assert.ok(ownsDeck(r.body.profile, starterDecks('RPG')[0].cards));
  const me = await call('me', undefined, { cookie: r.cookie });
  assert.equal(me.body.name, name);
  assert.equal((await call('me')).status, 401);
});

test('names are unique (ignoring case) and weak passwords are refused', async () => {
  const name = fresh();
  assert.equal((await call('signup', { name, password: 'longenough' })).status, 200);
  assert.equal((await call('signup', { name: name.toUpperCase(), password: 'longenough' })).body.reason, 'That name is taken.');
  assert.equal((await call('signup', { name: fresh(), password: 'short' })).status, 400);
  assert.equal((await call('signup', { name: 'no spaces', password: 'longenough' })).status, 400);
});

test('sign in checks the password, and repeated failures are throttled', async () => {
  const name = fresh();
  await call('signup', { name, password: 'right password' }, { headers: { 'x-test-ip': '10.0.0.9' } });
  const ok = await call('signin', { name, password: 'right password' }, { headers: { 'x-test-ip': '10.0.0.1' } });
  assert.equal(ok.status, 200);
  assert.ok(ok.cookie);
  for (let i = 0; i < 10; i++) assert.equal((await call('signin', { name, password: 'wrong' }, { headers: { 'x-test-ip': '10.0.0.2' } })).status, 401);
  const blocked = await call('signin', { name, password: 'right password' }, { headers: { 'x-test-ip': '10.0.0.2' } });
  assert.match(blocked.body.reason, /Too many/);
});

test('purchases run on the server; the client cannot set its own balances', async () => {
  const { cookie } = await call('signup', { name: fresh(), password: 'longenough' });
  const buy = await call('act', { op: 'buyPack', args: { kind: 'Horror', currency: 'gold' } }, { cookie });
  assert.equal(buy.body.ok, true);
  assert.equal(buy.body.profile.gold, 200);
  assert.equal(buy.body.profile.packs.Horror, 1);
  const open = await call('act', { op: 'openPack', args: { kind: 'Horror' } }, { cookie });
  assert.equal(open.body.pulls.length, 5);
  assert.equal((await call('act', { op: 'buyPack', args: { kind: 'Horror', currency: 'gems' } }, { cookie })).body.ok, false);
  assert.equal((await call('act', { op: 'setGold', args: { gold: 1e9 } }, { cookie })).body.reason, 'Unknown action.');
  assert.equal((await call('act', { op: 'testPurchase', args: { bundle: 'gems-100' } }, { cookie })).status, 403);
  const local = await call('act', { op: 'testPurchase', args: { bundle: 'gems-100' } }, { cookie, headers: { 'x-test-local': '1' } });
  assert.equal(local.body.profile.gems, 100);
  assert.equal((await call('act', { op: 'buyPack', args: {} })).status, 401, 'signed out');
});

test('vs-AI results are rate limited', async () => {
  const { cookie } = await call('signup', { name: fresh(), password: 'longenough' });
  assert.equal((await call('act', { op: 'recordMatch', args: { deckId: 'FPS', won: true, damage: 30 } }, { cookie })).body.ok, true);
  assert.equal((await call('act', { op: 'recordMatch', args: { deckId: 'FPS', won: true, damage: 30 } }, { cookie })).body.ok, false);
});

test('cross-site requests are refused', async () => {
  const r = await call('signup', { name: fresh(), password: 'longenough' }, { headers: { origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
});

test('admin grant needs the admin token, and accounts persist to disk', async () => {
  const name = fresh();
  const { cookie } = await call('signup', { name, password: 'longenough' });
  assert.equal((await call('grant', { name, gold: 999999, gems: 999999 })).status, 403);
  const g = await call('grant', { name, gold: 999999, gems: 999999 }, { headers: { 'x-admin-token': ADMIN } });
  assert.equal(g.body.gold, 999999 + 300);
  assert.equal(g.body.gems, 999999);
  accounts.flush();
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(!raw.includes('longenough'), 'no plain passwords on disk');
  assert.ok(!raw.includes(cookie.split('=')[1]), 'no session tokens on disk');
  const reloaded = createAccounts({ file });
  assert.equal(reloaded.me(cookie.split('=')[1]).profile.gems, 999999);
  assert.equal(reloaded.grant(name, { gems: -5 }).gems, 999994);
});

test('admin can set a password, which signs the account out everywhere', async () => {
  const name = fresh();
  const { cookie } = await call('signup', { name, password: 'old password' });
  assert.equal((await call('password', { name, password: 'new password' })).status, 403);
  assert.equal((await call('password', { name, password: 'short' }, { headers: { 'x-admin-token': ADMIN } })).status, 400);
  assert.equal((await call('password', { name, password: 'new password' }, { headers: { 'x-admin-token': ADMIN } })).body.ok, true);
  assert.equal((await call('me', undefined, { cookie })).status, 401, 'old session is gone');
  assert.equal((await call('signin', { name, password: 'old password' }, { headers: { 'x-test-ip': '10.2.0.1' } })).status, 401);
  assert.equal((await call('signin', { name, password: 'new password' }, { headers: { 'x-test-ip': '10.2.0.1' } })).status, 200);
});

test('online: an account may only bring cards it owns, and the server pays the winner', async () => {
  const a = await call('signup', { name: fresh(), password: 'longenough' });
  const b = await call('signup', { name: fresh(), password: 'longenough' });
  const token = c => c.cookie.split('=')[1];
  const sock = async session => {
    const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?session=${session}`);
    const inbox = [];
    const waiters = [];
    ws.onmessage = e => { const m = JSON.parse(e.data); const i = waiters.findIndex(w => w.t === m.t); if (i >= 0) waiters.splice(i, 1)[0].r(m); else inbox.push(m); };
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
    const next = t => { const i = inbox.findIndex(m => m.t === t); return i >= 0 ? Promise.resolve(inbox.splice(i, 1)[0]) : new Promise(r => waiters.push({ t, r })); };
    ws.send(JSON.stringify({ t: 'hello', name: 'ignored' }));
    return { ws, next, send: m => ws.send(JSON.stringify(m)), welcome: await next('welcome') };
  };
  const ca = await sock(token(a));
  const cb = await sock(token(b));
  assert.equal(ca.welcome.name, a.body.name, 'plays under the account name');

  const second = starterDecks('FPS')[1];
  ca.send({ t: 'queue', deck: { archetype: 'FPS', cards: second.cards, name: second.name } });
  assert.match((await ca.next('error')).message, /doesn't own/);

  const deck = id => { const d = starterDecks(id)[0]; return { archetype: id, cards: d.cards, name: d.name }; };
  ca.send({ t: 'queue', deck: deck('FPS') });
  await ca.next('queued');
  cb.send({ t: 'queue', deck: deck('Horror') });
  await ca.next('start');
  await cb.next('start');
  cb.send({ t: 'leave' }); // B leaves: A wins by forfeit
  const paid = await ca.next('rewards');
  assert.ok(paid.out.xp >= 150, 'online wins are worth 1.5× XP');
  assert.equal(paid.out.firstWin, true);
  assert.equal(accounts.me(token(a)).profile.stats.wins, 1);
  ca.ws.close();
  cb.ws.close();
});
