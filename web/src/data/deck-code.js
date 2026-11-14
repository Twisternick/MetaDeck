// Deck codes: a deck list as a short string to paste anywhere (Discord, Reddit, a friend), like
//   MD1-RPG-ClkGVRhJhkRWZQE
// "MD1" is the format version, then the archetype, then the copies of each of the archetype's cards
// (0–3, two bits each, in card-id order) as URL-safe base64, followed by a checksum character. A deck
// code only says which cards; it never carries the name or anything else.
//
// If cards are added to or removed from an archetype, its old codes no longer match its card count
// and decode() says the code is out of date instead of guessing.

import { DECKS, CARDS, getDeck } from './index.js';

const VERSION = 'MD1';
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const poolOf = id => getDeck(id).cards.map(c => c.cardId).sort();
const checksum = text => ABC[[...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 64, 7)];

export function encodeDeck(archetype, cards) {
  if (!getDeck(archetype)) throw new Error(`Unknown archetype ${archetype}.`);
  const counts = new Map();
  for (const id of cards) counts.set(id, (counts.get(id) ?? 0) + 1);
  const pool = poolOf(archetype);
  // 3 cards per base64 character: 3 × 2 bits = 6 bits.
  let body = '';
  for (let i = 0; i < pool.length; i += 3) {
    let v = 0;
    for (let k = 0; k < 3; k++) v = (v << 2) | Math.min(3, counts.get(pool[i + k]) ?? 0);
    body += ABC[v];
  }
  return `${VERSION}-${archetype}-${body}${checksum(archetype + body)}`;
}

// Returns { archetype, cards } or throws an Error whose message can be shown to the player.
export function decodeDeck(code) {
  const m = /^MD(\d+)-([A-Za-z]+)-([A-Za-z0-9_-]+)$/.exec(String(code ?? '').trim().replace(/\s+/g, ''));
  if (!m) throw new Error('That isn’t a MetaDeck deck code. They look like MD1-RPG-AAUV…');
  if (`MD${m[1]}` !== VERSION) throw new Error('That deck code is from a newer version of MetaDeck.');
  const deck = DECKS.find(d => d.id.toLowerCase() === m[2].toLowerCase());
  if (!deck) throw new Error(`There’s no ${m[2]} deck.`);
  const body = m[3].slice(0, -1);
  if (checksum(deck.id + body) !== m[3].slice(-1)) throw new Error('That deck code is mistyped or cut off. Copy it again.');
  const pool = poolOf(deck.id);
  if (body.length !== Math.ceil(pool.length / 3)) throw new Error(`That ${deck.name} code is out of date: the deck’s cards have changed since it was made.`);
  const cards = [];
  for (let i = 0; i < body.length; i++) {
    const v = ABC.indexOf(body[i]);
    for (let k = 0; k < 3; k++) {
      const n = (v >> (4 - 2 * k)) & 3;
      const id = pool[i * 3 + k];
      if (n && !id) throw new Error('That deck code is damaged.');
      for (let c = 0; c < n; c++) cards.push(id);
    }
  }
  return { archetype: deck.id, cards: cards.filter(id => CARDS[id]) };
}
