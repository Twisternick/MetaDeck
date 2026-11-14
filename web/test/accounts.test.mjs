// Accounts: a real HTTP server with the account API, its database, and the online lobby paying rewards.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAccounts, accountsIn } from '../server/accounts.mjs';
import { handleAccountApi, sessionToken } from '../server/account-api.mjs';
import { acceptWebSocket } from '../server/ws.mjs';
import { createLobby } from '../server/lobby.mjs';
import { createAiMatches } from '../server/ai-match.mjs';
import { createGame, applyAction, decisionPlayer } from '../src/engine/game.js';
import { chooseAction } from '../src/engine/ai.js';
import { starterDecks } from '../src/data/index.js';
import { ownsDeck } from '../src/data/economy.js';

let server, base, accounts, lobby, file, dir;
const ADMIN = 'test-admin-token';

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadeck-accounts-'));
  file = path.join(dir, 'metadeck.db');
  accounts = createAccounts({ file });
  lobby = createLobby({ accounts, turnMs: 2000, graceMs: 200 });
  const ctx = {
    accounts,
    aiMatches: createAiMatches({ accounts }),
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
  accounts.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// Each sign-up comes from its own address, so the per-address sign-up limit doesn't trip.
let ip = 0;
async function call(route, body, { cookie, headers = {} } = {}) {
  if (route === 'signup' && !headers['x-test-ip']) headers = { ...headers, 'x-test-ip': `10.1.0.${++ip}` };
  if (route === 'signup' && body && !('birthYear' in body)) body = { ...body, birthYear: 2000 };
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

// Play a dealt vs-AI match the way the browser does (here the AI plays the human's side too), and
// return the human's moves.
function playDealt(deal, start) {
  const game = createGame({ decks: [deal.myCards, deal.oppCards], deckIds: [deal.myDeck, deal.oppDeck], seed: start.seed, firstPlayer: start.firstPlayer });
  const moves = [];
  while (!game.over) {
    const human = decisionPlayer(game) === 0;
    const action = chooseAction(game, { difficulty: human ? 'normal' : start.difficulty });
    assert.equal(applyAction(game, action).ok, true);
    if (human) moves.push(action);
  }
  return { moves, won: game.winner === 0 };
}

test('vs-AI matches are paid only from the server replay', async () => {
  const { cookie } = await call('signup', { name: fresh(), password: 'longenough' });
  const mine = starterDecks('FPS')[0], theirs = starterDecks('Horror')[0];
  const deal = { myDeck: 'FPS', myCards: mine.cards, oppDeck: 'Horror', oppCards: theirs.cards };

  // Accounts can't report a result directly any more.
  assert.equal((await call('act', { op: 'recordMatch', args: { deckId: 'FPS', won: true, damage: 30 } }, { cookie })).status, 403);

  const start = await call('aistart', deal, { cookie });
  assert.equal(start.body.ok, true);
  assert.equal(start.body.difficulty, 'easy', 'a new account starts on easy');
  const { moves, won } = playDealt(deal, start.body);
  const fin = await call('aifinish', { ticket: start.body.ticket, moves }, { cookie });
  assert.equal(fin.body.ok, true, fin.body.reason);
  assert.equal(fin.body.won, won);
  assert.equal(fin.body.profile.stats.games, 1);
  assert.equal((await call('aifinish', { ticket: start.body.ticket, moves }, { cookie })).body.ok, false, 'a ticket is used up');
  const row = accounts.db.prepare("SELECT * FROM matches WHERE kind = 'ai' ORDER BY id DESC LIMIT 1").get();
  assert.equal(row.deck0, 'FPS');
  assert.equal(row.winner, won ? 0 : 1);

  // A move list that stops early, or makes a move the replay can't, earns nothing.
  await new Promise(r => setTimeout(r, 2100)); // starts are rate limited per account
  const again = await call('aistart', deal, { cookie });
  const honest = playDealt(deal, again.body).moves;
  const short = await call('aifinish', { ticket: again.body.ticket, moves: honest.slice(0, -1) }, { cookie });
  assert.equal(short.body.ok, false);
  await new Promise(r => setTimeout(r, 2100));
  const third = await call('aistart', deal, { cookie });
  const forged = await call('aifinish', { ticket: third.body.ticket, moves: [{ type: 'attack', uid: 9999, target: 'P1' }] }, { cookie });
  assert.equal(forged.body.ok, false);
  assert.equal(accounts.profileFor(accounts.accountFor(cookie.split('=')[1])).stats.games, 1);
});

test('vs-AI decks must be legal and owned', async () => {
  const { cookie } = await call('signup', { name: fresh(), password: 'longenough' });
  const theirs = starterDecks('Horror')[0];
  const locked = starterDecks('FPS')[2]; // the third starter needs archetype level 7
  assert.equal((await call('aistart', { myDeck: 'FPS', myCards: locked.cards, oppDeck: 'Horror', oppCards: theirs.cards }, { cookie })).status, 400);
  assert.equal((await call('aistart', { myDeck: 'FPS', myCards: ['FPS_M01'], oppDeck: 'Horror', oppCards: theirs.cards }, { cookie })).status, 400);
  assert.equal((await call('aistart', { myDeck: 'FPS', myCards: starterDecks('FPS')[0].cards, oppDeck: 'Horror', oppCards: theirs.cards })).status, 401);
});

test('accounts need a birth year at least 13 years ago, and under-age accounts are shut out', async () => {
  const year = new Date().getUTCFullYear();
  assert.equal((await call('signup', { name: fresh(), password: 'longenough', birthYear: null })).status, 400);
  const young = await call('signup', { name: fresh(), password: 'longenough', birthYear: year - 12 });
  assert.equal(young.status, 400);
  assert.match(young.body.reason, /13 and older/);
  assert.equal((await call('signup', { name: fresh(), password: 'longenough', birthYear: year - 13 })).status, 200);

  // An account from before the age check is asked once; an under-age answer signs it out for good.
  const name = fresh();
  const { cookie } = await call('signup', { name, password: 'longenough' });
  accounts.db.prepare('UPDATE users SET birth_year = NULL WHERE key = ?').run(name.toLowerCase());
  const fresh2 = createAccounts({ file });
  assert.equal(fresh2.me(cookie.split('=')[1]).info.birthYear, null);
  assert.equal(fresh2.setBirthYear(cookie.split('=')[1], year - 10).tooYoung, true);
  assert.equal(fresh2.me(cookie.split('=')[1]), null, 'signed out');
  assert.equal((await fresh2.signIn(name, 'longenough')).ok, false);
  fresh2.close();
});

test('a signed-in player can download everything stored about them', async () => {
  const name = fresh();
  const { cookie } = await call('signup', { name, password: 'longenough' });
  const res = await fetch(`${base}/api/account/export`, { headers: { cookie } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /attachment; filename="metadeck-/);
  const data = await res.json();
  assert.equal(data.account.name, name);
  assert.equal(data.account.birthYear, 2000);
  assert.ok(data.profile.cards);
  assert.ok(Array.isArray(data.matches) && Array.isArray(data.events));
  const raw = JSON.stringify(data);
  const row = accounts.db.prepare('SELECT hash, salt FROM users WHERE key = ?').get(name.toLowerCase());
  assert.ok(!raw.includes(row.hash) && !raw.includes(row.salt), 'no password hash in the export');
  assert.equal((await fetch(`${base}/api/account/export`)).status, 401);
});

test('accounts.json from before the database is imported once', async () => {
  const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadeck-legacy-'));
  const old = createAccounts();
  const made = await old.signUp('Legacy_1', 'longenough', '10.9.9.9', 2000);
  const user = old.db.prepare('SELECT * FROM users').get();
  fs.writeFileSync(path.join(legacyDir, 'accounts.json'), JSON.stringify({
    users: { legacy_1: { name: user.name, salt: user.salt, hash: user.hash, recovery: user.recovery, created: user.created, profile: JSON.parse(user.profile) } },
    sessions: { [old.db.prepare('SELECT hash FROM sessions').get().hash]: { user: 'legacy_1', expires: Date.now() + 86_400_000 } },
  }));
  old.close();
  const imported = accountsIn(legacyDir);
  assert.equal(imported.me(made.token)?.name, 'Legacy_1', 'sessions survive the import');
  assert.equal((await imported.signIn('Legacy_1', 'longenough')).ok, true);
  assert.ok(fs.existsSync(path.join(legacyDir, 'accounts.json.imported')));
  imported.close();
  fs.rmSync(legacyDir, { recursive: true, force: true });
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
  reloaded.close();
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

test('sign up hands out a recovery code once, and it resets a forgotten password', async () => {
  const name = fresh();
  const up = await call('signup', { name, password: 'first password' });
  assert.match(up.body.recoveryCode, /^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
  assert.equal(up.body.info.recovery, true);
  const me = await call('me', undefined, { cookie: up.cookie });
  assert.equal(me.body.recoveryCode, undefined, 'never shown again');
  accounts.flush();
  assert.ok(!fs.readFileSync(file, 'utf8').includes(up.body.recoveryCode.replaceAll('-', '')), 'no plain codes on disk');

  const h = { headers: { 'x-test-ip': '10.3.0.1' } };
  assert.equal((await call('reset', { name, code: 'AAAA-AAAA-AAAA-AAAA', password: 'second password' }, h)).status, 400);
  assert.equal((await call('reset', { name, code: up.body.recoveryCode, password: 'short' }, h)).status, 400);
  // Case, spaces and look-alike letters don't matter.
  const typed = up.body.recoveryCode.toLowerCase().replaceAll('-', ' ').replaceAll('0', 'o').replaceAll('1', 'l');
  const reset = await call('reset', { name: name.toUpperCase(), code: typed, password: 'second password' }, h);
  assert.equal(reset.status, 200);
  assert.equal(reset.body.name, name);
  assert.ok(reset.cookie, 'signed in after the reset');
  assert.notEqual(reset.body.recoveryCode, up.body.recoveryCode, 'a fresh code');
  assert.equal((await call('me', undefined, { cookie: up.cookie })).status, 401, 'other sessions signed out');
  assert.equal((await call('reset', { name, code: up.body.recoveryCode, password: 'third password' }, h)).status, 400, 'codes work once');
  assert.equal((await call('signin', { name, password: 'second password' }, h)).status, 200);
});

test('wrong recovery codes are throttled like wrong passwords', async () => {
  const name = fresh();
  const { body } = await call('signup', { name, password: 'longenough' });
  const h = { headers: { 'x-test-ip': '10.3.0.2' } };
  for (let i = 0; i < 10; i++) await call('reset', { name, code: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ', password: 'longenough2' }, h);
  assert.match((await call('reset', { name, code: body.recoveryCode, password: 'longenough2' }, h)).body.reason, /Too many/);
});

test('signed in: change password, new recovery code, sign out other devices', async () => {
  const name = fresh();
  const a = await call('signup', { name, password: 'old password' });
  const h = { headers: { 'x-test-ip': '10.3.0.3' } };
  const b = await call('signin', { name, password: 'old password' }, h);
  assert.equal((await call('me', undefined, { cookie: a.cookie })).body.info.devices, 2);

  assert.equal((await call('newpassword', { current: 'old password', password: 'new password' })).status, 401, 'signed out');
  assert.equal((await call('newpassword', { current: 'wrong', password: 'new password' }, { cookie: a.cookie, ...h })).body.ok, false);
  assert.equal((await call('newpassword', { current: 'old password', password: 'short' }, { cookie: a.cookie, ...h })).body.ok, false);
  const changed = await call('newpassword', { current: 'old password', password: 'new password' }, { cookie: a.cookie, ...h });
  assert.equal(changed.body.signedOut, 1);
  assert.equal((await call('me', undefined, { cookie: a.cookie })).status, 200, 'this device stays signed in');
  assert.equal((await call('me', undefined, { cookie: b.cookie })).status, 401, 'the other is signed out');

  assert.equal((await call('recovery', { password: 'old password' }, { cookie: a.cookie, ...h })).body.ok, false);
  const code = (await call('recovery', { password: 'new password' }, { cookie: a.cookie, ...h })).body.recoveryCode;
  assert.notEqual(code, a.body.recoveryCode);
  assert.equal((await call('reset', { name, code: a.body.recoveryCode, password: 'x password' }, h)).status, 400, 'the old code stopped working');

  const c = await call('signin', { name, password: 'new password' }, h);
  assert.equal((await call('signoutothers', {}, { cookie: c.cookie })).body.signedOut, 1);
  assert.equal((await call('me', undefined, { cookie: a.cookie })).status, 401);
  assert.equal((await call('me', undefined, { cookie: c.cookie })).body.info.devices, 1);
});

test('deleting an account needs the password and the name, and frees the name', async () => {
  const name = fresh();
  const { cookie } = await call('signup', { name, password: 'longenough' });
  const h = { headers: { 'x-test-ip': '10.3.0.4' } };
  assert.equal((await call('delete', { password: 'longenough', confirm: 'someone' }, { cookie, ...h })).body.ok, false);
  assert.equal((await call('delete', { password: 'wrong', confirm: name }, { cookie, ...h })).body.ok, false);
  const del = await call('delete', { password: 'longenough', confirm: name.toUpperCase() }, { cookie, ...h });
  assert.equal(del.body.ok, true);
  assert.match(del.setCookie, /Max-Age=0/);
  assert.equal((await call('me', undefined, { cookie })).status, 401);
  assert.equal((await call('signin', { name, password: 'longenough' }, h)).status, 401);
  assert.equal((await call('signup', { name, password: 'another one' })).status, 200, 'the name is free again');
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
