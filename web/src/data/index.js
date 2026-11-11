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

export const DECKS = [fps, horror, platformer, rpg, racing, fighting, sports, strategy, cityBuilder, cardGame];

// Every card (deck cards + tokens) by id, with `archetypes` filled in from the deck it belongs to.
export const CARDS = {};
for (const deck of DECKS) {
  for (const card of deck.cards) CARDS[card.cardId] = { ...card, archetypes: [deck.name], deckId: deck.id };
}
for (const t of TOKENS) CARDS[t.cardId] = { ...t, archetypes: ['Token'], deckId: null };

export const getDeck = id => DECKS.find(d => d.id === id);

// A deck list is every card in the archetype, once (each archetype has exactly 30).
export const deckList = id => getDeck(id).cards.map(c => c.cardId);
