// A ranked badge: the tier's colour, its name, and the stars in the current division (src/data/ranked.js).

import { h } from './dom.js';
import { STARS_PER_DIVISION, TIER_COLORS } from '../data/ranked.js';

export function rankBadge(rank, { big = false } = {}) {
  if (!rank) return null;
  const stars = rank.meta ? null : h('span', { class: 'rank-stars', 'aria-label': `${rank.star} of ${STARS_PER_DIVISION} stars` },
    Array.from({ length: STARS_PER_DIVISION }, (_, i) => h('i', { class: i < rank.star ? 'on' : '' }, '★')));
  return h('span', { class: `rank-badge${big ? ' big' : ''}`, style: { '--tier': rank.color ?? TIER_COLORS[rank.tier] } },
    h('span', { class: 'rank-gem', 'aria-hidden': 'true' }, rank.meta ? '✦' : rank.tier[0]),
    h('span', { class: 'rank-text' }, h('b', null, rank.label), stars));
}
