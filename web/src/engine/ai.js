// Greedy one-ply AI: try every legal action on a cloned state, score the result with a board
// evaluation, and take the best one if it beats doing nothing. Spells that set up an attack
// (pumps, Rush grants) also get credit for the best attack they enable. The same AI plays both
// sides in tools/simulate.mjs, so it doubles as the balance-testing opponent.

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

export function chooseAction(state) {
  const pid = decisionPlayer(state);
  const actions = legalActions(state);
  if (!actions.length) return null;

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
    if (sc > bestScore) { best = a; bestScore = sc; }
  }
  return best;
}
