// Snowball check: how often an early lead decides the game. Shared by the Balance lab and tools/simulate.mjs.
//
// A game's lead is scored from player 0's side at the start of turns LEAD_TURNS: board stats (ATK + health)
// plus half the HP difference plus 2 per extra card in hand. A side "leads" when that score is at least LEAD_MIN.

import { boardPower } from './game.js';

export const LEAD_TURNS = [6, 8, 12]; // turn 6 = each player has had three turns
export const LEAD_MIN = 6;
export const FLIPS_FROM = 4; // lead changes count from this turn on, so the empty opening boards don't add noise

export function leadScore(state) {
  const [a, b] = state.players;
  return (boardPower(state, 0) - boardPower(state, 1)) + (a.hp - b.hp) * 0.5 + (a.hand.length - b.hand.length) * 2;
}

// Call watch(state) after every action; result() gives { leads: { 6: score, ... }, scores, flips } for the game
// result, `scores` being the lead score at the start of every turn (card-stats.js uses it).
export function leadTracker() {
  const leads = {}, scores = [];
  let turn = 0, sign = 0, flips = 0;
  return {
    watch(state) {
      if (state.turn === turn) return;
      turn = state.turn;
      const score = leadScore(state);
      scores[turn] = Math.round(score * 2) / 2; // whole and half points, to keep results small
      if (turn < FLIPS_FROM) return;
      if (LEAD_TURNS.includes(turn)) leads[turn] = score;
      const s = Math.sign(score);
      if (s) { if (sign && s !== sign) flips++; sign = s; }
    },
    result: () => ({ leads, scores, flips }),
  };
}

// Adds one game result ({ a, b, winner, leads, flips }, a / b being the two decks' keys) to a running tally.
export function newLeadTally() {
  return { all: {}, lead: {}, behind: {}, flips: 0, flipless: 0, games: 0 };
}

export function tallyLead(t, r) {
  if (r.winner !== 0 && r.winner !== 1 || !r.leads) return;
  t.games++;
  t.flips += r.flips;
  if (!r.flips) t.flipless++;
  const side = [r.a, r.b];
  for (const turn of LEAD_TURNS) {
    const score = r.leads[turn];
    if (score == null || Math.abs(score) < LEAD_MIN) continue;
    const leader = score > 0 ? 0 : 1, won = r.winner === leader ? 1 : 0;
    const add = (map, id, w) => { const c = ((map[id] ??= {})[turn] ??= [0, 0]); c[0] += w; c[1]++; };
    t.all[turn] ??= [0, 0];
    t.all[turn][0] += won;
    t.all[turn][1]++;
    add(t.lead, side[leader], won);
    add(t.behind, side[1 - leader], 1 - won);
  }
}
