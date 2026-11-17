// The content pages (server/pages.mjs): deck pages, the card list, the meta from a Balance lab report
// and how to play, built from the card data.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPages, parseReport, slug } from '../server/pages.mjs';
import { DECKS, starterDecks } from '../src/data/index.js';
import { GUIDES } from '../src/data/guides.js';
import { encodeDeck, decodeDeck } from '../src/data/deck-code.js';

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
    assert.match(page.html, new RegExp(`<title>${deck.name} Deck Guides: `));
    for (const card of deck.cards) assert.ok(page.html.includes(`id="${card.cardId}"`), card.cardId);
    assert.ok(page.html.includes(`href="https://play.example.com/decks/${slug(deck)}"`), 'canonical');
  }
  const horror = pages.render('/decks/horror').html;
  assert.match(horror, /<dt>Haunt<\/dt><dd>When this dies, deal 2 damage/);
  assert.match(horror, /Fright Night/);
  assert.match(horror, /Death: Summon a 1\/1 Ghoul with Fear\./);
  assert.equal(pages.render('/decks/nope'), null);
}));

const codesIn = texts => texts.flatMap(t => [...t.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]));
const codeOf = id => id.split('_')[1];

test('every genre and every starter list has a written guide that names only its own cards', () => withReport(null, pages => {
  for (const deck of DECKS) {
    const g = GUIDES[deck.id];
    assert.ok(g, `${deck.name} has a guide`);
    for (const field of ['plan', 'against']) assert.ok(g[field]?.length > 40, `${deck.name}.${field}`);
    assert.ok(g.tips.length >= 3, deck.name);
    for (const code of codesIn([g.plan, g.against, ...g.tips])) assert.ok(deck.cards.some(c => codeOf(c.cardId) === code), `${deck.name} guide names ${code}`);

    const starters = starterDecks(deck.id);
    assert.deepEqual(Object.keys(g.lists).sort(), starters.map(s => s.name).sort(), `${deck.name}: one guide per starter list`);
    for (const s of starters) {
      const l = g.lists[s.name];
      const where = `${deck.name} / ${s.name}`;
      for (const field of ['plan', 'early', 'mid', 'late']) assert.ok(l[field]?.length > 40, `${where}.${field}`);
      assert.ok(l.keyCards.length >= 3 && l.tips.length >= 2, where);
      // A list's guide only talks about cards that are in that list.
      const inList = new Set(s.cards.map(codeOf));
      const texts = [l.plan, l.early, l.mid, l.late, ...l.tips, ...l.keyCards.map(([, why]) => why)];
      for (const code of [...l.keyCards.map(([code]) => code), ...codesIn(texts)]) assert.ok(inList.has(code), `${where} names ${code}, which isn't in the list`);
    }

    const html = pages.render(`/decks/${slug(deck)}`).html;
    assert.match(html, new RegExp(`<h2>How ${deck.name} plays</h2>`));
    for (const s of starters) {
      assert.match(html, new RegExp(`<article class="list" id="${slug({ name: s.name })}">`), s.name);
      assert.ok(html.includes(`<code>${encodeDeck(deck.id, s.cards)}</code>`), `${s.name} deck code`);
    }
    assert.doesNotMatch(html, /\[[MS]\d+\]/, `${deck.name}: every card code is replaced by its name`);
  }
  const fps = pages.render('/decks/fps').html;
  assert.match(fps, /<a class="card-ref" href="#FPS_M26_SpecOpsInfiltrator">Spec Ops Infiltrator<\/a>/);
  assert.match(fps, /Blitz Squad[\s\S]*Free from the start[\s\S]*Overwatch[\s\S]*Unlocks at FPS level 4[\s\S]*Drone Network[\s\S]*Unlocks at FPS level 7/);
  // The decklist adds up to 40.
  const blitz = /id="blitz-squad">[\s\S]*?<\/article>/.exec(fps)[0];
  assert.equal([...blitz.matchAll(/<b>×(\d)<\/b>/g)].reduce((n, m) => n + Number(m[1]), 0), 40);
}));

test('the starter decks behind the guides still decode from their deck codes', () => {
  for (const deck of DECKS) {
    for (const s of starterDecks(deck.id)) {
      const back = decodeDeck(encodeDeck(deck.id, s.cards));
      assert.equal(back.archetype, deck.id);
      assert.deepEqual([...back.cards].sort(), [...s.cards].sort());
    }
  }
});

test('the card list has every card, and text is escaped', () => withReport(null, pages => {
  const html = pages.render('/cards').html;
  const total = DECKS.reduce((n, d) => n + d.cards.length, 0);
  assert.equal(html.match(/<tr id="[^"]+" data-search=/g).length, total);
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

// A report shaped like the Balance lab's run over every starter list, with Team Spirit on top.
const variantReport = () => {
  const lists = DECKS.flatMap(d => starterDecks(d.id).map(s => ({ name: s.name, label: `${s.name} (${d.name})` })));
  const overall = Object.fromEntries(lists.map((l, i) => [l.name, 44 + (i % 10)]));
  overall['Team Spirit'] = 60.9;
  overall['Blitz Squad'] = 41.5;
  return `# MetaDeck meta report

## Every starter variant

Generated 2026-11-15T20:56:11.027Z by the Balance lab. 435000 AI-vs-AI games, 1000 per matchup.

### Balance check

| Deck | Overall | Favored (>55%) | Even | Unfavored (<45%) | Best | Worst | Spread | Verdict |
|---|---|---|---|---|---|---|---|---|
${lists.map(l => `| ${l.label} | ${overall[l.name]}% | 1 | 7 | 1 | Fortress (Strategy) 60% | Overwatch (FPS) 40% | 20% | Healthy: secret note |`).join('\n')}

### Play styles

| Style | Variants | vs other styles | vs Aggro | Verdict |
|---|---|---|---|---|
| Ramp | Economy 55% | 55.5% | 63% | Dominant: secret note |
| Aggro | Blitz Squad 41% | 43.6% | · | Behind |

### Matchups (row deck's win rate vs column deck)

| | ${lists.map(l => l.name).join(' | ')} |
|---|${lists.map(() => '---').join('|')}|
${lists.map(r => `| **${r.label}** | ${lists.map(c => (c === r ? '·' : r.name === 'Team Spirit' ? '72%' : '50%')).join(' | ')} |`).join('\n')}

### Snowball check

| Deck | Converts T6 | Verdict |
|---|---|---|
| Team Spirit (Sports) | 83% | Snowbally |
`;
};

test('a report over every starter list ranks the lists, and each deck page shows its own', () => withReport(variantReport(), pages => {
  const html = pages.render('/meta').html;
  assert.match(html, /Tier 1[\s\S]*Team Spirit<\/b><span>Sports · Midrange · 60\.9% win rate/);
  assert.match(html, /Tier 3[\s\S]*Blitz Squad/);
  assert.match(html, /href="\/decks\/sports#team-spirit"/);
  assert.match(html, /By play style[\s\S]*Ramp[\s\S]*55\.5%/);
  assert.match(html, /30 starter decks/);
  assert.match(html, /1,000 games per matchup/);
  assert.doesNotMatch(html, /secret note|Snowbally|noindex/);
  const sports = pages.render('/decks/sports').html;
  assert.match(sports, /Team Spirit<\/b><\/a> <span class="tag">Tier 1<\/span> 60\.9% win rate/);
  assert.match(sports, /id="team-spirit">[\s\S]*?<a href="\/meta">Tier 1<\/a>, 60\.9% win rate/);
  const data = parseReport(variantReport());
  assert.equal(data.variants.length, 30);
  assert.equal(data.matchups['Team Spirit']['Blitz Squad'], '72%');
  assert.equal(data.decks.length, DECKS.length);
}));

test('a partial report is not a meta', () => {
  assert.equal(parseReport('# MetaDeck meta report\n\n## Balance check\n\n| Deck | Overall |\n|---|---|\n| FPS | 50% |\n'), null);
  const full = parseReport(sampleReport());
  assert.equal(full.decks[0].deck.name, 'Strategy');
  assert.equal(full.matchups.Strategy.FPS, '60%');
  assert.equal(full.date, '2026-11-12');
});
