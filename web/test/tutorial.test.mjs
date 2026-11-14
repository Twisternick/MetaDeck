// The tutorial's script played through the real engine: every step must become reachable in order,
// allow at least one legal move, and the match must end in a win. A card or rules change that breaks
// the script (a cost, a stat, a keyword) fails here instead of stranding a new player mid-tutorial.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, applyAction, legalActions, decisionPlayer } from '../src/engine/game.js';
import { ME, AI, ENEMY_HP, MY_DECK, AI_DECK, STEPS, enemyMove } from '../src/ui/tutorial-script.js';

test('the tutorial plays from start to a win, one step at a time', () => {
  const s = createGame({ decks: [MY_DECK, AI_DECK], deckIds: ['RPG', 'Sports'], firstPlayer: ME, seed: 1, shuffle: () => {} });
  s.players[AI].hp = ENEMY_HP;
  let step = 1; // step 0 is the welcome
  const reached = new Set([0]);
  for (let guard = 0; !s.over; guard++) {
    assert.ok(guard < 200, 'the tutorial never ends');
    while (step < STEPS.length && STEPS[step].done?.(s)) step++;
    if (s.over) break;
    let action;
    if (decisionPlayer(s) === AI) {
      action = enemyMove(s);
    } else {
      const st = STEPS[step];
      assert.ok(st, 'ran out of steps before winning');
      assert.ok(!st.when || st.when(s), `step ${step} is waiting, but it's the player's move (turn ${s.turn})`);
      reached.add(step);
      action = legalActions(s).find(a => st.allow(a, s));
      assert.ok(action, `step ${step} allows no legal move (turn ${s.turn})`);
    }
    const res = applyAction(s, action);
    assert.equal(res.ok, true, `${JSON.stringify(action)}: ${res.reason}`);
    s.events.length = 0;
  }
  assert.equal(s.winner, ME);
  assert.deepEqual([...reached].sort((a, b) => a - b), STEPS.map((_, i) => i), 'every step came up');
});
