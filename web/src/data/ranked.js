// Ranked play: the visible ladder. (Who you're matched against is decided by a hidden skill rating,
// server/rating.mjs; this is what players see and climb.)
//
// Five tiers (Bronze → Diamond), each with five divisions (5 → 1) of three stars. A ranked win is a
// star, and a third win in a row adds a bonus star (below Diamond); a loss takes one away. You can't
// drop below the first division of a tier you've reached, so a tier, once earned, is kept for the
// season. Above Diamond 1 is Meta rank, where players are ordered by rating on the leaderboard.
//
// A season is a calendar month, the same as the season track. When it rolls over, everyone drops
// four divisions (and not below Bronze 5), and gets rewards for the highest rank they reached.
// Pure functions over a plain rank state, shared by the server (which owns it) and the UI.

import { seasonKey } from './economy.js';

export const TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'];
export const DIVISIONS = 5;
export const STARS_PER_DIVISION = 3;
export const TIER_STARS = DIVISIONS * STARS_PER_DIVISION; // 15
export const META_STARS = TIERS.length * TIER_STARS;      // 75
export const STREAK_BONUS_AT = 3;
export const SEASON_DROP = 4 * STARS_PER_DIVISION;
export const TIER_COLORS = { Bronze: '#cd8a52', Silver: '#c4cbe0', Gold: '#ffc53d', Platinum: '#5eead4', Diamond: '#7cc4ff', Meta: '#f472b6' };

export const newRank = (now = new Date()) => ({ season: seasonKey(now), stars: 0, peak: 0, streak: 0, games: 0, wins: 0 });

// Where a star count sits: { tier, division, star (0..2 within the division), meta, label }.
export function rankOf(stars) {
  if (stars >= META_STARS) return { tier: 'Meta', division: null, star: 0, meta: true, label: 'Meta', color: TIER_COLORS.Meta };
  const t = Math.floor(stars / TIER_STARS);
  const inTier = stars % TIER_STARS;
  const division = DIVISIONS - Math.floor(inTier / STARS_PER_DIVISION);
  return { tier: TIERS[t], division, star: inTier % STARS_PER_DIVISION, meta: false, label: `${TIERS[t]} ${division}`, color: TIER_COLORS[TIERS[t]] };
}

// The lowest star count a player can fall to: the start of the highest tier they've reached.
export const floorOf = peak => Math.min(Math.floor(peak / TIER_STARS), TIERS.length - 1) * TIER_STARS;

// A ranked result. Returns the new state and the star change (which may be 0 at a floor).
export function applyResult(rank, won) {
  const r = { ...rank, games: rank.games + 1, wins: rank.wins + (won ? 1 : 0) };
  if (won) {
    r.streak = Math.max(0, rank.streak) + 1;
    const bonus = r.streak >= STREAK_BONUS_AT && rank.stars < META_STARS - TIER_STARS ? 1 : 0;
    r.stars = rank.stars + 1 + bonus;
  } else {
    r.streak = Math.min(0, rank.streak) - 1;
    r.stars = Math.max(floorOf(rank.peak), rank.stars - 1);
  }
  r.peak = Math.max(rank.peak, r.stars);
  return { rank: r, change: r.stars - rank.stars };
}

// What reaching a rank in a season earns, given at the start of the next one.
export function seasonRewards(peak) {
  const t = peak >= META_STARS ? 'Meta' : TIERS[Math.floor(peak / TIER_STARS)];
  return {
    Bronze: [{ type: 'gold', n: 100 }],
    Silver: [{ type: 'pack', kind: 'any', n: 1 }, { type: 'gold', n: 100 }],
    Gold: [{ type: 'pack', kind: 'any', n: 2 }, { type: 'dust', n: 100 }],
    Platinum: [{ type: 'pack', kind: 'any', n: 3 }, { type: 'dust', n: 200 }],
    Diamond: [{ type: 'pack', kind: 'any', n: 4 }, { type: 'dust', n: 400 }, { type: 'cosmetic', id: 'back:gold-circuit' }],
    Meta: [{ type: 'pack', kind: 'any', n: 5 }, { type: 'dust', n: 800 }, { type: 'cosmetic', id: 'back:gold-circuit' }],
  }[t];
}

// Bring a stored rank into the current season. Returns { rank, ended } where `ended` is the finished
// season ({ season, peak, rewards }) when it rolled over just now (rewards still to be granted), else null.
export function rollSeason(raw, now = new Date()) {
  const rank = raw && typeof raw === 'object' ? { ...newRank(now), ...raw } : newRank(now);
  if (rank.season === seasonKey(now)) return { rank, ended: null };
  const ended = rank.games > 0 ? { season: rank.season, peak: rank.peak, rewards: seasonRewards(rank.peak) } : null;
  const stars = Math.max(0, rank.stars - SEASON_DROP);
  const start = stars - (stars % STARS_PER_DIVISION);
  return { rank: { ...newRank(now), stars: start, peak: start }, ended };
}
