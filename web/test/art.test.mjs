import test from 'node:test';
import assert from 'node:assert/strict';
import { allSlots, batchPrompt, batchable, DECK_STYLE, SAVE_PATH, COSMETIC_ART } from '../tools/art/slots.js';
import { COSMETICS } from '../src/data/economy.js';
import { REDO, REDO_REASONS, REDO_THEMES } from '../tools/art/redo.js';
import { DECKS } from '../src/data/index.js';
import { TOKENS } from '../src/data/tokens.js';
import { KEYWORDS, TERMS, RULES } from '../src/engine/constants.js';
import { keywordIconKey, ruleIconKey, triggerIconKey, uiIconKey, TRIGGERS, UI_ICONS } from '../src/ui/icon-keys.js';

test('every card, token, deck and hero has one art slot with a usable prompt', () => {
  const slots = allSlots();
  const keys = new Set(slots.map(s => s.key));
  assert.equal(keys.size, slots.length, 'slot keys are unique');
  for (const deck of DECKS) {
    assert.ok(DECK_STYLE[deck.id], `${deck.id} has a style`);
    for (const k of [`decks/${deck.id}`, `heroes/${deck.id}`, `ui/emblem-${deck.id}`, ...deck.cards.map(c => `cards/${c.cardId}`)]) assert.ok(keys.has(k), k);
  }
  for (const t of TOKENS) assert.ok(keys.has(`cards/${t.cardId}`), t.cardId);
  for (const s of slots) {
    assert.match(`assets/img/${s.key}.webp`, SAVE_PATH, s.key);
    assert.doesNotMatch(s.prompt, /undefined|\[object|\[\w+\]/, s.key);
  }
});

test('every icon the UI asks for (keywords, terms, House Rules, triggers, UI icons) has an art slot', () => {
  const keys = new Set(allSlots().map(s => s.key));
  const wanted = [
    ...Object.keys(KEYWORDS).map(keywordIconKey), ...Object.keys(TERMS).map(keywordIconKey),
    ...['Draft Night', 'Balance Patch', 'Hand Size Errata'].map(keywordIconKey),
    ...Object.keys(RULES).map(ruleIconKey), ...TRIGGERS.map(triggerIconKey), ...UI_ICONS.map(uiIconKey),
  ];
  for (const key of wanted) assert.ok(keys.has(`ui/${key}`), key);
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

test('the art tool only writes .webp files inside the art folders', () => {
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

test('the key art style slots ask for transparent cut-outs where the art tool fits them whole', () => {
  const ui = allSlots().filter(s => s.key.startsWith('ui/') && s.key !== 'ui/card-back' && s.group !== 'Cosmetics');
  assert.ok(ui.length >= 20, 'logo, frames, backgrounds, icons and effects');
  for (const s of ui) {
    // Deck emblems sit on their deck's tab; the rest of the UI art is under Extras.
    const emblem = s.key.match(/^ui\/emblem-(\w+)$/);
    assert.equal(s.group, emblem ? emblem[1] : 'Extras', s.key);
    assert.match(s.prompt, /reference image/, `${s.key} points at the key art`);
    assert.equal(s.fit, /transparent background/.test(s.prompt), `${s.key}: fitted exactly when transparent`);
  }
  for (const tier of ['common', 'rare', 'epic', 'legendary']) assert.ok(ui.some(s => s.key === `ui/frame-${tier}`), tier);
});

test('every deck has its own card back and arena', () => {
  for (const deck of DECKS) {
    for (const kind of ['back', 'arena']) {
      const own = COSMETICS.filter(c => c.deck === deck.id && c.kind === kind);
      assert.equal(own.length, 1, `${deck.id} has one ${kind}`);
    }
  }
  for (const c of COSMETICS.filter(c => c.deck)) assert.ok(DECKS.some(d => d.id === c.deck), `${c.id}: ${c.deck} is a deck`);
});

test('every card back and arena for sale, on the season track or for founders has an art slot with its own prompt', () => {
  const slots = allSlots();
  // Card frames are CSS only: no art.
  for (const c of COSMETICS.filter(c => !c.default && c.kind !== 'frame')) {
    const [kind, name] = c.id.split(':');
    const s = slots.find(s => s.key === `ui/${kind}-${name}`);
    assert.ok(s, c.id);
    assert.equal(s.group, 'Cosmetics');
    assert.equal(s.kind, kind === 'back' ? 'back' : 'scene');
    assert.ok(COSMETIC_ART[c.id] && s.prompt.includes(COSMETIC_ART[c.id]), `${c.id} has a subject`);
    assert.ok(SAVE_PATH.test(`assets/img/${s.key}.webp`), `${c.id}: the art tool may save it`);
  }
});
