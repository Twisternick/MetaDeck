// Content pages for search engines and new players: a page per genre deck, the full card list, the
// meta (tier list and matchups) and how to play. They're plain HTML built on the server from the game's
// own card data, so they stay in step with the cards, and each links back into the game.

import fs from 'node:fs';
import crypto from 'node:crypto';
import { DECKS } from '../src/data/index.js';
import { STARTERS, STYLES } from '../src/data/starters.js';
import { rarityOf, RARITY } from '../src/data/economy.js';
import { rulesText } from '../src/engine/text.js';
import { KEYWORDS, TERMS, RULES, START_HP, BOARD_SLOTS, MAX_HAND, MAX_BANDWIDTH, OPENING_HAND } from '../src/engine/constants.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slug = deck => deck.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const deckBySlug = s => DECKS.find(d => slug(d) === s);
const deckUrl = deck => `/decks/${slug(deck)}`;
const pct = n => `${Math.round(n * 10) / 10}%`;

// The meta comes from the Balance lab's latest report (AI-vs-AI simulations). Only its deck win rates
// and matchups are published; its balance notes and card statistics stay private. A report without a
// full balance check (a lab run on a single deck, say) means no meta page.
function parseReport(markdown) {
  const section = title => markdown.split(/^## /m).find(s => s.startsWith(title)) ?? '';
  const rows = text => text.split('\n').filter(l => l.startsWith('|') && !/^\|[-| ]+\|$/.test(l))
    .map(l => l.slice(1, -1).split('|').map(c => c.trim().replace(/\*\*/g, '')));
  const names = new Set(DECKS.map(d => d.name));
  const decks = rows(section('Balance check')).slice(1).filter(r => names.has(r[0])).map(r => ({
    deck: DECKS.find(d => d.name === r[0]), overall: parseFloat(r[1]), best: r[5], worst: r[6],
  })).filter(r => Number.isFinite(r.overall));
  if (decks.length !== DECKS.length) return null;
  decks.sort((a, b) => b.overall - a.overall);
  const [head, ...body] = rows(section('Matchups'));
  const matchups = {};
  for (const r of body) {
    if (!names.has(r[0])) continue;
    matchups[r[0]] = Object.fromEntries(head.slice(1).map((col, i) => [col, r[i + 1]]));
  }
  const gen = /Generated (\S+) by the Balance lab\. (\d+) AI-vs-AI games/.exec(markdown);
  return { decks, matchups, date: gen ? gen[1].slice(0, 10) : null, games: gen ? Number(gen[2]) : null };
}
const tierOf = overall => (overall >= 51 ? 1 : overall >= 49 ? 2 : 3);

export function createPages({ publicUrl = '', reportFile }) {
  const abs = p => `${publicUrl}${p}`;
  let report = { mtime: -1, data: null };
  const meta = () => {
    let mtime = 0;
    try { mtime = fs.statSync(reportFile).mtimeMs; } catch { /* no report yet */ }
    if (mtime !== report.mtime) {
      let data = null;
      try { data = mtime ? parseReport(fs.readFileSync(reportFile, 'utf8')) : null; } catch { /* unreadable: no meta page */ }
      report = { mtime, data };
      cache.clear();
    }
    return report.data;
  };
  const cache = new Map();

  function layout({ path: urlPath, title, description, image = '/assets/img/ui/key-art.webp', body, scripts = [], noindex = false }) {
    const nav = [['/decks', 'Decks'], ['/cards', 'Cards'], ...(meta() ? [['/meta', 'Meta']] : []), ['/how-to-play', 'How to play']];
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#04050b">
${noindex ? '  <meta name="robots" content="noindex">\n' : ''}
${publicUrl ? `  <link rel="canonical" href="${esc(abs(urlPath))}">\n  <meta property="og:url" content="${esc(abs(urlPath))}">\n` : ''}  <meta property="og:type" content="website">
  <meta property="og:site_name" content="MetaDeck">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${esc(abs(image))}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/png" href="/assets/img/ui/favicon.png">
  <link rel="stylesheet" href="/pages.css">
</head>
<body>
<header class="site-head">
  <a class="site-logo" href="/"><img src="/assets/img/ui/logo.webp" alt="MetaDeck" width="140" height="48"></a>
  <nav>${nav.map(([href, label]) => `<a href="${href}"${urlPath.startsWith(href) ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
  <a class="play-btn" href="/">Play free</a>
</header>
<main>
${body}
</main>
<footer class="site-foot">
  <p><a href="/">Play MetaDeck</a> · <a href="/legal/terms.html">Terms</a> · <a href="/legal/privacy.html">Privacy</a> · <a href="/legal/refunds.html">Refunds</a></p>
</footer>
${scripts.map(s => `<script type="module" src="${s}"></script>`).join('\n')}
</body>
</html>
`;
  }

  const keywordsOf = deck => [...new Set(deck.cards.flatMap(c => c.keywords))].filter(k => KEYWORDS[k]);
  const cardRow = (card, { deckCol = false } = {}) => {
    const rarity = rarityOf(card.cardId);
    const stats = card.type === 'Monster' ? `${card.baseAttack}/${card.baseHealth}` : '';
    const text = [card.keywords.map(k => KEYWORDS[k]?.name ?? k).join(', '), rulesText(card)].filter(Boolean).join('. ');
    const deck = DECKS.find(d => d.cards.includes(card));
    return `<tr data-search="${esc(`${card.displayName} ${text} ${deck.name} ${card.type}`.toLowerCase())}" data-deck="${esc(deck.id)}" data-type="${card.type}">
      <td class="cost">${card.cost}</td>
      <td class="name"><span id="${esc(card.cardId)}">${esc(card.displayName)}</span>${card.speedWindow === 'Quick' ? ' <span class="tag">Quick</span>' : ''}</td>
      ${deckCol ? `<td><a href="${deckUrl(deck)}">${esc(deck.name)}</a></td>` : ''}
      <td>${card.type}</td>
      <td class="stats">${stats}</td>
      <td class="rarity rarity-${rarity}">${RARITY[rarity].name}</td>
      <td class="text">${esc(text).replace(/\n/g, '<br>')}</td>
    </tr>`;
  };
  const cardTable = (cards, opts) => `<div class="table-wrap"><table class="cards">
    <thead><tr><th>Cost</th><th>Card</th>${opts?.deckCol ? '<th>Deck</th>' : ''}<th>Type</th><th>ATK/HP</th><th>Rarity</th><th>Text</th></tr></thead>
    <tbody>${cards.map(c => cardRow(c, opts)).join('')}</tbody></table></div>`;
  const byCost = cards => [...cards].sort((a, b) => a.cost - b.cost || a.displayName.localeCompare(b.displayName));

  function decksPage() {
    return layout({
      path: '/decks',
      title: 'All 10 Genre Decks — MetaDeck Card Battler',
      description: `Every MetaDeck deck is a video game genre: ${DECKS.map(d => d.name).join(', ')}. See how each one plays, its keywords and its cards.`,
      body: `<h1>The genre decks</h1>
<p class="lede">Every deck in MetaDeck is a video game genre with its own keywords and its own way to win. Each has a pool of 40 cards and three free starter lists.</p>
<ul class="deck-grid">${DECKS.map(d => `
  <li style="--deck:${esc(d.color)}"><a href="${deckUrl(d)}">
    <img src="/assets/img/decks/${esc(d.id)}.webp" alt="${esc(d.name)} deck art" loading="lazy" width="400" height="225">
    <h2>${esc(d.name)}</h2><p>${esc(d.tagline)}</p></a></li>`).join('')}
</ul>`,
    });
  }

  function deckPage(deck) {
    const m = meta()?.decks.find(r => r.deck === deck);
    const kws = keywordsOf(deck);
    const monsters = deck.cards.filter(c => c.type === 'Monster').length;
    return layout({
      path: deckUrl(deck),
      title: `${deck.name} Deck Guide: Cards, Keywords and Starters — MetaDeck`,
      description: `The ${deck.name} deck in MetaDeck, the free genre card battler. ${deck.tagline} All 40 cards, its keywords and three starter lists.`,
      image: `/assets/img/decks/${deck.id}.webp`,
      body: `<section class="deck-hero" style="--deck:${esc(deck.color)}">
  <img src="/assets/img/decks/${esc(deck.id)}.webp" alt="${esc(deck.name)} deck art" width="800" height="450">
  <div><p class="crumbs"><a href="/decks">Decks</a> ›</p>
  <h1><img class="emblem" src="/assets/img/ui/emblem-${esc(deck.id)}.webp" alt="" width="48" height="48"> ${esc(deck.name)}</h1>
  <p class="lede">${esc(deck.tagline)}</p>
  <p>${deck.cards.length} cards: ${monsters} monsters and ${deck.cards.length - monsters} spells.</p>
  <a class="play-btn" href="/">Play ${esc(deck.name)} free</a></div>
</section>
${m ? `<section><h2>In the meta</h2>
<p>${esc(deck.name)} wins ${pct(m.overall)} of its games across all matchups, which puts it in <a href="/meta">Tier ${tierOf(m.overall)}</a>. Best matchup: ${esc(m.best)}. Hardest: ${esc(m.worst)}.</p></section>` : ''}
<section><h2>Keywords</h2>
<dl class="glossary">${kws.map(k => `<dt>${esc(KEYWORDS[k].name)}</dt><dd>${esc(KEYWORDS[k].text)}</dd>`).join('')}</dl></section>
<section><h2>Starter decks</h2>
<p>Three ready-made ${esc(deck.name)} lists, each built around one play style.</p>
<ul class="starters">${(STARTERS[deck.id] ?? []).map(s => `<li><h3>${esc(s.name)} <span class="tag">${esc(s.style)}</span></h3><p>${esc(s.blurb)}</p><p class="muted">${esc(STYLES[s.style] ?? '')}</p></li>`).join('')}</ul></section>
<section><h2>All ${esc(deck.name)} cards</h2>
<ul class="art-strip">${byCost(deck.cards).map(c => `<li><img src="/assets/img/cards/${esc(c.cardId)}.webp" alt="${esc(c.displayName)}" loading="lazy" width="160" height="160"><span>${esc(c.displayName)}</span></li>`).join('')}</ul>
${cardTable(byCost(deck.cards))}</section>
<p class="other-decks">Other decks: ${DECKS.filter(d => d !== deck).map(d => `<a href="${deckUrl(d)}">${esc(d.name)}</a>`).join(' · ')}</p>`,
    });
  }

  function cardsPage() {
    const all = DECKS.flatMap(d => byCost(d.cards));
    return layout({
      path: '/cards',
      title: `MetaDeck Card List: All ${all.length} Cards`,
      description: `Search all ${all.length} MetaDeck cards by name, keyword, deck or type, with cost, stats, rarity and rules text for every card.`,
      scripts: ['/src/ui/card-search.js'],
      body: `<h1>Card list</h1>
<p class="lede">All ${all.length} cards across the ${DECKS.length} genre decks.</p>
<form class="card-filter" role="search">
  <input type="search" name="q" placeholder="Search cards, keywords, text…" aria-label="Search cards">
  <select name="deck" aria-label="Deck"><option value="">All decks</option>${DECKS.map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select>
  <select name="type" aria-label="Type"><option value="">Monsters and spells</option><option>Monster</option><option>Spell</option></select>
  <output name="count"></output>
</form>
${cardTable(all, { deckCol: true })}`,
    });
  }

  function metaPage(data) {
    const tiers = [1, 2, 3].map(t => [t, data.decks.filter(r => tierOf(r.overall) === t)]).filter(([, rows]) => rows.length);
    const names = DECKS.map(d => d.name);
    return layout({
      path: '/meta',
      title: 'MetaDeck Tier List: Best Decks and Matchups',
      description: `Which MetaDeck deck is best? The tier list and matchup chart for all ${DECKS.length} genre decks, from ${data.games ? `${data.games.toLocaleString('en-US')} ` : ''}simulated games.`,
      body: `<h1>Tier list and matchups</h1>
<p class="lede">How the ${DECKS.length} genre decks do against each other${data.date ? `, as of ${esc(data.date)}` : ''}.</p>
<p class="muted">From ${data.games ? `${data.games.toLocaleString('en-US')} ` : ''}games the AI played against itself with each deck's full card pool. Real players win and lose differently, and every deck is within a few points of even.</p>
${tiers.map(([t, rows]) => `<section class="tier tier-${t}"><h2>Tier ${t}</h2><ul class="tier-row">${rows.map(r => `
  <li style="--deck:${esc(r.deck.color)}"><a href="${deckUrl(r.deck)}"><img src="/assets/img/ui/emblem-${esc(r.deck.id)}.webp" alt="" width="40" height="40"><b>${esc(r.deck.name)}</b><span>${pct(r.overall)} win rate</span></a></li>`).join('')}</ul></section>`).join('')}
<section><h2>Matchups</h2>
<p>Each row is that deck's win rate against the deck in each column.</p>
<div class="table-wrap"><table class="matchups"><thead><tr><th></th>${names.map(n => `<th>${esc(n)}</th>`).join('')}</tr></thead>
<tbody>${names.filter(n => data.matchups[n]).map(row => `<tr><th><a href="${deckUrl(DECKS.find(d => d.name === row))}">${esc(row)}</a></th>${names.map(col => {
        const v = parseFloat(data.matchups[row][col]);
        return `<td class="${!Number.isFinite(v) ? 'self' : v >= 55 ? 'good' : v <= 45 ? 'bad' : ''}">${Number.isFinite(v) ? `${v}%` : '·'}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div></section>`,
    });
  }

  // Until there's a full report the home page's Tier list link still lands somewhere, kept out of search.
  const noMetaPage = () => layout({
    path: '/meta', noindex: true,
    title: 'MetaDeck Tier List',
    description: 'The MetaDeck tier list and matchup chart.',
    body: `<h1>Tier list</h1>
<p class="lede">The tier list is being worked out. In the meantime, see <a href="/decks">all ten decks</a>.</p>`,
  });

  function howToPage() {
    const kw = Object.values(KEYWORDS).sort((a, b) => a.name.localeCompare(b.name));
    return layout({
      path: '/how-to-play',
      title: 'How to Play MetaDeck: Rules, Keywords and House Rules',
      description: `Learn MetaDeck in a few minutes: bring the enemy from ${START_HP} HP to 0 with monsters and spells, Bandwidth, Quick cards and ${kw.length} keywords.`,
      body: `<h1>How to play</h1>
<p class="lede">MetaDeck is a one-on-one card battler. Pick a genre deck, then play the AI, a friend or ranked opponents online. The game also has an interactive tutorial.</p>
<section class="prose">
<h2>Goal</h2>
<p>Bring the enemy from ${START_HP} HP to 0.</p>
<h2>Turns</h2>
<ul>
  <li>The first player starts with ${OPENING_HAND[0]} cards, the second with ${OPENING_HAND[1]}. Draw a card at the start of each of your turns (except the very first turn of the game).</li>
  <li>Your maximum Bandwidth goes up by 1 each turn (to ${MAX_BANDWIDTH}) and refills at the start of your turn. Spend it to play cards.</li>
  <li>Monsters go onto your board (${BOARD_SLOTS} slots). They can attack starting next turn, once per turn. Attack an enemy monster (both deal damage) or the enemy player directly.</li>
  <li>Your hand holds ${MAX_HAND} cards; extra draws are burned. Drawing from an empty deck deals increasing fatigue damage.</li>
</ul>
<h2>Quick cards</h2>
<p>Quick spells can be played on your turn like normal, or from your hand when an enemy monster attacks, paid for with Bandwidth you left unspent on your own turn. If the response removes, hides or suppresses the attacker or its target, the attack fizzles.</p>
<h2>Decks</h2>
<p>A deck is 40 cards from one genre's pool, at most 2 copies of each. Every genre starts with free <a href="/decks">starter lists</a>.</p>
<h2>Keywords</h2>
<dl class="glossary">${kw.map(k => `<dt>${esc(k.name)}</dt><dd>${esc(k.text)}</dd>`).join('')}</dl>
<h2>Other terms</h2>
<dl class="glossary">${Object.entries(TERMS).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
<h2>House Rules</h2>
<p>The <a href="${deckUrl(DECKS.find(d => d.id === 'CardGame'))}">Card Game</a> deck can change the rules for both players for a few turns:</p>
<dl class="glossary">${Object.values(RULES).map(r => `<dt>${esc(r.name)}</dt><dd>${esc(r.text)}</dd>`).join('')}</dl>
</section>
<p><a class="play-btn" href="/">Play the tutorial</a></p>`,
    });
  }

  // The page for a URL path, as { html, etag }, or null when there's no such page.
  function render(urlPath) {
    const p = urlPath.replace(/\/+$/, '') || '/';
    const data = meta();
    if (cache.has(p)) return cache.get(p);
    let html = null;
    if (p === '/decks') html = decksPage();
    else if (p.startsWith('/decks/') && deckBySlug(p.slice(7))) html = deckPage(deckBySlug(p.slice(7)));
    else if (p === '/cards') html = cardsPage();
    else if (p === '/meta') html = data ? metaPage(data) : noMetaPage();
    else if (p === '/how-to-play') html = howToPage();
    if (!html) return null;
    const page = { html, etag: `W/"p-${crypto.createHash('sha1').update(html).digest('hex').slice(0, 16)}"` };
    cache.set(p, page);
    return page;
  }

  // Every page, for the sitemap.
  const paths = () => ['/decks', ...DECKS.map(deckUrl), '/cards', ...(meta() ? ['/meta'] : []), '/how-to-play'];

  return { render, paths };
}

export { parseReport, slug };
