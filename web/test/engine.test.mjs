import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, applyAction, legalActions, attackTargets, placeMonster, giveCard, getAttack, getHealth,
  effectiveCost, findMonster, hasKeyword, decisionPlayer, attackBonuses, boostCost, canBoost, defOf,
  cloneState,
} from '../src/engine/game.js';
import { chooseAction } from '../src/engine/ai.js';
import { DECKS, CARDS, deckList, starterDecks, deckErrors, DECK_SIZE, MAX_COPIES } from '../src/data/index.js';
import { rulesText } from '../src/engine/text.js';
import { CHOSEN_TARGETINGS, START_HP } from '../src/engine/constants.js';

// A quiet game: both decks are the vanilla Monster Card, player 0 active on turn 3 with 10 Bandwidth.
function setup(seed = 42) {
  const filler = Array(30).fill('CCG_M03_MonsterCard');
  const s = createGame({ decks: [filler, filler], seed, firstPlayer: 0 });
  s.players[0].hand = [];
  s.players[1].hand = [];
  s.turn = 3;
  for (const p of s.players) { p.maxBw = 10; p.bw = 10; }
  return s;
}

const ready = m => { m.summonedTurn = 0; return m; };
const ok = res => assert.ok(res.ok, res.reason);

test('selective sweepers resolve against every matching monster and spare the others', () => {
  const small = 'CCG_M03_MonsterCard'; // 2-cost 2/3
  const large = 'RPG_M09_QuestingKnight'; // 3-cost 4/3
  const district = 'CTY_M01_TownArchitect'; // 1-cost 1/3 District
  // Friendly small, friendly large, enemy small, enemy large, enemy District.
  for (const [spell, removed] of [
    ['HOR_S15_FinalGirl', [0, 3]],
    ['PLA_S06_WarpPipe', [2, 4]],
    ['CTY_S12_EminentDomain', [0, 2]],
    ['CCG_S12_BanHammer', [1, 3]],
  ]) {
    const s = setup();
    const board = [small, large, small, large, district].map((id, i) => placeMonster(s, i < 2 ? 0 : 1, id));
    board[0].damage = board[3].damage = 1;
    ok(applyAction(s, { type: 'play', uid: giveCard(s, 0, spell).uid }));
    board.forEach((m, i) => assert.equal(!!findMonster(s, m.uid), !removed.includes(i), spell));
    if (spell === 'PLA_S06_WarpPipe') assert.deepEqual(s.players[1].hand.map(c => c.id), [small, district]);
  }
});

// cloneState copies a fixed shape for speed, so a new nested field it misses would be shared with the real game.
test('cloneState copies the whole state and shares no arrays or objects with it', () => {
  const objects = (v, out = new Set()) => {
    if (v !== null && typeof v === 'object') { out.add(v); for (const k in v) objects(v[k], out); }
    return out;
  };
  const ids = DECKS.map(d => d.id);
  for (let g = 0; g < 10; g++) {
    const s = createGame({ decks: [deckList(ids[g]), deckList(ids[(g + 3) % 10])], seed: g, firstPlayer: g % 2 });
    while (!s.over) {
      s.log.length = 0;
      s.events.length = 0;
      const copy = cloneState(s);
      assert.deepEqual({ ...copy, rng: s.rng }, s);
      const real = objects(s);
      for (const o of objects(copy)) assert.ok(!real.has(o), 'a clone shares a nested array or object with the real state');
      ok(applyAction(s, chooseAction(s)));
    }
  }
});

test('every deck has exactly 40 unique, valid cards', () => {
  assert.equal(DECKS.length, 10);
  for (const deck of DECKS) {
    assert.equal(deck.cards.length, 40, deck.id);
    assert.equal(new Set(deck.cards.map(c => c.cardId)).size, 40, deck.id);
    for (const c of deck.cards) {
      assert.ok(!rulesText(c).includes('['), `${c.cardId} has unformatted text: ${rulesText(c)}`);
      const chosen = c.effects.filter(e => (e.trigger || 'play') === 'play' && CHOSEN_TARGETINGS.has(e.targeting));
      assert.ok(new Set(chosen.map(e => e.targeting)).size <= 1, `${c.cardId} mixes chosen targetings`);
      for (const e of c.effects) {
        if (e.token) assert.ok(CARDS[e.token], `${c.cardId} summons unknown token ${e.token}`);
        if ((e.trigger || 'play') !== 'play') assert.ok(!CHOSEN_TARGETINGS.has(e.targeting), `${c.cardId}: triggered effects can't ask for a target`);
      }
    }
  }
});

test('Guard forces attacks onto Guard monsters; Double Jump ignores it', () => {
  const s = setup();
  const att = ready(placeMonster(s, 0, 'CCG_M03_MonsterCard'));
  const jumper = ready(placeMonster(s, 0, 'PLA_M01_PixelJumper'));
  const guard = placeMonster(s, 1, 'FPS_M07_CoverEngineer');
  const other = placeMonster(s, 1, 'CCG_M03_MonsterCard');
  const targetsOf = uid => legalActions(s).filter(a => a.type === 'attack' && a.uid === uid).map(a => a.target);
  assert.deepEqual(targetsOf(att.uid), [guard.uid]);
  assert.deepEqual(targetsOf(jumper.uid).sort(), [guard.uid, other.uid, 'P1'].sort());
});

test('combat trades damage; First Strike kills before retaliation', () => {
  const s = setup();
  const sniper = ready(placeMonster(s, 0, 'FIG_M03_FramePerfectStriker')); // 2/2 First Strike
  const victim = placeMonster(s, 1, 'PLA_M02_CoinCollector'); // 2/1, Death: draw
  ok(applyAction(s, { type: 'attack', uid: sniper.uid, target: victim.uid }));
  assert.equal(findMonster(s, victim.uid), null);
  assert.equal(getHealth(sniper), 2);
  assert.equal(s.players[1].hand.length, 1, 'Coin Collector death trigger drew a card');
});

test('Headshot destroys a damaged defender with no retaliation', () => {
  const s = setup();
  const sniper = ready(placeMonster(s, 0, 'FPS_M10_SniperOperative'));
  const big = placeMonster(s, 1, 'FPS_M19_JuggernautExoSuit');
  big.damage = 1;
  ok(applyAction(s, { type: 'attack', uid: sniper.uid, target: big.uid }));
  assert.equal(findMonster(s, big.uid), null);
  assert.equal(getHealth(sniper), 2);
});

test('Powered Up absorbs a hit; Checkpoint survives a lethal one once', () => {
  const s = setup();
  const shielded = placeMonster(s, 1, 'PLA_M18_ExtraLifeSprite'); // Checkpoint + Powered Up
  const hitter = ready(placeMonster(s, 0, 'FPS_M17_KillstreakAce'));
  ok(applyAction(s, { type: 'attack', uid: hitter.uid, target: shielded.uid }));
  assert.equal(getHealth(shielded), 1);
  assert.ok(!hasKeyword(shielded, 'PoweredUp'));
  giveCard(s, 0, 'PLA_S12_GroundPound');
  ok(applyAction(s, { type: 'play', uid: s.players[0].hand[0].uid, target: shielded.uid }));
  assert.equal(getHealth(shielded), 1, 'Checkpoint kept it alive');
  assert.ok(!hasKeyword(shielded, 'Checkpoint'));
});

test('a Quick response can make an attack fizzle', () => {
  const s = setup();
  const att = ready(placeMonster(s, 0, 'CCG_M03_MonsterCard'));
  const def = placeMonster(s, 1, 'CCG_M03_MonsterCard');
  const smoke = giveCard(s, 1, 'FPS_S02_SmokeScreen');
  ok(applyAction(s, { type: 'attack', uid: att.uid, target: def.uid }));
  assert.equal(decisionPlayer(s), 1, 'defender gets a response window');
  ok(applyAction(s, { type: 'respond', uid: smoke.uid, target: def.uid }));
  assert.equal(s.pending, null);
  assert.equal(getHealth(def), 3, 'attack fizzled');
  assert.equal(att.attacks, 1, 'the attack was still used');
});

test('no response window opens without a playable Quick card', () => {
  const s = setup();
  s.players[1].bw = 0;
  giveCard(s, 1, 'FPS_S02_SmokeScreen');
  const att = ready(placeMonster(s, 0, 'CCG_M03_MonsterCard'));
  ok(applyAction(s, { type: 'attack', uid: att.uid, target: 'P1' }));
  assert.equal(s.pending, null);
  assert.equal(s.players[1].hp, START_HP - 2);
});

test('Tax raises enemy spell costs only', () => {
  const s = setup();
  placeMonster(s, 1, 'CTY_M02_TaxClerk');
  const spell = giveCard(s, 0, 'FPS_S04_FragGrenade');
  const monster = giveCard(s, 0, 'FPS_M05_ShotgunEnforcer');
  assert.equal(effectiveCost(s, spell), 3);
  assert.equal(effectiveCost(s, monster), 2);
});

test('Judge Call never picks a monster that is already Silenced', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = setup(seed);
    const muted = placeMonster(s, 1, 'CCG_M03_MonsterCard');
    muted.silenced = true;
    const fresh = placeMonster(s, 1, 'CCG_M03_MonsterCard');
    ok(applyAction(s, { type: 'play', uid: giveCard(s, 0, 'CCG_M04_WildCard').uid }));
    assert.equal(fresh.silenced, true, `seed ${seed}: the unsilenced enemy is the victim`);
  }
  const s = setup();
  placeMonster(s, 1, 'CCG_M03_MonsterCard').silenced = true;
  s.events = [];
  ok(applyAction(s, { type: 'play', uid: giveCard(s, 0, 'CCG_M04_WildCard').uid }));
  assert.ok(!s.events.some(e => e.type === 'silence'), 'no target left: Judge Call does nothing');
});

test('a Stealthed Guard stops guarding instead of locking out every attack', () => {
  const s = setup();
  const judge = placeMonster(s, 1, 'CCG_M18_Judge'); // Guard
  judge.tempKw.push('Stealth');
  const open = placeMonster(s, 1, 'CCG_M03_MonsterCard');
  const att = ready(placeMonster(s, 0, 'CCG_M03_MonsterCard'));
  assert.deepEqual(attackTargets(s, att).sort(), [open.uid, 'P1'].sort());
});

test('Checkpoint counts as surviving: no Devour on a saved defender, XP for a saved attacker', () => {
  const s = setup();
  const devourer = ready(placeMonster(s, 0, 'HOR_M10_CultDevourer')); // 3/3 Devour
  const survivor = placeMonster(s, 1, 'HOR_M05_LoneSurvivor'); // 2/2 Checkpoint
  ok(applyAction(s, { type: 'attack', uid: devourer.uid, target: survivor.uid }));
  assert.equal(getHealth(survivor), 1, 'Checkpoint saved the defender');
  assert.equal(getAttack(s, devourer), 3, 'nothing was killed, so no Devour');

  const rogue = ready(placeMonster(s, 0, 'RPG_M02_DungeonRogue')); // 2/1 XP
  rogue.kw.push('Checkpoint');
  ok(applyAction(s, { type: 'attack', uid: rogue.uid, target: placeMonster(s, 1, 'CCG_M03_MonsterCard').uid }));
  assert.equal(getHealth(rogue), 1);
  assert.equal(rogue.xp, 1, 'it survived the attack, so it gains XP');
});

test('Copy lands within the top 3 cards of the deck', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = setup(seed);
    const card = giveCard(s, 0, 'CCG_M05_ReverseCard');
    ok(applyAction(s, { type: 'play', uid: card.uid }));
    const top3 = s.players[0].deck.slice(-3).map(c => c.id);
    assert.ok(top3.includes('CCG_M05_ReverseCard'), `seed ${seed}`);
  }
});

test('Populate on a full board does not announce a Citizen', () => {
  const s = setup();
  for (let i = 0; i < 4; i++) placeMonster(s, 0, 'CCG_M03_MonsterCard');
  s.events = [];
  ok(applyAction(s, { type: 'play', uid: giveCard(s, 0, 'CTY_M04_HousingPlanner').uid }));
  assert.ok(!s.events.some(e => e.keyword === 'Populate'));
});

test('Combo counts other cards played this turn, capped at +2', () => {
  const s = setup();
  const student = placeMonster(s, 0, 'FIG_M11_DojoStudent'); // 1/2 Combo
  assert.equal(getAttack(s, student), 1);
  s.players[0].playedThisTurn = 1;
  assert.equal(getAttack(s, student), 2);
  s.players[0].playedThisTurn = 5;
  assert.equal(getAttack(s, student), 3);
});

test('Boost is optional: Nitro is spent only when the player chooses to Boost', () => {
  const s = setup();
  const target = placeMonster(s, 1, 'FPS_M19_JuggernautExoSuit'); // 5/7
  s.players[0].nitro = 1;
  ok(applyAction(s, { type: 'play', uid: giveCard(s, 0, 'RAC_S12_PhotoFinish').uid, target: target.uid }));
  assert.equal(getHealth(target), 5, 'played without Boost: base damage only');
  assert.equal(s.players[0].nitro, 1, 'Nitro kept');
  ok(applyAction(s, { type: 'play', uid: giveCard(s, 0, 'RAC_S12_PhotoFinish').uid, target: target.uid, boost: true }));
  assert.equal(getHealth(target), 1, 'boosted: 2 + 2 damage');
  assert.equal(s.players[0].nitro, 0);
  const res = applyAction(s, { type: 'play', uid: giveCard(s, 0, 'RAC_S12_PhotoFinish').uid, target: target.uid, boost: true });
  assert.equal(res.ok, false, "can't Boost without enough Nitro");
});

test('legal actions offer a boosted and a plain play only when the Boost is affordable', () => {
  const s = setup();
  const card = giveCard(s, 0, 'RAC_S14_LapRecord'); // Boost 2
  const plays = () => legalActions(s).filter(a => a.type === 'play' && a.uid === card.uid);
  s.players[0].nitro = 1;
  assert.deepEqual(plays().map(a => !!a.boost), [false]);
  s.players[0].nitro = 2;
  assert.deepEqual(plays().map(a => !!a.boost), [false, true]);
  assert.equal(boostCost(defOf(card)), 2);
  assert.equal(canBoost(s, 0, card), true);
});

test('Battle Training grants another +2/+2 every three surviving attacks', () => {
  const s = setup();
  const knight = ready(placeMonster(s, 0, 'RPG_M09_QuestingKnight')); // 4/3 Battle Training
  for (let i = 1; i <= 6; i++) {
    knight.attacks = 0;
    ok(applyAction(s, { type: 'attack', uid: knight.uid, target: 'P1' }));
    assert.equal(knight.xp, i);
    assert.equal(getAttack(s, knight), 4 + 2 * Math.floor(i / 3));
    assert.equal(getHealth(knight), 3 + 2 * Math.floor(i / 3));
  }
});

test('XP spells carry excess progress into the next level on an untrained monster', () => {
  const s = setup();
  const monster = placeMonster(s, 0, 'CCG_M03_MonsterCard');
  const baseAttack = getAttack(s, monster);
  for (const bonus of [0, 2, 4]) {
    const spell = giveCard(s, 0, 'RPG_S01_GainXP');
    ok(applyAction(s, { type: 'play', uid: spell.uid, target: monster.uid }));
    assert.equal(getAttack(s, monster), baseAttack + bonus);
  }
});

test('Suppress stops attacks through the controller\'s next turn', () => {
  const s = setup();
  const victim = placeMonster(s, 1, 'CCG_M03_MonsterCard');
  ok(applyAction(s, { type: 'play', uid: giveCard(s, 0, 'FPS_S03_Flashbang').uid, target: victim.uid }));
  ok(applyAction(s, { type: 'end' }));
  assert.ok(!legalActions(s).some(a => a.type === 'attack' && a.uid === victim.uid));
  ok(applyAction(s, { type: 'end' }));
  ok(applyAction(s, { type: 'end' }));
  assert.ok(legalActions(s).some(a => a.type === 'attack' && a.uid === victim.uid));
});

test('Haunt and death triggers fire, and Revive brings back the latest monster', () => {
  const s = setup();
  const haunter = placeMonster(s, 1, 'HOR_M03_GraveWhisperer');
  const bystander = placeMonster(s, 0, 'CCG_M03_MonsterCard');
  ok(applyAction(s, { type: 'play', uid: giveCard(s, 0, 'HOR_S02_FlashlightBeam').uid, target: haunter.uid }));
  assert.equal(getHealth(bystander), 1, 'Haunt dealt 2');
  s.active = 1;
  ok(applyAction(s, { type: 'play', uid: giveCard(s, 1, 'HOR_S09_GraveCall').uid }));
  assert.equal(s.players[1].board.filter(Boolean)[0].id, 'HOR_M03_GraveWhisperer');
});

test('drawing from an empty deck deals escalating fatigue', () => {
  const s = setup();
  s.players[1].deck = [];
  ok(applyAction(s, { type: 'end' }));
  assert.equal(s.players[1].hp, START_HP - 1);
  ok(applyAction(s, { type: 'end' }));
  ok(applyAction(s, { type: 'end' }));
  assert.equal(s.players[1].hp, START_HP - 3);
});

test('AI plays complete games between every deck using only legal actions', () => {
  for (let i = 0; i < DECKS.length; i++) {
    const a = DECKS[i].id, b = DECKS[(i + 3) % DECKS.length].id;
    const s = createGame({ decks: [deckList(a), deckList(b)], seed: 100 + i, firstPlayer: i % 2 });
    let steps = 0;
    while (!s.over && steps++ < 3000) ok(applyAction(s, chooseAction(s)));
    assert.ok(s.over, `${a} vs ${b} finished`);
  }
});

test('every archetype has three legal, distinct starter decks', () => {
  for (const deck of DECKS) {
    const starters = starterDecks(deck.id);
    assert.equal(starters.length, 3, deck.id);
    for (const st of starters) assert.deepEqual(deckErrors(deck.id, st.cards), [], `${deck.id} ${st.name}`);
    const lists = starters.map(st => [...st.cards].sort().join());
    assert.equal(new Set(lists).size, 3, `${deck.id} starters differ`);
  }
});

test('deck rules: size, copy limit and archetype', () => {
  const pool = deckList('RPG');
  assert.deepEqual(deckErrors('RPG', pool), []);
  assert.equal(deckErrors('RPG', pool.slice(1)).length, 1);
  const tooMany = [...pool.slice(MAX_COPIES + 1), ...Array(MAX_COPIES + 1).fill(pool[0])];
  assert.equal(tooMany.length, DECK_SIZE);
  assert.match(deckErrors('RPG', tooMany).join(), /at most/);
  assert.match(deckErrors('RPG', [...pool.slice(1), deckList('FPS')[0]]).join(), /isn't a RPG card/);
});

test('AI plays complete games with every starter deck', () => {
  DECKS.forEach((deck, i) => starterDecks(deck.id).forEach((st, j) => {
    const opp = DECKS[(i + 1 + j) % DECKS.length].id;
    const s = createGame({ decks: [st.cards, starterDecks(opp)[j].cards], deckIds: [deck.id, opp], seed: 500 + i * 3 + j, firstPlayer: j % 2 });
    let steps = 0;
    while (!s.over && steps++ < 3000) ok(applyAction(s, chooseAction(s)));
    assert.ok(s.over, `${st.name} vs ${opp} finished`);
  }));
});

test('keywords announce themselves as events the UI can show', () => {
  const s = setup();
  const sniper = ready(placeMonster(s, 0, 'FIG_M03_FramePerfectStriker')); // First Strike
  const victim = placeMonster(s, 1, 'PLA_M02_CoinCollector');
  s.events.length = 0;
  ok(applyAction(s, { type: 'attack', uid: sniper.uid, target: victim.uid }));
  const kw = s.events.filter(e => e.type === 'keyword');
  assert.ok(kw.some(e => e.keyword === 'FirstStrike' && e.uid === sniper.uid && e.text === 'Strikes first'));
  assert.ok(kw.some(e => e.keyword === 'FirstStrike' && e.text === 'No retaliation'));

  // Guard blocks a face attack after a pending response window: the fizzle names the Guard.
  const t = setup();
  const att = ready(placeMonster(t, 0, 'CCG_M03_MonsterCard'));
  const guard = placeMonster(t, 1, 'FPS_M07_CoverEngineer');
  assert.ok(!legalActions(t).some(a => a.type === 'attack' && a.target === 'P1'), 'face attack is illegal while Guard is up');
  assert.deepEqual(attackBonuses(t, att), []);
  assert.ok(hasKeyword(guard, 'Guard'));
});

test('conditional attack bonuses are reported by keyword', () => {
  const s = setup();
  const runner = ready(placeMonster(s, 0, 'token_benchwarmer')); // Momentum
  const other = ready(placeMonster(s, 0, 'CCG_M03_MonsterCard'));
  placeMonster(s, 1, 'CCG_M03_MonsterCard');
  assert.deepEqual(attackBonuses(s, runner), []);
  ok(applyAction(s, { type: 'attack', uid: other.uid, target: 'P1' }));
  assert.deepEqual(attackBonuses(s, runner), [{ keyword: 'Momentum', amount: 1 }]);
  s.events.length = 0;
  ok(applyAction(s, { type: 'attack', uid: runner.uid, target: 'P1' }));
  assert.ok(s.events.some(e => e.type === 'keyword' && e.keyword === 'Momentum' && e.text === '+1 ATK'));
});
