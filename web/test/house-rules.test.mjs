// The Card Game deck's rule-editing cards: Errata (swap Attack and Health), Alt Art (swap cost and
// Attack in hand), the three House Rules and Rules Lawyer.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, applyAction, placeMonster, giveCard, getAttack, getHealth, getMaxHealth, effectiveCost,
  hasKeyword, playInfo, cloneState, boardLimit, ruleTurnsLeft, errataWeekKeyword, monsters, handAttack, attackBonuses,
} from '../src/engine/game.js';
import { chooseAction } from '../src/engine/ai.js';
import { starterDecks } from '../src/data/index.js';
import { rulesText } from '../src/engine/text.js';
import { CARDS } from '../src/data/index.js';

// Same quiet game as engine.test.mjs: vanilla decks, player 0 active on turn 3 with 10 Bandwidth.
function setup(seed = 42) {
  const filler = Array(30).fill('CCG_M03_MonsterCard');
  const s = createGame({ decks: [filler, filler], seed, firstPlayer: 0 });
  s.players[0].hand = [];
  s.players[1].hand = [];
  s.turn = 3;
  for (const p of s.players) { p.maxBw = 10; p.bw = 10; }
  return s;
}
const ok = res => assert.ok(res.ok, res.reason);
const play = (s, pid, id, target) => applyAction(s, { type: 'play', uid: giveCard(s, pid, id).uid, ...(target !== undefined ? { target } : {}) });
// End the turn and refill the next player's Bandwidth, so tests can keep playing cards.
const endTurn = s => { ok(applyAction(s, { type: 'end' })); for (const p of s.players) p.bw = 10; };

test('Errata swaps a monster’s current Attack and Health, folding in buffs and damage', () => {
  const s = setup();
  const m = placeMonster(s, 1, 'CCG_M18_Judge'); // 3/5 Guard
  m.mods.push({ atk: 1, hp: 0 });                 // 4 Attack
  m.damage = 2;                                    // 3 Health left
  ok(play(s, 0, 'CCG_S07_Errata', m.uid));
  assert.equal(getAttack(s, m), 3);
  assert.equal(getHealth(m), 4);
  assert.equal(getMaxHealth(m), 4, 'the swap is the new printed stats, undamaged');
  assert.ok(s.events.some(e => e.type === 'swap' && e.uid === m.uid));
  // Silence doesn't undo an Errata: the card was reprinted, not buffed. (Judge Call silences the only enemy.)
  ok(play(s, 0, 'CCG_M04_WildCard'));
  assert.equal(m.silenced, true);
  assert.equal(getAttack(s, m), 3);
  assert.equal(getHealth(m), 4);
  // A second Errata swaps it back.
  ok(play(s, 0, 'CCG_S07_Errata', m.uid));
  assert.equal(getAttack(s, m), 4);
  assert.equal(getHealth(m), 3);
});

test('Errata on a 0-Attack monster leaves it with 0 Health, so it dies', () => {
  const s = setup();
  const wall = placeMonster(s, 1, 'CCG_M06_SleeveGuardian'); // 0/4 Guard, Powered Up
  ok(play(s, 0, 'CCG_S07_Errata', wall.uid));
  assert.equal(monsters(s, 1).length, 0);
});

test('Alt Art swaps the cost and Attack of every monster in hand; a second one swaps them back', () => {
  const s = setup();
  const dragon = giveCard(s, 0, 'CCG_M25_HoloChaseDragon'); // 7 cost, 6 Attack
  const guardian = giveCard(s, 0, 'CCG_M06_SleeveGuardian'); // 2 cost, 0 Attack
  const spell = giveCard(s, 0, 'CCG_S14_BurnSpell');
  ok(play(s, 0, 'CCG_S03_AltArt'));
  assert.equal(effectiveCost(s, dragon), 6);
  assert.equal(handAttack(dragon), 7);
  assert.equal(effectiveCost(s, guardian), 0);
  assert.equal(handAttack(guardian), 2);
  assert.equal(effectiveCost(s, spell), 3, 'spells are untouched');
  // Played, the monster keeps its new Attack; its Health is still printed.
  const bw = s.players[0].bw;
  ok(applyAction(s, { type: 'play', uid: guardian.uid }));
  assert.equal(s.players[0].bw, bw, 'it cost 0');
  const m = monsters(s, 0).find(x => x.uid === guardian.uid);
  assert.equal(getAttack(s, m), 2);
  assert.equal(getHealth(m), 4);
  ok(play(s, 0, 'CCG_S03_AltArt'));
  assert.equal(effectiveCost(s, dragon), 7);
  assert.equal(dragon.cost, undefined, 'back to the print');
});

test('Limited Format caps both boards at 4 for three turns, then the limit lifts', () => {
  const s = setup();
  for (let i = 0; i < 4; i++) placeMonster(s, 1, 'CCG_M03_MonsterCard');
  for (let i = 0; i < 5; i++) placeMonster(s, 0, 'CCG_M03_MonsterCard');
  s.players[0].board[4] = null; // player 0 has 4 monsters and a free slot
  ok(play(s, 0, 'CCG_S05_LimitedFormat'));
  assert.equal(boardLimit(s), 4);
  assert.equal(ruleTurnsLeft(s), 3, 'three more turns, as the card says');
  const info = playInfo(s, 0, giveCard(s, 0, 'CCG_M03_MonsterCard'));
  assert.equal(info.ok, false);
  assert.match(info.reason, /Limited Format/);
  ok(play(s, 0, 'HOR_S14_SummoningCircle')); // tokens can't squeeze in either
  assert.equal(monsters(s, 0).length, 4);
  endTurn(s); // turn 4: opponent under the rule
  assert.equal(playInfo(s, 1, giveCard(s, 1, 'CCG_M03_MonsterCard')).ok, false, 'it binds the opponent too');
  endTurn(s); endTurn(s); // turns 5 and 6
  assert.equal(ruleTurnsLeft(s), 0, 'turn 6 is its last');
  endTurn(s); // turn 7
  assert.equal(s.rule, null);
  assert.equal(boardLimit(s), 5);
  assert.ok(s.events.some(e => e.type === 'rule' && e.ended === 'LimitedFormat'));
});

test('Pauper Format stops cards costing 5 or more for both players', () => {
  const s = setup();
  ok(play(s, 0, 'CCG_S09_PauperFormat'));
  const big = giveCard(s, 0, 'CCG_M25_HoloChaseDragon');
  assert.match(playInfo(s, 0, big).reason, /Pauper Format/);
  assert.equal(playInfo(s, 0, giveCard(s, 0, 'CCG_M12_ComboPiece')).ok, true, '4 is fine');
  endTurn(s);
  assert.equal(playInfo(s, 1, giveCard(s, 1, 'CCG_S12_BanHammer')).ok, false);
});

test('Errata Week switches off the most common enemy keyword everywhere, and gives it back after', () => {
  const s = setup();
  const enemyGuards = [placeMonster(s, 1, 'CCG_M18_Judge'), placeMonster(s, 1, 'CCG_M18_Judge')];
  placeMonster(s, 1, 'CCG_M06_SleeveGuardian'); // Guard + Powered Up: Guard wins 3 to 1
  const myGuard = placeMonster(s, 0, 'CCG_M18_Judge');
  const silenced = placeMonster(s, 1, 'CCG_M17_BoosterPack'); // Guard, to be silenced under the rule
  assert.equal(errataWeekKeyword(s, 0), 'Guard');
  ok(play(s, 0, 'CCG_S06_ErrataWeek'));
  assert.equal(s.rule.keyword, 'Guard');
  for (const m of [...enemyGuards, myGuard]) assert.equal(hasKeyword(m, 'Guard'), false, 'off for both sides');
  assert.equal(hasKeyword(enemyGuards[0], 'JudgeCall'), true, 'other keywords stay');
  const fresh = placeMonster(s, 1, 'CCG_M25_HoloChaseDragon');
  assert.equal(hasKeyword(fresh, 'Guard'), false, 'monsters arriving under the rule lose it too');
  silenced.silenced = true; silenced.kw = []; silenced.ruled = null; // what Silence does to it
  for (let i = 0; i < 4; i++) endTurn(s);
  assert.equal(s.rule, null);
  for (const m of [...enemyGuards, myGuard, fresh]) assert.equal(hasKeyword(m, 'Guard'), true, 'Guard is back');
  assert.equal(hasKeyword(silenced, 'Guard'), false, 'a silenced monster stays silenced');
});

test('Errata Week can’t be played without an enemy keyword, and a new House Rule replaces the old one', () => {
  const s = setup();
  placeMonster(s, 1, 'CCG_M03_MonsterCard');
  assert.match(playInfo(s, 0, giveCard(s, 0, 'CCG_S06_ErrataWeek')).reason, /No enemy keyword/);
  const judge = placeMonster(s, 1, 'CCG_M18_Judge');
  ok(play(s, 0, 'CCG_S06_ErrataWeek'));
  assert.equal(hasKeyword(judge, 'Guard'), false);
  ok(play(s, 0, 'CCG_S09_PauperFormat'));
  assert.equal(s.rule.id, 'PauperFormat');
  assert.equal(hasKeyword(judge, 'Guard'), true, 'replacing Errata Week gives the keyword back');
});

test('Rules Lawyer: the opponent’s next spell is paid for and does nothing, the one after works', () => {
  const s = setup();
  ok(play(s, 0, 'CCG_M09_RulesLawyer'));
  assert.equal(s.players[1].objection, true);
  endTurn(s);
  const hp = s.players[0].hp;
  ok(play(s, 1, 'CCG_S14_BurnSpell', 'P0'));
  assert.equal(s.players[0].hp, hp, 'countered');
  assert.equal(s.players[1].bw, 7, 'still paid for');
  assert.ok(s.events.some(e => e.type === 'countered'));
  ok(play(s, 1, 'CCG_S14_BurnSpell', 'P0'));
  assert.equal(s.players[0].hp, hp - 3);
});

test('Draft Night: both players draw an extra card each turn, and Topdeck counts it', () => {
  const s = setup();
  const topdecker = placeMonster(s, 1, 'CCG_M01_DrawCard'); // 1/1 Topdeck
  ok(play(s, 0, 'CCG_S01_DraftNight'));
  const hand = s.players[1].hand.length;
  endTurn(s);
  assert.equal(s.players[1].hand.length, hand + 2);
  assert.equal(getAttack(s, topdecker), 2, 'the extra card is an extra draw');
  const mine = s.players[0].hand.length;
  endTurn(s);
  assert.equal(s.players[0].hand.length, mine + 2, 'the caster too');
});

test('Hand Size Errata: hands hold 12, and the bigger hand’s monsters have +1 Attack', () => {
  const s = setup();
  const mine = placeMonster(s, 0, 'CCG_M03_MonsterCard');   // 2/3
  const theirs = placeMonster(s, 1, 'CCG_M03_MonsterCard');
  for (let i = 0; i < 10; i++) giveCard(s, 0, 'CCG_M03_MonsterCard');
  ok(play(s, 0, 'CCG_S02_HandSizeErrata')); // 10 in hand, then its draw makes 11: kept, not burned
  assert.equal(s.players[0].hand.length, 11);
  assert.ok(!s.events.some(e => e.type === 'burn'));
  assert.equal(getAttack(s, mine), 3, 'more cards than the opponent');
  assert.equal(getAttack(s, theirs), 2);
  assert.ok(attackBonuses(s, mine).some(b => b.keyword === 'Hand Size Errata'));
  // Equal hands: no bonus for anyone.
  s.players[0].hand = s.players[0].hand.slice(0, s.players[1].hand.length);
  assert.equal(getAttack(s, mine), 2);
  for (let i = 0; i < 4; i++) endTurn(s); // turn 7: the rule is over
  assert.equal(s.rule, null);
  for (let i = 0; i < 8; i++) giveCard(s, 0, 'CCG_M03_MonsterCard');
  assert.equal(getAttack(s, mine), 2, 'no bonus without the rule');
});

test('Balance Patch nerfs the strongest monster and buffs the weakest at the start of each turn', () => {
  const s = setup();
  const big = placeMonster(s, 1, 'CCG_M15_TournamentWinner'); // 6/6
  const small = placeMonster(s, 0, 'CCG_M02_TokenSummon');    // 1/2, no Topdeck (the patch's own draw would grow one)
  const mid = placeMonster(s, 0, 'CCG_M03_MonsterCard');      // 2/3
  ok(play(s, 0, 'CCG_S11_BalancePatch'));
  assert.equal(getAttack(s, big), 6, 'nothing happens until a turn starts');
  endTurn(s);
  assert.equal(getAttack(s, big), 5);
  assert.equal(getAttack(s, small), 2);
  assert.equal(getAttack(s, mid), 2);
  endTurn(s); // now small and mid are both 2/x: the weakest is the one with less Health
  assert.equal(getAttack(s, big), 4);
  assert.equal(getAttack(s, small), 3);
  // A single monster has nothing to be balanced against.
  const t = setup();
  const lone = placeMonster(t, 1, 'CCG_M15_TournamentWinner');
  ok(play(t, 0, 'CCG_S11_BalancePatch'));
  endTurn(t);
  assert.equal(getAttack(t, lone), 6);
});

test('Rotation exiles both graveyards, so nothing can be revived', () => {
  const s = setup();
  s.players[0].grave.push(giveCard(s, 0, 'CCG_M15_TournamentWinner'));
  s.players[0].hand.pop();
  s.players[1].grave.push({ uid: 999, id: 'CCG_M18_Judge', owner: 1 });
  ok(play(s, 0, 'CCG_S10_Rotation'));
  assert.equal(s.players[0].grave.length, 1, 'only Rotation itself, played after the exile');
  assert.equal(s.players[1].grave.length, 0);
});

test('Typo makes the monsters in the opponent’s hand cost 1 more until played', () => {
  const s = setup();
  const dragon = giveCard(s, 1, 'CCG_M25_HoloChaseDragon');
  const spell = giveCard(s, 1, 'CCG_S14_BurnSpell');
  ok(play(s, 0, 'CCG_S04_Typo'));
  assert.equal(effectiveCost(s, dragon), 8);
  assert.equal(effectiveCost(s, spell), 3, 'spells are untouched');
  endTurn(s);
  const card = s.players[1].hand.find(c => c.uid === dragon.uid);
  assert.equal(effectiveCost(s, card), 8, 'it stays until played');
});

test('Alternate Printing summons a token copy of a friendly monster with its printed stats swapped', () => {
  const s = setup();
  const winner = placeMonster(s, 0, 'CCG_M15_TournamentWinner'); // 6/6 Topdeck
  winner.mods.push({ atk: 3, hp: 0 }); // buffs aren't copied: it's the printed card
  const rare = placeMonster(s, 0, 'CCG_M10_RareCard');          // 4/2
  ok(play(s, 0, 'CCG_M19_AlternatePrinting', rare.uid));
  const copy = monsters(s, 0).find(m => m.id === 'CCG_M10_RareCard' && m.uid !== rare.uid);
  assert.ok(copy);
  assert.equal(getAttack(s, copy), 2);
  assert.equal(getHealth(copy), 4);
  assert.equal(copy.isToken, true);
  assert.equal(playInfo(s, 0, giveCard(s, 0, 'CCG_M19_AlternatePrinting')).ok, true, 'playable with a target');
  // A 0-Attack monster's copy has 0 Health and dies at once.
  const t = setup();
  const wall = placeMonster(t, 0, 'CCG_M06_SleeveGuardian');
  ok(play(t, 0, 'CCG_M19_AlternatePrinting', wall.uid));
  assert.equal(monsters(t, 0).length, 2, 'the wall and Alternate Printing, no copy');
});

test('a cloned state never shares the House Rule', () => {
  const s = setup();
  placeMonster(s, 1, 'CCG_M18_Judge');
  ok(play(s, 0, 'CCG_S06_ErrataWeek'));
  const c = cloneState(s);
  c.rule.until = 99;
  assert.notEqual(s.rule.until, 99);
});

test('the reworked cards read clearly', () => {
  assert.equal(rulesText(CARDS.CCG_S07_Errata), 'Errata a monster: swap its Attack and Health. Draw a card.');
  assert.match(rulesText(CARDS.CCG_S05_LimitedFormat), /^House Rule for 3 turns: boards hold only 4 monsters\. Draw a card\.$/);
  assert.match(rulesText(CARDS.CCG_M09_RulesLawyer), /next spell does nothing/);
  for (const id of ['CCG_S03_AltArt', 'CCG_S06_ErrataWeek', 'CCG_S09_PauperFormat', 'CCG_S01_DraftNight', 'CCG_S02_HandSizeErrata',
    'CCG_S11_BalancePatch', 'CCG_S10_Rotation', 'CCG_S04_Typo', 'CCG_M19_AlternatePrinting']) assert.doesNotMatch(rulesText(CARDS[id]), /\[|\.\./, id);
});

test('the AI plays Card Game starters to the end with the new cards in them', () => {
  for (const [i, deck] of starterDecks('CardGame').entries()) {
    const s = createGame({ decks: [deck.cards, starterDecks('CardGame')[(i + 1) % 3].cards], seed: 100 + i });
    for (let n = 0; n < 4000 && !s.over; n++) ok(applyAction(s, chooseAction(s)));
    assert.ok(s.over, deck.name);
  }
});
