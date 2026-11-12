// Card rendering: full cards (hand / gallery / preview) and compact board monsters.
// Art is an image slot (assets/img/cards/<cardId>.png, then the deck's art) with an
// animated placeholder until an image exists. See assets/img/README.md.
// Keywords and rules terms are rendered through ui/keywords.js so that every chip, badge and
// glossary entry shares the same icon, colour and tooltip.

import { h } from './dom.js';
import { DECKS } from '../data/index.js';
import { KEYWORDS, TERMS } from '../engine/constants.js';
import { rulesLines } from '../engine/text.js';
import { getAttack, getHealth, getMaxHealth, hasKeyword, defOf, attackBonuses } from '../engine/game.js';
import { artSlot, cardArtUrls, cardBackUrls } from './fx.js';
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
      ? h('span', { class: 'term quick-tag', style: { '--kw': kwColor('Quick') }, 'data-kw': 'Quick', tabindex: '0' }, `${kwIcon('Quick')} Quick`)
      : null,
    def.speedWindow === 'Quick' ? ' ' : null,
    `${kind} · ${deck.name}`,
  ];
}

// `premium` draws the animated premium version (a cosmetic the player owns; it plays the same).
export function renderCard(def, { cost = def.cost, classes = '', onclick, attrs = {}, ownerDeckId = null, large = false, premium = false } = {}) {
  const { deck, style } = deckStyle(def, ownerDeckId);
  const costClass = cost > def.cost ? ' cost-up' : '';
  const costTip = cost > def.cost ? `Costs ${cost - def.cost} more: an enemy Tax monster is on the board.` : null;
  const rarity = def.deckId ? rarityOf(def.cardId) : null;
  return h('div', {
    class: `card ${def.type === 'Spell' ? 'spell' : 'monster'}${def.speedWindow === 'Quick' ? ' quick' : ''}${rarity ? ` rarity-${rarity}` : ''}${premium ? ' premium' : ''} ${classes}`,
    style, onclick, 'data-tilt': '12', ...attrs,
  },
    h('div', { class: `card-cost${costClass}`, 'data-kw': costTip ? null : 'Bandwidth', 'data-tip': costTip, 'data-tip-title': costTip ? `${kwIcon('Tax')} Taxed` : null }, cost),
    def.isNew ? h('div', { class: 'card-new' }, 'NEW') : null,
    artSlot('card-art', cardArtUrls(def, ownerDeckId), deck.icon, { label: large || classes.includes('large'), alt: '' }),
    h('div', { class: 'card-title' },
      h('div', { class: 'card-name' }, def.displayName),
      h('div', { class: 'card-type' }, typeLine(def, deck))),
    h('div', { class: 'card-body' },
      def.keywords.length ? h('div', { class: 'card-kws' }, def.keywords.map(k => kwChip(k))) : null,
      rulesLines(def).map(line => h('div', { class: 'card-line' }, richText(line))),
    ),
    def.type === 'Monster'
      ? h('div', { class: 'card-stats' },
          h('span', { class: 'stat atk', 'data-tip': 'Attack: damage this deals when it fights.', 'data-tip-title': 'Attack' }, def.baseAttack),
          h('span', { class: 'stat hp', 'data-tip': 'Health: it is destroyed when this reaches 0.', 'data-tip-title': 'Health' }, def.baseHealth))
      : null,
    rarity ? h('div', { class: 'card-gem', 'data-tip': `${RARITY[rarity].name} card`, 'data-tip-title': 'Rarity' }) : null,
    premium ? h('div', { class: 'card-premium', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')) : null,
    h('div', { class: 'card-foil', 'aria-hidden': 'true' }),
    h('div', { class: 'card-glare', 'aria-hidden': 'true' }),
  );
}

// `skin` is a card back cosmetic id ('back:aurora'); the classic back is the art slot alone.
export function renderCardBack(classes = '', skin = 'back:classic') {
  const name = skin.split(':')[1];
  return h('div', { class: `card card-back ${classes}`, 'data-back': name },
    artSlot('', cardBackUrls(), 'M'),
    name !== 'classic' ? h('div', { class: 'back-skin', 'aria-hidden': 'true' }, h('span', null, 'M')) : null);
}

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
    class: `minion ${flags}${premium ? ' premium' : ''} ${classes}`, style, 'data-uid': m.uid, 'data-tilt': '10', onclick, onmouseenter,
    role: 'button', tabindex: '0', 'aria-label': `${def.displayName}, ${atk} attack, ${hp} health`,
  },
    artSlot('minion-art', cardArtUrls(def, ownerDeckId), deck.icon),
    // Keyword strip between the art and the name: named chips, icon-only when there are too many to fit.
    kws.length || m.xp ? h('div', { class: `minion-badges${kws.length > 2 ? ' compact' : ''}` },
      kws.map(k => h('span', {
        class: `badge kind-${kwKind(k)}${lit.has(k) ? ' lit' : ''}${m.tempKw.includes(k) && !m.kw.includes(k) ? ' temp' : ''}`,
        style: { '--kw': kwColor(k) }, 'data-kw': k, 'aria-label': kwName(k),
      }, h('i', { 'aria-hidden': 'true' }, kwIcon(k)), h('b', null, kwName(k)))),
      m.xp ? h('span', { class: 'xp', 'data-tip': `${m.xp} XP${m.leveled ? ' · Leveled Up' : ' · Levels Up at 3'}`, 'data-tip-title': `${kwIcon('XP')} XP` }, `${m.xp}xp`) : null,
    ) : null,
    h('div', { class: 'minion-name' }, def.displayName),
    sleeping ? h('div', { class: 'minion-status', 'data-tip': 'Summoning sickness: monsters attack from the turn after they arrive, unless they have Rush.', 'data-tip-title': '💤 Resting' }, 'zzz') : null,
    rushReady ? h('div', { class: 'minion-status good', 'data-kw': 'Rush' }, `${kwIcon('Rush')} Rush`) : null,
    suppressed ? h('div', { class: 'minion-status bad', 'data-kw': 'Suppress' }, `${kwIcon('Suppression')} Suppressed`) : null,
    m.silenced && !suppressed ? h('div', { class: 'minion-status bad', 'data-kw': 'Silence' }, `${kwIcon('Silence')} Silenced`) : null,
    h('span', { class: `stat atk${atk > def.baseAttack ? ' up' : atk < def.baseAttack ? ' down' : ''}` }, atk),
    bonusTotal ? h('span', { class: 'minion-bonus', 'data-tip': `${bonusTip} — this bonus is active right now.`, 'data-tip-title': '⚡ Attack bonus' }, `+${bonusTotal}`) : null,
    h('span', { class: `stat hp${hp < maxHp ? ' down' : maxHp > def.baseHealth ? ' up' : ''}` }, hp),
    h('div', { class: 'minion-glow', 'aria-hidden': 'true' }),
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
    if (text.includes(term) || (term === 'Quick' && def.speedWindow === 'Quick')) entries.push([term, explain]);
  }
  return entries;
}

// Live status lines for a monster on the board ("Momentum: +1 ATK right now", "Silenced", ...).
export function statusLines(state, instance) {
  const status = [];
  for (const b of attackBonuses(state, instance)) status.push(`${kwIcon(b.keyword)} ${kwName(b.keyword)}: +${b.amount} ATK right now`);
  if (instance.xp) status.push(`${kwIcon('XP')} ${instance.xp} XP${instance.leveled ? ' (Leveled Up)' : ' — Levels Up at 3'}`);
  if (instance.silenced) status.push(`${kwIcon('Silence')} Silenced: no keywords or card text`);
  if (state.turn <= instance.suppressedUntil) status.push(`${kwIcon('Suppression')} Suppressed — can't attack this turn`);
  if (instance.tempKw.length) status.push(`This turn only: ${instance.tempKw.map(k => `${kwIcon(k)} ${kwName(k)}`).join(', ')}`);
  const temp = instance.mods.filter(x => x.temp).reduce((s, x) => s + x.atk, 0);
  if (temp) status.push(`${temp > 0 ? '+' : ''}${temp} ATK this turn`);
  if (instance.summonedTurn === state.turn && instance.owner === state.active && !hasKeyword(instance, 'Rush') && !hasKeyword(instance, 'Structure')) status.push('💤 Just summoned — attacks next turn');
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
