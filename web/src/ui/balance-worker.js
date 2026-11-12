// Balance lab worker: plays one AI-vs-AI pairing at a time and reports every game as it finishes.
// Same loop as tools/simulate.mjs, so the numbers match `npm run simulate`.

import { createGame, applyAction } from '../engine/game.js';
import { chooseAction } from '../engine/ai.js';
import { deckList } from '../data/index.js';

self.onmessage = ({ data: job }) => {
  const { key, a, b, games, seed, aCards } = job; // aCards: a deck list for side a (the new player check)
  for (let g = 0; g < games; g++) {
    const first = g % 2;
    const state = createGame({ decks: [aCards ?? deckList(a), deckList(b)], deckIds: [a, b], seed: seed + g, firstPlayer: first });
    const played = [new Set(), new Set()];
    let guard = 0;
    while (!state.over && guard++ < 4000) {
      const action = chooseAction(state);
      const res = applyAction(state, action);
      if (!res.ok) { self.postMessage({ type: 'error', key, message: `AI chose an illegal action (${res.reason})` }); return; }
      for (const e of state.events) if (e.type === 'play') played[e.pid].add(e.id);
      state.log.length = 0;
      state.events.length = 0;
    }
    self.postMessage({ type: 'game', key, result: { a, b, first, winner: state.over ? state.winner : 'draw', turns: state.turn, played: played.map(p => [...p]) } });
  }
  self.postMessage({ type: 'done', key });
};
