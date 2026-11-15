// Phase C: ranked play, friends, blocks, reports, challenges, emotes, history, the leaderboard, admin
// moderation, and deck codes. A real HTTP server with the account API and the online lobby.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAccounts } from '../server/accounts.mjs';
import { createSocial } from '../server/social.mjs';
import { handleAccountApi, sessionToken } from '../server/account-api.mjs';
import { acceptWebSocket } from '../server/ws.mjs';
import { createLobby } from '../server/lobby.mjs';
import { starterDecks, DECKS } from '../src/data/index.js';
import { rankOf, applyResult, rollSeason, newRank, META_STARS, TIER_STARS } from '../src/data/ranked.js';
import { encodeDeck, decodeDeck } from '../src/data/deck-code.js';

let server, base, wsUrl, accounts, social, lobby;

before(async () => {
  accounts = createAccounts();
  social = createSocial({ accounts });
  lobby = createLobby({ accounts, social, turnMs: 5000, graceMs: 200 });
  const ctx = {
    accounts, social,
    sameOrigin: () => true, clientIp: req => req.headers['x-test-ip'] ?? '127.0.0.1',
    secure: () => false, testPurchases: () => false, isAdmin: () => false,
  };
  server = http.createServer((req, res) => {
    const route = /^\/api\/account\/([a-z]+)$/.exec(new URL(req.url, 'http://x').pathname);
    if (route) handleAccountApi(req, res, route[1], ctx); else res.writeHead(404).end();
  });
  server.on('upgrade', (req, socket) => acceptWebSocket(req, socket, ws => {
    ws.account = accounts.accountFor(new URL(req.url, 'http://x').searchParams.get('session') ?? sessionToken(req));
    lobby.connect(ws);
  }));
  await new Promise(r => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  wsUrl = `ws://127.0.0.1:${server.address().port}/ws`;
});

after(() => {
  lobby.close();
  server.close();
  accounts.close();
});

let n = 0, ip = 0;
async function player(prefix = 'P') {
  const name = `${prefix}_${++n}`;
  const res = await fetch(`${base}/api/account/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-ip': `10.7.0.${++ip}` },
    body: JSON.stringify({ name, password: 'longenough', birthYear: 2000 }),
  });
  const token = res.headers.get('set-cookie').split(';')[0].split('=')[1];
  return { name, token, cookie: `md_session=${token}` };
}
async function api(p, route, body) {
  const res = await fetch(`${base}/api/account/${route}`, body === undefined
    ? { headers: { cookie: p.cookie } }
    : { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: p.cookie }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
async function connect(p) {
  const ws = new WebSocket(`${wsUrl}?session=${p.token}`);
  const inbox = [], waiters = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    const i = waiters.findIndex(w => w.t === m.t);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(m); else inbox.push(m);
  };
  await new Promise(r => { ws.onopen = r; });
  const c = {
    send: m => ws.send(JSON.stringify(m)),
    next: (t, ms = 3000) => {
      const i = inbox.findIndex(m => m.t === t);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = { t, resolve };
        waiters.push(w);
        setTimeout(() => { if (waiters.includes(w)) { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`${p.name}: no ${t}`)); } }, ms);
      });
    },
    has: t => inbox.some(m => m.t === t),
    close: () => ws.close(),
  };
  c.send({ t: 'hello' });
  await c.next('welcome');
  return c;
}
const deck = id => { const d = starterDecks(id)[0]; return { archetype: d.archetype, cards: d.cards, name: d.name }; };

// ---------------------------------------------------------------- the ladder itself

test('ranks: stars, divisions, floors, streaks and Meta', () => {
  assert.equal(rankOf(0).label, 'Bronze 5');
  assert.equal(rankOf(14).label, 'Bronze 1');
  assert.equal(rankOf(15).label, 'Silver 5');
  assert.equal(rankOf(META_STARS).label, 'Meta');
  let r = newRank();
  r = applyResult(r, false).rank;
  assert.equal(r.stars, 0, "can't drop below Bronze 5");
  for (let i = 0; i < 3; i++) r = applyResult(r, true).rank;
  assert.equal(r.stars, 4, 'the third win in a row is worth two stars');
  r = { ...r, stars: TIER_STARS, peak: TIER_STARS, streak: 0 };
  const { rank: after, change } = applyResult(r, false);
  assert.equal(change, 0, 'a tier, once reached, is kept');
  assert.equal(after.stars, TIER_STARS);
});

test('a new season drops four divisions and hands out last season’s rewards', () => {
  const r = { season: '2026-10', stars: 40, peak: 46, streak: 2, games: 30, wins: 20 };
  const { rank, ended } = rollSeason(r, new Date('2026-11-14T12:00:00Z'));
  assert.equal(rank.season, '2026-11');
  assert.equal(rank.stars, 27); // 40 - 12 = 28, back to the start of its division
  assert.equal(rank.games, 0);
  assert.equal(ended.peak, 46);
  assert.ok(ended.rewards.some(x => x.type === 'pack'));
  assert.equal(rollSeason(rank, new Date('2026-11-20T12:00:00Z')).ended, null, 'once');
});

test('deck codes round-trip every starter and reject damaged codes', () => {
  for (const d of DECKS) {
    for (const s of starterDecks(d.id)) {
      const back = decodeDeck(encodeDeck(s.archetype, s.cards));
      assert.equal(back.archetype, d.id);
      assert.deepEqual([...back.cards].sort(), [...s.cards].sort());
    }
  }
  const code = encodeDeck('RPG', starterDecks('RPG')[0].cards);
  assert.throws(() => decodeDeck(code.slice(0, -2)), /mistyped|out of date/);
  assert.throws(() => decodeDeck(code.replace('MD1', 'MD9')), /newer version/);
  assert.throws(() => decodeDeck('hello'), /isn’t a MetaDeck deck code/);
  assert.equal(decodeDeck(code.replace('-RPG-', '-rpg-')).archetype, 'RPG', 'the archetype ignores case');
});

// ---------------------------------------------------------------- friends, blocks, reports

test('friend requests, accepting, unfriending', async () => {
  const a = await player(), b = await player();
  assert.equal((await api(a, 'friend', { name: b.name })).body.requested, true);
  assert.deepEqual((await api(b, 'friends')).body.incoming, [a.name]);
  assert.equal((await api(b, 'friend', { name: a.name })).body.accepted, true);
  assert.deepEqual((await api(a, 'friends')).body.friends.map(f => f.name), [b.name]);
  assert.equal((await api(a, 'friend', { name: a.name })).status, 400, 'not yourself');
  assert.equal((await api(a, 'friend', { name: 'Nobody_here' })).status, 400);
  await api(b, 'unfriend', { name: a.name });
  assert.deepEqual((await api(a, 'friends')).body.friends, []);
  assert.equal((await api(a, 'friends', undefined)).status, 200);
});

test('blocking ends a friendship and stops requests both ways', async () => {
  const a = await player(), b = await player();
  await api(a, 'friend', { name: b.name });
  await api(b, 'friend', { name: a.name });
  await api(a, 'block', { name: b.name });
  assert.deepEqual((await api(a, 'friends')).body.friends, []);
  assert.deepEqual((await api(a, 'friends')).body.blocked, [b.name]);
  assert.equal((await api(b, 'friend', { name: a.name })).status, 400);
  await api(a, 'unblock', { name: b.name });
  assert.equal((await api(b, 'friend', { name: a.name })).status, 200);
});

test('reports need a reason, and repeats are filed once', async () => {
  const a = await player(), b = await player();
  assert.equal((await api(a, 'report', { name: b.name, reason: 'because' })).status, 400);
  assert.equal((await api(a, 'report', { name: b.name, reason: 'abuse', note: 'mean emotes' })).body.ok, true);
  assert.equal((await api(a, 'report', { name: b.name, reason: 'abuse' })).body.duplicate, true);
  const open = social.reports().filter(r => r.reported_name === b.name);
  assert.equal(open.length, 1);
  assert.equal(open[0].reporter, a.name);
  assert.equal(social.resolveReport(open[0].id), true);
  assert.equal(social.reports().filter(r => r.reported_name === b.name).length, 0);
});

// ---------------------------------------------------------------- ranked play

test('quick find between two accounts is ranked: stars, rating, history and leaderboard', async () => {
  const a = await player('R'), b = await player('R');
  const [ca, cb] = await Promise.all([connect(a), connect(b)]);
  ca.send({ t: 'queue', deck: deck('FPS') });
  assert.equal((await ca.next('queued')).ranked, true);
  cb.send({ t: 'queue', deck: deck('RPG') });
  const [sa] = await Promise.all([ca.next('start'), cb.next('start')]);
  assert.equal(sa.ranked, true);
  cb.send({ t: 'leave' }); // b forfeits: a wins
  const [ra, rb] = await Promise.all([ca.next('rewards'), cb.next('rewards')]);
  assert.equal(ra.ranked.change, 1);
  assert.equal(ra.ranked.after.stars, 1);
  assert.equal(rb.ranked.change, 0, 'no stars to lose at Bronze 5');
  assert.ok(accounts.userByKey(a.name.toLowerCase()).rating > 1500);
  assert.ok(accounts.userByKey(b.name.toLowerCase()).rating < 1500);

  const hist = (await api(a, 'history')).body;
  assert.equal(hist.matches[0].result, 'win');
  assert.equal(hist.matches[0].rated, true);
  assert.equal(hist.matches[0].opponent, b.name);
  assert.equal(hist.matches[0].stars, 1);
  assert.equal(hist.rank.stars, 1);
  assert.ok(hist.decks.some(d => d.deck === 'FPS' && d.wins === 1));
  const board = (await api(a, 'leaderboard')).body.players;
  assert.ok(board.findIndex(p => p.name === a.name) < board.findIndex(p => p.name === b.name));
  assert.equal((await api(a, 'me')).body.rank.label, 'Bronze 5');
  const idle = await player('Idle');
  await api(idle, 'me'); // seen their rank, never played ranked
  assert.ok(!(await api(a, 'leaderboard')).body.players.some(p => p.name === idle.name), 'no ranked games, not on the board');
  ca.close(); cb.close();
});

test('the same two players only count for ranked a few times a day', async () => {
  const a = await player('W'), b = await player('W');
  const [ca, cb] = await Promise.all([connect(a), connect(b)]);
  const changes = [];
  for (let i = 0; i < 4; i++) {
    // Keep the two within each other's matchmaking window (wins move ratings apart).
    for (const x of [a, b]) accounts.userByKey(x.name.toLowerCase()).rating = 1500;
    ca.send({ t: 'queue', deck: deck('FPS') });
    await ca.next('queued');
    cb.send({ t: 'queue', deck: deck('RPG') });
    await Promise.all([ca.next('start'), cb.next('start')]);
    cb.send({ t: 'leave' });
    const r = await ca.next('rewards');
    changes.push(r.ranked?.change ?? null);
    if (i === 3) assert.equal(r.rankedSkipped, true);
    ca.send({ t: 'leave' });
    await new Promise(res => setTimeout(res, 50));
  }
  assert.deepEqual(changes.slice(0, 3).every(c => c > 0), true);
  assert.equal(changes[3], null);
  ca.close(); cb.close();
});

test('matchmaking waits for a close rating, and never pairs players who blocked each other', async () => {
  const a = await player('M'), b = await player('M'), c = await player('M');
  accounts.userByKey(b.name.toLowerCase()).rating = 2400; // far out of a's window
  await api(a, 'block', { name: c.name });
  const [ca, cb, cc] = await Promise.all([connect(a), connect(b), connect(c)]);
  ca.send({ t: 'queue', deck: deck('FPS') });
  await ca.next('queued');
  cb.send({ t: 'queue', deck: deck('RPG') });
  await cb.next('queued');
  cc.send({ t: 'queue', deck: deck('Horror') });
  await cc.next('queued');
  await new Promise(r => setTimeout(r, 300));
  assert.ok(!ca.has('start') && !cb.has('start') && !cc.has('start'), 'nobody paired yet');
  for (const x of [ca, cb, cc]) { x.send({ t: 'cancel' }); x.close(); }
});

// ---------------------------------------------------------------- challenges and emotes

test('challenge a friend in the lobby; they can join or decline', async () => {
  const a = await player('C'), b = await player('C'), stranger = await player('C');
  await api(a, 'friend', { name: b.name });
  await api(b, 'friend', { name: a.name });
  const [ca, cb, cs] = await Promise.all([connect(a), connect(b), connect(stranger)]);

  cs.send({ t: 'challenge', to: a.name, deck: deck('FPS') });
  assert.match((await cs.next('error')).message, /isn’t in the online lobby/, 'only friends');

  ca.send({ t: 'challenge', to: b.name, deck: deck('FPS') });
  const hosting = await ca.next('hosting');
  assert.equal(hosting.challenge, b.name);
  const invite = await cb.next('invite');
  assert.equal(invite.from, a.name);
  cb.send({ t: 'decline', code: invite.code });
  assert.match((await ca.next('error')).message, /can’t play right now/);

  ca.send({ t: 'challenge', to: b.name, deck: deck('FPS') });
  const again = await cb.next('invite');
  cb.send({ t: 'join', code: again.code, deck: deck('RPG') });
  const [sa] = await Promise.all([ca.next('start'), cb.next('start')]);
  assert.equal(sa.ranked, false, 'friendly matches are unranked');

  // Emotes: preset ids only, relayed to both seats, rate limited.
  ca.send({ t: 'emote', id: 'wellplayed' });
  assert.deepEqual([(await ca.next('emote')).id, (await cb.next('emote')).id], ['wellplayed', 'wellplayed']);
  ca.send({ t: 'emote', id: 'gg' });           // too soon
  ca.send({ t: 'emote', id: '<script>' });     // not an emote
  await new Promise(r => setTimeout(r, 200));
  assert.ok(!cb.has('emote'));
  ca.send({ t: 'leave' });
  for (const x of [ca, cb, cs]) x.close();
});

// ---------------------------------------------------------------- moderation

test('admin rename moves the account with its friends and history; bans lock it out', async () => {
  const a = await player('Old'), b = await player('B');
  await api(a, 'friend', { name: b.name });
  await api(b, 'friend', { name: a.name });
  assert.equal(accounts.rename(a.name, 'Fresh_Name').ok, true);
  assert.equal((await api(a, 'me')).body.name, 'Fresh_Name', 'still signed in');
  assert.deepEqual((await api(b, 'friends')).body.friends.map(f => f.name), ['Fresh_Name']);
  assert.equal(accounts.rename('Fresh_Name', b.name).ok, false, 'taken');

  assert.equal(accounts.setBanned('Fresh_Name').banned, true);
  assert.equal((await api(a, 'me')).status, 401);
  assert.match((await accounts.signIn('Fresh_Name', 'longenough')).reason, /banned/);
  assert.deepEqual((await api(b, 'friends')).body.friends, [], 'banned players drop out of friend lists');
  accounts.setBanned('Fresh_Name', false);
  assert.equal((await accounts.signIn('Fresh_Name', 'longenough')).ok, true);
});

test('names that aren’t allowed are refused at sign-up', async () => {
  const res = await fetch(`${base}/api/account/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-ip': '10.8.0.1' },
    body: JSON.stringify({ name: 'MetaDeck_Admin', password: 'longenough', birthYear: 2000 }),
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).reason, /isn’t allowed/);
});
