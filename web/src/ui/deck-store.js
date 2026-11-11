// Deck lists the player can pick: the three starters per archetype plus their own decks, which are
// kept in localStorage as { id, archetype, name, cards }. Keys are 'RPG:starter:0' or 'custom:<id>'.

import { storage } from './dom.js';
import { getDeck, starterDecks, deckErrors } from '../data/index.js';

const KEY = 'metadeck.customDecks';

export function customDecks() {
  const list = storage.get(KEY, []);
  return Array.isArray(list)
    ? list.filter(d => d && typeof d.id === 'string' && getDeck(d.archetype) && Array.isArray(d.cards))
      .map(d => ({ ...d, key: `custom:${d.id}`, starter: false }))
    : [];
}

export function saveCustomDeck({ id, archetype, name, cards }) {
  const deck = { id: id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, archetype, name, cards };
  const list = customDecks().map(({ key, starter, ...d }) => d);
  const i = list.findIndex(d => d.id === deck.id);
  if (i >= 0) list[i] = deck; else list.push(deck);
  storage.set(KEY, list);
  return { ...deck, key: `custom:${deck.id}`, starter: false };
}

export function deleteCustomDeck(id) {
  storage.set(KEY, customDecks().filter(d => d.id !== id).map(({ key, starter, ...d }) => d));
}

export const isPlayable = deck => deckErrors(deck.archetype, deck.cards).length === 0;

// Every deck list for an archetype: starters first, then the player's own.
export const decksFor = archetype => [...starterDecks(archetype), ...customDecks().filter(d => d.archetype === archetype)];

// The deck behind a key, falling back to the archetype's first starter if it's gone or not playable.
export function resolveDeck(archetype, key) {
  const found = decksFor(archetype).find(d => d.key === key);
  return found && isPlayable(found) ? found : starterDecks(archetype)[0];
}

export const randomStarter = archetype => {
  const starters = starterDecks(archetype);
  return starters[Math.floor(Math.random() * starters.length)];
};
