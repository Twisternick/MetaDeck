// Greedy one-ply AI: try every legal action on a cloned state, score the result with a board
// evaluation, and take the best one if it beats doing nothing. Spells that set up an attack
// (pumps, Rush grants) also get credit for the best attack they enable. The same AI plays both
// sides in tools/simulate.mjs, so it doubles as the balance-testing opponent.
//
// { difficulty: 'easy' } (a new player's first matches) sometimes passes on its best move and takes
// one of the next best instead. It stays deterministic, choosing from a hash of the game state rather
// than Math.random, because the server replays vs-AI matches to check them (server/ai-match.mjs).

import {
  legalActions, applyAction, cloneState, decisionPlayer, monsters, getAttack, getHealth,
  hasKeyword, defOf, effectiveCost,
} from './game.js';

// Bandwidth left unspent at end of turn is wasted, so spending it is worth a little on its own.
// This is what makes the AI cycle card-neutral spells (Draw 1, Copy Card) instead of passing.
const MANA_USE_BONUS = 0.35;

const KEYWORD_VALUE = {
  Guard: 1, Stealth: 1, FirstStrike: 1, Counter: 0.5, PoweredUp: 1.5, Checkpoint: 2, Fortify: 1.5,
  Inspire: 1.5, Haunt: 1, Devour: 1, Suppression: 1, Headshot: 1.5, Generate: 1.5, Tax: 1,
  Topdeck: 1.5, XP: 0.5, DoubleJump: 0.5, Overtake: 0.5,
};

function monsterValue(state, m) {
  const def = defOf(m);
  const hp = getHealth(m);
  if (hp <= 0) return 0;
  const tempAtk = m.mods.filter(x => x.temp).reduce((s, x) => s + x.atk, 0);
  const atk = hasKeyword(m, 'Structure') ? 0 : Math.max(0, getAttack(state, m) - tempAtk);
  let v = atk * 1.1 + hp * 0.9 + 0.5;
  for (const k of [...m.kw, ...m.tempKw]) v += KEYWORD_VALUE[k] ?? 0;
  if (!m.silenced) {
    for (const e of def.effects) {
      const trig = e.trigger || 'play';
      if (trig === 'turnStart' || trig === 'turnEnd' || trig === 'draw' || trig === 'allyDeath') v += 2.5;
      else if (trig === 'death') v += 1.5;
    }
  }
  v += m.xp * 0.6;
  if (state.turn <= m.suppressedUntil && m.owner !== state.active) v -= atk * 0.4;
  return v;
}

// Life is worth more the lower it gets.
const lifeValue = hp => (hp <= 0 ? -1000 : hp * 0.8 - Math.max(0, 12 - hp) * 0.7);

export function evaluate(state, pid) {
  if (state.over) return state.winner === pid ? 1e6 : state.winner === 'draw' ? -5e5 : -1e6;
  const me = state.players[pid];
  const them = state.players[1 - pid];
  let s = lifeValue(me.hp) - lifeValue(them.hp);
  for (const m of monsters(state, pid)) s += monsterValue(state, m);
  for (const m of monsters(state, 1 - pid)) s -= monsterValue(state, m) * 1.05;
  s += Math.min(me.hand.length, 9) * 1.4 - Math.min(them.hand.length, 9) * 1.0;
  s += me.maxBw * 1.2 - them.maxBw * 1.2;
  s += Math.min(me.nitro, 5) * 0.6;
  // Threat: how much the enemy board could hit us for next turn.
  const threat = monsters(state, 1 - pid).reduce((t, m) => t + (hasKeyword(m, 'Structure') ? 0 : getAttack(state, m)), 0);
  if (threat >= me.hp) s -= 30;
  return s;
}

function simulate(state, action) {
  const next = cloneState(state);
  const res = applyAction(next, action);
  return res.ok ? next : null;
}

function bestFollowUpAttack(state, pid) {
  let best = -Infinity;
  for (const a of legalActions(state)) {
    if (a.type !== 'attack') continue;
    const next = simulate(state, a);
    if (next) best = Math.max(best, scoreAfter(next, pid));
  }
  return best;
}

// If the opponent gets a response window, assume they pass (we can't see their hand).
function scoreAfter(state, pid) {
  if (state.pending && state.pending.responder !== pid) {
    const passed = simulate(state, { type: 'pass' });
    if (passed) return evaluate(passed, pid);
  }
  return evaluate(state, pid);
}

export function chooseAction(state, { difficulty = 'normal' } = {}) {
  const pid = decisionPlayer(state);
  const actions = legalActions(state);
  if (!actions.length) return null;
  const easy = difficulty === 'easy' && !state.pending;
  const options = []; // easy only: every action that beat doing nothing, with its score

  if (state.pending) {
    const passed = simulate(state, { type: 'pass' });
    const baseline = passed ? evaluate(passed, pid) : -Infinity;
    let best = { type: 'pass' }, bestScore = baseline + 1.5; // only respond if it clearly helps
    for (const a of actions) {
      if (a.type !== 'respond') continue;
      const next = simulate(state, a);
      if (!next) continue;
      const sc = evaluate(next, pid);
      if (sc > bestScore) { best = a; bestScore = sc; }
    }
    return best;
  }

  const baseline = evaluate(state, pid);
  let best = { type: 'end' }, bestScore = baseline + 0.05;
  for (const a of actions) {
    if (a.type === 'end') continue;
    const next = simulate(state, a);
    if (!next) continue;
    let sc = scoreAfter(next, pid);
    const card = a.type === 'play' && state.players[pid].hand.find(c => c.uid === a.uid);
    if (card) sc += MANA_USE_BONUS * effectiveCost(state, card);
    if (card && defOf(card).type === 'Spell') {
      sc = Math.max(sc, bestFollowUpAttack(next, pid) - 0.5);
    }
    if (easy && sc > baseline + 0.05) options.push({ a, sc });
    if (sc > bestScore) { best = a; bestScore = sc; }
  }
  if (easy && options.length > 1) {
    const roll = stateHash(state);
    if (roll % 100 < EASY_MISS_PCT) {
      options.sort((x, y) => y.sc - x.sc);
      return options[1 + (Math.floor(roll / 100) % Math.min(2, options.length - 1))].a;
    }
  }
  return best;
}

const EASY_MISS_PCT = 35;
// A player's first matches against the AI are on easy.
export const EASY_FIRST_GAMES = 3;
export const difficultyFor = gamesPlayed => (gamesPlayed < EASY_FIRST_GAMES ? 'easy' : 'normal');

// A number from the visible game state: the same state always gives the same number.
function stateHash(state) {
  let h = 2166136261;
  const mix = n => { h = Math.imul(h ^ (n & 0xffff), 16777619) >>> 0; };
  mix(state.turn); mix(state.uidSeq);
  for (const p of state.players) {
    mix(p.hp); mix(p.bw); mix(p.hand.length); mix(p.deck.length);
    for (const m of p.board) if (m) { mix(m.uid); mix(m.attacks ?? 0); }
  }
  return h;
}
