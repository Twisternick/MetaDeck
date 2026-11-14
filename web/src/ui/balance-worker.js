// Balance lab worker: plays one AI-vs-AI pairing at a time and reports every game as it finishes.
// Same loop as tools/simulate.mjs, so the numbers match `npm run simulate`.

import { createGame, applyAction } from '../engine/game.js';
import { chooseAction } from '../engine/ai.js';
import { deckList } from '../data/index.js';
import { leadTracker } from '../engine/snowball.js';

self.onmessage = ({ data: job }) => {
  // a / b are the lab's deck keys ('FPS' or 'FPS:starter:0'); aArch / bArch the archetypes they belong to;
  // aCards / bCards the lists to play (the archetype's full pool when left out).
  const { key, a, b, games, seed } = job;
  const aArch = job.aArch ?? a, bArch = job.bArch ?? b;
  const decks = [job.aCards ?? deckList(aArch), job.bCards ?? deckList(bArch)];
  for (let g = 0; g < games; g++) {
    const first = g % 2;
    const state = createGame({ decks, deckIds: [aArch, bArch], seed: seed + g, firstPlayer: first });
    const played = [new Map(), new Map()]; // card id -> turn it was first played
    const lead = leadTracker();
    let guard = 0;
    while (!state.over && guard++ < 4000) {
      const action = chooseAction(state);
      const res = applyAction(state, action);
      if (!res.ok) { self.postMessage({ type: 'error', key, message: `AI chose an illegal action (${res.reason})` }); return; }
      for (const e of state.events) if (e.type === 'play' && !played[e.pid].has(e.id)) played[e.pid].set(e.id, state.turn);
      lead.watch(state);
      state.log.length = 0;
      state.events.length = 0;
    }
    self.postMessage({ type: 'game', key, result: { a, b, first, winner: state.over ? state.winner : 'draw', turns: state.turn, played: played.map(p => [...p]), ...lead.result() } });
  }
  self.postMessage({ type: 'done', key });
};
