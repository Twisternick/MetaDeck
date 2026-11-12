// Online play: real HTTP server + WebSocket clients (Node's built-in WebSocket) driving the lobby.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { acceptWebSocket } from '../server/ws.mjs';
import { createLobby } from '../server/lobby.mjs';
import { starterDecks } from '../src/data/index.js';
import { legalActions, decisionPlayer } from '../src/engine/game.js';

let server, lobby, url;

before(async () => {
  lobby = createLobby({ turnMs: 400, responseMs: 200, graceMs: 300 });
  server = http.createServer((req, res) => res.end());
  server.on('upgrade', (req, socket) => acceptWebSocket(req, socket, ws => lobby.connect(ws)));
  await new Promise(r => server.listen(0, r));
  url = `ws://127.0.0.1:${server.address().port}/ws`;
});

after(() => {
  lobby.close();
  server.close();
});

const deck = id => { const d = starterDecks(id)[0]; return { archetype: d.archetype, cards: d.cards, name: d.name }; };

// A client that records every message and can wait for one of a given type.
async function client(name, token) {
  const ws = new WebSocket(url);
  const inbox = [];
  const waiters = [];
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    const i = waiters.findIndex(w => w.match(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg); else inbox.push(msg);
  };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  const c = {
    ws,
    send: msg => ws.send(JSON.stringify(msg)),
    next(t, pred = () => true) {
      const match = m => m.t === t && pred(m);
      const i = inbox.findIndex(match);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = { match, resolve };
        waiters.push(w);
        setTimeout(() => { if (waiters.includes(w)) { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`${name}: no '${t}' message`)); } }, 3000);
      });
    },
    close: () => ws.close(),
  };
  c.send({ t: 'hello', name, token });
  c.welcome = await c.next('welcome');
  return c;
}

test('quick find pairs two players and hides the opponent hand', async () => {
  const a = await client('Ana');
  const b = await client('Ben');
  a.send({ t: 'queue', deck: deck('FPS') });
  await a.next('queued');
  b.send({ t: 'queue', deck: deck('Horror') });
  const [sa, sb] = await Promise.all([a.next('start'), b.next('start')]);
  assert.deepEqual([sa.seat, sb.seat].sort(), [0, 1]);
  assert.equal(sa.opponent.name, 'Ben');
  assert.equal(sa.visibility, 'quick');
  const mine = sa.state.players[sa.seat];
  const theirs = sa.state.players[1 - sa.seat];
  assert.ok(mine.hand.every(c => typeof c.id === 'string'));
  assert.ok(theirs.hand.length > 0 && theirs.hand.every(c => c.hidden && c.id === undefined && c.uid === undefined));
  assert.ok(mine.deck.every(c => c.hidden && c.id === undefined));
  assert.equal(sa.state.rng, 0);
  a.send({ t: 'leave' });
  b.send({ t: 'leave' });
  a.close(); b.close();
});

test('private room: join by code, play actions, reject out-of-turn moves, forfeit on leave', async () => {
  const host = await client('Host');
  const guest = await client('Guest');
  host.send({ t: 'host', visibility: 'private', deck: deck('RPG') });
  const { code } = await host.next('hosting');
  assert.match(code, /^[A-Z2-9]{5}$/);
  const lobbyMsg = await guest.next('lobby');
  assert.ok(!lobbyMsg.rooms.some(r => r.code === code), 'private rooms are not listed');

  guest.send({ t: 'join', code: code.toLowerCase(), deck: deck('Racing') });
  const [sh, sg] = await Promise.all([host.next('start'), guest.next('start')]);
  const bySeat = { [sh.seat]: [host, sh], [sg.seat]: [guest, sg] };
  const toMove = decisionPlayer(sh.state);
  const [mover, moverStart] = bySeat[toMove];
  const [waiter] = bySeat[1 - toMove];

  waiter.send({ t: 'action', action: { type: 'end' } });
  assert.match((await waiter.next('reject')).reason, /not your move/);

  // Play whatever the mover can play from its own (unredacted) view, then end the turn.
  const play = legalActions(moverStart.state).find(a => a.type === 'play');
  if (play) {
    mover.send({ t: 'action', action: play });
    const [um, uw] = await Promise.all([mover.next('update'), waiter.next('update')]);
    assert.equal(um.card, uw.card);
    assert.ok(uw.state.players[toMove].hand.every(c => c.hidden));
  }
  mover.send({ t: 'action', action: { type: 'end' } });
  const ended = await waiter.next('update', m => m.action?.type === 'end');
  assert.equal(ended.state.active, 1 - toMove);
  assert.ok(ended.events.filter(e => e.type === 'draw').every(e => e.pid !== toMove || e.uid === undefined));

  host.send({ t: 'leave' });
  const fin = await guest.next('update', m => m.forfeit !== undefined);
  assert.equal(fin.state.over, true);
  assert.equal(fin.state.winner, sg.seat);
  await guest.next('opponentLeft');
  host.close(); guest.close();
});

test('open rooms are listed and anyone can join from the list', async () => {
  const host = await client('Opener');
  const browser = await client('Browser');
  host.send({ t: 'host', visibility: 'open', deck: deck('Sports') });
  const { code } = await host.next('hosting');
  const listed = await browser.next('lobby', m => m.rooms.some(r => r.code === code));
  assert.equal(listed.rooms.find(r => r.code === code).host, 'Opener');
  browser.send({ t: 'join', code, deck: deck('Strategy') });
  await Promise.all([host.next('start'), browser.next('start')]);
  const after = await (await client('Late')).next('lobby');
  assert.ok(!after.rooms.some(r => r.code === code), 'a started room leaves the list');
  host.close(); browser.close();
});

test('illegal decks and unknown codes are refused', async () => {
  const c = await client('Cheater');
  c.send({ t: 'queue', deck: { archetype: 'FPS', cards: Array(40).fill(deck('FPS').cards[0]) } });
  assert.match((await c.next('error')).message, /legal/);
  c.send({ t: 'join', code: 'ZZZZZ', deck: deck('FPS') });
  assert.match((await c.next('error')).message, /No room/);
  c.close();
});

test('the turn clock ends an idle turn', async () => {
  const a = await client('Slow');
  const b = await client('Slower');
  a.send({ t: 'host', visibility: 'private', deck: deck('Fighting') });
  const { code } = await a.next('hosting');
  b.send({ t: 'join', code, deck: deck('Platformer') });
  const s = await a.next('start');
  const timedOut = await a.next('update', m => m.timeout);
  assert.equal(timedOut.action.type, 'end');
  assert.equal(timedOut.state.active, 1 - decisionPlayer(s.state));
  a.close(); b.close();
});

test('a dropped player can reconnect with their token, or forfeits after the grace period', async () => {
  const a = await client('Flaky');
  const b = await client('Steady');
  a.send({ t: 'host', visibility: 'private', deck: deck('CityBuilder') });
  const { code } = await a.next('hosting');
  b.send({ t: 'join', code, deck: deck('CardGame') });
  const sa = await a.next('start');
  await b.next('start');

  a.close();
  await b.next('opponentAway');
  const back = await client('Flaky', a.welcome.token);
  const resync = await back.next('start');
  assert.equal(resync.seat, sa.seat);
  await b.next('opponentBack');

  back.close();
  const fin = await b.next('update', m => m.forfeit !== undefined);
  assert.equal(fin.state.winner, 1 - sa.seat);
  b.close();
});
