// Names other players see (account names, guest names in the lobby) are checked against a list of
// words that aren't allowed: slurs, profanity, sexual terms, and names that pose as staff. Matching
// ignores case, underscores, digits used as letters (sh1t, 4dmin) and stretched letters (fuuuck).
//
// It matches inside names, so the list leaves out short words that hide inside ordinary ones
// (Peacock, Dickens, Spicy, Tycoon, Grape). The operator can add words in DATA_DIR/blocked-names.txt (one per
// line), and `npm run rename` fixes a name that slipped through.

import fs from 'node:fs';

const BUILT_IN = [
  'fuck', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'pussy', 'penis', 'vagina', 'porn', 'dildo', 'wanker',
  'nigg', 'faggot', 'retard', 'kike', 'chink', 'tranny', 'wetback', 'kkk',
  'nazi', 'hitler', 'siegheil',
  'admin', 'moderator', 'metadeck', 'official',
];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i' };
const plain = s => [...String(s).toLowerCase()].map(c => LEET[c] ?? c).join('').replace(/[^a-z]/g, '');
const squashed = s => s.replace(/(.)\1+/g, '$1');

let extra = [];
// Load the operator's own list (once at startup, with the data folder's file).
export function loadBlockedNames(file) {
  try { extra = fs.readFileSync(file, 'utf8').split(/\r?\n/).map(w => w.trim()).filter(w => w && !w.startsWith('#')); }
  catch { extra = []; }
}

// True when a name contains a word that isn't allowed, as written or with stretched letters squashed.
export function offensiveName(name) {
  const p = plain(name);
  const s = squashed(p);
  return [...BUILT_IN, ...extra].map(plain).some(w => w && (p.includes(w) || s.includes(w)));
}
