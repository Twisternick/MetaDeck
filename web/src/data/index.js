import fps from './decks/fps.js';
import horror from './decks/horror.js';
import platformer from './decks/platformer.js';
import rpg from './decks/rpg.js';
import racing from './decks/racing.js';
import fighting from './decks/fighting.js';
import sports from './decks/sports.js';
import strategy from './decks/strategy.js';
import cityBuilder from './decks/citybuilder.js';
import cardGame from './decks/cardgame.js';
import { TOKENS } from './tokens.js';
import { STARTERS } from './starters.js';

export const DECKS = [fps, horror, platformer, rpg, racing, fighting, sports, strategy, cityBuilder, cardGame];

// Every card (deck cards + tokens) by id, with `archetypes` filled in from the deck it belongs to.
export const CARDS = {};
for (const deck of DECKS) {
  for (const card of deck.cards) CARDS[card.cardId] = { ...card, archetypes: [deck.name], deckId: deck.id };
}
for (const t of TOKENS) CARDS[t.cardId] = { ...t, archetypes: ['Token'], deckId: null };

export const getDeck = id => DECKS.find(d => d.id === id);

// The archetype's pool: every card in it, once (each archetype has exactly 40).
export const deckList = id => getDeck(id).cards.map(c => c.cardId);

// Deck building rules: a deck is DECK_SIZE cards from one archetype's pool, at most MAX_COPIES of each.
export const DECK_SIZE = 40;
export const MAX_COPIES = 2;

export const countCards = cards => cards.reduce((m, id) => m.set(id, (m.get(id) ?? 0) + 1), new Map());

// Problems with a deck list, as player-facing strings. Empty means it's legal.
export function deckErrors(archetypeId, cards) {
  const deck = getDeck(archetypeId);
  if (!deck) return [`Unknown archetype ${archetypeId}.`];
  const errors = [];
  if (cards.length !== DECK_SIZE) errors.push(`A deck needs exactly ${DECK_SIZE} cards (this one has ${cards.length}).`);
  for (const [id, n] of countCards(cards)) {
    if (CARDS[id]?.deckId !== archetypeId) errors.push(`${CARDS[id]?.displayName ?? id} isn't a ${deck.name} card.`);
    else if (n > MAX_COPIES) errors.push(`${CARDS[id].displayName}: at most ${MAX_COPIES} copies.`);
  }
  return errors;
}

const byCode = (archetypeId, code) => {
  const card = getDeck(archetypeId).cards.find(c => c.cardId.split('_')[1] === code);
  if (!card) throw new Error(`Starter refers to unknown card ${archetypeId} ${code}`);
  return card.cardId;
};

// Starter decks as { key, archetype, name, blurb, cards }. The key ('RPG:starter:0') is stable for prefs.
export const starterDecks = archetypeId => (STARTERS[archetypeId] ?? []).map((s, i) => {
  const cut = new Set(s.cut.map(code => byCode(archetypeId, code)));
  const cards = deckList(archetypeId).filter(id => !cut.has(id));
  for (const code of s.double) cards.push(byCode(archetypeId, code));
  return { key: `${archetypeId}:starter:${i}`, archetype: archetypeId, name: s.name, blurb: s.blurb, cards, starter: true };
});
