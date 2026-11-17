// The live meta: a tier list built only from games real players finished on this server (the matches
// table), never from simulations. The Balance lab's tier list (server/pages.mjs, /meta) says how the
// decks should do with the AI on both sides; this one says how they're actually doing.
//
//   GET /api/live-meta?days=7&source=pvp
//
// Sources: 'pvp' is every online match (both sides are people), 'ranked' only the rated ones, and 'ai'
// the player's side of the server-checked vs-AI matches. A side is a genre deck and the play style its
// list is built for (data/index.js deckStyle), so the same genre can rank differently as Aggro and as
// Control. Mirror matches count toward how often a deck is played but not toward its win rate, a draw is
// half a win, and a game that ended because someone's connection dropped says nothing about the decks,
// so it's left out. A deck needs MIN_GAMES before it gets a tier, and its tier comes from its win rate
// pulled toward 50% by PRIOR games' worth of even results, so a lucky few games can't put it on top.
// Results are cached for CACHE_MS per window and source, so the page can poll freely.

import { DECKS } from '../src/data/index.js';

export const WINDOWS = [1, 7, 30, 90];   // days
export const SOURCES = ['pvp', 'ranked', 'ai'];
export const MIN_GAMES = 20;
const PRIOR = 30;
const CACHE_MS = 60_000;
// Tiers by adjusted win rate, best first.
export const TIERS = [['S', 0.54], ['A', 0.515], ['B', 0.485], ['C', 0.46], ['D', -1]];
const known = new Set(DECKS.map(d => d.id));

const round = (n, places = 4) => Math.round(n * 10 ** places) / 10 ** places;
const adjust = r => (r.wins + 0.5 * PRIOR) / (r.games + PRIOR);
const tierOf = r => (r.games < MIN_GAMES ? null : TIERS.find(([, min]) => adjust(r) >= min)[0]);

// Every side that counts in [from, to): { deck, style, opp, oppStyle, score (1, 0.5 or 0), player }.
function sides(q, source, from, to) {
  const out = [];
  for (const m of q.all(source === 'ai' ? 'ai' : 'online', from.toISOString(), to.toISOString())) {
    if (m.ending === 'disconnected' || (source === 'ranked' && !m.rated)) continue;
    if (!known.has(m.deck0) || !known.has(m.deck1)) continue;
    const seats = source === 'ai' ? [0] : [0, 1];
    for (const s of seats) {
      out.push({
        deck: s ? m.deck1 : m.deck0, style: (s ? m.style1 : m.style0) ?? null,
        opp: s ? m.deck0 : m.deck1, oppStyle: (s ? m.style0 : m.style1) ?? null,
        score: m.winner == null ? 0.5 : m.winner === s ? 1 : 0, player: s ? m.p1 : m.p0,
      });
    }
  }
  return out;
}

// Play and win rates per key: { key -> { games (non-mirror), wins, picks (all sides) } }.
function tally(list, keyOf, mirror) {
  const rows = new Map();
  for (const s of list) {
    const key = keyOf(s);
    if (key == null) continue;
    const r = rows.get(key) ?? rows.set(key, { games: 0, wins: 0, picks: 0 }).get(key);
    r.picks++;
    if (!mirror(s)) { r.games++; r.wins += s.score; }
  }
  return rows;
}

function summarise(list, prev, { days, source, at }) {
  const total = list.length || 1;
  const prevTotal = prev.length || 1;
  const row = (r, p) => ({
    games: r.games, picks: r.picks, winRate: r.games ? round(r.wins / r.games) : null, adjusted: round(adjust(r)),
    playRate: round(r.picks / total), tier: tierOf(r),
    // Change since the window before this one, when that one had enough games to compare against.
    trend: p ? { winRate: p.games >= MIN_GAMES && r.games ? round(r.wins / r.games - p.wins / p.games) : null, playRate: round(r.picks / total - p.picks / prevTotal) } : null,
  });
  const byTier = (a, b) => (b.tier ? 1 : 0) - (a.tier ? 1 : 0) || b.adjusted - a.adjusted || b.picks - a.picks;

  const deckMirror = s => s.deck === s.opp;
  const decksNow = tally(list, s => s.deck, deckMirror);
  const decksPrev = tally(prev, s => s.deck, deckMirror);
  const decks = [...decksNow].map(([deck, r]) => ({ deck, ...row(r, decksPrev.get(deck)) })).sort(byTier);

  const buildKey = s => (s.style ? `${s.deck}|${s.style}` : null);
  const buildMirror = s => s.deck === s.opp && s.style === s.oppStyle;
  const buildsNow = tally(list, buildKey, buildMirror);
  const buildsPrev = tally(prev, buildKey, buildMirror);
  const builds = [...buildsNow].map(([key, r]) => {
    const [deck, style] = key.split('|');
    return { deck, style, ...row(r, buildsPrev.get(key)) };
  }).sort(byTier);

  const styles = [...tally(list, s => s.style, s => s.style === s.oppStyle)]
    .map(([style, r]) => ({ style, ...row(r, null) })).sort(byTier);

  // Deck against deck: the row deck's results against each column deck.
  const matchups = {};
  for (const s of list) {
    if (s.deck === s.opp) continue;
    const cell = (matchups[s.deck] ??= {})[s.opp] ??= { games: 0, wins: 0 };
    cell.games++;
    cell.wins += s.score;
  }
  for (const cols of Object.values(matchups)) {
    for (const [opp, c] of Object.entries(cols)) cols[opp] = { games: c.games, winRate: round(c.wins / c.games) };
  }

  // How healthy the meta is: how many decks are really being played (the effective number: 10 if every
  // deck is played equally, 1 if only one is), the most played deck, and the gap between the best and
  // worst ranked deck.
  const shares = decks.map(d => d.picks / total);
  const diversity = list.length ? round(1 / shares.reduce((t, s) => t + s * s, 0), 1) : 0;
  const ranked = decks.filter(d => d.tier);
  const spread = ranked.length >= 2 ? round(ranked[0].adjusted - ranked.at(-1).adjusted) : null;
  const top = [...decks].sort((a, b) => b.picks - a.picks)[0] ?? null;
  const games = source === 'ai' ? list.length : list.length / 2;
  let verdict;
  if (ranked.length < 3) verdict = { level: 'early', text: 'Too early to call: not enough games yet.' };
  else if (top.playRate >= 0.3 || ranked[0].adjusted >= 0.57) verdict = { level: 'warning', text: 'One deck is pulling ahead of the rest.' };
  else if (diversity >= 0.7 * DECKS.length && spread <= 0.08) verdict = { level: 'healthy', text: 'Healthy: lots of decks played, none running away with it.' };
  else verdict = { level: 'fair', text: 'Fairly balanced, with a few decks ahead of the pack.' };

  return {
    updated: at.toISOString(), days, source, games, players: new Set(list.map(s => s.player).filter(Boolean)).size,
    minGames: MIN_GAMES, tiers: TIERS.map(([t]) => t),
    health: { diversity, of: DECKS.length, spread, top: top ? { deck: top.deck, playRate: top.playRate } : null, ...verdict },
    decks, builds, styles, matchups,
  };
}

export function createLiveMeta({ db, now = () => new Date() }) {
  const q = db.prepare(`SELECT deck0, deck1, style0, style1, winner, ending, rated, p0, p1 FROM matches
    WHERE kind = ? AND at >= ? AND at < ?`);
  const cache = new Map(); // `${days}|${source}` -> { until, data }

  return {
    // The live meta for the last `days` days from `source`. Unknown values fall back to the defaults.
    get({ days = 7, source = 'pvp' } = {}) {
      days = WINDOWS.includes(Number(days)) ? Number(days) : 7;
      source = SOURCES.includes(source) ? source : 'pvp';
      const key = `${days}|${source}`;
      const at = now();
      const hit = cache.get(key);
      if (hit && hit.until > at.getTime()) return hit.data;
      const span = days * 86_400_000;
      const from = new Date(at.getTime() - span);
      const data = summarise(sides(q, source, from, at), sides(q, source, new Date(from.getTime() - span), from), { days, source, at });
      cache.set(key, { until: at.getTime() + CACHE_MS, data });
      return data;
    },
  };
}
