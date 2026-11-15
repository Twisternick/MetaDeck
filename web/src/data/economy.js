// The economy: rarities, the player's collection, currencies, packs, crafting, daily quests, archetype
// levels, the season track and cosmetics. Pure functions over a plain-data profile, so it runs in the
// browser and in Node. ui/profile.js loads and saves the profile; nothing here touches storage or the DOM.
//
// Currencies: Gold is earned by playing and buys packs. Gems are bought (or earned in small amounts on the
// season track) and buy packs, cosmetics and the premium season track. Dust comes from duplicates and
// disenchanting, and crafts the exact card you want. Everything that changes how a deck plays can be
// earned with Gold and Dust alone; Gems only speed that up or buy looks.

import { DECKS, CARDS, MAX_COPIES, starterDecks, countCards } from './index.js';

export const PROFILE_VERSION = 1;

// ---------------------------------------------------------------- rarity

export const RARITY = {
  common: { name: 'Common', craft: 40, dust: 5, weight: 0.72 },
  rare: { name: 'Rare', craft: 100, dust: 20, weight: 0.21 },
  epic: { name: 'Epic', craft: 400, dust: 100, weight: 0.055 },
  legendary: { name: 'Legendary', craft: 1600, dust: 400, weight: 0.015 },
};
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];
export const PREMIUM_MULT = 4;      // a premium (animated) copy costs and disenchants for 4x
export const PREMIUM_CHANCE = 0.05; // per card in a pack
// Hologram: the finish above premium, its art projected above the card. Made by upgrading a premium
// copy, found in about 1 pack card in 100, and given on two premium season tiers.
export const HOLO_MULT = 12;
export const HOLO_CHANCE = 0.01;
export const LEGENDARY_PITY = 30;   // a pack without a Legendary in this many is guaranteed one

// Each archetype's first starter is its core set: all Common, and every new player owns it. Of the 10
// cards the core set leaves out, the two most expensive are Legendary, the next three Epic, the rest Rare.
// Rarity says how hard a card is to collect, not how strong it is.
export const CARD_RARITY = {};
export const CORE_COPIES = {}; // cardId -> copies in the core set (what a new player owns)
for (const deck of DECKS) {
  const core = starterDecks(deck.id)[0].cards;
  for (const [id, n] of countCards(core)) CORE_COPIES[id] = n;
  const rest = deck.cards.filter(c => !CORE_COPIES[c.cardId])
    .sort((a, b) => b.cost - a.cost || a.cardId.localeCompare(b.cardId));
  rest.forEach((c, i) => { CARD_RARITY[c.cardId] = i < 2 ? 'legendary' : i < 5 ? 'epic' : 'rare'; });
  for (const c of deck.cards) CARD_RARITY[c.cardId] ??= 'common';
}
export const rarityOf = id => CARD_RARITY[id] ?? 'common';
export const craftCost = (id, premium = false) => RARITY[rarityOf(id)].craft * (premium ? PREMIUM_MULT : 1);
export const dustValue = (id, premium = false, holo = false) => RARITY[rarityOf(id)].dust * (holo ? HOLO_MULT : premium ? PREMIUM_MULT : 1);

// ---------------------------------------------------------------- time

const pad = n => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Seasons run for a calendar month.
export const seasonKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const seasonName = key => {
  const [y, m] = key.split('-').map(Number);
  return `${new Date(y, m - 1, 1).toLocaleString('en', { month: 'long' })} ${y} Season`;
};

// ---------------------------------------------------------------- cosmetics

// `gems` is the shop price; `season` is where the track gives it ({ track, tier }). Defaults cost nothing.
// `deck` marks a genre's own back and arena: every deck has exactly one of each. `founder` items are only
// ever given to Meta Founders (FOUNDER below) and never sold. A frame dresses the player's own cards.
export const COSMETICS = [
  { id: 'back:classic', kind: 'back', name: 'Classic', blurb: 'The standard MetaDeck back.', default: true },
  { id: 'back:neon-grid', kind: 'back', name: 'Neon Grid', blurb: 'A scrolling synth grid.', gems: 300 },
  { id: 'back:aurora', kind: 'back', name: 'Aurora', blurb: 'Northern lights that never sit still.', gems: 300 },
  { id: 'back:gold-circuit', kind: 'back', name: 'Gold Circuit', blurb: 'Pulsing gold traces on black.', gems: 500 },
  { id: 'back:pixel-pop', kind: 'back', name: 'Pixel Pop', blurb: 'Retro pixels in candy colours.', season: { track: 'premium', tier: 10 } },
  { id: 'back:void-rift', kind: 'back', name: 'Void Rift', blurb: 'A swirling tear in space.', season: { track: 'free', tier: 30 } },
  { id: 'back:midnight-tape', kind: 'back', name: 'Midnight Tape', blurb: 'Found footage that watches back.', gems: 300, deck: 'Horror' },
  { id: 'back:dragon-hoard', kind: 'back', name: 'Dragon Hoard', blurb: 'A gold dragon coiled around its treasure.', gems: 700, deck: 'RPG' },
  { id: 'back:dog-tags', kind: 'back', name: 'Dog Tags', blurb: 'Steel tags on rain-soaked camo.', gems: 300, deck: 'FPS' },
  { id: 'back:cloud-hop', kind: 'back', name: 'Cloud Hop', blurb: 'Pixel islands drifting through a bright sky.', gems: 300, deck: 'Platformer' },
  { id: 'back:chequered-flag', kind: 'back', name: 'Chequered Flag', blurb: 'The flag drops. Floor it.', gems: 300, deck: 'Racing' },
  { id: 'back:dojo-seal', kind: 'back', name: 'Dojo Seal', blurb: 'An ink-brush circle burning with fighting spirit.', gems: 300, deck: 'Fighting' },
  { id: 'back:stadium-lights', kind: 'back', name: 'Stadium Lights', blurb: 'Floodlights blazing over fresh-cut turf.', gems: 300, deck: 'Sports' },
  { id: 'back:war-banner', kind: 'back', name: 'War Banner', blurb: 'Raise the standard and march.', gems: 300, deck: 'Strategy' },
  { id: 'back:blueprint', kind: 'back', name: 'Blueprint', blurb: 'A whole city, drawn up in teal ink.', gems: 300, deck: 'CityBuilder' },
  { id: 'back:house-deck', kind: 'back', name: 'House Deck', blurb: 'The back of every card in the shop.', gems: 300, deck: 'CardGame' },
  { id: 'arena:standard', kind: 'arena', name: 'Standard Arena', blurb: 'The classic battlefield.', default: true },
  { id: 'arena:synthwave', kind: 'arena', name: 'Synthwave', blurb: 'Sunset gradient and a rolling grid.', gems: 600 },
  { id: 'arena:deep-space', kind: 'arena', name: 'Deep Space', blurb: 'Nebulae drifting behind the board.', gems: 600 },
  { id: 'arena:sunset-court', kind: 'arena', name: 'Sunset Court', blurb: 'Warm dusk over the arena.', season: { track: 'free', tier: 20 } },
  { id: 'arena:molten-core', kind: 'arena', name: 'Molten Core', blurb: 'Lava light pulsing from below.', season: { track: 'premium', tier: 20 } },
  { id: 'arena:crystal-vault', kind: 'arena', name: 'Crystal Vault', blurb: 'Prismatic light on ice.', season: { track: 'premium', tier: 40 } },
  { id: 'arena:haunted-manor', kind: 'arena', name: 'Haunted Manor', blurb: 'Candlelight, fog and something in the corner.', gems: 600, deck: 'Horror' },
  { id: 'arena:night-circuit', kind: 'arena', name: 'Night Circuit', blurb: 'Floodlit asphalt and passing light trails.', gems: 600, deck: 'Racing' },
  { id: 'arena:killhouse', kind: 'arena', name: 'Killhouse', blurb: 'Wet concrete, sandbags and rain that never stops.', gems: 600, deck: 'FPS' },
  { id: 'arena:sky-islands', kind: 'arena', name: 'Sky Islands', blurb: 'Floating platforms under a twinkling dusk.', gems: 600, deck: 'Platformer' },
  { id: 'arena:tavern-table', kind: 'arena', name: 'Tavern Table', blurb: 'Candles, a quest map and a round on the house.', gems: 600, deck: 'RPG' },
  { id: 'arena:dojo-floor', kind: 'arena', name: 'Dojo Floor', blurb: 'Tatami, paper lanterns and sparks in the air.', gems: 600, deck: 'Fighting' },
  { id: 'arena:home-turf', kind: 'arena', name: 'Home Turf', blurb: 'Striped grass under the floodlights.', gems: 600, deck: 'Sports' },
  { id: 'arena:war-table', kind: 'arena', name: 'War Table', blurb: 'A campaign map under drifting fog of war.', gems: 600, deck: 'Strategy' },
  { id: 'arena:model-city', kind: 'arena', name: 'Model City', blurb: 'A tiny town lighting up at dusk.', gems: 600, deck: 'CityBuilder' },
  { id: 'arena:card-table', kind: 'arena', name: 'Card Table', blurb: 'Tournament felt, deck boxes and dice.', gems: 600, deck: 'CardGame' },
  { id: 'frame:standard', kind: 'frame', name: 'Standard Frame', blurb: 'Your cards in their deck’s colours.', default: true },
  // Meta Founders only.
  { id: 'back:founder', kind: 'back', name: 'Founder’s Seal', blurb: 'A gold founding crest. Only the first players ever have this.', founder: true },
  { id: 'arena:founders-hall', kind: 'arena', name: 'Founders’ Hall', blurb: 'A gilded hall lit for the first players.', founder: true },
  { id: 'frame:founder', kind: 'frame', name: 'Founder Gold', blurb: 'A gleaming gold frame on every card you play, for everyone to see.', founder: true },
];
export const cosmetic = id => COSMETICS.find(c => c.id === id);
export const ownsCosmetic = (p, id) => !!cosmetic(id)?.default || p.cosmetics.owned.includes(id);

// ---------------------------------------------------------------- Meta Founders
// The first FOUNDER.slots accounts are Meta Founders, numbered in sign-up order (the server assigns the
// number: server/accounts.mjs). They get the title "Meta Founder #n", the founder-only back, arena and card
// frame straight away, and FOUNDER.gems Gems once they've finished FOUNDER.gemsAfterGames matches (so a
// throwaway account can't just collect them).
export const FOUNDER = { slots: 100, gems: 7000, gemsAfterGames: 3, title: 'Meta Founder' };
export const FOUNDER_COSMETICS = COSMETICS.filter(c => c.founder).map(c => c.id);
export const founderTitle = n => (Number.isInteger(n) && n > 0 ? `${FOUNDER.title} #${n}` : null);

// Make a profile founder number `n`. Returns false if it already is one.
export function makeFounder(p, n) {
  if (p.founder) return false;
  p.founder = n;
  p.founderGems = 'pending';
  for (const id of FOUNDER_COSMETICS) if (!p.cosmetics.owned.includes(id)) p.cosmetics.owned.push(id);
  return true;
}
// Take founder status away (an account that shouldn't have it). Gems already paid stay.
export function unmakeFounder(p) {
  if (!p.founder) return false;
  p.founder = null;
  if (p.founderGems === 'pending') p.founderGems = null;
  p.cosmetics.owned = p.cosmetics.owned.filter(id => !FOUNDER_COSMETICS.includes(id));
  for (const c of COSMETICS) if (c.default && !ownsCosmetic(p, p.cosmetics[c.kind])) p.cosmetics[c.kind] = c.id;
  tidyLoadouts(p);
  return true;
}

// ---------------------------------------------------------------- profile

export const STARTING_GOLD = 300; // three packs of the player's choice
export const STARTING_DUST = 100;

export function newProfile(now = new Date()) {
  const cards = {};
  for (const [id, n] of Object.entries(CORE_COPIES)) cards[id] = { n, p: 0, h: 0 };
  const p = {
    v: PROFILE_VERSION,
    gold: STARTING_GOLD, gems: 0, dust: STARTING_DUST,
    cards,
    arch: {},
    packs: {},
    pity: 0,
    quests: [], questDay: null, rerollDay: null,
    daily: { day: null, firstWin: false, winGold: 0 },
    season: { id: seasonKey(now), xp: 0, premium: false, claimed: { free: [], premium: [] } },
    cosmetics: { owned: [], back: 'back:classic', arena: 'arena:standard', frame: 'frame:standard', perDeck: {}, premiumArt: true },
    stats: { games: 0, wins: 0 },
    tutorial: false, // finished the tutorial (and got its pack)
    purchases: [],
    gemDebt: 0, // Gems a refund took back after they were spent (blocks Gem spending until repaid)
    founder: null,     // Meta Founder number (1..FOUNDER.slots), or null
    founderGems: null, // 'pending' until the founder Gems are paid, then 'paid'
    createdAt: now.toISOString(),
  };
  refreshDaily(p, now, () => 0.5, 3);
  return p;
}

// Repair a stored profile: fill anything missing, drop cards that no longer exist, roll the day and season.
export function normalizeProfile(raw, now = new Date(), rng = Math.random) {
  if (!raw || typeof raw !== 'object' || raw.v !== PROFILE_VERSION) return newProfile(now);
  const p = { ...newProfile(now), ...raw };
  const num = v => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  p.gold = num(p.gold); p.gems = num(p.gems); p.dust = num(p.dust); p.pity = num(p.pity);
  p.tutorial = raw.tutorial === true;
  p.gemDebt = num(raw.gemDebt);
  p.founder = Number.isInteger(raw.founder) && raw.founder > 0 ? raw.founder : null;
  p.founderGems = raw.founderGems === 'pending' || raw.founderGems === 'paid' ? raw.founderGems : null;
  const cards = {};
  for (const [id, c] of Object.entries(raw.cards ?? {})) {
    if (!CARDS[id]?.deckId) continue;
    const holo = Math.min(MAX_COPIES, num(c?.h));
    const prem = Math.min(MAX_COPIES - holo, num(c?.p));
    cards[id] = { n: Math.min(MAX_COPIES - holo - prem, num(c?.n)), p: prem, h: holo };
  }
  for (const [id, n] of Object.entries(CORE_COPIES)) {
    const c = (cards[id] ??= { n: 0, p: 0, h: 0 });
    if (c.n + c.p + c.h < n) c.n = n - c.p - c.h; // nobody ever loses their core set
  }
  p.cards = cards;
  p.cosmetics = { ...newProfile(now).cosmetics, ...raw.cosmetics };
  p.cosmetics.owned = (p.cosmetics.owned ?? []).filter(id => cosmetic(id));
  if (!ownsCosmetic(p, p.cosmetics.back)) p.cosmetics.back = 'back:classic';
  if (!ownsCosmetic(p, p.cosmetics.arena)) p.cosmetics.arena = 'arena:standard';
  if (!ownsCosmetic(p, p.cosmetics.frame)) p.cosmetics.frame = 'frame:standard';
  tidyLoadouts(p);
  if (p.season?.id !== seasonKey(now)) p.season = { id: seasonKey(now), xp: 0, premium: false, claimed: { free: [], premium: [] } };
  refreshDaily(p, now, rng);
  return p;
}

// ---------------------------------------------------------------- collection

const NO_COPIES = Object.freeze({ n: 0, p: 0, h: 0 });
export const owned = (p, id) => (p.cards[id] ? { ...NO_COPIES, ...p.cards[id] } : NO_COPIES);
export const ownedTotal = (p, id) => { const c = owned(p, id); return c.n + c.p + c.h; };
export const hasPremium = (p, id) => owned(p, id).p > 0;
export const hasHolo = (p, id) => owned(p, id).h > 0;
// The best finish the player owns of a card: 'holo', 'premium' or null.
export const bestFinish = (p, id) => (hasHolo(p, id) ? 'holo' : hasPremium(p, id) ? 'premium' : null);
// A card's copy counts, created on first use (older saves have no hologram count yet).
const copies = (p, id) => { const c = (p.cards[id] ??= { n: 0, p: 0, h: 0 }); c.h ??= 0; return c; };

// Cards a deck list needs that the player doesn't own: [{ id, need }].
export function missingCards(p, cards) {
  const out = [];
  for (const [id, n] of countCards(cards)) if (ownedTotal(p, id) < n) out.push({ id, need: n - ownedTotal(p, id) });
  return out;
}
export const missingDust = (p, cards) => missingCards(p, cards).reduce((s, m) => s + craftCost(m.id) * m.need, 0);
export const ownsDeck = (p, cards) => missingCards(p, cards).length === 0;

// How many copies of a card can be disenchanted: everything above the core set's copies.
export const spareCopies = (p, id) => Math.max(0, ownedTotal(p, id) - (CORE_COPIES[id] ?? 0));

export function craft(p, id, premium = false) {
  if (!CARDS[id]?.deckId) return { ok: false, reason: 'Unknown card.' };
  if (ownedTotal(p, id) >= MAX_COPIES) return { ok: false, reason: `You already own ${MAX_COPIES} copies.` };
  const cost = craftCost(id, premium);
  if (p.dust < cost) return { ok: false, reason: `Needs ${cost} Dust.` };
  p.dust -= cost;
  const c = copies(p, id);
  premium ? c.p++ : c.n++;
  return { ok: true, cost };
}

// Turn one normal copy into a premium one, or (holo) one premium copy into a hologram, for the
// difference in price.
export const upgradeCost = (id, holo = false) => (holo
  ? RARITY[rarityOf(id)].craft * (HOLO_MULT - PREMIUM_MULT)
  : craftCost(id, true) - craftCost(id));
export function upgrade(p, id, holo = false) {
  const c = owned(p, id);
  if (holo ? !c.p : !c.n) return { ok: false, reason: holo ? 'No premium copy to upgrade.' : 'No normal copy to upgrade.' };
  const cost = upgradeCost(id, holo);
  if (p.dust < cost) return { ok: false, reason: `Needs ${cost} Dust.` };
  p.dust -= cost;
  const k = copies(p, id);
  if (holo) { k.p--; k.h++; } else { k.n--; k.p++; }
  return { ok: true, cost };
}

export function disenchant(p, id, premium = false, holo = false) {
  const c = owned(p, id);
  if (!spareCopies(p, id)) return { ok: false, reason: 'Core set copies can’t be disenchanted.' };
  if (holo ? !c.h : premium ? !c.p : !c.n) return { ok: false, reason: 'No such copy.' };
  const k = copies(p, id);
  if (holo) k.h--; else if (premium) k.p--; else k.n--;
  const value = dustValue(id, premium, holo);
  p.dust += value;
  return { ok: true, value };
}

// ---------------------------------------------------------------- packs

export const PACK_SIZE = 5;
export const PACK_GOLD = 100;
export const PACK_GEMS = 100;
// 'any' packs draw each card from every archetype.
export const packPool = kind => (kind === 'any' ? DECKS : DECKS.filter(d => d.id === kind)).flatMap(d => d.cards.map(c => c.cardId));

export const PACK_ODDS = RARITY_ORDER.map(r => ({ rarity: r, chance: RARITY[r].weight }));

function rollRarity(rng, floor = 'common') {
  const allowed = RARITY_ORDER.slice(RARITY_ORDER.indexOf(floor));
  const total = allowed.reduce((s, r) => s + RARITY[r].weight, 0);
  let x = rng() * total;
  for (const r of allowed) if ((x -= RARITY[r].weight) < 0) return r;
  return allowed[allowed.length - 1];
}

// Open a pack: 5 cards, at least one Rare or better, a Legendary at least every LEGENDARY_PITY packs.
// Duplicate protection: a card you already own MAX_COPIES of is only drawn when every card of that
// rarity is maxed, and then it turns straight into Dust.
// Returns [{ id, rarity, premium, holo, fresh (first copy), dust (if converted) }].
export function openPack(p, kind, rng = Math.random) {
  const pool = packPool(kind);
  if (!pool.length) throw new Error(`Unknown pack ${kind}`);
  const rarities = Array.from({ length: PACK_SIZE }, () => rollRarity(rng));
  if (!rarities.some(r => r !== 'common')) rarities[PACK_SIZE - 1] = rollRarity(rng, 'rare');
  if (!rarities.includes('legendary') && p.pity + 1 >= LEGENDARY_PITY) rarities[PACK_SIZE - 1] = 'legendary';
  p.pity = rarities.includes('legendary') ? 0 : p.pity + 1;

  const pulled = [];
  const pending = new Map(); // copies pulled earlier in this pack count toward the cap
  for (const rarity of rarities) {
    const ofRarity = pool.filter(id => rarityOf(id) === rarity);
    const open = ofRarity.filter(id => ownedTotal(p, id) + (pending.get(id) ?? 0) < MAX_COPIES);
    const from = open.length ? open : ofRarity;
    const id = from[Math.floor(rng() * from.length)];
    const finish = rng();
    const holo = finish < HOLO_CHANCE;
    const premium = !holo && finish < HOLO_CHANCE + PREMIUM_CHANCE;
    if (!open.length) {
      const dust = dustValue(id, premium, holo);
      p.dust += dust;
      pulled.push({ id, rarity, premium, holo, fresh: false, dust });
      continue;
    }
    const fresh = ownedTotal(p, id) === 0 && !pending.has(id);
    pending.set(id, (pending.get(id) ?? 0) + 1);
    const c = copies(p, id);
    if (holo) c.h++; else if (premium) c.p++; else c.n++;
    pulled.push({ id, rarity, premium, holo, fresh, dust: 0 });
  }
  return pulled;
}

export const addPacks = (p, kind, n = 1) => { p.packs[kind] = (p.packs[kind] ?? 0) + n; };
export function takePack(p, kind) {
  if (!p.packs[kind]) return false;
  if (--p.packs[kind] === 0) delete p.packs[kind];
  return true;
}
export const unopenedPacks = p => Object.values(p.packs).reduce((s, n) => s + n, 0);

// ---------------------------------------------------------------- shop

export const GEM_BUNDLES = [
  { id: 'gems-100', gems: 100, price: 0.99 },
  { id: 'gems-550', gems: 550, price: 4.99, bonus: '10% bonus' },
  { id: 'gems-1200', gems: 1200, price: 9.99, bonus: '20% bonus' },
  { id: 'gems-2600', gems: 2600, price: 19.99, bonus: '30% bonus' },
  { id: 'gems-7000', gems: 7000, price: 49.99, bonus: '40% bonus' },
];
export const PACK_BUNDLE = { packs: 10, gems: 900 };
// Where paid random packs are restricted (Belgium treats them as gambling): packs can't be bought with
// Gems there; Gold packs, cosmetics and the season track are unaffected. The server decides the
// player's country (Cloudflare's CF-IPCountry header); it's never taken from the browser.
export const NO_PAID_PACKS = new Set(['BE']);
// Gem purchases are for adults only (accounts whose birth year makes them 18 or older this year).
export const PURCHASE_MIN_AGE = 18;
const DEBT = 'A refund took back Gems you had already spent, so Gem purchases in the shop are paused until your balance is back above zero.';
export const SEASON_PASS_GEMS = 1000;

export function buyPack(p, kind, currency, count = 1, country = null) {
  if (!packPool(kind).length) return { ok: false, reason: 'Unknown pack.' };
  if (currency === 'gems' && NO_PAID_PACKS.has(country)) return { ok: false, reason: 'Packs can’t be bought with Gems in your country. Gold packs are still available.' };
  if (currency === 'gems' && p.gemDebt > 0) return { ok: false, reason: DEBT };
  const price = currency === 'gold' ? PACK_GOLD * count
    : count === PACK_BUNDLE.packs ? PACK_BUNDLE.gems : PACK_GEMS * count;
  if (p[currency] < price) return { ok: false, reason: `Not enough ${currency === 'gold' ? 'Gold' : 'Gems'}.` };
  p[currency] -= price;
  addPacks(p, kind, count);
  return { ok: true, price };
}

export function buyCosmetic(p, id) {
  const c = cosmetic(id);
  if (!c?.gems) return { ok: false, reason: 'Not for sale.' };
  if (ownsCosmetic(p, id)) return { ok: false, reason: 'Already owned.' };
  if (p.gemDebt > 0) return { ok: false, reason: DEBT };
  if (p.gems < c.gems) return { ok: false, reason: 'Not enough Gems.' };
  p.gems -= c.gems;
  p.cosmetics.owned.push(id);
  return { ok: true, price: c.gems };
}

// ---------------------------------------------------------------- loadouts
// What a player plays with: a card back, an arena and a card frame. `p.cosmetics.back/arena/frame` are the
// defaults; `p.cosmetics.perDeck[deckId]` can override any of them for one archetype (Racing on the
// Chequered Flag back and Night Circuit arena, say). A kind a deck doesn't override uses the default.
export const LOADOUT_KINDS = ['back', 'arena', 'frame'];

// The back, arena and frame for playing `deckId` (or the defaults, without one).
export function loadoutFor(p, deckId = null) {
  const own = (deckId && p.cosmetics.perDeck?.[deckId]) || {};
  return Object.fromEntries(LOADOUT_KINDS.map(k => [k, own[k] && ownsCosmetic(p, own[k]) ? own[k] : p.cosmetics[k]]));
}

// Equip a cosmetic as the default, or (with `deckId`) only for that archetype.
export function equipCosmetic(p, id, deckId = null) {
  const c = cosmetic(id);
  if (!c || !ownsCosmetic(p, id)) return false;
  if (deckId) {
    if (!DECKS.some(d => d.id === deckId) || !LOADOUT_KINDS.includes(c.kind)) return false;
    ((p.cosmetics.perDeck ??= {})[deckId] ??= {})[c.kind] = id;
  } else {
    p.cosmetics[c.kind] = id;
  }
  return true;
}

// Make an archetype use the default `kind` again.
export function clearDeckCosmetic(p, kind, deckId) {
  const own = p.cosmetics.perDeck?.[deckId];
  if (!own?.[kind]) return false;
  delete own[kind];
  if (!Object.keys(own).length) delete p.cosmetics.perDeck[deckId];
  return true;
}

// Drop overrides for unknown decks, kinds or cosmetics the player no longer owns.
function tidyLoadouts(p) {
  const out = {};
  for (const [deckId, own] of Object.entries(p.cosmetics.perDeck ?? {})) {
    if (!DECKS.some(d => d.id === deckId) || !own || typeof own !== 'object') continue;
    const keep = Object.fromEntries(LOADOUT_KINDS.filter(k => typeof own[k] === 'string' && cosmetic(own[k])?.kind === k && ownsCosmetic(p, own[k])).map(k => [k, own[k]]));
    if (Object.keys(keep).length) out[deckId] = keep;
  }
  p.cosmetics.perDeck = out;
}

export function buySeasonPass(p) {
  if (p.season.premium) return { ok: false, reason: 'Already unlocked.' };
  if (p.gemDebt > 0) return { ok: false, reason: DEBT };
  if (p.gems < SEASON_PASS_GEMS) return { ok: false, reason: 'Not enough Gems.' };
  p.gems -= SEASON_PASS_GEMS;
  p.season.premium = true;
  return { ok: true, price: SEASON_PASS_GEMS };
}

// Real-money purchases only credit Gems once the payment provider confirms them (server/payments.mjs);
// this records that credit. Any debt from an earlier refund is paid off first. `txn` is the provider's
// transaction id, `paid` what was actually charged ({ amount, currency }).
export function creditGems(p, bundleId, now = new Date(), test = false, { txn = null, paid = null } = {}) {
  const b = GEM_BUNDLES.find(x => x.id === bundleId);
  if (!b) return { ok: false, reason: 'Unknown bundle.' };
  addGems(p, b.gems);
  p.purchases.push({ bundle: b.id, gems: b.gems, price: b.price, at: now.toISOString(), test, ...(txn ? { txn } : {}), ...(paid ? { paid } : {}) });
  return { ok: true, gems: b.gems };
}

// Add Gems, paying off any refund debt first.
export function addGems(p, n) {
  const pay = Math.min(p.gemDebt ?? 0, n);
  p.gemDebt = (p.gemDebt ?? 0) - pay;
  p.gems += n - pay;
}

// A refund or chargeback takes back `gems`. What's already been spent becomes debt, which blocks Gem
// spending until new Gems (bought or earned) pay it off. Marks the purchase as `status`.
export function takeBackGems(p, gems, txn, status, now = new Date()) {
  const take = Math.min(p.gems, gems);
  p.gems -= take;
  p.gemDebt = (p.gemDebt ?? 0) + (gems - take);
  const purchase = txn ? p.purchases.find(x => x.txn === txn) : null;
  if (purchase) { purchase.status = status; purchase.reversedAt = now.toISOString(); }
  return { taken: take, debt: gems - take };
}

// ---------------------------------------------------------------- season track

export const SEASON_TIERS = 40;
export const TIER_XP = 500;
export const seasonTier = p => Math.min(SEASON_TIERS, Math.floor(p.season.xp / TIER_XP));

// What each tier gives. The free track pays out Gold, Dust and packs; the premium track adds
// cosmetics, premium and hologram cards, extra packs and some of its Gems back.
export function seasonReward(track, tier) {
  const cos = COSMETICS.find(c => c.season?.track === track && c.season.tier === tier);
  if (cos) return { type: 'cosmetic', id: cos.id };
  if (track === 'free') {
    if (tier % 5 === 0) return { type: 'pack', kind: 'any', n: 1 };
    return tier % 2 ? { type: 'gold', n: 40 } : { type: 'dust', n: 40 };
  }
  if (tier % 5 === 0) return { type: 'pack', kind: 'any', n: 2 };
  if (tier === 28 || tier === 36) return { type: 'holoCard', rarity: tier === 36 ? 'epic' : 'rare' };
  if (tier % 4 === 0) return { type: 'premiumCard', rarity: tier >= 24 ? 'epic' : 'rare' };
  if (tier % 3 === 0) return { type: 'gems', n: 75 };
  return tier % 2 ? { type: 'gold', n: 60 } : { type: 'dust', n: 60 };
}

export const canClaim = (p, track, tier) => tier >= 1 && tier <= seasonTier(p) && !p.season.claimed[track].includes(tier)
  && (track === 'free' || p.season.premium);

// Gives a reward; returns a description of what arrived (premium cards name the card).
export function grantReward(p, reward, rng = Math.random) {
  switch (reward.type) {
    case 'gold': p.gold += reward.n; return { ...reward };
    case 'gems': p.gems += reward.n; return { ...reward };
    case 'dust': p.dust += reward.n; return { ...reward };
    case 'pack': addPacks(p, reward.kind, reward.n); return { ...reward };
    case 'cosmetic': if (!p.cosmetics.owned.includes(reward.id)) p.cosmetics.owned.push(reward.id); return { ...reward };
    case 'premiumCard': case 'holoCard': {
      const holo = reward.type === 'holoCard';
      const pool = Object.keys(CARD_RARITY).filter(id => rarityOf(id) === reward.rarity);
      const open = pool.filter(id => ownedTotal(p, id) < MAX_COPIES);
      const id = (open.length ? open : pool)[Math.floor(rng() * (open.length || pool.length))];
      if (!open.length) { const n = dustValue(id, !holo, holo); p.dust += n; return { type: 'dust', n }; }
      copies(p, id)[holo ? 'h' : 'p']++;
      return { ...reward, id };
    }
    case 'cards': {
      for (const [id, n] of countCards(reward.cards)) {
        const c = copies(p, id);
        if (c.n + c.p + c.h < n) c.n = n - c.p - c.h;
      }
      return { ...reward };
    }
    default: return null;
  }
}

export function claimSeason(p, track, tier, rng = Math.random) {
  if (!canClaim(p, track, tier)) return null;
  p.season.claimed[track].push(tier);
  return grantReward(p, seasonReward(track, tier), rng);
}

// ---------------------------------------------------------------- archetype levels

export const ARCH_LEVEL_XP = 10;
export const ARCH_MAX_LEVEL = 10;
// Levels that unlock a starter deck (the other two starters, after the free core set).
export const STARTER_UNLOCKS = { 4: 1, 7: 2 };
export const archLevel = xp => Math.min(ARCH_MAX_LEVEL, 1 + Math.floor(xp / ARCH_LEVEL_XP));
export const archInfo = (p, id) => p.arch[id] ?? { xp: 0, games: 0, wins: 0 };
export const starterUnlockLevel = index => Number(Object.keys(STARTER_UNLOCKS).find(l => STARTER_UNLOCKS[l] === index)) || 1;

// Each level gives a pack of that archetype; levels 4 and 7 also give the cards of the next starter deck.
export function levelRewards(deckId, level) {
  const out = [{ type: 'pack', kind: deckId, n: 1 }];
  const starter = STARTER_UNLOCKS[level];
  if (starter) {
    const s = starterDecks(deckId)[starter];
    out.push({ type: 'cards', cards: s.cards, name: s.name });
  }
  return out;
}

// ---------------------------------------------------------------- quests

export const MAX_QUESTS = 3;
export const QUEST_XP = 300;

const QUEST_TEMPLATES = [
  { kind: 'win', goal: 3, gold: 60 },
  { kind: 'play', goal: 5, gold: 50 },
  { kind: 'winWith', goal: 2, gold: 80 },
  { kind: 'playWith', goal: 3, gold: 50 },
  { kind: 'damage', goal: 60, gold: 60 },
];

export function questText(q) {
  const deck = q.deck ? DECKS.find(d => d.id === q.deck)?.name : '';
  switch (q.kind) {
    case 'win': return `Win ${q.goal} games`;
    case 'play': return `Play ${q.goal} games`;
    case 'winWith': return `Win ${q.goal} games with ${deck}`;
    case 'playWith': return `Play ${q.goal} games with ${deck}`;
    case 'damage': return `Deal ${q.goal} damage to enemy heroes`;
    default: return 'Quest';
  }
}

export function rollQuest(p, rng = Math.random) {
  const taken = new Set(p.quests.map(q => q.kind + (q.deck ?? '')));
  for (let tries = 0; tries < 20; tries++) {
    const t = QUEST_TEMPLATES[Math.floor(rng() * QUEST_TEMPLATES.length)];
    const deck = t.kind.endsWith('With') ? DECKS[Math.floor(rng() * DECKS.length)].id : undefined;
    if (taken.has(t.kind + (deck ?? ''))) continue;
    return { id: `${Date.now().toString(36)}${Math.floor(rng() * 1e6).toString(36)}`, ...t, deck, progress: 0 };
  }
  return { id: `${Date.now().toString(36)}x`, ...QUEST_TEMPLATES[0], progress: 0 };
}

// A new day adds a quest (up to MAX_QUESTS) and resets the daily Gold counters.
export function refreshDaily(p, now = new Date(), rng = Math.random, count = 1) {
  const today = dayKey(now);
  if (p.questDay !== today) {
    for (let i = 0; i < count && p.quests.length < MAX_QUESTS; i++) p.quests.push(rollQuest(p, rng));
    p.questDay = today;
  }
  if (p.daily.day !== today) p.daily = { day: today, firstWin: false, winGold: 0 };
}

export const canReroll = (p, now = new Date()) => p.rerollDay !== dayKey(now);
export function rerollQuest(p, questId, now = new Date(), rng = Math.random) {
  const i = p.quests.findIndex(q => q.id === questId);
  if (i < 0 || !canReroll(p, now)) return false;
  p.quests.splice(i, 1);
  p.quests.splice(i, 0, rollQuest(p, rng));
  p.rerollDay = dayKey(now);
  return true;
}

// ---------------------------------------------------------------- match rewards

export const WIN_GOLD = 10;
export const DAILY_WIN_GOLD_CAP = 100;
export const FIRST_WIN_GOLD = 50;
export const WIN_XP = 100;
export const LOSS_XP = 50;

// Record a finished match and pay out. `result` is { deckId, won, damage, online }; a draw counts as a loss.
// Returns everything that was earned so the game-over screen can show it.
export function recordMatch(p, { deckId, won, damage = 0, online = false }, now = new Date(), rng = Math.random) {
  refreshDaily(p, now, rng);
  const out = { gold: 0, xp: 0, firstWin: false, quests: [], levelUps: [], archXp: 0 };
  p.stats.games++;
  if (won) p.stats.wins++;

  // Gold for wins, capped per day, and a bonus for the first win of the day.
  if (won) {
    const winGold = Math.min(WIN_GOLD, DAILY_WIN_GOLD_CAP - p.daily.winGold);
    p.daily.winGold += winGold;
    out.gold += winGold;
    if (!p.daily.firstWin) { p.daily.firstWin = true; out.firstWin = true; out.gold += FIRST_WIN_GOLD; }
  }

  // Season XP. Online games are worth a bit more.
  out.xp = Math.round((won ? WIN_XP : LOSS_XP) * (online ? 1.5 : 1));

  // Quests.
  for (const q of [...p.quests]) {
    const add = q.kind === 'win' ? +won
      : q.kind === 'play' ? 1
      : q.kind === 'winWith' ? +(won && q.deck === deckId)
      : q.kind === 'playWith' ? +(q.deck === deckId)
      : q.kind === 'damage' ? Math.max(0, damage) : 0;
    q.progress = Math.min(q.goal, q.progress + add);
    if (q.progress >= q.goal) {
      p.quests.splice(p.quests.indexOf(q), 1);
      out.gold += q.gold;
      out.xp += QUEST_XP;
      out.quests.push({ text: questText(q), gold: q.gold });
    }
  }
  p.gold += out.gold;
  p.season.xp += out.xp;

  // Archetype XP and level-up rewards.
  // A founder's Gems, once they've played enough to show the account is real.
  if (p.founder && p.founderGems === 'pending' && p.stats.games >= FOUNDER.gemsAfterGames) {
    addGems(p, FOUNDER.gems);
    p.founderGems = 'paid';
    out.founderGems = FOUNDER.gems;
  }

  const a = (p.arch[deckId] ??= { xp: 0, games: 0, wins: 0 });
  const before = archLevel(a.xp);
  out.archXp = won ? 3 : 1;
  a.xp += out.archXp; a.games++; if (won) a.wins++;
  for (let lv = before + 1; lv <= archLevel(a.xp); lv++) {
    out.levelUps.push({ deckId, level: lv, rewards: levelRewards(deckId, lv).map(r => grantReward(p, r, rng)) });
  }
  return out;
}

// A short label for any reward, for lists and toasts.
export function rewardLabel(r) {
  const deckName = id => (id === 'any' ? 'Mixed' : DECKS.find(d => d.id === id)?.name ?? id);
  switch (r?.type) {
    case 'gold': return `${r.n} Gold`;
    case 'gems': return `${r.n} Gems`;
    case 'dust': return `${r.n} Dust`;
    case 'pack': return `${r.n > 1 ? `${r.n}× ` : ''}${deckName(r.kind)} pack`;
    case 'cosmetic': return `${cosmetic(r.id)?.kind === 'arena' ? 'Arena' : 'Card back'}: ${cosmetic(r.id)?.name}`;
    case 'premiumCard': return r.id ? `Premium ${CARDS[r.id].displayName}` : `Premium ${RARITY[r.rarity].name} card`;
    case 'holoCard': return r.id ? `Hologram ${CARDS[r.id].displayName}` : `Hologram ${RARITY[r.rarity].name} card`;
    case 'cards': return `Starter deck: ${r.name}`;
    default: return '';
  }
}

// ---------------------------------------------------------------- operations

// Every change a player can make to a profile, by name. The server applies these to the account's
// profile (so a browser can't hand itself Gold or cards), and a guest's browser applies the same ones
// to its local profile. `a` is untrusted input from the client; `ctx` is { now, rng, testPurchases }.
// Each returns { ok: true, ... } or { ok: false, reason }.
export const MIN_MATCH_GAP_MS = 15_000;
export const TUTORIAL_REWARD = { type: 'pack', kind: 'any', n: 1 }; // a reported vs-AI match can't come faster than this

const fail = reason => ({ ok: false, reason });
const str = v => (typeof v === 'string' && v.length <= 100 ? v : '');

export function craftDeck(p, cards) {
  if (!Array.isArray(cards) || cards.length > 60 || !cards.every(id => CARDS[id]?.deckId)) return fail('Unknown deck.');
  const cost = missingDust(p, cards);
  if (p.dust < cost) return fail(`Needs ${cost} Dust.`);
  for (const m of missingCards(p, cards)) {
    for (let k = 0; k < m.need; k++) { const r = craft(p, m.id); if (!r.ok) return r; }
  }
  return { ok: true, cost };
}

export const OPS = {
  refresh: () => ({ ok: true }),
  openPack: (p, a, ctx) => (takePack(p, str(a.kind)) ? { ok: true, pulls: openPack(p, str(a.kind), ctx.rng) } : fail('You have no pack of that kind.')),
  // Open up to `count` packs of a kind at once (Open 10 / Open all). Returns one pull list per pack.
  openPacks: (p, a, ctx) => {
    const kind = str(a.kind);
    const have = Object.hasOwn(p.packs, kind) ? p.packs[kind] : 0;
    const n = Math.min(have, Math.max(1, Math.floor(Number(a.count)) || 1));
    if (!n) return fail('You have no pack of that kind.');
    const packs = [];
    for (let i = 0; i < n; i++) { takePack(p, kind); packs.push(openPack(p, kind, ctx.rng)); }
    return { ok: true, packs };
  },
  buyPack: (p, a, ctx) => buyPack(p, str(a.kind), a.currency === 'gems' ? 'gems' : 'gold', a.count === PACK_BUNDLE.packs ? PACK_BUNDLE.packs : 1, ctx.country),
  buyCosmetic: (p, a) => buyCosmetic(p, str(a.id)),
  // { id, deck? }: as the default, or only for one archetype.
  equip: (p, a) => (equipCosmetic(p, str(a.id), a.deck ? str(a.deck) : null) ? { ok: true } : fail('You don’t own that.')),
  // { kind, deck }: that archetype goes back to the default.
  unequip: (p, a) => (clearDeckCosmetic(p, str(a.kind), str(a.deck)) ? { ok: true } : fail('Nothing to reset there.')),
  premiumArt: (p, a) => { p.cosmetics.premiumArt = a.on === true; return { ok: true }; },
  buySeasonPass: p => buySeasonPass(p),
  craft: (p, a) => craft(p, str(a.id), a.premium === true),
  craftDeck: (p, a) => craftDeck(p, a.cards),
  upgrade: (p, a) => upgrade(p, str(a.id), a.holo === true),
  disenchant: (p, a) => disenchant(p, str(a.id), a.premium === true, a.holo === true),
  claimSeason: (p, a, ctx) => {
    const r = claimSeason(p, a.track === 'premium' ? 'premium' : 'free', Number(a.tier), ctx.rng);
    return r ? { ok: true, reward: r } : fail('Nothing to claim there.');
  },
  claimAllSeason: (p, a, ctx) => {
    const rewards = [];
    for (let t = 1; t <= seasonTier(p); t++) for (const track of ['free', 'premium']) {
      const r = claimSeason(p, track, t, ctx.rng);
      if (r) rewards.push(r);
    }
    return { ok: true, rewards };
  },
  rerollQuest: (p, a, ctx) => (rerollQuest(p, str(a.id), ctx.now, ctx.rng) ? { ok: true } : fail('You already swapped a quest today.')),
  // A vs-AI match is played in the browser, so its result is taken on trust, at most one every MIN_MATCH_GAP_MS.
  // Online matches are recorded by the server itself (online: true never comes from a client).
  recordMatch: (p, a, ctx) => {
    if (!DECKS.some(d => d.id === a.deckId)) return fail('Unknown deck.');
    const last = Date.parse(p.lastMatchAt ?? '') || 0;
    if (!ctx.online && ctx.now.getTime() - last < MIN_MATCH_GAP_MS) return fail('Too many results too quickly.');
    p.lastMatchAt = ctx.now.toISOString();
    const damage = Math.max(0, Math.min(60, Math.floor(Number(a.damage) || 0)));
    return { ok: true, out: recordMatch(p, { deckId: a.deckId, won: a.won === true, damage, online: !!ctx.online }, ctx.now, ctx.rng) };
  },
  // The tutorial's reward, once per profile. The tutorial runs in the browser, so this is taken on
  // trust; it's worth one pack, and only ever once.
  finishTutorial: (p, a, ctx) => {
    if (p.tutorial) return fail('You already finished the tutorial.');
    p.tutorial = true;
    return { ok: true, reward: grantReward(p, TUTORIAL_REWARD, ctx.rng) };
  },
  testPurchase: (p, a, ctx) => (ctx.testPurchases ? creditGems(p, str(a.bundle), ctx.now, true) : fail('Payments are not connected yet.')),
};

// `country` (an ISO code from the server, or null) applies regional rules such as NO_PAID_PACKS.
export function runOp(p, op, args, { now = new Date(), rng = Math.random, testPurchases = false, online = false, country = null } = {}) {
  const fn = typeof op === 'string' && Object.hasOwn(OPS, op) ? OPS[op] : null;
  if (!fn) return fail('Unknown action.');
  const ctx = { now, rng, testPurchases, online, country };
  refreshDaily(p, now, rng);
  return fn(p, args && typeof args === 'object' ? args : {}, ctx) ?? fail('Something went wrong.');
}
