// Online play assumes hostile clients. These tests attack the real server (serve.mjs in a child
// process) and a lobby with tight limits: path traversal, the report endpoint, cross-site sockets,
// malformed frames, floods, connection caps, escaping a match without forfeiting, stalling, and
// predicting the shuffle.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acceptWebSocket } from '../server/ws.mjs';
import { createLobby } from '../server/lobby.mjs';
import { starterDecks } from '../src/data/index.js';
import { decisionPlayer } from '../src/engine/game.js';

let site, siteUrl, server, lobby, wsUrl;

before(async () => {
  site = spawn(process.execPath, [fileURLToPath(new URL('../serve.mjs', import.meta.url)), '0'], { stdio: ['ignore', 'pipe', 'inherit'] });
  siteUrl = await new Promise((resolve, reject) => {
    site.stdout.on('data', d => { const m = /http:\/\/localhost:(\d+)/.exec(String(d)); if (m) resolve(`http://127.0.0.1:${m[1]}`); });
    site.on('exit', () => reject(new Error('serve.mjs exited')));
  });

  lobby = createLobby({ turnMs: 150, responseMs: 100, graceMs: 300, idleTurns: 2, helloMs: 200, maxPerIp: 3, rate: { burst: 5, perSec: 5 } });
  server = http.createServer((req, res) => res.end());
  server.on('upgrade', (req, socket) => acceptWebSocket(req, socket, ws => lobby.connect(ws)));
  await new Promise(r => server.listen(0, r));
  wsUrl = `ws://127.0.0.1:${server.address().port}/ws`;
});

after(() => {
  site.kill();
  lobby.close();
  server.close();
});

const deck = id => { const d = starterDecks(id)[0]; return { archetype: d.archetype, cards: d.cards, name: d.name }; };

function client(name, url = wsUrl) {
  const ws = new WebSocket(url);
  const inbox = [];
  const waiters = [];
  let closed = false;
  const closedP = new Promise(r => ws.addEventListener('close', () => { closed = true; r(); }));
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    const i = waiters.findIndex(w => w.match(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg); else inbox.push(msg);
  };
  const c = {
    ws,
    opened: new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }),
    closed: closedP,
    get isClosed() { return closed; },
    send: msg => ws.send(JSON.stringify(msg)),
    next(t, pred = () => true, ms = 3000) {
      const match = m => m.t === t && pred(m);
      const i = inbox.findIndex(match);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = { match, resolve };
        waiters.push(w);
        setTimeout(() => { if (waiters.includes(w)) { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`${name}: no '${t}' message`)); } }, ms);
      });
    },
    async hello() {
      await c.opened;
      c.send({ t: 'hello', name });
      c.welcome = await c.next('welcome');
      return c;
    },
    close: () => ws.close(),
  };
  return c;
}

const get = (path, headers = {}) => new Promise((resolve, reject) => {
  const u = new URL(siteUrl);
  // A raw request, so paths like /../ reach the server unnormalized.
  http.get({ host: u.hostname, port: u.port, path, headers }, res => {
    let body = '';
    res.on('data', d => { body += d; });
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
  }).on('error', reject);
});

test('the site serves only the game, with security headers', async () => {
  const home = await get('/');
  assert.equal(home.status, 200);
  assert.match(home.headers['content-security-policy'], /script-src 'self'/);
  assert.match(home.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(home.headers['x-content-type-options'], 'nosniff');
  assert.equal((await get('/src/engine/game.js')).status, 200);

  for (const path of ['/server/lobby.mjs', '/serve.mjs', '/package.json', '/reports/meta-latest.md', '/tools/simulate.mjs',
    '/src/../server/lobby.mjs', '/src/%2e%2e/serve.mjs', '/src/..%5cserve.mjs', '/assets/../../.git/config', '/src/%00', '/%', '/src']) {
    assert.equal((await get(path)).status, path === '/%' ? 400 : 404, path);
  }
  // The server is still up after all of that.
  assert.equal((await get('/index.html')).status, 200);
});

test('Balance lab reports are only accepted as same-origin JSON addressed to localhost', async () => {
  const post = (headers, body = '{"markdown":"x"}') => new Promise((resolve, reject) => {
    const u = new URL(siteUrl);
    const req = http.request({ host: u.hostname, port: u.port, path: '/api/meta-report', method: 'POST', headers }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end(body);
  });
  const port = new URL(siteUrl).port;
  // A cross-site form (text/plain), another site's page, and a DNS-rebinding hostname are all refused.
  assert.equal(await post({ 'Content-Type': 'text/plain', Host: `localhost:${port}` }), 403);
  assert.equal(await post({ 'Content-Type': 'application/json', Host: `localhost:${port}`, Origin: 'https://evil.example' }), 403);
  assert.equal(await post({ 'Content-Type': 'application/json', Host: `evil.example:${port}`, Origin: `http://evil.example:${port}` }), 403);
  assert.equal(await post({ 'Content-Type': 'application/json', Host: `localhost:${port}` }, 'not json'), 400);
});

test("another site's page can't open the game socket", async () => {
  const port = new URL(siteUrl).port;
  const answer = await new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1', () => sock.write([
      'GET /ws HTTP/1.1', `Host: localhost:${port}`, 'Upgrade: websocket', 'Connection: Upgrade',
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version: 13', 'Origin: https://evil.example', '', '',
    ].join('\r\n')));
    let data = '';
    sock.on('data', d => { data += d; });
    sock.on('end', () => resolve(data));
    sock.on('error', reject);
  });
  assert.match(answer, /^HTTP\/1\.1 403/);
  // The game's own page can.
  const ok = client('Local', siteUrl.replace('http', 'ws') + '/ws');
  await ok.hello();
  ok.close();
});

test('malformed frames close the connection', async () => {
  const port = server.address().port;
  const handshake = sock => sock.write([
    'GET /ws HTTP/1.1', `Host: 127.0.0.1:${port}`, 'Upgrade: websocket', 'Connection: Upgrade',
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version: 13', '', '',
  ].join('\r\n'));
  const frames = {
    unmasked: Buffer.from([0x81, 0x02, 0x7b, 0x7d]),
    huge: Buffer.from([0x81, 0xff, 0, 0, 0, 0, 0x7f, 0xff, 0xff, 0xff, 1, 2, 3, 4]),
    unknownOpcode: Buffer.from([0x83, 0x80, 1, 2, 3, 4]),
    strayContinuation: Buffer.from([0x80, 0x80, 1, 2, 3, 4]),
  };
  for (const [name, frame] of Object.entries(frames)) {
    const ended = await new Promise((resolve, reject) => {
      const sock = net.connect(port, '127.0.0.1', () => handshake(sock));
      let upgraded = false;
      sock.on('data', d => { if (!upgraded && String(d).startsWith('HTTP/1.1 101')) { upgraded = true; sock.write(frame); } });
      sock.on('close', () => resolve(upgraded));
      sock.on('error', reject);
      setTimeout(() => { sock.destroy(); resolve('still open'); }, 1500);
    });
    assert.equal(ended, true, name);
  }
});

test('a connection that never says hello is dropped', async () => {
  const c = client('Silent');
  await c.opened;
  await c.closed;
  assert.ok(c.isClosed);
});

test('flooding gets throttled, then disconnected', async () => {
  const c = await client('Spammer').hello();
  for (let i = 0; i < 60; i++) c.send({ t: 'lobby' });
  assert.match((await c.next('error')).message, /Slow down/);
  await c.closed;
});

test('each address has a connection cap', async () => {
  const cs = [await client('A').hello(), await client('B').hello(), await client('C').hello()];
  const extra = client('D');
  await extra.opened;
  assert.match((await extra.next('error')).message, /Too many connections/);
  await extra.closed;
  cs.forEach(c => c.close());
  await Promise.all(cs.map(c => c.closed));
});

test("names can't carry control, zero-width or text-direction characters", async () => {
  const c = client('x');
  await c.opened;
  c.send({ t: 'hello', name: '  Ad​min‮\u0007  <b>  Bob﻿   ' });
  assert.equal((await c.next('welcome')).name, 'Admin b Bob');
  c.close();
  await c.closed;
});

test("a player can't walk out of a running match without forfeiting, and stalling forfeits", async () => {
  const a = await client('Runner').hello();
  const b = await client('Waiter').hello();
  a.send({ t: 'host', visibility: 'private', deck: deck('Horror') });
  const { code } = await a.next('hosting');
  b.send({ t: 'join', code, deck: deck('RPG') });
  const [sa] = await Promise.all([a.next('start'), b.next('start')]);

  a.send({ t: 'queue', deck: deck('Horror') });
  assert.match((await a.next('error')).message, /current match/);
  b.send({ t: 'host', visibility: 'open', deck: deck('RPG') });
  assert.match((await b.next('error')).message, /current match/);

  // Nobody moves: whoever runs out the clock twice in a row forfeits.
  const first = decisionPlayer(sa.state);
  const warned = await a.next('update', m => m.timeout && m.actor === first);
  assert.deepEqual(warned.idle, { missed: 1, limit: 2 }, 'the client is told how close it is to forfeiting');
  const fin = await a.next('update', m => m.forfeit !== undefined, 3000);
  assert.equal(fin.state.over, true);
  assert.equal(fin.forfeit, first);
  assert.match(fin.state.log.at(-1).text, /stopped taking turns and forfeits\.$/);
  a.close(); b.close();
  await Promise.all([a.closed, b.closed]);
});

test('online decks are not shuffled from a guessable seed', async () => {
  // Two matches with identical decks almost never deal the same opening hands. More to the point, the
  // RNG state is never sent, and the server's opening shuffle doesn't use the engine's seeded RNG.
  const hands = [];
  for (let i = 0; i < 2; i++) {
    const a = await client('S1').hello();
    const b = await client('S2').hello();
    a.send({ t: 'host', visibility: 'private', deck: deck('FPS') });
    const { code } = await a.next('hosting');
    b.send({ t: 'join', code, deck: deck('FPS') });
    const s = await a.next('start');
    assert.equal(s.state.rng, 0);
    hands.push(s.state.players[s.seat].hand.map(c => c.uid).join());
    a.send({ t: 'leave' });
    a.close(); b.close();
    await Promise.all([a.closed, b.closed]);
  }
  assert.notEqual(hands[0], hands[1]);
});
