// Content pages for search engines and new players: a page per genre deck, the full card list, the
// meta (tier list and matchups) and how to play. They're plain HTML built on the server from the game's
// own card data, so they stay in step with the cards, and each links back into the game.

import fs from 'node:fs';
import crypto from 'node:crypto';
import { DECKS, starterDecks, countCards } from '../src/data/index.js';
import { GUIDES } from '../src/data/guides.js';
import { encodeDeck } from '../src/data/deck-code.js';
import { rarityOf, RARITY, starterUnlockLevel } from '../src/data/economy.js';
import { rulesText } from '../src/engine/text.js';
import { MIN_GAMES } from './live-meta.mjs';
import { KEYWORDS, TERMS, RULES, START_HP, BOARD_SLOTS, MAX_HAND, MAX_BANDWIDTH, OPENING_HAND } from '../src/engine/constants.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slug = deck => deck.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const deckBySlug = s => DECKS.find(d => slug(d) === s);
const deckUrl = deck => `/decks/${slug(deck)}`;
const pct = n => `${Math.round(n * 10) / 10}%`;
// A deck's card by its code ('M14' for 'HOR_M14_HauntedTitan').
const cardByCode = (deck, code) => deck.cards.find(c => c.cardId.split('_')[1] === code);
// Guide text with each [M14] shown as that card's name, linked to its row in the card table.
const guideText = (deck, text) => esc(text).replace(/\[([MS]\d+)\]/g, (_, code) => {
  const card = cardByCode(deck, code);
  return card ? `<a class="card-ref" href="#${esc(card.cardId)}">${esc(card.displayName)}</a>` : code;
});

// The meta comes from the Balance lab's latest report (AI-vs-AI simulations). Only its deck win rates
// and matchups are published; its balance notes and card statistics stay private. A report without a
// full balance check (a lab run on a single deck, say) means no meta page.
// A report covers either the genres (one row per genre, its full card pool) or every starter list (rows
// like "Blitz Squad (FPS)"). With starter lists, those are what the tier list ranks, and a genre's rate is
// the average of its three lists.
function parseReport(markdown) {
  const section = title => markdown.split(/^#{2,3} /m).find(s => s.startsWith(title)) ?? '';
  const rows = text => text.split('\n').filter(l => l.startsWith('|') && !/^\|[-| ]+\|$/.test(l))
    .map(l => l.slice(1, -1).split('|').map(c => c.trim().replace(/\*\*/g, '')));
  const lists = DECKS.flatMap(deck => starterDecks(deck.id).map(s => ({ deck, starter: s, label: `${s.name} (${deck.name})` })));
  // A row's deck or list, by its label in the report.
  const subject = label => DECKS.find(d => d.name === label) ?? lists.find(l => l.label === label);
  const balance = rows(section('Balance check')).slice(1).map(r => ({ of: subject(r[0]), overall: parseFloat(r[1]), best: r[5], worst: r[6] }))
    .filter(r => r.of && Number.isFinite(r.overall));
  const byOverall = (a, b) => b.overall - a.overall;
  const listRows = balance.filter(r => r.of.starter).map(r => ({ ...r.of, name: r.of.starter.name, overall: r.overall, best: r.best, worst: r.worst }));
  let decks, variants = null;
  if (listRows.length === lists.length) {
    variants = listRows.sort(byOverall).map(r => ({ ...r, tier: r.overall >= 53 ? 1 : r.overall >= 47 ? 2 : 3 }));
    decks = DECKS.map(deck => {
      const own = variants.filter(v => v.deck === deck);
      return { deck, overall: Math.round(own.reduce((n, v) => n + v.overall, 0) / own.length * 10) / 10 };
    });
  } else {
    decks = balance.filter(r => r.of.cards).map(r => ({ deck: r.of, overall: r.overall, best: r.best, worst: r.worst }));
    if (decks.length !== DECKS.length) return null;
  }
  decks = decks.sort(byOverall).map(r => ({ ...r, tier: r.overall >= 51 ? 1 : r.overall >= 49 ? 2 : 3 }));
  // Matchups by row and column name: genre names, or list names without their genre.
  const [head, ...body] = rows(section('Matchups'));
  const matchups = {};
  for (const r of body) {
    const of = subject(r[0]);
    if (of) matchups[of.starter?.name ?? of.name] = Object.fromEntries(head.slice(1).map((col, i) => [col, r[i + 1]]));
  }
  // Win rate of each play style against the others (starter-list reports only).
  const styles = variants ? rows(section('Play styles')).slice(1).map(r => ({ style: r[0], overall: parseFloat(r[2]) }))
    .filter(r => Number.isFinite(r.overall)).sort(byOverall) : [];
  const gen = /Generated (\S+) by the Balance lab\. (\d+) AI-vs-AI games(?:, (\d+) per matchup)?/.exec(markdown);
  return {
    decks, variants, styles, matchups,
    date: gen ? gen[1].slice(0, 10) : null, games: gen ? Number(gen[2]) : null, perMatchup: gen ? Number(gen[3]) : null,
  };
}

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
    const nav = [['/decks', 'Decks'], ['/cards', 'Cards'], ['/meta/live', 'Live meta'], ...(meta() ? [['/meta', 'Lab tier list']] : []), ['/how-to-play', 'How to play']];
    // The current section: the longest link the path starts with, so /meta/live doesn't also light up /meta.
    const current = nav.map(([href]) => href).filter(href => urlPath === href || urlPath.startsWith(`${href}/`))
      .sort((a, b) => b.length - a.length)[0];
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
  <nav>${nav.map(([href, label]) => `<a href="${href}"${href === current ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>
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
    return `<tr id="${esc(card.cardId)}" data-search="${esc(`${card.displayName} ${text} ${deck.name} ${card.type}`.toLowerCase())}" data-deck="${esc(deck.id)}" data-type="${card.type}">
      <td class="cost">${card.cost}</td>
      <td class="name">${esc(card.displayName)}${card.speedWindow === 'Quick' ? ' <span class="tag">Quick</span>' : ''}</td>
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
<p class="lede">Every deck in MetaDeck is a video game genre with its own keywords and its own way to win. Each has a pool of 40 cards and three complete decks with a guide on how to play them.</p>
<ul class="deck-grid">${DECKS.map(d => `
  <li style="--deck:${esc(d.color)}" data-deck="${esc(d.id)}"><a href="${deckUrl(d)}">
    <img src="/assets/img/decks/${esc(d.id)}.webp" alt="${esc(d.name)} deck art" loading="lazy" width="400" height="225">
    <h2>${esc(d.name)}</h2><p>${esc(d.tagline)}</p></a></li>`).join('')}
</ul>`,
    });
  }

  // How the genre plays as a whole: its plan, general tips and what beats it.
  function genreSection(deck) {
    const g = GUIDES[deck.id];
    if (!g) return '';
    const t = text => guideText(deck, text);
    return `<section class="guide" style="--deck:${esc(deck.color)}"><h2>How ${esc(deck.name)} plays</h2>
<p class="lede">${t(g.plan)}</p>
<h3>Tips for every ${esc(deck.name)} list</h3>
<ul class="tips">${g.tips.map(tip => `<li>${t(tip)}</li>`).join('')}</ul>
<h3>What beats ${esc(deck.name)}</h3>
<p>${t(g.against)}</p></section>`;
  }

  // One starter list: its guide, the 40 cards and its deck code, and where it stands in the meta when the
  // report covers starter lists.
  function listSection(deck, starter, index) {
    const v = meta()?.variants?.find(r => r.deck === deck && r.name === starter.name);
    const g = GUIDES[deck.id]?.lists?.[starter.name];
    const t = text => guideText(deck, text);
    const counts = [...countCards(starter.cards)].map(([id, n]) => [deck.cards.find(c => c.cardId === id), n])
      .sort(([a], [b]) => a.cost - b.cost || a.displayName.localeCompare(b.displayName));
    const curve = (starter.cards.reduce((sum, id) => sum + deck.cards.find(c => c.cardId === id).cost, 0) / starter.cards.length).toFixed(1);
    const unlock = index === 0 ? 'Free from the start' : `Unlocks at ${deck.name} level ${starterUnlockLevel(index)}`;
    return `<article class="list" id="${slug({ name: starter.name })}">
<header><h3>${esc(starter.name)} <span class="tag">${esc(starter.style)}</span></h3><p class="muted">${unlock} · average cost ${curve}${v ? ` · <a href="/meta">Tier ${v.tier}</a>, ${pct(v.overall)} win rate` : ''}</p></header>
<p class="lede">${esc(starter.blurb)}</p>
${g ? `<p>${t(g.plan)}</p>
<ol class="phases">
  <li><h4>Early turns</h4><p>${t(g.early)}</p></li>
  <li><h4>Middle turns</h4><p>${t(g.mid)}</p></li>
  <li><h4>Late game</h4><p>${t(g.late)}</p></li>
</ol>
<h4>Key cards</h4>
<ul class="key-cards">${g.keyCards.map(([code, why]) => {
      const card = cardByCode(deck, code);
      return `<li><img src="/assets/img/cards/${esc(card.cardId)}.webp" alt="" loading="lazy" width="72" height="72"><div><b><a href="#${esc(card.cardId)}">${esc(card.displayName)}</a></b> <span class="muted">${card.cost} Bandwidth</span><p>${t(why)}</p></div></li>`;
    }).join('')}</ul>
<h4>Tips</h4>
<ul class="tips">${g.tips.map(tip => `<li>${t(tip)}</li>`).join('')}</ul>` : ''}
<details class="decklist"><summary>The 40 cards</summary>
<ul>${counts.map(([c, n]) => `<li><span class="cost">${c.cost}</span><a href="#${esc(c.cardId)}">${esc(c.displayName)}</a><b>×${n}</b></li>`).join('')}</ul>
</details>
<p class="deck-code"><span class="muted">Deck code</span> <code>${esc(encodeDeck(deck.id, starter.cards))}</code> <button type="button" class="copy-code" hidden>Copy</button></p>
</article>`;
  }

  // Where the genre, or each of its lists, stands in the meta.
  function metaSection(deck) {
    const data = meta();
    if (!data) return '';
    if (!data.variants) {
      const m = data.decks.find(r => r.deck === deck);
      return `<section><h2>In the meta</h2>
<p>${esc(deck.name)} wins ${pct(m.overall)} of its games across all matchups, which puts it in <a href="/meta">Tier ${m.tier}</a>. Best matchup: ${esc(m.best)}. Hardest: ${esc(m.worst)}.</p></section>`;
    }
    const own = data.variants.filter(v => v.deck === deck);
    const avg = data.decks.find(r => r.deck === deck).overall;
    return `<section><h2>In the meta</h2>
<p>Against the other genres’ decks, the three ${esc(deck.name)} lists win ${pct(avg)} of their games on average. See the <a href="/meta">full tier list</a>.</p>
<ul class="meta-lists">${own.map(v => `<li><a href="#${slug(v.starter)}"><b>${esc(v.name)}</b></a> <span class="tag">Tier ${v.tier}</span> ${pct(v.overall)} win rate. Best matchup: ${esc(v.best)}. Hardest: ${esc(v.worst)}.</li>`).join('')}</ul></section>`;
  }

  function deckPage(deck) {
    const kws = keywordsOf(deck);
    const monsters = deck.cards.filter(c => c.type === 'Monster').length;
    const starters = starterDecks(deck.id);
    return layout({
      path: deckUrl(deck),
      title: `${deck.name} Deck Guides: ${starters.map(s => s.name).join(', ')} — MetaDeck`,
      description: `How to play every ${deck.name} deck in MetaDeck, the free genre card battler: ${starters.map(s => `${s.name} (${s.style})`).join(', ')}. Game plans turn by turn, key cards, tips, full lists and deck codes.`,
      image: `/assets/img/decks/${deck.id}.webp`,
      scripts: ['/src/ui/deck-page.js'],
      body: `<section class="deck-hero" style="--deck:${esc(deck.color)}" data-deck="${esc(deck.id)}">
  <img src="/assets/img/decks/${esc(deck.id)}.webp" alt="${esc(deck.name)} deck art" width="800" height="450">
  <div><p class="crumbs"><a href="/decks">Decks</a> ›</p>
  <h1><img class="emblem" src="/assets/img/ui/emblem-${esc(deck.id)}.webp" alt="" width="48" height="48"> ${esc(deck.name)}</h1>
  <p class="lede">${esc(deck.tagline)}</p>
  <p>${deck.cards.length} cards: ${monsters} monsters and ${deck.cards.length - monsters} spells. Three decks: ${starters.map(s => `<a href="#${slug({ name: s.name })}">${esc(s.name)}</a>`).join(', ')}.</p>
  <a class="play-btn" href="/">Play ${esc(deck.name)} free</a></div>
</section>
${genreSection(deck)}
<section class="lists" style="--deck:${esc(deck.color)}" data-deck="${esc(deck.id)}"><h2>The ${esc(deck.name)} decks</h2>
<p>Each is a complete 40-card list built around one play style. The first is free; the others unlock as you level ${esc(deck.name)} up. Paste a deck code into Import code on the game’s menu to open the list in the deck builder.</p>
${starters.map((s, i) => listSection(deck, s, i)).join('\n')}
</section>
${metaSection(deck)}
<section><h2>Keywords</h2>
<dl class="glossary">${kws.map(k => `<dt>${esc(KEYWORDS[k].name)}</dt><dd>${esc(KEYWORDS[k].text)}</dd>`).join('')}</dl></section>
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
    // What the tier list ranks: the 30 starter lists, or the genres for an older report.
    const ranked = data.variants ?? data.decks.map(r => ({ ...r, name: r.deck.name }));
    const tiers = [1, 2, 3].map(t => [t, ranked.filter(r => r.tier === t)]).filter(([, rows]) => rows.length);
    const games = data.games ? `${data.games.toLocaleString('en-US')} ` : '';
    const rowUrl = r => (r.starter ? `${deckUrl(r.deck)}#${slug(r.starter)}` : deckUrl(r.deck));
    // The chart follows the game's order of genres and lists rather than the ranking.
    const order = data.variants
      ? DECKS.flatMap(d => starterDecks(d.id).map(s => data.variants.find(v => v.deck === d && v.name === s.name)))
      : DECKS.map(d => ranked.find(r => r.deck === d));
    const what = data.variants ? `${ranked.length} starter decks` : `${DECKS.length} genre decks`;
    return layout({
      path: '/meta',
      title: 'MetaDeck Tier List: Best Decks and Matchups',
      description: `Which MetaDeck deck is best? The tier list and matchup chart for all ${what}, from ${games}simulated games.`,
      body: `<h1>Tier list and matchups</h1>
<p class="lede">How the ${what} do against each other${data.date ? `, as of ${esc(data.date)}` : ''}.</p>
<p class="muted">From ${games}games the AI played against itself${data.variants
    ? `: every starter deck against every deck from the other genres${data.perMatchup ? `, ${data.perMatchup.toLocaleString('en-US')} games per matchup` : ''}. A win rate counts only games against other genres`
    : ' with each deck’s full card pool'}. Real players win and lose differently: the <a href="/meta/live">live tier list</a> ranks the decks by players’ own games.</p>
${tiers.map(([t, rows]) => `<section class="tier tier-${t}"><h2>Tier ${t}</h2><ul class="tier-row">${rows.map(r => `
  <li style="--deck:${esc(r.deck.color)}" data-deck="${esc(r.deck.id)}"><a href="${rowUrl(r)}"><img src="/assets/img/ui/emblem-${esc(r.deck.id)}.webp" alt="" width="40" height="40"><b>${esc(r.name)}</b><span>${r.starter ? `${esc(r.deck.name)} · ${esc(r.starter.style)} · ` : ''}${pct(r.overall)} win rate</span></a></li>`).join('')}</ul></section>`).join('')}
${data.variants ? `<section class="meta-summary"><div><h2>By genre</h2>
<p>The average of each genre’s three starter decks.</p>
<ol class="rank">${data.decks.map(r => `<li style="--deck:${esc(r.deck.color)}"><a href="${deckUrl(r.deck)}">${esc(r.deck.name)}</a><span>${pct(r.overall)}</span></li>`).join('')}</ol></div>
${data.styles.length ? `<div><h2>By play style</h2>
<p>Every deck of a style against the decks of the other styles.</p>
<ol class="rank">${data.styles.map(r => `<li><span class="name">${esc(r.style)}</span><span>${pct(r.overall)}</span></li>`).join('')}</ol></div>` : ''}</section>` : ''}
<section><h2>Matchups</h2>
<p>Each row is that deck's win rate against the deck in each column.${data.variants ? ' Decks from the same genre do play each other, but those games don’t count toward the tier list.' : ''}</p>
<div class="table-wrap"><table class="matchups${data.variants ? ' wide' : ''}"><thead><tr><th></th>${order.map(r => `<th>${esc(r.name)}</th>`).join('')}</tr></thead>
<tbody>${order.filter(row => data.matchups[row.name]).map(row => `<tr><th><a href="${rowUrl(row)}">${esc(row.name)}</a></th>${order.map(col => {
        const v = parseFloat(data.matchups[row.name][col.name]);
        return `<td class="${!Number.isFinite(v) ? 'self' : v >= 55 ? 'good' : v <= 45 ? 'bad' : ''}">${Number.isFinite(v) ? `${v}%` : '·'}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div></section>`,
    });
  }

  // The live tier list: the page is a shell that src/ui/live-meta.js fills from /api/live-meta (real
  // players' games, server/live-meta.mjs) and keeps up to date while it's open.
  const liveMetaPage = () => layout({
    path: '/meta/live',
    title: 'MetaDeck Live Tier List: What Players Are Winning With',
    description: `The MetaDeck tier list from real players' games: win rates, play rates and matchups for all ${DECKS.length} decks and every play style, updated as people play.`,
    scripts: ['/src/ui/live-meta.js'],
    body: `<div class="live-head"><h1>Live tier list</h1><span class="live-badge"><i></i>Live</span></div>
<p class="lede">How every deck and play style is really doing, from games players finished on MetaDeck. No simulations and no AI-vs-AI: only the player base.</p>
<div id="live-meta" class="live-meta" aria-live="polite"><p class="muted">Loading the latest games…</p></div>
<noscript><p>The live tier list needs JavaScript.</p></noscript>
<p class="muted live-foot">A deck needs ${MIN_GAMES} games before it gets a tier, and its tier comes from its win rate weighed by how many games it has, so a lucky streak can’t put it on top. Mirror matches count toward play rate only, and games that ended in a dropped connection don’t count.${meta() ? ' For how the decks do with the AI on both sides, see the <a href="/meta">Balance lab tier list</a>.' : ''}</p>`,
  });

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
<p>A deck is 40 cards from one genre's pool, at most 2 copies of each. Every genre comes with three <a href="/decks">ready-made decks</a>, the first of them free.</p>
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
    else if (p === '/meta/live') html = liveMetaPage();
    else if (p === '/how-to-play') html = howToPage();
    if (!html) return null;
    const page = { html, etag: `W/"p-${crypto.createHash('sha1').update(html).digest('hex').slice(0, 16)}"` };
    cache.set(p, page);
    return page;
  }

  // Every page, for the sitemap.
  const paths = () => ['/decks', ...DECKS.map(deckUrl), '/cards', '/meta/live', ...(meta() ? ['/meta'] : []), '/how-to-play'];

  return { render, paths };
}

export { parseReport, slug };
