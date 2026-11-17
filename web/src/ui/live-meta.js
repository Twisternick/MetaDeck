// The live tier list page (/meta/live, server/pages.mjs): fills the page from /api/live-meta, which is
// built only from real players' games (server/live-meta.mjs), and refreshes it every minute while the tab
// is visible. The filters (source, time window, decks or decks by play style) live in the address, so a
// link to the page shows the same view.

import { DECKS } from '../data/index.js';

const REFRESH_MS = 60_000;
const SOURCES = [['pvp', 'Online'], ['ranked', 'Ranked'], ['ai', 'vs AI']];
const WINDOWS = [[1, '24 hours'], [7, '7 days'], [30, '30 days'], [90, '90 days']];
const VIEWS = [['builds', 'Deck + style'], ['decks', 'Genre']];
const TIER_TEXT = { S: 'Dominating', A: 'Strong', B: 'Solid', C: 'Struggling', D: 'Falling behind' };
const SOURCE_TEXT = {
  pvp: 'every online match, player against player',
  ranked: 'ranked matches only',
  ai: 'players’ own side of their matches against the AI',
};

const root = document.getElementById('live-meta');
const deckOf = id => DECKS.find(d => d.id === id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slug = deck => deck.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const keyOf = r => `${r.deck}|${r.style ?? ''}`;
const pct = (n, places = 1) => `${(n * 100).toFixed(places)}%`;
const num = n => n.toLocaleString('en-US');
const signed = n => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n * 100).toFixed(1)}`;

const params = new URLSearchParams(location.search);
const pick = (list, value, fallback) => (list.some(([v]) => String(v) === value) ? value : fallback);
const state = {
  source: pick(SOURCES, params.get('source'), 'pvp'),
  days: pick(WINDOWS, params.get('days'), '7'),
  view: pick(VIEWS, params.get('view'), 'builds'),
  open: null,      // the tile whose matchups are showing: deck|style
  data: null,
  loadedAt: 0,
};
let first = true;
let shownOpen = null; // state.open as of the last render

async function load() {
  try {
    const res = await fetch(`/api/live-meta?days=${state.days}&source=${state.source}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    state.data = await res.json();
    state.loadedAt = Date.now();
    render();
  } catch {
    if (!state.data) root.innerHTML = '<p class="muted">The live tier list can’t be reached right now. Try again in a minute.</p>';
  }
}

function setFilter(key, value) {
  state[key] = value;
  const q = new URLSearchParams({ source: state.source, days: state.days, view: state.view });
  history.replaceState(null, '', `?${q}`);
  if (key === 'view') render(); else load();
}

const segmented = (key, options, label) => `<div class="seg" role="group" aria-label="${label}">${options.map(([v, text]) =>
  `<button type="button" data-key="${key}" data-value="${v}" aria-pressed="${String(v) === state[key]}">${esc(text)}</button>`).join('')}</div>`;

const trend = t => {
  if (!t || t.winRate == null || Math.abs(t.winRate) < 0.01) return '';
  return `<span class="trend ${t.winRate > 0 ? 'up' : 'down'}" title="Win rate ${signed(t.winRate)} points since the ${state.days === '1' ? 'day' : 'period'} before">${t.winRate > 0 ? '▲' : '▼'} ${Math.abs(t.winRate * 100).toFixed(1)}</span>`;
};

function tile(r, i) {
  const deck = deckOf(r.deck);
  return `<li style="--deck:${esc(deck.color)};--i:${i}">
  <button type="button" class="live-tile" data-key="${esc(keyOf(r))}" aria-expanded="${state.open === keyOf(r)}">
    <img src="/assets/img/ui/emblem-${esc(deck.id)}.webp" alt="" width="44" height="44">
    <span class="who"><b>${esc(deck.name)}</b>${r.style ? `<span class="style">${esc(r.style)}</span>` : ''}</span>
    <span class="nums"><span class="wr">${r.winRate == null ? '–' : pct(r.winRate)}</span>${trend(r.trend)}</span>
    <span class="meter" aria-hidden="true"><i style="--w:${r.winRate == null ? 0 : Math.max(0, Math.min(1, (r.winRate - 0.3) / 0.4))}"></i></span>
    <span class="sub"><span>${pct(r.playRate)} played</span><span>${num(r.games)} games</span></span>
  </button></li>`;
}

// The open deck's best and worst matchups, and a link to its guide.
function detail(deckId) {
  const deck = deckOf(deckId);
  const cols = Object.entries(state.data.matchups[deckId] ?? {}).filter(([, c]) => c.games >= 5)
    .map(([opp, c]) => ({ opp: deckOf(opp), ...c })).filter(c => c.opp).sort((a, b) => b.winRate - a.winRate);
  const list = rows => rows.map(c => `<li style="--deck:${esc(c.opp.color)}"><span>${esc(c.opp.name)}</span><span class="${c.winRate >= 0.55 ? 'good' : c.winRate <= 0.45 ? 'bad' : ''}">${pct(c.winRate, 0)}</span><span class="muted">${num(c.games)}</span></li>`).join('');
  const best = cols.slice(0, 3), worst = cols.slice(-3).reverse().filter(c => !best.includes(c));
  return `<div class="live-detail" style="--deck:${esc(deck.color)}">
  <h3>${esc(deck.name)} matchups</h3>
  ${cols.length ? `<div class="pair"><div><h4>Best against</h4><ol>${list(best)}</ol></div>${worst.length ? `<div><h4>Worst against</h4><ol>${list(worst)}</ol></div>` : ''}</div>`
    : '<p class="muted">Not enough games against other decks yet.</p>'}
  <p><a href="/decks/${slug(deck)}">${esc(deck.name)} deck guide →</a></p></div>`;
}

function healthCard(d) {
  const h = d.health;
  const top = h.top && deckOf(h.top.deck);
  const stat = (value, label) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`;
  return `<section class="health health-${esc(h.level)}">
  <div class="verdict"><span class="pulse" aria-hidden="true"></span><div><h2>Meta health</h2><p>${esc(h.text)}</p></div></div>
  <div class="stats">
    ${stat(num(d.games), 'games')}
    ${stat(num(d.players), 'signed-in players')}
    ${stat(`${h.diversity}<small>/${h.of}</small>`, 'decks really in play')}
    ${top ? stat(`<span class="deck-name" style="--deck:${esc(top.color)}">${esc(top.name)}</span>`, `most played · ${pct(h.top.playRate, 0)}`) : ''}
    ${h.spread != null ? stat(`${(h.spread * 100).toFixed(1)}<small> pts</small>`, 'best-to-worst gap') : ''}
  </div></section>`;
}

function matchupChart(d) {
  const ids = DECKS.map(x => x.id).filter(id => d.matchups[id]);
  if (ids.length < 2) return '';
  const cell = (row, col) => {
    if (row === col) return '<td class="self">·</td>';
    const c = d.matchups[row]?.[col];
    if (!c) return '<td class="none">–</td>';
    const cls = c.games < 5 ? 'thin' : c.winRate >= 0.55 ? 'good' : c.winRate <= 0.45 ? 'bad' : '';
    return `<td class="${cls}" title="${num(c.games)} games">${Math.round(c.winRate * 100)}%</td>`;
  };
  return `<section><h2>Matchups</h2>
  <p class="muted">Each row is that deck’s win rate against the deck in each column. Hover a cell for its games; faded cells have fewer than 5.</p>
  <div class="table-wrap"><table class="matchups"><thead><tr><th></th>${ids.map(id => `<th>${esc(deckOf(id).name)}</th>`).join('')}</tr></thead>
  <tbody>${ids.map(row => `<tr><th><a href="/decks/${slug(deckOf(row))}">${esc(deckOf(row).name)}</a></th>${ids.map(col => cell(row, col)).join('')}</tr>`).join('')}</tbody></table></div></section>`;
}

function render() {
  const d = state.data;
  if (!d) return;
  const rows = state.view === 'decks' ? d.decks : d.builds;
  const ranked = d.tiers.map(t => [t, rows.filter(r => r.tier === t)]).filter(([, list]) => list.length);
  const waiting = rows.filter(r => !r.tier);
  let i = 0;
  const tierBlock = ([t, list]) => `<section class="live-tier tier-${t}">
  <div class="tier-label"><b>${t}</b><span>${TIER_TEXT[t]}</span></div>
  <ul>${list.map(r => tile(r, i++)).join('')}</ul>
  ${list.some(r => keyOf(r) === state.open) ? detail(state.open.split('|')[0]) : ''}</section>`;

  // The page is rebuilt on every change, so note which control had focus and give it back afterwards:
  // otherwise a keyboard user is thrown to the top of the page by each click and each refresh.
  const focused = document.activeElement?.closest?.('#live-meta [data-key]');
  const refocus = focused && `[data-key="${CSS.escape(focused.dataset.key)}"]${focused.dataset.value ? `[data-value="${CSS.escape(focused.dataset.value)}"]` : ''}`;
  // The matchup panel slides in when it opens, not again on every refresh while it stays open.
  const opened = state.open !== shownOpen;
  shownOpen = state.open;

  root.classList.toggle('animate', first);
  root.classList.toggle('detail-opened', opened);
  first = false;
  root.innerHTML = `<div class="live-filters">
  ${segmented('source', SOURCES, 'Games from')}${segmented('days', WINDOWS, 'Time window')}${segmented('view', VIEWS, 'Rank by')}
</div>
<p class="muted live-source">From ${SOURCE_TEXT[d.source]} in the last ${d.days === 1 ? '24 hours' : `${d.days} days`}. <span class="ago" data-at="${state.loadedAt}"></span></p>
${healthCard(d)}
${d.games === 0 ? `<section class="live-empty"><h2>No games yet</h2><p>Nobody has finished a game here in this window. Be the first: every game you play shapes this list.</p><a class="play-btn" href="/">Play now</a></section>` : `
<section class="live-tiers">${ranked.length ? ranked.map(tierBlock).join('') : '<p class="muted">No deck has enough games for a tier yet.</p>'}
${waiting.length ? `<section class="live-tier tier-wait"><div class="tier-label"><b>?</b><span>Under ${d.minGames} games</span></div>
  <ul>${waiting.map(r => tile(r, i++)).join('')}</ul>${waiting.some(r => keyOf(r) === state.open) ? detail(state.open.split('|')[0]) : ''}</section>` : ''}</section>
${d.styles.length ? `<section class="meta-summary"><div><h2>By play style</h2><p class="muted">Every deck of a style against decks of the other styles.</p>
<ol class="rank">${d.styles.map(s => `<li><span class="name">${esc(s.style)}</span><span class="muted">${pct(s.playRate, 0)} played</span><span>${s.winRate == null ? '–' : pct(s.winRate)}</span></li>`).join('')}</ol></div>
<div><h2>Most played</h2><p class="muted">Share of all decks brought to a game.</p>
<ol class="rank">${[...d.decks].sort((a, b) => b.picks - a.picks).slice(0, 5).map(r => `<li style="--deck:${esc(deckOf(r.deck).color)}"><a href="/decks/${slug(deckOf(r.deck))}">${esc(deckOf(r.deck).name)}</a><span>${pct(r.playRate)}</span></li>`).join('')}</ol></div></section>` : ''}
${matchupChart(d)}`}`;
  if (refocus) root.querySelector(refocus)?.focus({ preventScroll: true });
  tick();
}

// "Updated 20s ago", kept current between refreshes.
function tick() {
  const el = root.querySelector('.ago');
  if (!el) return;
  const s = Math.round((Date.now() - Number(el.dataset.at)) / 1000);
  el.textContent = s < 5 ? 'Updated just now.' : s < 60 ? `Updated ${s}s ago.` : `Updated ${Math.round(s / 60)} min ago.`;
}

root.addEventListener('click', e => {
  const seg = e.target.closest('.seg button');
  if (seg) { setFilter(seg.dataset.key, seg.dataset.value); return; }
  const t = e.target.closest('.live-tile');
  if (t) { state.open = state.open === t.dataset.key ? null : t.dataset.key; render(); }
});
setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
setInterval(tick, 5_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - state.loadedAt > REFRESH_MS) load(); });
load();
