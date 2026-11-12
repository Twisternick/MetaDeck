// MetaDeck rules engine. Ported from the Unity C# engine (GameFlowStateMachine, CombatResolver,
// CleanupResolver, the effect classes and keyword handlers) into plain functions over a plain-data
// state, so a match can be cloned for AI lookahead and run headless in Node for balance simulation.
//
// Flow: the decision player (active player, or the responder during an attack's response window)
// picks one of legalActions(state); applyAction(state, action) validates and resolves it, appends
// UI events to state.events and readable lines to state.log, then sweeps deaths and checks for a win.

import { CARDS } from '../data/index.js';
import {
  START_HP, BOARD_SLOTS, MAX_HAND, MAX_BANDWIDTH, OPENING_HAND, TURN_LIMIT,
  LEVEL_UP_XP, LEVEL_UP_BONUS, CHOSEN_TARGETINGS,
} from './constants.js';
import { pick, randInt, shuffleInPlace } from './rng.js';

// ---------------------------------------------------------------- setup

// `shuffle(list)` replaces the seeded opening shuffle. The online server shuffles with crypto randomness,
// so a client can't brute-force the 31-bit seed from its own opening hand and learn the opponent's deck.
export function createGame({ decks, names = ['Player 1', 'Player 2'], deckIds = [null, null], seed, firstPlayer = 0, shuffle = null }) {
  const state = {
    rng: (seed ?? Math.floor(Math.random() * 2 ** 31)) | 0,
    turn: 1,
    active: firstPlayer,
    uidSeq: 1,
    players: [0, 1].map(pid => ({
      id: pid, name: names[pid], deckId: deckIds[pid],
      hp: START_HP, maxBw: 0, bw: 0, nitro: 0, fatigue: 0,
      deck: [], hand: [], grave: [], board: Array(BOARD_SLOTS).fill(null),
      playedThisTurn: 0, attacksThisTurn: 0, revealedTurn: -1,
    })),
    pending: null,
    over: false,
    winner: null, // 0 | 1 | 'draw'
    log: [],
    events: [],
  };

  for (const pid of [0, 1]) {
    const p = state.players[pid];
    p.deck = decks[pid].map(id => newCard(state, id, pid));
    if (shuffle) shuffle(p.deck); else shuffleInPlace(state, p.deck);
  }

  const first = state.players[firstPlayer];
  first.maxBw = 1;
  first.bw = 1;
  draw(state, firstPlayer, OPENING_HAND[0], { triggers: false });
  draw(state, 1 - firstPlayer, OPENING_HAND[1], { triggers: false });
  log(state, `${says(first, 'go', 'goes')} first.`);
  return state;
}

function newCard(state, id, owner) {
  if (!CARDS[id]) throw new Error(`Unknown card id: ${id}`);
  return { uid: state.uidSeq++, id, owner };
}

export const defOf = card => CARDS[card.id];
const P = (state, pid) => state.players[pid];
const opp = pid => 1 - pid;

export function cloneState(state) {
  const copy = JSON.parse(JSON.stringify({ ...state, log: [], events: [] }));
  copy.rng = (copy.rng ^ 0x5bd1e995) | 0; // simulations must not "see" the real future draws
  return copy;
}

// ---------------------------------------------------------------- queries

export function decisionPlayer(state) {
  return state.pending ? state.pending.responder : state.active;
}

export function monsters(state, pid) {
  return P(state, pid).board.filter(Boolean);
}

export function allMonsters(state) {
  return [...monsters(state, 0), ...monsters(state, 1)];
}

export function findMonster(state, uid) {
  for (const p of state.players) for (const m of p.board) if (m && m.uid === uid) return m;
  return null;
}

export function hasKeyword(m, k) {
  return m.kw.includes(k) || m.tempKw.includes(k);
}

export function getMaxHealth(m) {
  return defOf(m).baseHealth + m.mods.reduce((s, x) => s + (x.hp || 0), 0);
}

export function getHealth(m) {
  return getMaxHealth(m) - m.damage;
}

const alive = m => getHealth(m) > 0;
const isDamaged = m => m.damage > 0;

// The conditional Attack bonuses currently active on a monster: [{ keyword, amount }].
// These are the keywords whose bonus comes and goes with the game state (not permanent buffs).
export function attackBonuses(state, m) {
  const owner = P(state, m.owner);
  const out = [];
  if (hasKeyword(m, 'Slipstream') && owner.nitro > 0) out.push({ keyword: 'Slipstream', amount: 1 });
  if (hasKeyword(m, 'Momentum') && state.active === m.owner && owner.attacksThisTurn >= 1) out.push({ keyword: 'Momentum', amount: 1 });
  if (hasKeyword(m, 'Clutch') && owner.hp < P(state, opp(m.owner)).hp) out.push({ keyword: 'Clutch', amount: 2 });
  if (hasKeyword(m, 'Combo') && state.active === m.owner) {
    const others = owner.playedThisTurn - (m.playedTurn === state.turn ? 1 : 0);
    const n = Math.min(2, Math.max(0, others));
    if (n) out.push({ keyword: 'Combo', amount: n });
  }
  let inspire = 0;
  for (const ally of monsters(state, m.owner)) {
    if (ally !== m && hasKeyword(ally, 'Inspire') && alive(ally)) inspire += 1;
  }
  if (inspire) out.push({ keyword: 'Inspire', amount: inspire });
  return out;
}

export function getAttack(state, m) {
  let atk = defOf(m).baseAttack + m.mods.reduce((s, x) => s + (x.atk || 0), 0);
  for (const b of attackBonuses(state, m)) atk += b.amount;
  return Math.max(0, atk);
}

export function effectiveCost(state, card) {
  const def = defOf(card);
  if (def.type !== 'Spell') return def.cost;
  const tax = monsters(state, opp(card.owner)).filter(m => hasKeyword(m, 'Tax')).length;
  return def.cost + tax;
}

const controls = (state, pid, kw) => monsters(state, pid).some(m => alive(m) && hasKeyword(m, kw));

function checkCondition(state, pid, cond) {
  const p = P(state, pid);
  switch (cond) {
    case undefined: case 'None': case 'TargetMustBeDamaged': return true;
    case 'CardsPlayed1': return p.playedThisTurn >= 1;
    case 'CardsPlayed2': return p.playedThisTurn >= 2;
    case 'Attacked3': return p.attacksThisTurn >= 3;
    case 'FriendlyAttackedThisTurn': return p.attacksThisTurn >= 1;
    case 'ControlsDistrict': return controls(state, pid, 'District');
    case 'ControlsStructure': return controls(state, pid, 'Structure');
    case 'FriendlyBoardAtLeast3': return monsters(state, pid).length >= 3;
    case 'HealthLessThanOpponent': return p.hp < P(state, opp(pid)).hp;
    default: throw new Error(`Unknown condition: ${cond}`);
  }
}

// The chosen-target effects of a card's play trigger. All of them share one target.
export function chosenEffects(def) {
  return def.effects.filter(e => (e.trigger || 'play') === 'play' && CHOSEN_TARGETINGS.has(e.targeting));
}

export const playerRef = pid => `P${pid}`;
const refToPid = ref => (typeof ref === 'string' && ref[0] === 'P' ? Number(ref.slice(1)) : null);

// Valid chosen targets for a card played by `pid`, as refs (monster uid or 'P0'/'P1').
export function validTargets(state, pid, def) {
  const effects = chosenEffects(def);
  if (!effects.length) return null;
  const targeting = effects[0].targeting;
  const mustBeDamaged = effects.some(e => e.cond === 'TargetMustBeDamaged');
  const enemy = opp(pid);
  const ok = m => alive(m) && (!mustBeDamaged || isDamaged(m));
  const enemyOk = m => ok(m) && !hasKeyword(m, 'Stealth');
  const refs = [];
  if (targeting === 'EnemyMonster' || targeting === 'AnyMonster' || targeting === 'EnemyCharacter') {
    for (const m of monsters(state, enemy)) if (enemyOk(m)) refs.push(m.uid);
  }
  if (targeting === 'FriendlyMonster' || targeting === 'OtherFriendlyMonster' || targeting === 'AnyMonster') {
    for (const m of monsters(state, pid)) if (ok(m)) refs.push(m.uid);
  }
  if (targeting === 'EnemyCharacter') refs.push(playerRef(enemy));
  return refs;
}

// Can `pid` play this hand card right now? Returns { ok, reason, targets }.
export function playInfo(state, pid, card, { asResponse = false } = {}) {
  const def = defOf(card);
  const p = P(state, pid);
  if (state.over) return { ok: false, reason: 'The game is over.' };
  if (!p.hand.some(c => c.uid === card.uid)) return { ok: false, reason: 'Card is not in your hand.' };
  if (asResponse) {
    if (!state.pending || state.pending.responder !== pid) return { ok: false, reason: 'Nothing to respond to.' };
    if (def.speedWindow !== 'Quick') return { ok: false, reason: 'Only Quick cards can respond.' };
  } else {
    if (state.pending) return { ok: false, reason: 'Waiting for a response.' };
    if (state.active !== pid) return { ok: false, reason: 'Not your turn.' };
  }
  const cost = effectiveCost(state, card);
  if (p.bw < cost) return { ok: false, reason: `Needs ${cost} Bandwidth.` };
  if (def.type === 'Monster' && !p.board.includes(null)) return { ok: false, reason: 'Your board is full.' };
  const targets = validTargets(state, pid, def);
  if (def.type === 'Spell' && targets && targets.length === 0) return { ok: false, reason: 'No valid target.' };
  return { ok: true, targets };
}

// Attacker-side legality (CombatRules.CanAttack).
export function attackInfo(state, m) {
  if (state.over) return { ok: false, reason: 'The game is over.' };
  if (state.pending) return { ok: false, reason: 'Waiting for a response.' };
  if (state.active !== m.owner) return { ok: false, reason: 'Not your turn.' };
  if (hasKeyword(m, 'Structure')) return { ok: false, reason: "Structures can't attack." };
  if (!alive(m)) return { ok: false, reason: 'This monster is destroyed.' };
  if (m.summonedTurn === state.turn && !hasKeyword(m, 'Rush')) return { ok: false, reason: 'Summoning sickness (needs Rush).' };
  if (state.turn <= m.suppressedUntil) return { ok: false, reason: "Suppressed — can't attack this turn." };
  if (m.attacks >= 1) return { ok: false, reason: 'Already attacked this turn.' };
  if (getAttack(state, m) <= 0) return { ok: false, reason: 'Has no Attack.' };
  return { ok: true };
}

const hasGuard = (state, pid) => monsters(state, pid).some(m => alive(m) && hasKeyword(m, 'Guard'));

// Legal attack targets for a monster that can attack (Guard / Stealth / Double Jump rules).
export function attackTargets(state, m) {
  const enemy = opp(m.owner);
  const guarded = hasGuard(state, enemy) && !hasKeyword(m, 'DoubleJump');
  const refs = [];
  for (const d of monsters(state, enemy)) {
    if (!alive(d) || hasKeyword(d, 'Stealth')) continue;
    if (guarded && !hasKeyword(d, 'Guard')) continue;
    refs.push(d.uid);
  }
  if (!guarded) refs.push(playerRef(enemy));
  return refs;
}

export function legalActions(state) {
  if (state.over) return [];
  const pid = decisionPlayer(state);
  const p = P(state, pid);
  const actions = [];
  const expand = (type, card, info) => {
    if (info.targets && info.targets.length) for (const t of info.targets) actions.push({ type, uid: card.uid, target: t });
    else actions.push({ type, uid: card.uid });
  };

  if (state.pending) {
    actions.push({ type: 'pass' });
    for (const c of p.hand) {
      const info = playInfo(state, pid, c, { asResponse: true });
      if (info.ok) expand('respond', c, info);
    }
    return actions;
  }

  actions.push({ type: 'end' });
  for (const c of p.hand) {
    const info = playInfo(state, pid, c);
    if (info.ok) expand('play', c, info);
  }
  for (const m of monsters(state, pid)) {
    if (!attackInfo(state, m).ok) continue;
    for (const t of attackTargets(state, m)) actions.push({ type: 'attack', uid: m.uid, target: t });
  }
  return actions;
}

// ---------------------------------------------------------------- actions

export function applyAction(state, action) {
  if (state.over) return fail('The game is over.');
  let result;
  switch (action.type) {
    case 'play': result = doPlay(state, action, false); break;
    case 'respond': result = doPlay(state, action, true); break;
    case 'attack': result = doAttack(state, action); break;
    case 'pass': result = doPass(state); break;
    case 'end': result = doEndTurn(state); break;
    default: return fail(`Unknown action ${action.type}`);
  }
  if (result.ok) cleanup(state);
  return result;
}

const fail = reason => ({ ok: false, reason });
const OK = { ok: true };

// A keyword did something visible. `ref` is a monster (uid) or a player ({ pid }); `text` is a short
// caption for the UI callout ("+1/+1", "Blocked", ...).
function keywordEvent(state, keyword, ref, text = null, extra = {}) {
  const e = { type: 'keyword', keyword, ...extra };
  if (ref && ref.uid !== undefined) e.uid = ref.uid; else if (ref && ref.pid !== undefined) e.pid = ref.pid;
  if (text) e.text = text;
  state.events.push(e);
}

function doPlay(state, action, asResponse) {
  const pid = decisionPlayer(state);
  const p = P(state, pid);
  const card = p.hand.find(c => c.uid === action.uid);
  if (!card) return fail('Card is not in your hand.');
  const info = playInfo(state, pid, card, { asResponse });
  if (!info.ok) return info;
  const target = action.target ?? null;
  if (info.targets && info.targets.length && !info.targets.includes(target)) return fail('Choose a valid target.');

  const def = defOf(card);
  const cost = effectiveCost(state, card);
  p.bw -= cost;
  p.hand = p.hand.filter(c => c !== card);
  state.events.push({ type: 'play', pid, id: card.id, uid: card.uid });
  if (cost > def.cost) {
    const taxer = monsters(state, opp(pid)).find(m => alive(m) && hasKeyword(m, 'Tax'));
    if (taxer) keywordEvent(state, 'Tax', taxer, `+${cost - def.cost} cost`);
  }
  log(state, `${says(p, 'play', 'plays')} ${def.displayName}${describeTarget(state, target)}.`);

  if (def.type === 'Monster') {
    const m = summon(state, pid, card, { played: true });
    resolveEffects(state, m, 'play', target);
    if (hasKeyword(m, 'Populate')) {
      keywordEvent(state, 'Populate', m, 'Summons a Citizen');
      summonToken(state, pid, 'token_citizen');
    }
    if (hasKeyword(m, 'Errata')) {
      const victim = pick(state, monsters(state, opp(pid)).filter(alive));
      if (victim) { keywordEvent(state, 'Errata', m); silence(state, victim); }
    }
    if (hasKeyword(m, 'Copy')) {
      const copy = newCard(state, card.id, pid);
      p.deck.splice(randInt(state, p.deck.length + 1), 0, copy);
      keywordEvent(state, 'Copy', m, 'Copy shuffled into deck');
      log(state, `A copy of ${def.displayName} is shuffled into the deck.`);
    }
  } else {
    resolveEffects(state, card, 'play', target);
    p.grave.push(strip(card));
  }
  if (!asResponse) p.playedThisTurn++;

  if (asResponse) resolvePending(state);
  return OK;
}

function doAttack(state, action) {
  const m = findMonster(state, action.uid);
  if (!m || m.owner !== state.active) return fail('Choose one of your monsters.');
  const info = attackInfo(state, m);
  if (!info.ok) return info;
  if (!attackTargets(state, m).includes(action.target)) return fail('Invalid attack target.');

  const responder = opp(m.owner);
  state.events.push({ type: 'attack', uid: m.uid, target: action.target });
  log(state, `${defOf(m).displayName} attacks ${describeRef(state, action.target)}.`);
  if (m.summonedTurn === state.turn && hasKeyword(m, 'Rush')) keywordEvent(state, 'Rush', m, 'Attacks right away');
  if (hasKeyword(m, 'DoubleJump') && hasGuard(state, responder)) {
    const tgt = refToPid(action.target) === null ? findMonster(state, action.target) : null;
    if (!tgt || !hasKeyword(tgt, 'Guard')) keywordEvent(state, 'DoubleJump', m, 'Leaps past Guard');
  }
  for (const b of attackBonuses(state, m)) keywordEvent(state, b.keyword, m, `+${b.amount} ATK`);

  const canRespond = P(state, responder).hand.some(c => playInfoResponseProbe(state, responder, c));
  if (canRespond) {
    state.pending = { attacker: m.uid, target: action.target, responder };
    return OK;
  }
  resolveAttack(state, m, action.target);
  return OK;
}

// Would `c` be a playable response if a window were open? (Opens a temporary window to ask.)
function playInfoResponseProbe(state, pid, c) {
  if (defOf(c).speedWindow !== 'Quick') return false;
  const saved = state.pending;
  state.pending = { responder: pid };
  const ok = playInfo(state, pid, c, { asResponse: true }).ok;
  state.pending = saved;
  return ok;
}

function doPass(state) {
  if (!state.pending) return fail('Nothing to pass on.');
  resolvePending(state);
  return OK;
}

function resolvePending(state) {
  const { attacker, target } = state.pending;
  state.pending = null;
  cleanup(state);
  if (state.over) return;
  const m = findMonster(state, attacker);
  const fizzle = (why, keyword = null, ref = null) => {
    if (m) m.attacks++;
    state.events.push({ type: 'fizzle', uid: attacker, why, keyword });
    if (keyword && ref) keywordEvent(state, keyword, ref, 'Attack fizzles');
    log(state, `The attack fizzles (${why}).`);
  };
  if (!m || !alive(m)) return fizzle('attacker is gone');
  if (state.turn <= m.suppressedUntil) return fizzle('attacker was suppressed', 'Suppression', m);
  const pid = refToPid(target);
  if (pid !== null) {
    if (hasGuard(state, pid) && !hasKeyword(m, 'DoubleJump')) {
      const g = monsters(state, pid).find(x => alive(x) && hasKeyword(x, 'Guard'));
      return fizzle('a Guard stepped in', 'Guard', g);
    }
  } else {
    const d = findMonster(state, target);
    if (!d || !alive(d)) return fizzle('target is gone');
    if (hasKeyword(d, 'Stealth')) return fizzle('target vanished into Stealth', 'Stealth', d);
  }
  resolveAttack(state, m, target);
}

function resolveAttack(state, att, target) {
  const owner = P(state, att.owner);
  if (hasKeyword(att, 'Stealth')) keywordEvent(state, 'Stealth', att, 'Revealed');
  removeKeyword(att, 'Stealth');
  const facePid = refToPid(target);

  if (facePid !== null) {
    const dmg = getAttack(state, att);
    att.attacks++;
    owner.attacksThisTurn++;
    damagePlayer(state, facePid, dmg);
    afterAttack(state, att, false);
    return;
  }

  const def = findMonster(state, target);
  if (hasKeyword(att, 'Fear')) {
    def.mods.push({ atk: -1, hp: 0, temp: true });
    keywordEvent(state, 'Fear', att);
    keywordEvent(state, 'Fear', def, '-1 ATK');
  }
  const aAtk = getAttack(state, att);
  const dAtk = getAttack(state, def);
  att.attacks++;
  owner.attacksThisTurn++;

  if (hasKeyword(att, 'Headshot') && isDamaged(def)) {
    def.damage = getMaxHealth(def);
    keywordEvent(state, 'Headshot', att);
    state.events.push({ type: 'damage', uid: def.uid, amount: 'HEADSHOT' });
    log(state, `Headshot! ${defOf(def).displayName} is destroyed.`);
  } else {
    const aFirst = hasKeyword(att, 'FirstStrike');
    const dFirst = hasKeyword(def, 'FirstStrike') || hasKeyword(def, 'Counter');
    const dKw = hasKeyword(def, 'Counter') ? 'Counter' : 'FirstStrike';
    if (aFirst && !dFirst) {
      keywordEvent(state, 'FirstStrike', att, 'Strikes first');
      damageMonster(state, att, def, aAtk);
      if (alive(def)) damageMonster(state, def, att, dAtk);
      else keywordEvent(state, 'FirstStrike', att, 'No retaliation');
    } else if (dFirst && !aFirst) {
      keywordEvent(state, dKw, def, 'Strikes first');
      damageMonster(state, def, att, dAtk);
      if (alive(att)) damageMonster(state, att, def, aAtk);
      else keywordEvent(state, dKw, def, 'No retaliation');
    } else {
      damageMonster(state, att, def, aAtk);
      damageMonster(state, def, att, dAtk);
    }
  }
  afterAttack(state, att, !alive(def));
}

function afterAttack(state, att, killed) {
  if (!alive(att)) return;
  if (killed && hasKeyword(att, 'Devour')) {
    att.mods.push({ atk: 1, hp: 1 });
    keywordEvent(state, 'Devour', att, '+1/+1');
    state.events.push({ type: 'buff', uid: att.uid });
    log(state, `${defOf(att).displayName} devours its prey (+1/+1).`);
  }
  if (hasKeyword(att, 'Overtake')) { keywordEvent(state, 'Overtake', att, '+1 Nitro'); gainNitro(state, att.owner, 1); }
  if (hasKeyword(att, 'XP')) { keywordEvent(state, 'XP', att, '+1 XP'); gainXP(state, att, 1); }
}

function doEndTurn(state) {
  if (state.pending) return fail('Waiting for a response.');
  const ap = state.active;
  log(state, `${says(P(state, ap), 'end your', 'ends their')} turn.`);
  runTriggers(state, ap, 'turnEnd');
  cleanup(state);
  if (state.over) return OK;

  for (const m of allMonsters(state)) {
    m.mods = m.mods.filter(x => !x.temp);
    m.tempKw = [];
    m.attacks = 0;
  }
  state.active = opp(ap);
  state.turn++;
  for (const p of state.players) {
    p.playedThisTurn = 0;
    p.attacksThisTurn = 0;
  }
  const np = P(state, state.active);
  np.maxBw = Math.min(MAX_BANDWIDTH, np.maxBw + 1);
  const generators = monsters(state, np.id).filter(m => hasKeyword(m, 'Generate'));
  np.bw = np.maxBw + generators.length;
  state.events.push({ type: 'turn', pid: np.id, turn: state.turn });
  for (const g of generators) keywordEvent(state, 'Generate', g, '+1 Bandwidth');

  if (state.turn > TURN_LIMIT) {
    state.over = true;
    state.winner = 'draw';
    log(state, 'Turn limit reached — the match is a draw.');
    return OK;
  }
  draw(state, np.id, 1);
  runTriggers(state, np.id, 'turnStart');
  return OK;
}

// ---------------------------------------------------------------- zones

function strip(card) {
  return { uid: card.uid, id: card.id, owner: card.owner };
}

function summon(state, pid, card, { played = false } = {}) {
  const p = P(state, pid);
  const slot = p.board.indexOf(null);
  if (slot < 0) return null;
  const def = defOf(card);
  const m = {
    uid: card.uid, id: card.id, owner: pid,
    damage: 0, mods: [], kw: [...def.keywords], tempKw: [],
    silenced: false, xp: 0, leveled: false,
    summonedTurn: state.turn, playedTurn: played ? state.turn : -1,
    attacks: 0, suppressedUntil: 0, isToken: !!def.isToken,
  };
  p.board[slot] = m;
  state.events.push({ type: 'summon', uid: m.uid });
  return m;
}

// Put a card straight onto the board (free, no Play effects). Used by tests and tools.
export function placeMonster(state, pid, cardId) {
  return summon(state, pid, newCard(state, cardId, pid));
}

// Put a fresh copy of a card into a player's hand. Used by tests and tools.
export function giveCard(state, pid, cardId) {
  const card = newCard(state, cardId, pid);
  state.players[pid].hand.push(card);
  return card;
}

function summonToken(state, pid, tokenId) {
  return summon(state, pid, newCard(state, tokenId, pid));
}

function removeFromBoard(state, m) {
  const p = P(state, m.owner);
  const slot = p.board.indexOf(m);
  if (slot >= 0) p.board[slot] = null;
}

function addToHand(state, pid, card) {
  const p = P(state, pid);
  if (p.hand.length >= MAX_HAND) {
    p.grave.push(strip(card));
    state.events.push({ type: 'burn', pid, id: card.id });
    log(state, `${p.name === 'You' ? 'Your' : `${p.name}'s`} hand is full — ${defOf(card).displayName} is burned.`);
    return false;
  }
  p.hand.push(strip(card));
  return true;
}

export function draw(state, pid, n, { triggers = true } = {}) {
  const p = P(state, pid);
  for (let i = 0; i < n; i++) {
    if (state.over) return;
    if (!p.deck.length) {
      p.fatigue++;
      log(state, `${says(p, 'have', 'has')} no cards left and ${p.name === 'You' ? 'take' : 'takes'} ${p.fatigue} fatigue damage.`);
      damagePlayer(state, pid, p.fatigue);
      continue;
    }
    const card = p.deck.pop();
    const kept = addToHand(state, pid, card);
    if (kept) state.events.push({ type: 'draw', pid, uid: card.uid });
    if (triggers) onDraw(state, pid);
  }
}

function onDraw(state, pid) {
  for (const m of monsters(state, pid)) {
    if (!alive(m)) continue;
    if (hasKeyword(m, 'Topdeck')) {
      m.mods.push({ atk: 1, hp: 1 });
      keywordEvent(state, 'Topdeck', m, '+1/+1');
      state.events.push({ type: 'buff', uid: m.uid });
    }
    resolveEffects(state, m, 'draw', null);
  }
}

// ---------------------------------------------------------------- damage & death

function damageMonster(state, src, m, amount) {
  if (amount <= 0 || !findMonster(state, m.uid)) return 0;
  if (hasKeyword(m, 'PoweredUp')) {
    removeKeyword(m, 'PoweredUp');
    keywordEvent(state, 'PoweredUp', m, 'Blocked');
    state.events.push({ type: 'shield', uid: m.uid });
    return 0;
  }
  if (hasKeyword(m, 'Fortify')) { amount -= 1; keywordEvent(state, 'Fortify', m, '-1 damage'); }
  if (amount <= 0) {
    state.events.push({ type: 'damage', uid: m.uid, amount: 0 });
    return 0;
  }
  m.damage += amount;
  state.events.push({ type: 'damage', uid: m.uid, amount });
  if (src && src.kw && hasKeyword(src, 'Suppression') && src.owner !== m.owner) {
    keywordEvent(state, 'Suppression', src);
    suppress(state, m);
  }
  return amount;
}

function damagePlayer(state, pid, amount) {
  if (amount <= 0) return;
  P(state, pid).hp -= amount;
  state.events.push({ type: 'damage', pid, amount });
}

// Sweep dead monsters until the board is stable (death triggers can kill more), then check for a win.
function cleanup(state) {
  for (let pass = 0; pass < 30; pass++) {
    const dead = allMonsters(state).filter(m => !alive(m));
    if (!dead.length) break;
    const died = [];
    for (const m of dead) {
      if (hasKeyword(m, 'Checkpoint')) {
        removeKeyword(m, 'Checkpoint');
        m.damage = getMaxHealth(m) - 1;
        keywordEvent(state, 'Checkpoint', m, 'Survives at 1');
        state.events.push({ type: 'checkpoint', uid: m.uid });
        log(state, `${defOf(m).displayName} hits a Checkpoint and survives at 1 health.`);
        continue;
      }
      removeFromBoard(state, m);
      if (!m.isToken) P(state, m.owner).grave.push(strip(m));
      state.events.push({ type: 'death', uid: m.uid, id: m.id, owner: m.owner });
      log(state, `${defOf(m).displayName} is destroyed.`);
      died.push(m);
    }
    for (const m of died) {
      if (m.silenced) continue;
      resolveEffects(state, m, 'death', null);
      if (hasKeyword(m, 'Haunt')) {
        const victim = pick(state, monsters(state, opp(m.owner)).filter(alive));
        if (victim) { keywordEvent(state, 'Haunt', victim, 'Haunted'); damageMonster(state, m, victim, 2); }
      }
    }
    for (const m of died) {
      for (const ally of monsters(state, m.owner)) if (alive(ally)) resolveEffects(state, ally, 'allyDeath', null);
    }
  }
  checkWinner(state);
}

function checkWinner(state) {
  if (state.over) return;
  const dead = state.players.filter(p => p.hp <= 0);
  if (!dead.length) return;
  state.over = true;
  state.pending = null;
  state.winner = dead.length === 2 ? 'draw' : opp(dead[0].id);
  log(state, state.winner === 'draw' ? 'Both players fall — draw!' : `${says(P(state, state.winner), 'win', 'wins')}!`);
}

// ---------------------------------------------------------------- effects

function runTriggers(state, pid, trigger) {
  for (const m of monsters(state, pid)) {
    if (state.over) return;
    if (findMonster(state, m.uid) && alive(m)) resolveEffects(state, m, trigger, null);
  }
}

function resolveEffects(state, source, trigger, chosen) {
  const def = defOf(source);
  for (const e of def.effects) {
    if (state.over) return;
    if ((e.trigger || 'play') !== trigger) continue;
    if (trigger !== 'play' && source.silenced) continue;
    if (!checkCondition(state, source.owner, e.cond)) continue;
    if (e.nitroCost) {
      const p = P(state, source.owner);
      if (p.nitro < e.nitroCost) continue;
      p.nitro -= e.nitroCost;
      state.events.push({ type: 'nitro', pid: p.id, amount: -e.nitroCost, boost: true });
    }
    applyEffect(state, source, e, effectTargets(state, source, e, chosen));
  }
}

function effectTargets(state, source, e, chosen) {
  const pid = source.owner;
  const onBoard = m => findMonster(state, m.uid) && alive(m);
  const friendly = () => monsters(state, pid).filter(onBoard);
  const enemies = () => monsters(state, opp(pid)).filter(onBoard);
  switch (e.targeting) {
    case 'None': return [];
    case 'Self': return findMonster(state, source.uid) ? [source] : [];
    case 'FriendlyPlayer': return [{ pid }];
    case 'EnemyPlayer': return [{ pid: opp(pid) }];
    case 'RandomEnemyMonster': { const m = pick(state, enemies()); return m ? [m] : []; }
    case 'RandomOtherFriendlyMonster': { const m = pick(state, friendly().filter(x => x.uid !== source.uid)); return m ? [m] : []; }
    case 'AllFriendlyMonsters': return friendly();
    case 'AllOtherFriendlyMonsters': return friendly().filter(x => x.uid !== source.uid);
    case 'AllEnemyMonsters': return enemies();
    case 'AllMonsters': return [...friendly(), ...enemies()];
    default: { // chosen targeting
      if (chosen === null || chosen === undefined) return [];
      const tpid = refToPid(chosen);
      if (tpid !== null) return [{ pid: tpid }];
      const m = findMonster(state, chosen);
      if (!m || !alive(m)) return [];
      if (e.cond === 'TargetMustBeDamaged' && !isDamaged(m)) return [];
      return [m];
    }
  }
}

function applyEffect(state, src, e, targets) {
  const pid = src.owner;
  const p = P(state, pid);
  const n = e.amount;
  const mons = targets.filter(t => t.uid !== undefined);
  const players = targets.filter(t => t.uid === undefined).map(t => t.pid);

  switch (e.effectType) {
    case 'Draw': draw(state, pid, n); break;
    case 'DealDamage':
      for (const m of mons) damageMonster(state, src, m, n);
      for (const t of players) damagePlayer(state, t, n);
      break;
    case 'Buff':
    case 'Equip':
      for (const m of mons) {
        m.mods.push({ atk: e.attack ?? n, hp: e.health ?? n });
        if (e.keyword) addKeyword(m, e.keyword);
        state.events.push({ type: 'buff', uid: m.uid });
      }
      break;
    case 'BuffAttackThisTurn': for (const m of mons) { m.mods.push({ atk: n, hp: 0, temp: true }); state.events.push({ type: 'buff', uid: m.uid, temp: true, text: `+${n} ATK` }); } break;
    case 'DebuffAttack': for (const m of mons) { m.mods.push({ atk: -n, hp: 0, temp: true }); state.events.push({ type: 'debuff', uid: m.uid, text: `-${n} ATK` }); } break;
    case 'Heal':
      for (const t of players) {
        const tp = P(state, t);
        const before = tp.hp;
        tp.hp = Math.min(START_HP, tp.hp + n);
        if (tp.hp > before) state.events.push({ type: 'heal', pid: t, amount: tp.hp - before });
      }
      for (const m of mons) {
        const before = m.damage;
        m.damage = n ? Math.max(0, m.damage - n) : 0;
        if (m.damage < before) state.events.push({ type: 'heal', uid: m.uid, amount: before - m.damage });
      }
      break;
    case 'Destroy':
      for (const m of mons) m.damage = Math.max(m.damage, getMaxHealth(m));
      break;
    case 'Silence': for (const m of mons) silence(state, m); break;
    case 'Suppress': for (const m of mons) suppress(state, m); break;
    case 'Bounce':
      for (const m of mons) {
        removeFromBoard(state, m);
        state.events.push({ type: 'bounce', uid: m.uid });
        log(state, `${defOf(m).displayName} returns to its owner's hand.`);
        if (!m.isToken) addToHand(state, m.owner, m);
      }
      break;
    case 'GrantKeyword': for (const m of mons) { addKeyword(m, e.keyword); keywordEvent(state, e.keyword, m, 'Gained'); } break;
    case 'GrantKeywordThisTurn': for (const m of mons) if (!m.tempKw.includes(e.keyword)) { m.tempKw.push(e.keyword); keywordEvent(state, e.keyword, m, 'This turn'); } break;
    case 'RemoveKeyword': for (const m of mons) { removeKeyword(m, e.keyword); keywordEvent(state, e.keyword, m, 'Lost'); } break;
    case 'SummonToken': for (let i = 0; i < Math.max(1, n); i++) summonToken(state, pid, e.token); break;
    case 'Revive': {
      if (!p.board.includes(null)) break;
      const idx = p.grave.map(c => defOf(c).type).lastIndexOf('Monster');
      if (idx < 0) break;
      const [card] = p.grave.splice(idx, 1);
      summon(state, pid, card);
      log(state, `${defOf(card).displayName} is revived.`);
      break;
    }
    case 'ReturnFromGraveyardToHand': {
      const card = p.grave.pop();
      if (card) addToHand(state, pid, card);
      break;
    }
    case 'DiscardRandom':
      for (const t of players) {
        const tp = P(state, t);
        for (let i = 0; i < Math.max(1, n) && tp.hand.length; i++) {
          const [card] = tp.hand.splice(randInt(state, tp.hand.length), 1);
          tp.grave.push(card);
          state.events.push({ type: 'discard', pid: t, id: card.id });
          log(state, `${says(tp, 'discard', 'discards')} ${defOf(card).displayName}.`);
        }
      }
      break;
    case 'RevealHand': P(state, opp(pid)).revealedTurn = state.turn; break;
    case 'GainNitro': gainNitro(state, pid, n); break;
    case 'GainXP': for (const m of mons) gainXP(state, m, n); break;
    case 'Generate': p.bw += n; state.events.push({ type: 'bandwidth', pid, amount: n }); break;
    case 'GainMaxBandwidth': p.maxBw = Math.min(MAX_BANDWIDTH, p.maxBw + n); break;
    case 'ShuffleGraveyardIntoDeck':
      p.deck.push(...p.grave);
      p.grave = [];
      shuffleInPlace(state, p.deck);
      break;
    case 'CopyRandomHandCard': {
      for (let i = 0; i < Math.max(1, n); i++) {
        const original = pick(state, p.hand);
        if (original) addToHand(state, pid, newCard(state, original.id, pid));
      }
      break;
    }
    default: throw new Error(`Unknown effect type: ${e.effectType}`);
  }
}

function addKeyword(m, k) {
  if (!m.kw.includes(k)) m.kw.push(k);
}

function removeKeyword(m, k) {
  m.kw = m.kw.filter(x => x !== k);
  m.tempKw = m.tempKw.filter(x => x !== k);
}

function silence(state, m) {
  m.kw = [];
  m.tempKw = [];
  m.mods = [];
  m.xp = 0;
  m.leveled = false;
  m.silenced = true;
  m.damage = Math.min(m.damage, getMaxHealth(m) - 1);
  state.events.push({ type: 'silence', uid: m.uid });
  log(state, `${defOf(m).displayName} is Silenced.`);
}

function suppress(state, m) {
  // Through the end of its controller's next turn.
  m.suppressedUntil = Math.max(m.suppressedUntil, state.turn + (state.active === m.owner ? 2 : 1));
  state.events.push({ type: 'suppress', uid: m.uid });
  log(state, `${defOf(m).displayName} is Suppressed.`);
}

function gainNitro(state, pid, n) {
  const p = P(state, pid);
  p.nitro = Math.max(0, p.nitro + n);
  state.events.push({ type: 'nitro', pid, amount: n });
}

function gainXP(state, m, n) {
  m.xp += n;
  if (m.xp >= LEVEL_UP_XP && !m.leveled) {
    m.leveled = true;
    m.mods.push({ atk: LEVEL_UP_BONUS, hp: LEVEL_UP_BONUS });
    keywordEvent(state, 'XP', m, `Level Up! +${LEVEL_UP_BONUS}/+${LEVEL_UP_BONUS}`);
    state.events.push({ type: 'levelup', uid: m.uid });
    log(state, `${defOf(m).displayName} Levels Up! (+${LEVEL_UP_BONUS}/+${LEVEL_UP_BONUS})`);
  }
}

// ---------------------------------------------------------------- log helpers

function log(state, text) {
  state.log.push({ turn: state.turn, text });
}

// "You play" / "FPS AI plays"
const says = (p, youVerb, theyVerb) => `${p.name} ${p.name === 'You' ? youVerb : theyVerb}`;

function describeRef(state, ref) {
  const pid = refToPid(ref);
  if (pid !== null) return P(state, pid).name === 'You' ? 'you' : P(state, pid).name;
  const m = findMonster(state, ref);
  return m ? defOf(m).displayName : 'a target';
}

function describeTarget(state, ref) {
  return ref === null || ref === undefined ? '' : ` targeting ${describeRef(state, ref)}`;
}
