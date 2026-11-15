// Per-archetype looks: a deck can have its own card back, arena and frame; anything it doesn't pick uses
// the default; picks for things no longer owned (or decks that don't exist) are dropped.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runOp, normalizeProfile, loadoutFor, makeFounder, unmakeFounder } from '../src/data/economy.js';

const owning = (...ids) => { const p = normalizeProfile(null); p.cosmetics.owned.push(...ids); return p; };

test('a deck can have its own back, arena and frame; the rest follow the default', () => {
  const p = owning('back:chequered-flag', 'arena:night-circuit', 'back:aurora');
  assert.equal(runOp(p, 'equip', { id: 'back:aurora' }).ok, true); // the default
  assert.equal(runOp(p, 'equip', { id: 'back:chequered-flag', deck: 'Racing' }).ok, true);
  assert.equal(runOp(p, 'equip', { id: 'arena:night-circuit', deck: 'Racing' }).ok, true);
  assert.deepEqual(loadoutFor(p, 'Racing'), { back: 'back:chequered-flag', arena: 'arena:night-circuit', frame: 'frame:standard' });
  assert.deepEqual(loadoutFor(p, 'RPG'), { back: 'back:aurora', arena: 'arena:standard', frame: 'frame:standard' }, 'other decks use the defaults');
  assert.deepEqual(loadoutFor(p), loadoutFor(p, 'RPG'));
  assert.equal(p.cosmetics.back, 'back:aurora', 'a deck pick leaves the default alone');

  assert.equal(runOp(p, 'unequip', { kind: 'back', deck: 'Racing' }).ok, true);
  assert.equal(loadoutFor(p, 'Racing').back, 'back:aurora', 'back to the default');
  assert.equal(loadoutFor(p, 'Racing').arena, 'arena:night-circuit', 'the arena pick stays');
  assert.equal(runOp(p, 'unequip', { kind: 'back', deck: 'Racing' }).ok, false, 'nothing left to reset');
});

test('only owned cosmetics, real decks and the right kinds can be picked', () => {
  const p = owning('back:aurora');
  assert.equal(runOp(p, 'equip', { id: 'back:gold-circuit', deck: 'Racing' }).ok, false, 'not owned');
  assert.equal(runOp(p, 'equip', { id: 'back:aurora', deck: 'NotADeck' }).ok, false);
  assert.equal(runOp(p, 'equip', { id: 'back:classic', deck: 'Horror' }).ok, true, 'defaults are owned by everyone');
});

test('picks that no longer apply are dropped when the profile loads, and when founder items go', () => {
  const p = owning('back:aurora');
  runOp(p, 'equip', { id: 'back:aurora', deck: 'Horror' });
  const raw = JSON.parse(JSON.stringify(p));
  raw.cosmetics.perDeck.Nowhere = { back: 'back:aurora' };
  raw.cosmetics.perDeck.FPS = { back: 'back:gold-circuit', arena: 'back:aurora' }; // not owned; wrong kind
  raw.cosmetics.owned = raw.cosmetics.owned.filter(id => id !== 'back:aurora');
  assert.deepEqual(normalizeProfile(raw).cosmetics.perDeck, {});

  const f = normalizeProfile(null);
  makeFounder(f, 1);
  runOp(f, 'equip', { id: 'frame:founder', deck: 'Racing' });
  assert.equal(loadoutFor(f, 'Racing').frame, 'frame:founder');
  unmakeFounder(f);
  assert.equal(loadoutFor(f, 'Racing').frame, 'frame:standard');
  assert.deepEqual(f.cosmetics.perDeck, {});
});
