// The live tier list (server/live-meta.mjs): built only from finished matches in the database.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, logMatch } from '../server/db.mjs';
import { createLiveMeta, MIN_GAMES } from '../server/live-meta.mjs';
import { createPages } from '../server/pages.mjs';
import { DECKS } from '../src/data/index.js';

const NOW = new Date('2026-11-16T12:00:00Z');
const daysAgo = d => new Date(NOW.getTime() - d * 86_400_000);
const [A, B, C, D] = DECKS.map(d => d.id);

// `n` online games of deck a (seat 0) against deck b, a winning `wins` of them.
function games(db, n, a, b, wins, { styles = ['Aggro', 'Control'], at = daysAgo(1), kind = 'online', rated = false, ending = 'hero', players = ['p1', 'p2'] } = {}) {
  for (let i = 0; i < n; i++) {
    logMatch(db, { kind, players, decks: [a, b], styles, winner: i < wins ? 0 : 1, turns: 10, at, rated, ending });
  }
}

const meta = (db, opts) => createLiveMeta({ db, now: () => NOW }).get(opts);
const row = (list, deck, style) => list.find(r => r.deck === deck && (!style || r.style === style));

test('win and play rates come from both sides of every online game', () => {
  const db = openDb(':memory:');
  games(db, 40, A, B, 30);
  const m = meta(db);
  assert.equal(m.games, 40);
  assert.equal(m.players, 2);
  assert.equal(row(m.decks, A).winRate, 0.75);
  assert.equal(row(m.decks, B).winRate, 0.25);
  assert.equal(row(m.decks, A).playRate, 0.5);
  assert.equal(row(m.builds, A, 'Aggro').games, 40);
  assert.equal(m.matchups[A][B].winRate, 0.75);
  assert.equal(m.matchups[B][A].games, 40);
  // A ranks above B, and the tier reflects the shrunk rate, not the raw one.
  assert.equal(m.decks[0].deck, A);
  assert.ok(row(m.decks, A).adjusted < 0.75 && row(m.decks, A).adjusted > 0.6);
  assert.equal(row(m.decks, A).tier, 'S');
  assert.equal(row(m.decks, B).tier, 'D');
});

test('a deck needs enough games for a tier', () => {
  const db = openDb(':memory:');
  games(db, MIN_GAMES - 1, A, B, MIN_GAMES - 1);
  const m = meta(db);
  assert.equal(row(m.decks, A).tier, null);
  assert.equal(row(m.decks, A).winRate, 1);
  assert.equal(m.health.level, 'early');
});

test('mirrors count toward play rate only, and dropped connections not at all', () => {
  const db = openDb(':memory:');
  games(db, 10, A, A, 10, { styles: ['Aggro', 'Aggro'] });
  games(db, 10, A, B, 0, { ending: 'disconnected' });
  const m = meta(db);
  assert.equal(m.games, 10);
  assert.equal(row(m.decks, A).picks, 20);
  assert.equal(row(m.decks, A).games, 0);
  assert.equal(row(m.decks, A).winRate, null);
  assert.equal(m.matchups[A], undefined);
  // Same genre but different styles is a real matchup for the styles, not for the genre.
  games(db, 10, A, A, 10, { styles: ['Aggro', 'Control'] });
  const m2 = createLiveMeta({ db, now: () => NOW }).get();
  assert.equal(row(m2.builds, A, 'Aggro').winRate, 1);
  assert.equal(row(m2.builds, A, 'Control').winRate, 0);
});

test('sources, windows and trends', () => {
  const db = openDb(':memory:');
  games(db, 30, A, B, 20, { rated: true });
  games(db, 30, C, D, 10);
  games(db, 30, A, B, 10, { at: daysAgo(10) });                         // the window before the last 7 days
  games(db, 25, A, B, 25, { kind: 'ai', players: ['p1', null] });       // vs AI: only the player's side
  games(db, 5, A, B, 5, { at: daysAgo(100) });                          // older than any window

  const ranked = meta(db, { source: 'ranked' });
  assert.equal(ranked.games, 30);
  assert.equal(row(ranked.decks, C), undefined);

  const pvp = meta(db, { days: 7 });
  assert.equal(pvp.games, 60);
  // A won 20 of 30 now and 10 of 30 in the week before.
  assert.equal(row(pvp.decks, A).trend.winRate, 0.3333);

  const month = meta(db, { days: 30 });
  assert.equal(month.games, 90);
  assert.equal(row(month.decks, A).winRate, 0.5);

  const ai = meta(db, { source: 'ai' });
  assert.equal(ai.games, 25);
  assert.equal(row(ai.decks, B), undefined);
  assert.equal(row(ai.decks, A).winRate, 1);

  // Unknown filters fall back to the defaults.
  const odd = meta(db, { days: 3, source: 'everything' });
  assert.equal(odd.days, 7);
  assert.equal(odd.source, 'pvp');
});

test('the meta health reads diversity and a runaway deck', () => {
  const db = openDb(':memory:');
  // Every deck played about equally and winning about half.
  for (let i = 0; i < DECKS.length; i++) games(db, 40, DECKS[i].id, DECKS[(i + 1) % DECKS.length].id, 20);
  const even = meta(db);
  assert.equal(even.health.level, 'healthy');
  assert.ok(even.health.diversity > 9.9);
  // One deck in most games, and winning them.
  const db2 = openDb(':memory:');
  for (const d of DECKS.slice(1)) games(db2, 30, A, d.id, 24);
  const runaway = meta(db2);
  assert.equal(runaway.health.level, 'warning');
  assert.equal(runaway.health.top.deck, A);
});

test('results are cached briefly, then refreshed', () => {
  const db = openDb(':memory:');
  let t = NOW.getTime();
  const live = createLiveMeta({ db, now: () => new Date(t) });
  games(db, 4, A, B, 2);
  assert.equal(live.get().games, 4);
  games(db, 4, A, B, 2);
  assert.equal(live.get().games, 4);
  t += 61_000;
  assert.equal(live.get().games, 8);
});

test('the live tier list page is in the nav and the sitemap', () => {
  const pages = createPages({ reportFile: '/nonexistent/meta-latest.md' });
  const html = pages.render('/meta/live').html;
  assert.match(html, /<title>MetaDeck Live Tier List/);
  assert.match(html, /src="\/src\/ui\/live-meta\.js"/);
  assert.match(html, /<a href="\/meta\/live" aria-current="page">Live meta<\/a>/);
  assert.doesNotMatch(html, /noindex/);
  assert.ok(pages.paths().includes('/meta/live'));
  assert.match(pages.render('/decks').html, /href="\/meta\/live">Live meta/);
});
