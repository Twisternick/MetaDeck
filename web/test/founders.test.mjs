// Meta Founders: the first sign-ups get a number, the title, the founder-only cosmetics, and their Gems
// after a few matches; later sign-ups don't; the operator can grant, revoke and reset; and an online
// opponent sees a founder's title and card frame.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createAccounts } from '../server/accounts.mjs';
import { acceptWebSocket } from '../server/ws.mjs';
import { createLobby } from '../server/lobby.mjs';
import { runOp, normalizeProfile, FOUNDER, FOUNDER_COSMETICS, founderTitle, ownsCosmetic, COSMETICS } from '../src/data/economy.js';
import { starterDecks } from '../src/data/index.js';

let ip = 0;
const signUp = (accounts, name) => accounts.signUp(name, 'longenough', `10.20.0.${++ip}`, 1995);
const profileOf = (accounts, name) => accounts.userByKey(name.toLowerCase()).profile;

test('the first sign-ups are numbered founders with the founder cosmetics; later ones are not', async () => {
  const accounts = createAccounts({ founderSlots: 2 });
  for (const n of ['First_1', 'Second_2', 'Third_3']) await signUp(accounts, n);
  const [a, b, c] = ['First_1', 'Second_2', 'Third_3'].map(n => profileOf(accounts, n));
  assert.deepEqual([a.founder, b.founder, c.founder], [1, 2, null]);
  assert.equal(founderTitle(a.founder), 'Meta Founder #1');
  for (const id of FOUNDER_COSMETICS) {
    assert.ok(ownsCosmetic(a, id), id);
    assert.ok(!ownsCosmetic(c, id), `not ${id}`);
  }
  assert.equal(runOp(a, 'equip', { id: 'frame:founder' }).ok, true);
  assert.equal(a.cosmetics.frame, 'frame:founder');
  assert.equal(runOp(c, 'equip', { id: 'frame:founder' }).ok, false);
  assert.ok(COSMETICS.filter(x => x.founder).every(x => !x.gems && !x.season), 'founder items are never sold or on the track');
  accounts.close();
});

test('founder Gems arrive after the first few matches, once', async () => {
  const accounts = createAccounts();
  await signUp(accounts, 'Gem_Founder');
  const account = { key: 'gem_founder', name: 'Gem_Founder' };
  const outs = [];
  for (let i = 0; i < FOUNDER.gemsAfterGames + 1; i++) outs.push(accounts.recordResult(account, { deckId: 'FPS', won: false, damage: 0 }));
  const p = profileOf(accounts, 'Gem_Founder');
  assert.equal(p.gems, FOUNDER.gems);
  assert.equal(p.founderGems, 'paid');
  assert.deepEqual(outs.map(o => o.founderGems ?? 0), [0, 0, FOUNDER.gems, 0]);
  assert.equal(normalizeProfile(JSON.parse(JSON.stringify(p))).founder, p.founder, 'survives a reload');
  accounts.close();
});

test('the operator can make, unmake and reset founders', async () => {
  const accounts = createAccounts({ founderSlots: 1 });
  await signUp(accounts, 'Dev_Test');
  await signUp(accounts, 'Late_One');
  assert.equal(profileOf(accounts, 'Late_One').founder, null);
  runOp(profileOf(accounts, 'Dev_Test'), 'equip', { id: 'arena:founders-hall' });

  assert.equal(accounts.setFounder('Dev_Test', false).ok, true);
  const p = profileOf(accounts, 'Dev_Test');
  assert.equal(p.founder, null);
  assert.equal(p.cosmetics.arena, 'arena:standard', 'an unmade founder loses the equipped founder arena');
  assert.ok(!ownsCosmetic(p, 'back:founder'));

  assert.equal(accounts.setFounder('Late_One').founder, 1, 'a granted founder gets the next free number after the highest one');
  assert.equal(accounts.founders().length, 1);
  assert.equal(accounts.resetFounders(), 1);
  await signUp(accounts, 'Real_First');
  assert.equal(profileOf(accounts, 'Real_First').founder, 1, 'after a reset, numbering starts again');
  accounts.close();
});

test('an online opponent sees a founder’s title and card frame', async () => {
  const accounts = createAccounts();
  const lobby = createLobby({ accounts, turnMs: 5000 });
  const server = http.createServer((req, res) => res.end());
  server.on('upgrade', (req, socket) => acceptWebSocket(req, socket, ws => {
    ws.account = accounts.accountFor(new URL(req.url, 'http://x').searchParams.get('session'));
    lobby.connect(ws);
  }));
  await new Promise(r => server.listen(0, r));
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
  const a = await signUp(accounts, 'Shown_Off');
  runOp(profileOf(accounts, 'Shown_Off'), 'equip', { id: 'frame:founder' });
  const connect = async (token, name) => {
    const ws = new WebSocket(token ? `${url}?session=${token}` : url);
    const inbox = [];
    ws.onmessage = e => inbox.push(JSON.parse(e.data));
    await new Promise(r => { ws.onopen = r; });
    ws.send(JSON.stringify({ t: 'hello', name }));
    const next = async t => { for (let i = 0; i < 100; i++) { const m = inbox.findIndex(x => x.t === t); if (m >= 0) return inbox.splice(m, 1)[0]; await new Promise(r => setTimeout(r, 20)); } throw new Error(`no ${t}`); };
    await next('welcome');
    return { ws, next, send: m => ws.send(JSON.stringify(m)) };
  };
  const deck = id => { const d = starterDecks(id)[0]; return { archetype: d.archetype, cards: d.cards, name: d.name }; };
  const founder = await connect(a.token, 'x');
  const guest = await connect(null, 'Guesty');
  founder.send({ t: 'queue', deck: deck('FPS') });
  await founder.next('queued');
  guest.send({ t: 'queue', deck: deck('RPG') });
  const [sf, sg] = await Promise.all([founder.next('start'), guest.next('start')]);
  assert.equal(sg.opponent.title, 'Meta Founder #1');
  assert.equal(sg.opponent.frame, 'frame:founder');
  assert.equal(sf.opponent.title, undefined, 'a guest has no title');
  lobby.close(); // closes both sockets and clears every timer before the database goes
  server.close();
  accounts.close();
});
