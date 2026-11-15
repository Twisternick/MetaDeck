// The content pages (server/pages.mjs): deck pages, the card list, the meta from a Balance lab report
// and how to play, built from the card data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPages, parseReport, slug } from '../server/pages.mjs';
import { DECKS } from '../src/data/index.js';

const names = DECKS.map(d => d.name);
// A report shaped like the Balance lab's, with Strategy on top and Fighting at the bottom.
const sampleReport = () => {
  const overall = Object.fromEntries(names.map((n, i) => [n, 50 + (i % 3) - 1]));
  overall.Strategy = 52.4;
  overall.Fighting = 47.9;
  return `# MetaDeck meta report

## Balance check

| Deck | Overall | Favored (>55%) | Even | Unfavored (<45%) | Best | Worst | Spread | Verdict |
|---|---|---|---|---|---|---|---|---|
${names.map(n => `| ${n} | ${overall[n]}% | 1 | 7 | 1 | FPS 60% | Sports 44% | 16% | Healthy: secret note |`).join('\n')}

Generated 2026-11-12T18:50:12.104Z by the Balance lab. 450000 AI-vs-AI games, 10000 per matchup.

## Matchups (row deck's win rate vs column deck)

| | ${names.join(' | ')} |
|---|${names.map(() => '---').join('|')}|
${names.map(r => `| **${r}** | ${names.map(c => (c === r ? '·' : r === 'Strategy' ? '60%' : '50%')).join(' | ')} |`).join('\n')}

## Cards that over-perform their deck

| Δ | Deck | Cost | Card | Played in |
|---|---|---|---|---|
| +20% | Fighting | 4 | Sudden Death | 17% |
`;
};

function withReport(markdown, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadeck-pages-'));
  const reportFile = path.join(dir, 'meta-latest.md');
  if (markdown !== null) fs.writeFileSync(reportFile, markdown);
  try { return fn(createPages({ reportFile, publicUrl: 'https://play.example.com' }), reportFile); }
  finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('every deck has a page listing its 40 cards, keywords and starters', () => withReport(null, pages => {
  for (const deck of DECKS) {
    const page = pages.render(`/decks/${slug(deck)}`);
    assert.ok(page, deck.name);
    assert.match(page.html, new RegExp(`<title>${deck.name} Deck Guide`));
    for (const card of deck.cards) assert.ok(page.html.includes(`id="${card.cardId}"`), card.cardId);
    assert.ok(page.html.includes(`href="https://play.example.com/decks/${slug(deck)}"`), 'canonical');
  }
  const horror = pages.render('/decks/horror').html;
  assert.match(horror, /<dt>Haunt<\/dt><dd>When this dies, deal 2 damage/);
  assert.match(horror, /Fright Night/);
  assert.match(horror, /Death: Summon a 1\/1 Ghoul with Fear\./);
  assert.equal(pages.render('/decks/nope'), null);
}));

test('the card list has every card, and text is escaped', () => withReport(null, pages => {
  const html = pages.render('/cards').html;
  const total = DECKS.reduce((n, d) => n + d.cards.length, 0);
  assert.equal(html.match(/<tr data-search=/g).length, total);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /src="\/src\/ui\/card-search\.js"/);
}));

test('the meta page shows tiers and matchups but none of the report’s private notes', () => withReport(sampleReport(), (pages, reportFile) => {
  const html = pages.render('/meta').html;
  assert.match(html, /Tier 1[\s\S]*Strategy[\s\S]*52\.4% win rate/);
  assert.match(html, /Tier 3[\s\S]*Fighting/);
  assert.match(html, /450,000/);
  assert.doesNotMatch(html, /secret note|Sudden Death|noindex/);
  assert.ok(pages.paths().includes('/meta'));
  assert.match(pages.render('/decks/strategy').html, /Tier 1/);
  // A new report shows up without a restart.
  fs.writeFileSync(reportFile, '# MetaDeck meta report\n\nOne deck only.\n');
  fs.utimesSync(reportFile, new Date(), new Date(Date.now() + 5000));
  assert.match(pages.render('/meta').html, /noindex/);
  assert.ok(!pages.paths().includes('/meta'));
}));

test('without a report the meta page is a placeholder kept out of search', () => withReport(null, pages => {
  assert.match(pages.render('/meta').html, /<meta name="robots" content="noindex">/);
  assert.ok(!pages.paths().includes('/meta'));
  assert.doesNotMatch(pages.render('/decks').html, /href="\/meta"/);
}));

test('a partial report is not a meta', () => {
  assert.equal(parseReport('# MetaDeck meta report\n\n## Balance check\n\n| Deck | Overall |\n|---|---|\n| FPS | 50% |\n'), null);
  const full = parseReport(sampleReport());
  assert.equal(full.decks[0].deck.name, 'Strategy');
  assert.equal(full.matchups.Strategy.FPS, '60%');
  assert.equal(full.date, '2026-11-12');
});
