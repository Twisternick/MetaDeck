// Card impact: how much more often a deck wins when it plays a card, against games that were in the same spot
// when the card came down. Shared by the Balance lab and tools/simulate.mjs.
//
// A raw "win rate when played" flatters expensive cards (the game has to last, usually with you holding your own,
// before you can cast a 7-drop) and punishes catch-up cards (you play them because you are losing). So each play
// is compared with the deck's win rate over games that reached the same turn, on the same side's turn, with the
// same lead (ahead, even or behind by snowball.js's lead score). Δ is the card's win rate minus that expectation.

import { LEAD_MIN } from './snowball.js';

const LAST_TURN = 24; // later turns share one bucket, so the late-game cells aren't too sparse

// The game situation a side was in at the start of `turn`: turn, whose turn it was, and its lead.
function cell(r, side, turn) {
  const s = (r.scores?.[turn] ?? 0) * (side ? -1 : 1);
  const lead = s >= LEAD_MIN ? 2 : s <= -LEAD_MIN ? 0 : 1;
  const own = (turn % 2 === 1) === (r.first === side) ? 1 : 0;
  return (Math.min(turn, LAST_TURN) * 2 + own) * 3 + lead;
}

export function newCardTally() {
  return { base: {}, cards: {} };
}

// Adds one game ({ first, winner, turns, scores, played: [[[cardId, turn], ...], [...]] }) to the tally.
// deckOf(side) names the group each side's cards are measured against (an archetype, say).
export function tallyCards(t, r, deckOf) {
  for (const side of [0, 1]) {
    const won = r.winner === side ? 1 : r.winner === 'draw' ? 0.5 : 0;
    const deck = deckOf(side);
    const base = (t.base[deck] ??= {});
    for (let turn = 1; turn <= r.turns; turn++) {
      const c = (base[cell(r, side, turn)] ??= [0, 0]);
      c[0] += won;
      c[1]++;
    }
    for (const [id, turn] of r.played[side]) {
      const c = (t.cards[id] ??= { deck, w: 0, n: 0, cells: {} });
      c.w += won;
      c.n++;
      const k = cell(r, side, turn);
      c.cells[k] = (c.cells[k] ?? 0) + 1;
    }
  }
}

// { [cardId]: { deck, n, rate, expected, delta } } for every card played at least once.
export function cardImpact(t) {
  const out = {};
  for (const [id, c] of Object.entries(t.cards)) {
    const base = t.base[c.deck];
    let expected = 0;
    for (const [k, n] of Object.entries(c.cells)) expected += n * (base[k][0] / base[k][1]);
    expected /= c.n;
    out[id] = { deck: c.deck, n: c.n, rate: c.w / c.n, expected, delta: c.w / c.n - expected };
  }
  return out;
}
