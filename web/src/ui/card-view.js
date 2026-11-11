// Card rendering: full cards (hand / gallery / preview) and compact board monsters.
// Art is an image slot (assets/img/cards/<cardId>.png, then the deck's art) with an
// animated placeholder until an image exists. See assets/img/README.md.

import { h } from './dom.js';
import { DECKS } from '../data/index.js';
import { KEYWORDS, TERMS } from '../engine/constants.js';
import { rulesLines, keywordName } from '../engine/text.js';
import { getAttack, getHealth, getMaxHealth, hasKeyword, defOf } from '../engine/game.js';
import { artSlot, cardArtUrls, cardBackUrls } from './fx.js';

const NEUTRAL = { name: 'Token', icon: '◆', color: '#7d8590' };

// Tokens have no deck of their own; pass the deck id of whoever summoned them.
export function deckStyle(def, ownerDeckId = null) {
  const deck = DECKS.find(d => d.id === (def.deckId ?? ownerDeckId)) ?? NEUTRAL;
  return { deck, style: { '--deck': deck.color } };
}

function typeLine(def, deck) {
  const kind = def.type === 'Spell' ? `${def.speedWindow === 'Quick' ? 'Quick ' : ''}Spell` : 'Monster';
  return [h('span', { class: 'dot', 'aria-hidden': 'true' }), `${kind} · ${deck.name}`];
}

export function renderCard(def, { cost = def.cost, classes = '', onclick, attrs = {}, ownerDeckId = null, large = false } = {}) {
  const { deck, style } = deckStyle(def, ownerDeckId);
  const costClass = cost > def.cost ? ' cost-up' : '';
  return h('div', {
    class: `card ${def.type === 'Spell' ? 'spell' : 'monster'}${def.speedWindow === 'Quick' ? ' quick' : ''} ${classes}`,
    style, onclick, 'data-tilt': '12', ...attrs,
  },
    h('div', { class: `card-cost${costClass}`, title: 'Bandwidth cost' }, cost),
    def.isNew ? h('div', { class: 'card-new' }, 'NEW') : null,
    artSlot('card-art', cardArtUrls(def, ownerDeckId), deck.icon, { label: large || classes.includes('large'), alt: '' }),
    h('div', { class: 'card-title' },
      h('div', { class: 'card-name' }, def.displayName),
      h('div', { class: 'card-type' }, typeLine(def, deck))),
    h('div', { class: 'card-body' },
      def.keywords.length ? h('div', { class: 'card-kws' }, def.keywords.map(k => h('span', { class: 'kw-chip' }, keywordName(k)))) : null,
      rulesLines(def).map(line => h('div', { class: 'card-line' }, line)),
    ),
    def.type === 'Monster'
      ? h('div', { class: 'card-stats' },
          h('span', { class: 'stat atk', title: 'Attack' }, def.baseAttack),
          h('span', { class: 'stat hp', title: 'Health' }, def.baseHealth))
      : null,
    h('div', { class: 'card-foil', 'aria-hidden': 'true' }),
    h('div', { class: 'card-glare', 'aria-hidden': 'true' }),
  );
}

export function renderCardBack(classes = '') {
  return h('div', { class: `card card-back ${classes}` }, artSlot('', cardBackUrls(), 'M'));
}

const STATUS_BADGES = [
  ['Guard', '🛡️'], ['Stealth', '👁️'], ['PoweredUp', '✨'], ['Checkpoint', '🚩'], ['Rush', '⚡'],
  ['FirstStrike', '⚔️'], ['Counter', '↩️'], ['Fortify', '🧱'], ['DoubleJump', '🦘'], ['Headshot', '🎯'],
  ['Suppression', '📵'], ['Fear', '😱'], ['Haunt', '👻'], ['Devour', '🦷'], ['Inspire', '📣'],
  ['Structure', '🏛️'], ['Tax', '💰'], ['Topdeck', '🃏'], ['Generate', '🔋'],
];

export function renderMinion(state, m, { classes = '', onclick, onmouseenter } = {}) {
  const def = defOf(m);
  const ownerDeckId = state.players[m.owner].deckId;
  const { deck, style } = deckStyle(def, ownerDeckId);
  const atk = getAttack(state, m);
  const hp = getHealth(m);
  const maxHp = getMaxHealth(m);
  const kws = [...new Set([...m.kw, ...m.tempKw])];
  const sleeping = m.summonedTurn === state.turn && !hasKeyword(m, 'Rush') && m.owner === state.active && !hasKeyword(m, 'Structure');
  const suppressed = state.turn <= m.suppressedUntil;
  const flags = [
    hasKeyword(m, 'Guard') && 'guard',
    hasKeyword(m, 'Stealth') && 'stealth',
    hasKeyword(m, 'PoweredUp') && 'shielded',
    suppressed && 'suppressed',
    m.silenced && 'silenced',
  ].filter(Boolean).join(' ');

  return h('div', {
    class: `minion ${flags} ${classes}`, style, 'data-uid': m.uid, 'data-tilt': '10', onclick, onmouseenter,
    role: 'button', tabindex: '0', 'aria-label': `${def.displayName}, ${atk} attack, ${hp} health`,
  },
    artSlot('minion-art', cardArtUrls(def, ownerDeckId), deck.icon),
    h('div', { class: 'minion-name' }, def.displayName),
    h('div', { class: 'minion-badges' },
      kws.map(k => STATUS_BADGES.find(([kk]) => kk === k)).filter(Boolean)
        .map(([k, icon]) => h('span', { title: KEYWORDS[k].name }, icon)),
      m.xp ? h('span', { class: 'xp', title: `${m.xp} XP` }, `${m.xp}xp`) : null,
    ),
    sleeping ? h('div', { class: 'minion-status' }, 'zzz') : null,
    suppressed ? h('div', { class: 'minion-status' }, 'suppressed') : null,
    h('span', { class: `stat atk${atk > def.baseAttack ? ' up' : atk < def.baseAttack ? ' down' : ''}` }, atk),
    h('span', { class: `stat hp${hp < maxHp ? ' down' : maxHp > def.baseHealth ? ' up' : ''}` }, hp),
    h('div', { class: 'minion-glow', 'aria-hidden': 'true' }),
  );
}

// Glossary entries for everything a card mentions.
export function glossaryFor(def, instance) {
  const kws = new Set(def.keywords);
  if (instance) [...instance.kw, ...instance.tempKw].forEach(k => kws.add(k));
  for (const e of def.effects) if (e.keyword) kws.add(e.keyword);
  const text = rulesLines(def).join(' ');
  const entries = [...kws].filter(k => KEYWORDS[k]).map(k => [KEYWORDS[k].name, KEYWORDS[k].text]);
  for (const [term, explain] of Object.entries(TERMS)) {
    if (text.includes(term) || (term === 'Quick' && def.speedWindow === 'Quick')) entries.push([term, explain]);
  }
  return entries;
}

export function renderPreview(state, def, instance) {
  const ownerDeckId = instance && state ? state.players[instance.owner].deckId : null;
  const parts = [renderCard(def, { classes: 'large', ownerDeckId, large: true })];
  if (instance && state) {
    const status = [];
    if (instance.xp) status.push(`${instance.xp} XP${instance.leveled ? ' (Leveled Up)' : ''}`);
    if (instance.silenced) status.push('Silenced');
    if (state.turn <= instance.suppressedUntil) status.push("Suppressed — can't attack");
    if (instance.tempKw.length) status.push(`This turn: ${instance.tempKw.map(keywordName).join(', ')}`);
    const temp = instance.mods.filter(x => x.temp).reduce((s, x) => s + x.atk, 0);
    if (temp) status.push(`${temp > 0 ? '+' : ''}${temp} ATK this turn`);
    if (status.length) parts.push(h('div', { class: 'preview-status' }, status.map(s => h('div', null, s))));
  }
  const gloss = glossaryFor(def, instance);
  if (gloss.length) {
    parts.push(h('dl', { class: 'glossary' }, gloss.map(([t, d]) => [h('dt', null, t), h('dd', null, d)])));
  }
  return parts;
}
