// Keyword presentation: one icon, colour and one-line hint per keyword and rules term, shared by
// card chips, board badges, glossaries, tooltips and the in-match callouts. Rules text itself
// lives in engine/constants.js; this file only decides how it looks.

import { h } from './dom.js';
import { KEYWORDS, TERMS } from '../engine/constants.js';

// kind: how the keyword behaves, which decides the chip colour family.
//   combat  – changes how fights resolve (red/orange)
//   defense – protects or absorbs (blue)
//   trigger – fires on an event (violet)
//   bonus   – conditional attack bonus (gold)
//   economy – resources: cards, Bandwidth, Nitro (cyan)
//   passive – static restriction or tag (grey)
export const KW_META = {
  Rush: { icon: '⚡', kind: 'combat', hint: 'Attacks the turn it arrives' },
  Guard: { icon: '🛡️', kind: 'defense', hint: 'Must be attacked first' },
  FirstStrike: { icon: '⚔️', kind: 'combat', hint: 'Hits before the other monster' },
  Counter: { icon: '↩️', kind: 'defense', hint: 'Hits first when attacked' },
  Stealth: { icon: '👁️', kind: 'defense', hint: "Can't be hit until it attacks" },
  Suppression: { icon: '📵', kind: 'combat', hint: "What it damages can't attack next turn" },
  Headshot: { icon: '🎯', kind: 'combat', hint: 'Kills a damaged monster outright' },
  Drone: { icon: '🛸', kind: 'passive', hint: 'Just a tag — no rules' },
  Fear: { icon: '😱', kind: 'combat', hint: 'Target gets -1 ATK before the fight' },
  Haunt: { icon: '👻', kind: 'trigger', hint: 'Death: 2 damage to a random enemy' },
  Devour: { icon: '🦷', kind: 'trigger', hint: 'Grows +1/+1 after a kill' },
  DoubleJump: { icon: '🦘', kind: 'combat', hint: 'Ignores Guard' },
  PoweredUp: { icon: '✨', kind: 'defense', hint: 'Blocks the next damage once' },
  Checkpoint: { icon: '🚩', kind: 'defense', hint: 'Survives lethal damage once' },
  XP: { icon: '⭐', kind: 'trigger', hint: 'Levels up after 3 attacks' },
  Momentum: { icon: '🏃', kind: 'bonus', hint: '+1 ATK after your first attack' },
  Clutch: { icon: '💢', kind: 'bonus', hint: '+2 ATK while behind on HP' },
  Combo: { icon: '🔗', kind: 'bonus', hint: '+1 ATK per other card played (max 2)' },
  Structure: { icon: '🏛️', kind: 'passive', hint: "Can't attack" },
  Fortify: { icon: '🧱', kind: 'defense', hint: 'Takes 1 less from every hit' },
  Generate: { icon: '🔋', kind: 'economy', hint: '+1 Bandwidth each turn' },
  District: { icon: '🏙️', kind: 'passive', hint: 'Powers up District cards' },
  Tax: { icon: '💰', kind: 'economy', hint: 'Enemy spells cost 1 more' },
  Populate: { icon: '👥', kind: 'trigger', hint: 'Arrives with a 1/1 Citizen' },
  Topdeck: { icon: '🃏', kind: 'trigger', hint: '+1/+1 whenever you draw' },
  Errata: { icon: '📝', kind: 'trigger', hint: 'Silences a random enemy on entry' },
  Copy: { icon: '📑', kind: 'economy', hint: 'Shuffles a copy into your deck' },
  Overtake: { icon: '🏁', kind: 'economy', hint: '+1 Nitro after it attacks' },
  Slipstream: { icon: '💨', kind: 'bonus', hint: '+1 ATK while you hold Nitro' },
  Inspire: { icon: '📣', kind: 'bonus', hint: 'Your other monsters +1 ATK' },
};

export const TERM_META = {
  Silence: { icon: '🔇', kind: 'combat' },
  Suppress: { icon: '📵', kind: 'combat' },
  Boost: { icon: '🔥', kind: 'economy' },
  Nitro: { icon: '🏎️', kind: 'economy' },
  Bandwidth: { icon: '💠', kind: 'economy' },
  Quick: { icon: '⏱️', kind: 'trigger' },
  Revive: { icon: '💫', kind: 'trigger' },
};

export const KIND_COLORS = {
  combat: '#ff6b5c',
  defense: '#4fb8ff',
  trigger: '#b78cff',
  bonus: '#ffc53d',
  economy: '#2fe3d6',
  passive: '#9aa3c2',
};

export const kwIcon = k => KW_META[k]?.icon ?? TERM_META[k]?.icon ?? '◆';
export const kwKind = k => KW_META[k]?.kind ?? TERM_META[k]?.kind ?? 'passive';
export const kwColor = k => KIND_COLORS[kwKind(k)];
export const kwName = k => KEYWORDS[k]?.name ?? k;
export const kwText = k => KEYWORDS[k]?.text ?? TERMS[k] ?? '';
export const kwHint = k => KW_META[k]?.hint ?? '';

// The trigger words that open a rules line ("Play:", "Death:", ...), with what they mean.
export const TRIGGER_TIPS = {
  'Play': ['▶', 'Happens when you play this card.'],
  'Death': ['💀', 'Happens when this monster is destroyed.'],
  'Turn start': ['🌅', 'Happens at the start of each of your turns while this is on the board.'],
  'Turn end': ['🌙', 'Happens at the end of each of your turns while this is on the board.'],
};

// A small inline chip for a keyword: icon + name, coloured by kind, with a hover tooltip.
export function kwChip(k, { icon = true, name = true, extra = '', classes = '' } = {}) {
  return h('span', {
    class: `kw-chip kind-${kwKind(k)} ${classes}`, style: { '--kw': kwColor(k) }, 'data-kw': k, tabindex: '0',
  },
    icon ? h('i', { class: 'kw-ico', 'aria-hidden': 'true' }, kwIcon(k)) : null,
    name ? kwName(k) : null,
    extra ? h('b', { class: 'kw-extra' }, extra) : null);
}

// Rules text with keywords, terms and trigger prefixes wrapped in tooltip-bearing spans.
// Longer names are matched first so "First Strike" wins over anything shorter.
const KW_BY_NAME = Object.entries(KEYWORDS).map(([k, v]) => [v.name, k]).sort((a, b) => b[0].length - a[0].length);
const TERM_NAMES = Object.keys(TERMS).sort((a, b) => b.length - a.length);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RICH_RE = new RegExp(
  `^(${Object.keys(TRIGGER_TIPS).map(esc).join('|')}):|\\b(${[...KW_BY_NAME.map(x => x[0]), ...TERM_NAMES].map(esc).join('|')})\\b`,
  'g',
);

export function richText(line) {
  const out = [];
  let last = 0;
  for (const m of line.matchAll(RICH_RE)) {
    if (m.index > last) out.push(line.slice(last, m.index));
    if (m[1]) {
      const [icon, tip] = TRIGGER_TIPS[m[1]];
      out.push(h('span', { class: 'trig', 'data-tip': tip, 'data-tip-title': m[1], tabindex: '0' },
        h('i', { 'aria-hidden': 'true' }, icon), m[1]));
    } else {
      const name = m[2];
      const kw = KW_BY_NAME.find(x => x[0] === name)?.[1];
      const key = kw ?? name;
      out.push(h('span', { class: `term kind-${kwKind(key)}`, style: { '--kw': kwColor(key) }, 'data-kw': key, tabindex: '0' }, name));
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

// What the shared tooltip shows for an element carrying data-kw or data-tip.
export function describeTip(el) {
  const k = el.dataset.kw;
  if (k) return { icon: kwIcon(k), title: kwName(k), text: kwText(k), hint: kwHint(k), color: kwColor(k) };
  if (el.dataset.tip) return { icon: null, title: el.dataset.tipTitle || '', text: el.dataset.tip, hint: '', color: '#c9cfe6' };
  return null;
}

// A glossary list (dl) with icons, used by the inspect popup, gallery and rules page.
// entries: [[key, text]] where key is a keyword id or a term.
export function glossaryList(entries, classes = '') {
  return h('dl', { class: `glossary ${classes}` }, entries.map(([key, text]) => [
    h('dt', { class: `kind-${kwKind(key)}`, style: { '--kw': kwColor(key) } },
      h('i', { class: 'kw-ico', 'aria-hidden': 'true' }, kwIcon(key)), kwName(key)),
    h('dd', null, text),
  ]));
}
