import test from 'node:test';
import assert from 'node:assert/strict';
import { allSlots, batchPrompt, batchable, DECK_STYLE, SAVE_PATH } from '../tools/art-studio/slots.js';
import { REDO, REDO_REASONS, REDO_THEMES } from '../tools/art-studio/redo.js';
import { DECKS } from '../src/data/index.js';
import { TOKENS } from '../src/data/tokens.js';

test('every card, token, deck and hero has one art slot with a usable prompt', () => {
  const slots = allSlots();
  const keys = new Set(slots.map(s => s.key));
  assert.equal(keys.size, slots.length, 'slot keys are unique');
  for (const deck of DECKS) {
    assert.ok(DECK_STYLE[deck.id], `${deck.id} has a style`);
    for (const k of [`decks/${deck.id}`, `heroes/${deck.id}`, ...deck.cards.map(c => `cards/${c.cardId}`)]) assert.ok(keys.has(k), k);
  }
  for (const t of TOKENS) assert.ok(keys.has(`cards/${t.cardId}`), t.cardId);
  for (const s of slots) {
    assert.match(`assets/img/${s.key}.webp`, SAVE_PATH, s.key);
    assert.doesNotMatch(s.prompt, /undefined|\[object|\[\w+\]/, s.key);
  }
});

test('every image flagged for redoing is a real slot with a known reason, and its prompt says what to fix', () => {
  const slots = new Map(allSlots().map(s => [s.key, s]));
  for (const [key, r] of Object.entries(REDO)) {
    assert.ok(slots.has(key), key);
    assert.ok(REDO_REASONS[r.why], `${key}: reason ${r.why}`);
    assert.ok(Number.isInteger(r.bytes) && r.bytes > 0, `${key}: bytes`);
    assert.ok(slots.get(key).prompt.includes(r.note), `${key}: prompt includes the note`);
  }
});

test('a deck flagged for a theme rework flags every image drawn in its style', () => {
  const slots = allSlots();
  for (const [deck, t] of Object.entries(REDO_THEMES)) {
    assert.ok(DECK_STYLE[deck], `${deck} is a deck`);
    const styled = slots.filter(s => s.style === DECK_STYLE[deck]);
    assert.deepEqual(Object.keys(t.bytes).sort(), styled.map(s => s.key).sort(), `${deck} flags exactly its styled slots`);
    for (const s of styled) {
      assert.ok(s.redo.some(r => r.why === 'theme'), `${s.key} carries the theme flag`);
      assert.ok(s.prompt.includes(t.note), `${s.key}: prompt includes the theme note`);
    }
  }
});

test('the studio only writes .webp files inside the art folders', () => {
  for (const bad of ['assets/img/cards/../../serve.mjs', 'assets/img/cards/x.png', 'src/ui/fx.webp', 'assets/img/cards/a/b.webp']) {
    assert.doesNotMatch(bad, SAVE_PATH, bad);
  }
});

test('a batch prompt names each card in its panel and pads missing panels', () => {
  const cards = allSlots().filter(s => s.group === 'Horror' && s.kind === 'card');
  const full = batchPrompt(cards.slice(0, 4));
  for (const s of cards.slice(0, 4)) assert.ok(full.includes(`"${s.name}"`), s.name);
  assert.doesNotMatch(full, /undefined/);
  assert.match(batchPrompt(cards.slice(0, 3)), /Bottom-right: leave this panel plain black/);
  assert.ok(batchable(cards[0], cards[1]));
  assert.ok(!batchable(cards[0], allSlots().find(s => s.key === 'heroes/Horror')));
});
