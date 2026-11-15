// The AI plays each deck by its style: Aggro races the enemy hero, Control clears the board, and so on.
// A side's style comes from its deck list (data/index.js deckStyle) when the game is created.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, placeMonster } from '../src/engine/game.js';
import { chooseAction, evaluate, STYLE_WEIGHTS } from '../src/engine/ai.js';
import { DECKS, deckList, starterDecks, deckStyle, STYLES } from '../src/data/index.js';

// Player 0 to act on turn 5 with a ready 3/4 and nothing in hand; the enemy has a 2/1 and 20 HP.
function position(style) {
  const filler = Array(30).fill('CCG_M03_MonsterCard');
  const s = createGame({ decks: [filler, filler], seed: 7, firstPlayer: 0 });
  for (const p of s.players) { p.hand = []; p.maxBw = 5; p.bw = 0; }
  s.turn = 5;
  s.players[0].style = style;
  s.players[1].hp = 20;
  const mine = placeMonster(s, 0, 'CCG_M07_DeckboxMimic'); // 3/4
  mine.summonedTurn = 0;
  const theirs = placeMonster(s, 1, 'CCG_M04_WildCard');    // 2/1
  return { s, mine, theirs };
}

test('Aggro hits the enemy hero; Control kills the monster instead', () => {
  const aggro = position('Aggro');
  assert.deepEqual(chooseAction(aggro.s), { type: 'attack', uid: aggro.mine.uid, target: 'P1' });
  const control = position('Control');
  assert.deepEqual(chooseAction(control.s), { type: 'attack', uid: control.mine.uid, target: control.theirs.uid });
});

test('removing an enemy monster matters most to Control, damage to the enemy hero most to Aggro', () => {
  const gain = (style, change) => { const { s } = position(style); const before = evaluate(s, 0); change(s); return evaluate(s, 0) - before; };
  const removeMonster = s => { s.players[1].board = s.players[1].board.map(() => null); };
  const hitFace = s => { s.players[1].hp -= 5; };
  assert.ok(gain('Control', removeMonster) > gain('Midrange', removeMonster) && gain('Midrange', removeMonster) > gain('Aggro', removeMonster));
  assert.ok(gain('Aggro', hitFace) > gain('Midrange', hitFace) && gain('Midrange', hitFace) > gain('Control', hitFace));
});

test('each side plays by its deck’s style: a starter’s own style, otherwise a guess from the curve', () => {
  for (const d of DECKS) {
    for (const st of starterDecks(d.id)) assert.equal(deckStyle(d.id, st.cards), st.style, st.name);
    assert.equal(deckStyle(d.id, deckList(d.id)), 'Midrange', `${d.id} pool plays as Midrange, the AI's old weights`);
  }
  const [aggro, control] = [starterDecks('FPS')[0], starterDecks('FPS')[1]];
  const s = createGame({ decks: [aggro.cards, control.cards], deckIds: ['FPS', 'FPS'], seed: 3 });
  assert.deepEqual(s.players.map(p => p.style), ['Aggro', 'Control']);
  assert.deepEqual(Object.keys(STYLE_WEIGHTS).sort(), Object.keys(STYLES).sort(), 'every style has weights');
  assert.deepEqual(STYLE_WEIGHTS.Midrange, { myLife: 1, theirLife: 1, myBoard: 1, theirBoard: 1.05, myHand: 1.4, theirHand: 1, bw: 1.2, lethal: 30 });
});
