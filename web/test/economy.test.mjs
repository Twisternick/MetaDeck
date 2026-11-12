import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, MAX_COPIES, starterDecks } from '../src/data/index.js';
import {
  CARD_RARITY, CORE_COPIES, rarityOf, newProfile, normalizeProfile, ownsDeck, missingCards, craft, disenchant,
  upgrade, openPack, buyPack, PACK_SIZE, LEGENDARY_PITY, recordMatch, seasonReward, SEASON_TIERS, claimSeason,
  TIER_XP, COSMETICS, buyCosmetic, equipCosmetic, buySeasonPass, creditGems, rerollQuest, MAX_QUESTS,
  DAILY_WIN_GOLD_CAP, archLevel, ownedTotal, craftCost, dustValue, runOp, addPacks,
} from '../src/data/economy.js';
import { nextRandom } from '../src/engine/rng.js';

const mulberry32 = seed => { const s = { rng: seed }; return () => nextRandom(s); };

const at = (s = '2026-11-12T12:00:00') => new Date(s);

test('every archetype has 30 commons, 5 rares, 3 epics and 2 legendaries', () => {
  for (const d of DECKS) {
    const n = r => d.cards.filter(c => rarityOf(c.cardId) === r).length;
    assert.deepEqual([n('common'), n('rare'), n('epic'), n('legendary')], [30, 5, 3, 2], d.id);
  }
  assert.equal(Object.keys(CARD_RARITY).length, DECKS.length * 40);
});

test('a new player owns every free starter deck and nothing above Common', () => {
  const p = newProfile(at());
  for (const d of DECKS) {
    assert.ok(ownsDeck(p, starterDecks(d.id)[0].cards), `${d.id} core starter`);
    assert.ok(!ownsDeck(p, starterDecks(d.id)[1].cards), `${d.id} second starter is locked`);
  }
  assert.ok(Object.keys(p.cards).every(id => rarityOf(id) === 'common'));
  assert.equal(p.quests.length, MAX_QUESTS);
});

test('craft, upgrade and disenchant move Dust and copies, and the core set is protected', () => {
  const p = newProfile(at());
  const core = Object.keys(CORE_COPIES).find(id => CORE_COPIES[id] === 2);
  assert.equal(disenchant(p, core).ok, false);
  const legend = Object.keys(CARD_RARITY).find(id => rarityOf(id) === 'legendary');
  assert.equal(craft(p, legend).ok, false, 'not enough dust');
  p.dust = 10000;
  assert.equal(craft(p, legend).ok, true);
  assert.equal(p.dust, 10000 - craftCost(legend));
  assert.equal(upgrade(p, legend).ok, true);
  assert.equal(p.cards[legend].p, 1);
  assert.equal(craft(p, legend).ok, true);
  assert.equal(craft(p, legend).ok, false, 'max copies');
  const before = p.dust;
  assert.equal(disenchant(p, legend, true).ok, true);
  assert.equal(p.dust, before + dustValue(legend, true));
});

test('packs: 5 cards, a Rare or better, duplicate protection and the Legendary pity timer', () => {
  const p = newProfile(at());
  const rng = mulberry32(7);
  let sinceLegend = 0;
  for (let i = 0; i < 400; i++) {
    const pulls = openPack(p, i % 2 ? 'any' : 'Horror', rng);
    assert.equal(pulls.length, PACK_SIZE);
    assert.ok(pulls.some(c => c.rarity !== 'common'));
    sinceLegend = pulls.some(c => c.rarity === 'legendary') ? 0 : sinceLegend + 1;
    assert.ok(sinceLegend < LEGENDARY_PITY);
    for (const c of pulls) if (!c.dust) assert.ok(ownedTotal(p, c.id) <= MAX_COPIES);
  }
  // After that many packs every Horror card is maxed, so extra copies came back as Dust.
  assert.ok(DECKS.find(d => d.id === 'Horror').cards.every(c => ownedTotal(p, c.cardId) === MAX_COPIES));
});

test('shop purchases spend the right currency', () => {
  const p = newProfile(at());
  assert.equal(buyPack(p, 'RPG', 'gold').ok, true);
  assert.equal(p.packs.RPG, 1);
  assert.equal(buyPack(p, 'RPG', 'gems').ok, false);
  creditGems(p, 'gems-2600', at(), true);
  assert.equal(buyPack(p, 'any', 'gems', 10).ok, true);
  assert.equal(p.gems, 2600 - 900);
  const back = COSMETICS.find(c => c.gems && c.kind === 'back');
  assert.equal(equipCosmetic(p, back.id), false);
  assert.equal(buyCosmetic(p, back.id).ok, true);
  assert.equal(equipCosmetic(p, back.id), true);
  assert.equal(p.cosmetics.back, back.id);
  assert.equal(buySeasonPass(p).ok, true);
  assert.equal(p.gems, 2600 - 900 - back.gems - 1000);
  assert.equal(buySeasonPass(p).ok, false, 'already unlocked');
});

test('matches pay Gold (capped daily), quest rewards, season XP and archetype levels', () => {
  const p = newProfile(at());
  p.quests = [{ id: 'q', kind: 'winWith', deck: 'RPG', goal: 2, gold: 80, progress: 0 }];
  const first = recordMatch(p, { deckId: 'RPG', won: true, damage: 30 }, at());
  assert.equal(first.firstWin, true);
  assert.equal(first.gold, 10 + 50);
  const second = recordMatch(p, { deckId: 'RPG', won: true, damage: 30 }, at());
  assert.equal(second.quests.length, 1);
  assert.equal(second.gold, 10 + 80);
  for (let i = 0; i < 30; i++) recordMatch(p, { deckId: 'RPG', won: true }, at());
  assert.equal(p.daily.winGold, DAILY_WIN_GOLD_CAP);
  // 32 wins = 96 XP = level 10, which unlocked both other RPG starters.
  assert.equal(archLevel(p.arch.RPG.xp), 10);
  for (const s of starterDecks('RPG')) assert.ok(ownsDeck(p, s.cards), s.name);
  assert.ok(p.packs.RPG >= 9);
});

test('season track: every tier has a reward on both tracks, premium needs the pass', () => {
  for (let t = 1; t <= SEASON_TIERS; t++) for (const track of ['free', 'premium']) assert.ok(seasonReward(track, t), `${track} ${t}`);
  for (const c of COSMETICS.filter(c => c.season)) assert.equal(seasonReward(c.season.track, c.season.tier).id, c.id);
  const p = newProfile(at());
  p.season.xp = TIER_XP * 5;
  assert.ok(claimSeason(p, 'free', 5));
  assert.equal(claimSeason(p, 'free', 5), null, 'claimed once');
  assert.equal(claimSeason(p, 'free', 6), null, 'not reached');
  assert.equal(claimSeason(p, 'premium', 1), null, 'no pass');
  p.season.premium = true;
  assert.ok(claimSeason(p, 'premium', 4));
});

test('a stored profile is repaired, keeps the core set and rolls into a new day and season', () => {
  const p = newProfile(at('2026-10-01T09:00:00'));
  p.gold = -5;
  p.cards = { bogus: { n: 2, p: 0 } };
  p.season.xp = 999;
  p.quests = [];
  const q = normalizeProfile(JSON.parse(JSON.stringify(p)), at('2026-11-12T09:00:00'));
  assert.equal(q.gold, 0);
  assert.ok(!q.cards.bogus);
  assert.ok(ownsDeck(q, starterDecks('FPS')[0].cards));
  assert.equal(q.season.xp, 0);
  assert.equal(q.quests.length, 1);
  assert.equal(rerollQuest(q, q.quests[0].id, at('2026-11-12T10:00:00')), true);
  assert.equal(rerollQuest(q, q.quests[0].id, at('2026-11-12T11:00:00')), false, 'once a day');
  assert.equal(normalizeProfile(null).v, 1);
  assert.equal(missingCards(q, starterDecks('FPS')[0].cards).length, 0);
});

test('openPacks opens several packs at once, never more than you have', () => {
  const p = newProfile(at());
  addPacks(p, 'Horror', 12);
  const ten = runOp(p, 'openPacks', { kind: 'Horror', count: 10 }, { now: at(), rng: mulberry32(7) });
  assert.equal(ten.ok, true);
  assert.equal(ten.packs.length, 10);
  assert.ok(ten.packs.every(pk => pk.length === PACK_SIZE));
  assert.equal(p.packs.Horror, 2);
  const rest = runOp(p, 'openPacks', { kind: 'Horror', count: 999 }, { now: at(), rng: mulberry32(8) });
  assert.equal(rest.packs.length, 2);
  assert.equal(p.packs.Horror, undefined);
  assert.equal(runOp(p, 'openPacks', { kind: 'Horror', count: 5 }, { now: at() }).ok, false);
  assert.equal(runOp(p, 'openPacks', { kind: '__proto__', count: 5 }, { now: at() }).ok, false);
});
