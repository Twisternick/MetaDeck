// Card rendering: full cards (hand / gallery / preview) and compact board monsters.
// Art is an image slot (assets/img/cards/<cardId>.png, then the deck's art) with an
// animated placeholder until an image exists. See assets/img/README.md.
// Keywords and rules terms are rendered through ui/keywords.js so that every chip, badge and
// glossary entry shares the same icon, colour and tooltip.

import { h } from './dom.js';
import { DECKS } from '../data/index.js';
import { KEYWORDS, TERMS, LEVEL_UP_XP } from '../engine/constants.js';
import { rulesLines } from '../engine/text.js';
import { getAttack, getHealth, getMaxHealth, hasKeyword, defOf, attackBonuses, baseAttackOf, baseHealthOf } from '../engine/game.js';
import { artSlot, deckEmblem, cardArtUrls, cardBackUrls, backSkinUrls } from './fx.js';
import { kwChip, richText, kwIcon, kwKind, kwColor, kwName, glossaryList } from './keywords.js';
import { rarityOf, RARITY } from '../data/economy.js';

const NEUTRAL = { name: 'Token', icon: '◆', color: '#7d8590' };

// Tokens have no deck of their own; pass the deck id of whoever summoned them.
export function deckStyle(def, ownerDeckId = null) {
  const deck = DECKS.find(d => d.id === (def.deckId ?? ownerDeckId)) ?? NEUTRAL;
  return { deck, style: { '--deck': deck.color } };
}

function typeLine(def, deck) {
  const kind = def.type === 'Spell' ? 'Spell' : 'Monster';
  return [
    h('span', { class: 'dot', 'aria-hidden': 'true' }),
    def.speedWindow === 'Quick'
      ? h('span', { class: 'term quick-tag', style: { '--kw': kwColor('Quick') }, 'data-kw': 'Quick', tabindex: '0' }, kwIcon('Quick'), ' Quick')
      : null,
    def.speedWindow === 'Quick' ? ' ' : null,
    `${kind} · ${deck.name}`,
  ];
}

// `premium` draws a finish the player owns (a cosmetic; it plays the same): true or 'premium' for the
// animated premium version, 'holo' for the hologram, whose art is projected up out of the card.
// `printed` and `atk` are a hand card's cost before Tax and its Attack, when Alt Art rewrote them.
export function renderCard(def, { cost = def.cost, printed = def.cost, atk = def.baseAttack, classes = '', onclick, attrs = {}, ownerDeckId = null, large = false, premium = false } = {}) {
  const { deck, style } = deckStyle(def, ownerDeckId);
  const holo = premium === 'holo';
  const altArt = printed !== def.cost || atk !== def.baseAttack;
  const altTip = altArt ? `Rewritten in your hand (Alt Art or Typo): printed as ${def.cost} cost and ${def.baseAttack} Attack.` : null;
  const costClass = cost > printed ? ' cost-up' : altArt ? ' edited' : '';
  const costTip = cost > printed ? `Costs ${cost - printed} more: an enemy Tax monster is on the board.` : altTip;
  const rarity = def.deckId ? rarityOf(def.cardId) : null;
  return h('div', {
    class: `card ${def.type === 'Spell' ? 'spell' : 'monster'}${def.speedWindow === 'Quick' ? ' quick' : ''}${rarity ? ` rarity-${rarity}` : ''}${holo ? ' holo' : premium ? ' premium' : ''} ${classes}`,
    style, onclick, 'data-tilt': '12', 'data-deck': themeFrame(/\bframe-founder\b/.test(classes) ? FOUNDER_FRAME : deck, rarity ?? 'common'), ...attrs,
  },
    h('div', { class: `card-cost${costClass}`, 'data-kw': costTip ? null : 'Bandwidth', 'data-tip': costTip,
      'data-tip-title': cost > printed ? 'Taxed' : altArt ? 'Rewritten' : null }, cost),
    def.isNew ? h('div', { class: 'card-new' }, 'NEW') : null,
    artSlot('card-art', cardArtUrls(def, ownerDeckId), deckEmblem(deck), { label: large || classes.includes('large'), alt: '' }),
    h('div', { class: 'card-title' },
      h('div', { class: 'card-name' }, def.displayName),
      h('div', { class: 'card-type' }, typeLine(def, deck))),
    arcName(def.displayName, rarity ?? 'common', holo ? 'holo' : premium ? 'premium' : ''),
    h('div', { class: 'card-body' },
      def.keywords.length ? h('div', { class: 'card-kws' }, def.keywords.map(k => kwChip(k))) : null,
      rulesLines(def).map(line => h('div', { class: 'card-line' }, richText(line))),
    ),
    def.type === 'Monster'
      ? h('div', { class: 'card-stats' },
          h('span', { class: `stat atk${altArt ? ' edited' : ''}`, 'data-tip': altTip ?? 'Attack: damage this deals when it fights.', 'data-tip-title': altArt ? 'Rewritten' : 'Attack' }, atk),
          h('span', { class: 'stat hp', 'data-tip': 'Health: it is destroyed when this reaches 0.', 'data-tip-title': 'Health' }, def.baseHealth))
      : null,
    // The rarity frame (ui/frame-<rarity>) is drawn over the art; tokens get the common one.
    h('div', { class: `card-frame frame-${rarity ?? 'common'}`, 'aria-hidden': 'true' }),
    rarity ? h('div', { class: 'card-gem', 'data-tip': `${RARITY[rarity].name} card`, 'data-tip-title': 'Rarity' }) : null,
    premium && !holo ? h('div', { class: 'card-premium', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')) : null,
    holo ? holoProjection('card-holo', cardArtUrls(def, ownerDeckId), deck) : null,
    h('div', { class: 'card-foil', 'aria-hidden': 'true' }),
    h('div', { class: 'card-glare', 'aria-hidden': 'true' }),
  );
}

// Deck-themed frames: the first time a card of a deck and rarity is drawn, that rarity's frame art is
// recoloured on a canvas: the blue (or epic violet) enamel takes the deck's colour and the silver picks up
// a hint of it, while the gold trim, and with it the rarity read, stays. The plain frame shows until it's ready.
const themedFrames = new Set();
// The Founder Gold frame (a Meta Founder's cosmetic, class frame-founder) tints the enamel gold instead.
const FOUNDER_FRAME = { id: 'founder', color: '#e3a41c' };
let frameSheet;
function themeFrame(deck, rarity) {
  if (!deck.id) return null; // tokens keep the plain frame
  const key = `${deck.id}|${rarity}`;
  if (themedFrames.has(key)) return deck.id;
  themedFrames.add(key);
  const img = new Image();
  img.src = `assets/img/ui/frame-${rarity}.webp`;
  img.decode().then(() => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, c.width, c.height);
    tintFrame(px.data, deck.color);
    ctx.putImageData(px, 0, 0);
    return new Promise(done => c.toBlob(done, 'image/webp', .92));
  }).then(blob => {
    frameSheet ??= document.head.appendChild(document.createElement('style')).sheet;
    frameSheet.insertRule(`.card[data-deck="${deck.id}"] > .card-frame.frame-${rarity} { background-image: url(${URL.createObjectURL(blob)}); }`);
  }).catch(() => themedFrames.delete(key));
  return deck.id;
}

function hsl(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 510, d = (max - min) / 255;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / (max - min) + 6) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  return [h * 60, Math.min(1, s), l];
}
function rgbOf(h, s, l, out, i) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  out[i] = (r + m) * 255; out[i + 1] = (g + m) * 255; out[i + 2] = (b + m) * 255;
}
function tintFrame(px, color) {
  const n = parseInt(color.slice(1), 16);
  const [dh, ds] = hsl(n >> 16, (n >> 8) & 255, n & 255);
  for (let i = 0; i < px.length; i += 4) {
    if (!px[i + 3]) continue;
    const [h, s, l] = hsl(px[i], px[i + 1], px[i + 2]);
    if (s > .25 && h > 185 && h < 305) rgbOf(dh, Math.min(1, Math.max(s, ds) * 1.05), l, px, i); // enamel and its glow
    else if (s < .2 && l > .3) rgbOf(dh, ds * .3, l, px, i); // silver
  }
}

// The card name, set along the arched name banner of the rarity's frame with an SVG textPath. The
// banner's centreline (y) and how far its ends drop (sag) were measured on the 560×784 frames; the
// viewBox matches them so the curve lines up at any card size. Names too long for the banner are squeezed.
const BANNER = { common: [424, 20], rare: [409, 9], epic: [408, 11], legendary: [413, 8] };
const NAME_PX = 36, NAME_ROOM = 340;
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs, ...kids) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  el.append(...kids);
  return el;
};
let arcIds = 0;
let measure;
const nameWidth = text => {
  measure ??= document.createElement('canvas').getContext('2d');
  measure.font = `700 ${NAME_PX}px Rajdhani, 'Roboto Condensed', sans-serif`;
  return measure.measureText(text).width;
};
function arcName(text, rarity, finish) {
  const [y, sag] = BANNER[rarity];
  const base = y + NAME_PX * .34; // baseline that centres the letters on the banner
  const id = `name-arc-${++arcIds}`;
  return svg('svg', { class: `card-name-arc${finish ? ` ${finish}` : ''}`, viewBox: '0 0 560 784', preserveAspectRatio: 'none', 'aria-hidden': 'true' },
    svg('path', { id, d: `M 90 ${base + sag} Q 280 ${base - sag} 470 ${base + sag}`, fill: 'none' }),
    svg('text', { 'font-size': NAME_PX },
      svg('textPath', {
        href: `#${id}`, startOffset: '50%', 'text-anchor': 'middle',
        textLength: nameWidth(text) > NAME_ROOM ? NAME_ROOM : null, lengthAdjust: 'spacingAndGlyphs',
      }, text)));
}

// A hologram's projection: the card's art floating above its art window, with the light beam that
// throws it up from an emitter in the window. It follows the card's tilt (--px/--py, see installTilt) a
// little further than the card itself, which is what makes it read as hovering above it.
function holoProjection(className, urls, deck) {
  return h('div', { class: className, 'aria-hidden': 'true' },
    h('i', { class: 'holo-beam' }),
    artSlot('holo-art', urls, deckEmblem(deck)),
    h('i', { class: 'holo-emitter' }));
}

// `skin` is a card back cosmetic id ('back:aurora'); the classic back is the art slot alone.
export function renderCardBack(classes = '', skin = 'back:classic') {
  const name = skin.split(':')[1];
  return h('div', { class: `card card-back ${classes}`, 'data-back': name },
    artSlot('', cardBackUrls(), 'M'),
    name !== 'classic' ? backSkin(name) : null);
}

// A non-classic back: its painted image (ui/back-<name>, made with tools/art.mjs) over the CSS skin it
// falls back to, with a foil sheen sweeping across either one.
export function backSkin(name) {
  return h('div', { class: 'back-skin', 'aria-hidden': 'true' },
    artSlot('back-img', backSkinUrls(name), ''), h('span', null, 'M'), h('i', { class: 'back-sheen' }));
}

// Ambient motion for an arena skin: a few drifting particles (embers, stars, fog...) styled per arena in
// styles.css. Positions are fixed per index so re-renders don't make them jump.
export function arenaFx(name) {
  if (name === 'standard') return null;
  if (name === 'founders-hall') {
    // Align the effects with the painted floor. Match renders rebuild the arena, so keep a common clock.
    const phase = `-${document.timeline.currentTime ?? 0}ms`;
    return h('div', { class: 'arena-fx hall-fx', 'aria-hidden': 'true', style: { '--hall-phase': phase } },
      h('div', { class: 'hall-floor-light' },
        h('span', { class: 'hall-orbit' }), h('span', { class: 'hall-orbit trailing' }),
        [[50, 82.4], [50, 10.8], [2.9, 45.2], [97.1, 45.2]].map(([x, y], i) =>
          h('span', { class: 'hall-gem', style: { left: `${x}%`, top: `${y}%`, '--lag': `-${i * 1.9}s` } }))));
  }
  return h('div', { class: 'arena-fx', 'data-arena': name, 'aria-hidden': 'true' },
    Array.from({ length: 9 }, (_, i) => h('i', { style: { '--x': `${(i * 37 + 11) % 100}%`, '--y': `${(i * 53 + 7) % 100}%`, '--d': `${-i * 1.7}s`, '--s': `${0.6 + ((i * 29) % 10) / 12}` } })));
}

const xpStatus = m => `${m.xp % LEVEL_UP_XP}/${LEVEL_UP_XP} XP`;

// Keywords that mean nothing on the board on their own (tags), hidden from badges to save room.
const TAG_KEYWORDS = new Set(['Drone', 'District']);

export function renderMinion(state, m, { classes = '', onclick, onmouseenter, premium = false } = {}) {
  const def = defOf(m);
  const ownerDeckId = state.players[m.owner].deckId;
  const { deck, style } = deckStyle(def, ownerDeckId);
  const atk = getAttack(state, m);
  const hp = getHealth(m);
  const maxHp = getMaxHealth(m);
  const bonuses = attackBonuses(state, m);
  const bonusTotal = bonuses.reduce((s, b) => s + b.amount, 0);
  const lit = new Set(bonuses.map(b => b.keyword));
  const kws = [...new Set([...m.kw, ...m.tempKw])].filter(k => KEYWORDS[k] && !TAG_KEYWORDS.has(k));
  const mine = m.owner === state.active;
  const freshSummon = m.summonedTurn === state.turn && mine;
  const sleeping = freshSummon && !hasKeyword(m, 'Rush') && !hasKeyword(m, 'Structure');
  const rushReady = freshSummon && hasKeyword(m, 'Rush') && m.attacks === 0 && !state.over;
  const suppressed = state.turn <= m.suppressedUntil;
  const errata = m.baseAtk !== undefined;
  if (rushReady) lit.add('Rush');
  if (hasKeyword(m, 'Guard')) lit.add('Guard');
  if (hasKeyword(m, 'Stealth')) lit.add('Stealth');
  const flags = [
    hasKeyword(m, 'Guard') && 'guard',
    hasKeyword(m, 'Stealth') && 'stealth',
    hasKeyword(m, 'PoweredUp') && 'shielded',
    suppressed && 'suppressed',
    m.silenced && 'silenced',
    bonusTotal && 'boosted',
  ].filter(Boolean).join(' ');

  const bonusTip = bonuses.map(b => `${kwName(b.keyword)} +${b.amount}`).join(', ');
  return h('div', {
    class: `minion ${flags}${premium === 'holo' ? ' holo' : premium ? ' premium' : ''} ${classes}`, style, 'data-uid': m.uid, 'data-tilt': '10', onclick, onmouseenter,
    role: 'button', tabindex: '0', 'aria-label': `${def.displayName}, ${atk} attack, ${hp} health`,
  },
    artSlot('minion-art', cardArtUrls(def, ownerDeckId), deckEmblem(deck)),
    premium === 'holo' ? holoProjection('minion-holo', cardArtUrls(def, ownerDeckId), deck) : null,
    // Keyword strip between the art and the name: named chips, icon-only when there are too many to fit.
    kws.length || m.xp ? h('div', { class: `minion-badges${kws.length > 2 ? ' compact' : ''}` },
      kws.map(k => h('span', {
        class: `badge kind-${kwKind(k)}${lit.has(k) ? ' lit' : ''}${m.tempKw.includes(k) && !m.kw.includes(k) ? ' temp' : ''}`,
        style: { '--kw': kwColor(k) }, 'data-kw': k, 'aria-label': kwName(k),
      }, h('i', { 'aria-hidden': 'true' }, kwIcon(k)), h('b', null, kwName(k)))),
      m.xp ? h('span', { class: 'xp', 'data-tip': TERMS['Level Up'], 'data-tip-title': 'Level Up' }, xpStatus(m)) : null,
    ) : null,
    h('div', { class: 'minion-name' }, def.displayName),
    sleeping ? h('div', { class: 'minion-status', 'data-tip': 'Summoning sickness: monsters attack from the turn after they arrive, unless they have Rush.', 'data-tip-title': 'Resting' }, 'zzz') : null,
    rushReady ? h('div', { class: 'minion-status good', 'data-kw': 'Rush' }, kwIcon('Rush'), ' Rush') : null,
    suppressed ? h('div', { class: 'minion-status bad', 'data-kw': 'Suppress' }, kwIcon('Suppression'), ' Suppressed') : null,
    m.silenced && !suppressed ? h('div', { class: 'minion-status bad', 'data-kw': 'Silence' }, kwIcon('Silence'), ' Silenced') : null,
    h('span', { class: `stat atk${atk > baseAttackOf(m) ? ' up' : atk < baseAttackOf(m) ? ' down' : ''}${errata ? ' edited' : ''}` }, atk),
    bonusTotal ? h('span', { class: 'minion-bonus', 'data-tip': `${bonusTip} — this bonus is active right now.`, 'data-tip-title': 'Attack bonus' }, `+${bonusTotal}`) : null,
    h('span', { class: `stat hp${hp < maxHp ? ' down' : maxHp > baseHealthOf(m) ? ' up' : ''}${errata ? ' edited' : ''}` }, hp),
    m.ruled ? h('div', { class: 'minion-ruled', 'data-tip': `Errata Week has switched off ${kwName(m.ruled)}. It comes back when the House Rule ends.`, 'data-tip-title': 'House Rule' },
      h('s', null, kwIcon(m.ruled), ` ${kwName(m.ruled)}`)) : null,
    h('div', { class: 'minion-glow', 'aria-hidden': 'true' }),
    h('div', { class: 'minion-ring', 'aria-hidden': 'true' }),
  );
}

// Glossary entries for everything a card mentions: [[key, text]] where key is a keyword id or term.
export function glossaryFor(def, instance) {
  const kws = new Set(def.keywords);
  if (instance) [...instance.kw, ...instance.tempKw].forEach(k => kws.add(k));
  for (const e of def.effects) if (e.keyword) kws.add(e.keyword);
  const text = rulesLines(def).join(' ');
  const entries = [...kws].filter(k => KEYWORDS[k]).map(k => [k, KEYWORDS[k].text]);
  for (const [term, explain] of Object.entries(TERMS)) {
    if ((term === 'Level Up' && (kws.has('XP') || text.includes('XP'))) || text.includes(term) || (term === 'Quick' && def.speedWindow === 'Quick')) entries.push([term, explain]);
  }
  return entries;
}

// Live status lines for a monster on the board ("Momentum: +1 ATK right now", "Silenced", ...).
export function statusLines(state, instance) {
  const status = [];
  for (const b of attackBonuses(state, instance)) status.push(`${kwName(b.keyword)}: +${b.amount} ATK right now`);
  if (instance.xp) status.push(`${xpStatus(instance)} toward next level (${instance.xp} XP total)`);
  if (instance.silenced) status.push('Silenced: no keywords or card text');
  if (instance.baseAtk !== undefined) {
    const def = defOf(instance);
    status.push(`Errata'd: printed ${def.baseAttack}/${def.baseHealth}, now reads ${instance.baseAtk}/${instance.baseHp}`);
  }
  if (instance.ruled) status.push(`Errata Week: ${kwName(instance.ruled)} is switched off`);
  if (state.turn <= instance.suppressedUntil) status.push("Suppressed — can't attack this turn");
  if (instance.tempKw.length) status.push(`This turn only: ${instance.tempKw.map(k => kwName(k)).join(', ')}`);
  const temp = instance.mods.filter(x => x.temp).reduce((s, x) => s + x.atk, 0);
  if (temp) status.push(`${temp > 0 ? '+' : ''}${temp} ATK this turn`);
  if (instance.summonedTurn === state.turn && instance.owner === state.active && !hasKeyword(instance, 'Rush') && !hasKeyword(instance, 'Structure')) status.push('Just summoned — attacks next turn');
  return status;
}

export function renderPreview(state, def, instance, { premium = false } = {}) {
  const ownerDeckId = instance && state ? state.players[instance.owner].deckId : null;
  const parts = [renderCard(def, { classes: 'large', ownerDeckId, large: true, premium })];
  if (instance && state) {
    const status = statusLines(state, instance);
    if (status.length) parts.push(h('div', { class: 'preview-status' }, status.map(s => h('div', null, s))));
  }
  const gloss = glossaryFor(def, instance);
  if (gloss.length) parts.push(glossaryList(gloss));
  return parts;
}
