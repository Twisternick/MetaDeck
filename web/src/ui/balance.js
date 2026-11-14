// Balance lab: an AI-vs-AI round robin run in Web Workers so the page stays live. It plays either the ten
// archetype pools against each other, or every starter variant against every other variant: the other
// themes' variants and its own theme's other variants (identical decks never meet). Shows the matchups being
// played, then the full balance tables, and can hand the results to Claude (saved to web/reports/ by the
// local server, and copied to the clipboard).

import { h, storage } from './dom.js';
import { removeFx, deckEmblem } from './fx.js';
import { DECKS, CARDS, STYLES, starterDecks, deckList } from '../data/index.js';
import { LEAD_TURNS, LEAD_MIN, newLeadTally, tallyLead } from '../engine/snowball.js';
import { newCardTally, tallyCards, cardImpact } from '../engine/card-stats.js';

const GAME_OPTIONS = [20, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const CHUNK = 250; // games per worker job, so big matchups spread across every thread
const FAVORED = 0.55, UNFAVORED = 0.45;
// New player check: a free starter deck should win at least STARTER_TARGET against the full decks, and
// below STARTER_FLOOR it needs a buff (to the starter list, not the meta).
const STARTER_TARGET = 0.45, STARTER_FLOOR = 0.40;
// A variant that wins this much less against other themes than its theme's best variant is falling behind.
const THEME_LAG = 0.08;
// Snowball check: the side ahead at SNOWBALL_TURN should win SNOWBALL_TARGET of the time. Above it an early lead
// decides too many games; below it the early turns barely matter.
const SNOWBALL_TURN = 8, SNOWBALL_TARGET = [0.65, 0.72];

// The decks each scope plays: { key, arch, name, color, cards }.
const SCOPES = {
  archetypes: {
    label: 'Archetypes',
    entries: DECKS.map(d => ({ key: d.id, arch: d.id, name: d.name, color: d.color, cards: deckList(d.id) })),
    blurb: "Plays every archetype's full card pool against every other archetype with the built-in AI on both sides, each deck going first half the time.",
  },
  variants: {
    label: 'Every variant',
    entries: DECKS.flatMap(d => starterDecks(d.id).map(s => ({ key: s.key, arch: d.id, name: s.name, style: s.style, color: d.color, cards: s.cards }))),
    blurb: "Plays every starter variant against every other theme's variants and against its own theme's other variants, with the built-in AI on both sides, each deck going first half the time.",
  },
};
const ENTRY = Object.fromEntries(Object.values(SCOPES).flatMap(s => s.entries.map(e => [e.key, e])));
const icon = e => deckEmblem(DECKS.find(d => d.id === e.arch));
const sameTheme = (x, y) => ENTRY[x].arch === ENTRY[y].arch;

let running = null; // the live run, so leaving the screen can stop its workers

export function balanceLab(root, { onBack }) {
  removeFx();
  stopRun();
  const prefs = storage.get('metadeck.balance', { games: 100 });
  if (!SCOPES[prefs.scope]) prefs.scope = 'archetypes';
  const deck = id => DECKS.find(d => d.id === id);
  const results = { archetypes: null, variants: null }; // the current or last run of each scope
  let ids = [], stats = null; // the shown scope's deck keys and results
  let starters = null; // results of the last new player check

  // ---------- static layout; live updates only touch text, widths and classes ----------
  const progressFill = h('div', { class: 'bl-progress-fill' });
  const progressText = h('span', null, 'Ready');
  const rateText = h('span', { class: 'bl-rate' });
  const runBtn = h('button', { class: 'btn primary big', onclick: () => (running ? stop(true) : start()) }, 'Check game balance');
  const starterBtn = h('button', { class: 'btn ghost big', onclick: () => (running ? stop(true) : startStarters()) }, 'Check starter decks');
  const starterTable = h('div', { class: 'bl-table-wrap' },
    h('p', { class: 'muted bl-empty' }, `Plays each archetype's free starter deck (the one every new player owns) against every other archetype's full deck. A starter should win at least ${pct(STARTER_TARGET)}; below ${pct(STARTER_FLOOR)} it needs a buff.`));
  const sendBtn = h('button', { class: 'btn primary big online', disabled: true, onclick: () => sendToClaude() }, 'Send stats to Claude');
  const sendNote = h('p', { class: 'bl-send-note muted' });
  const blurb = h('p');
  const scopeChips = h('div', { class: 'chips' });
  const gameChips = h('div', { class: 'chips' });
  const estimate = h('span', { class: 'bl-estimate muted' });
  const pairingsOf = n => (n * (n - 1)) / 2;
  const renderChips = () => {
    scopeChips.replaceChildren(...Object.entries(SCOPES).map(([k, s]) => h('button', {
      class: `chip${prefs.scope === k ? ' selected' : ''}`, disabled: running ? true : null,
      onclick: () => { if (prefs.scope === k) return; prefs.scope = k; storage.set('metadeck.balance', prefs); showScope(); },
    }, `${s.label} · ${s.entries.length}`)));
    gameChips.replaceChildren(...GAME_OPTIONS.map(n => h('button', {
      class: `chip${prefs.games === n ? ' selected' : ''}`, disabled: running ? true : null,
      onclick: () => { prefs.games = n; storage.set('metadeck.balance', prefs); renderChips(); },
    }, n.toLocaleString())));
    const pairings = pairingsOf(SCOPES[prefs.scope].entries.length);
    const total = pairings * prefs.games;
    estimate.textContent = `${pairings} matchups × ${prefs.games.toLocaleString()} = ${total.toLocaleString()} games · about ${duration(total / (prefs.rate || 200))}`;
  };

  const activeGrid = h('div', { class: 'bl-active' }, h('p', { class: 'muted bl-empty' }, 'Matchups appear here while the simulation runs.'));
  const feed = h('ol', { class: 'bl-feed' });
  const summary = h('div', { class: 'bl-summary' });
  const board = h('div', { class: 'bl-board' });
  const gridWrap = h('div', { class: 'bl-grid-wrap' });
  const gridLegend = h('p', { class: 'muted bl-legend' });
  const verdictTable = h('div', { class: 'bl-table-wrap' });
  const themeTable = h('div', { class: 'bl-table-wrap' });
  const themeSection = h('section', { class: 'rise', style: { '--i': 5 } }, h('h2', null, 'Within each theme'), themeTable);
  const styleTable = h('div', { class: 'bl-table-wrap' });
  const styleSection = h('section', { class: 'rise', style: { '--i': 5 } }, h('h2', null, 'Play styles'), styleTable);
  const cardTable = h('div', { class: 'bl-cards' });
  const snowballTable = h('div', { class: 'bl-table-wrap' });
  let rows = {}, cells = {};

  // Rebuilds the board and grid for the chosen scope and shows that scope's last results, if any.
  function showScope() {
    const scope = SCOPES[prefs.scope];
    ids = scope.entries.map(e => e.key);
    stats = results[prefs.scope];
    blurb.textContent = scope.blurb;
    renderChips();
    const variants = prefs.scope === 'variants';
    rows = {};
    cells = {};
    board.replaceChildren(...ids.map(id => {
      const e = ENTRY[id];
      const fill = h('div', { class: 'bl-bar-fill' });
      const pctEl = h('span', { class: 'bl-pct' }, '–');
      const badge = h('span', { class: 'bl-verdict' });
      rows[id] = { el: h('div', { class: 'bl-row', style: { '--deck': e.color } },
        h('span', { class: 'bl-emblem' }, icon(e)), h('span', { class: 'bl-name' }, e.name, variants ? h('small', null, deck(e.arch).name) : ''),
        h('div', { class: 'bl-bar' }, h('i', { class: 'bl-mid' }), fill), pctEl, badge), fill, pct: pctEl, badge };
      return rows[id].el;
    }));
    gridWrap.replaceChildren(h('div', { class: `bl-grid${variants ? ' wide' : ''}`, style: { '--n': ids.length } },
      h('span', { class: 'bl-corner' }, 'row vs col'),
      ids.map(c => h('span', { class: 'bl-col', style: { '--deck': ENTRY[c].color }, title: label(c) }, icon(ENTRY[c]), h('b', null, ENTRY[c].name))),
      ids.map(r => [
        h('span', { class: 'bl-rowhead', style: { '--deck': ENTRY[r].color }, title: label(r) }, icon(ENTRY[r]), ' ', ENTRY[r].name),
        ids.map(c => {
          if (r === c) return h('span', { class: 'bl-cell self' }, '·');
          const cell = h('span', { class: `bl-cell${sameTheme(r, c) ? ' sib' : ''}`, title: `${label(r)} vs ${label(c)}` }, '');
          (cells[r] ??= {})[c] = cell;
          return cell;
        }),
      ])));
    gridLegend.textContent = variants
      ? "Dashed cells are variants of the same theme playing each other. Win rate and the balance check count only games against other themes; the same-theme results are under Within each theme."
      : '';
    themeSection.hidden = !variants;
    styleSection.hidden = !variants;
    styleTable.replaceChildren(h('p', { class: 'muted bl-empty' }, `The variants grouped by play style (${Object.keys(STYLES).join(', ')}): which style wins most, and how each style does against each other style.`));
    verdictTable.replaceChildren();
    themeTable.replaceChildren(h('p', { class: 'muted bl-empty' }, "Each variant against its own theme's other variants, next to how it does against the other themes."));
    cardTable.replaceChildren();
    snowballTable.replaceChildren(h('p', { class: 'muted bl-empty' }, `How often the side that is ahead at turn ${SNOWBALL_TURN} goes on to win, and how often each deck comes back from behind.`));
    summary.replaceChildren();
    if (!stats) return;
    for (const r of ids) for (const c of ids) {
      const g = stats.grid[r]?.[c];
      if (g && cells[r]?.[c]) { paintCell(cells[r][c], g[0] / g[1]); cells[r][c].classList.add('done'); }
    }
    paintBoard();
    if (stats.finishedAt) paintFinal();
  }

  root.replaceChildren(h('main', { class: 'balance' },
    h('header', { class: 'page-head' },
      h('button', { class: 'btn ghost small', onclick: () => { stop(); onBack(); } }, '← Menu'),
      h('h1', null, 'Balance lab')),
    h('section', { class: 'bl-controls rise' },
      h('div', { class: 'bl-control-text' },
        blurb,
        h('div', { class: 'bl-games' }, h('span', { class: 'muted' }, 'Decks'), scopeChips),
        h('div', { class: 'bl-games' }, h('span', { class: 'muted' }, 'Games per matchup'), gameChips), estimate),
      h('div', { class: 'bl-actions' }, runBtn, starterBtn, sendBtn)),
    sendNote,
    h('div', { class: 'bl-progress rise', style: { '--i': 1 } }, progressFill, h('div', { class: 'bl-progress-text' }, progressText, rateText)),
    h('div', { class: 'bl-live rise', style: { '--i': 2 } },
      h('section', null, h('h2', null, 'Active matchups'), activeGrid),
      h('section', null, h('h2', null, 'Finished matchups'), feed)),
    summary,
    h('section', { class: 'rise', style: { '--i': 3 } }, h('h2', null, 'Win rate'), board),
    h('section', { class: 'rise', style: { '--i': 4 } }, h('h2', null, "Matchups · row deck's win rate"), gridWrap, gridLegend),
    h('section', { class: 'rise', style: { '--i': 5 } }, h('h2', null, 'Balance check'), verdictTable),
    themeSection,
    styleSection,
    h('section', { class: 'rise', style: { '--i': 6 } }, h('h2', null, 'Snowball check'), snowballTable),
    h('section', { class: 'rise', style: { '--i': 7 } }, h('h2', null, 'Card outliers'), cardTable),
    h('section', { class: 'rise', style: { '--i': 8 } }, h('h2', null, 'New player check'), starterTable),
  ));
  showScope();

  // ---------- running ----------
  function start() {
    stats = results[prefs.scope] = newStats(prefs.scope);
    stats.gamesPer = prefs.games;
    const matchups = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) matchups.push({ a: ids[i], b: ids[j] });
    // Shuffle so the active matchups aren't all one deck at the start.
    for (let i = matchups.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [matchups[i], matchups[k]] = [matchups[k], matchups[i]]; }
    // Each matchup is split into chunks of CHUNK games. A matchup's chunks stay together in the queue, so only a few
    // matchups are live at once, and a big one is shared across threads instead of leaving the others idle at the end.
    const chunks = Math.ceil(prefs.games / CHUNK);
    const queue = matchups.flatMap(m => Array.from({ length: chunks }, (_, c) =>
      ({ ...m, key: `${m.a}|${m.b}`, games: Math.min(CHUNK, prefs.games - c * CHUNK), chunks })));
    stats.total = matchups.length * prefs.games;
    const baseSeed = Math.floor(Math.random() * 1e9);
    const threads = Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 1, 8, queue.length));
    const live = new Map(); // matchup key -> { a, b, wins: [a, b], n, chunksLeft, card elements }
    showScope();
    activeGrid.replaceChildren();
    feed.replaceChildren();
    sendBtn.disabled = true;
    sendNote.textContent = '';

    running = { workers: [], started: performance.now(), busy: 0 };
    runBtn.textContent = 'Stop';
    runBtn.classList.remove('primary');
    runBtn.classList.add('danger');
    starterBtn.disabled = true;
    renderChips();

    const card = next => {
      const A = ENTRY[next.a], B = ENTRY[next.b];
      const scoreA = h('b', null, '0'), scoreB = h('b', null, '0');
      const split = h('div', { class: 'bl-split-fill' });
      const count = h('span', { class: 'bl-count' }, `0 / ${prefs.games.toLocaleString()}`);
      const el = h('div', { class: 'bl-match', style: { '--a': A.color, '--b': B.color } },
        h('div', { class: 'bl-side' }, h('span', { class: 'bl-emblem' }, icon(A)), h('span', { title: label(next.a) }, A.name), scoreA),
        h('div', { class: 'bl-vs' }, 'VS'),
        h('div', { class: 'bl-side right' }, scoreB, h('span', { title: label(next.b) }, B.name), h('span', { class: 'bl-emblem' }, icon(B))),
        h('div', { class: 'bl-split' }, split), count);
      activeGrid.append(el);
      return { a: next.a, b: next.b, wins: [0, 0], n: 0, chunksLeft: next.chunks, scoreA, scoreB, split, count, el };
    };

    const assign = worker => {
      const next = queue.shift();
      if (!next) { worker.terminate(); if (!running.busy) finish(); return; }
      if (!live.has(next.key)) live.set(next.key, card(next));
      running.busy++;
      const A = ENTRY[next.a], B = ENTRY[next.b];
      worker.postMessage({ key: next.key, a: next.a, b: next.b, aArch: A.arch, bArch: B.arch, aCards: A.cards, bCards: B.cards, games: next.games, seed: baseSeed + stats.assigned * 100003 });
      stats.assigned++;
    };

    for (let t = 0; t < threads; t++) {
      const worker = new Worker(new URL('./balance-worker.js', import.meta.url), { type: 'module' });
      running.workers.push(worker);
      worker.onmessage = ({ data }) => {
        if (!running) return;
        if (data.type === 'error') { sendNote.textContent = `Simulation error: ${data.message}`; stop(); return; }
        const m = live.get(data.key);
        if (data.type === 'game') {
          addGame(stats, data.result);
          if (data.result.winner === 0 || data.result.winner === 1) m.wins[data.result.winner]++;
          m.n++;
          schedule();
          return;
        }
        running.busy--;
        if (--m.chunksLeft === 0) {
          live.delete(data.key);
          m.el.remove();
          pushFeed(m);
        }
        assign(worker);
      };
      worker.onerror = e => { sendNote.textContent = `Simulation error: ${e.message}`; stop(); };
      assign(worker);
    }

    // A timer rather than requestAnimationFrame, so long runs keep updating in a background tab.
    let frame = 0;
    function schedule() { if (!frame) frame = setTimeout(() => { frame = 0; if (running) paintLive(live); }, 120); }
  }

  // ---------- new player check ----------
  function startStarters() {
    const archs = DECKS.map(d => d.id);
    starters = { wins: {}, games: 0, total: 0, gamesPer: prefs.games, started: performance.now() };
    const queue = [];
    const chunks = Math.ceil(prefs.games / CHUNK);
    for (const a of archs) for (const b of archs) {
      if (a === b) continue;
      for (let c = 0; c < chunks; c++) queue.push({ key: `${a}>${b}`, a, b, games: Math.min(CHUNK, prefs.games - c * CHUNK), aCards: starterDecks(a)[0].cards });
    }
    starters.total = queue.length ? (archs.length * (archs.length - 1)) * prefs.games : 0;
    const baseSeed = Math.floor(Math.random() * 1e9);
    let assigned = 0;
    const threads = Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 1, 8, queue.length));
    running = { workers: [], started: performance.now(), busy: 0, starters: true };
    starterBtn.textContent = 'Stop';
    starterBtn.classList.add('danger');
    runBtn.disabled = true;
    renderChips();
    starterTable.replaceChildren(h('p', { class: 'muted bl-empty' }, 'Playing starter decks…'));
    let frame = 0;
    const assign = worker => {
      const next = queue.shift();
      if (!next) { worker.terminate(); if (!running.busy) finishStarters(); return; }
      running.busy++;
      worker.postMessage({ ...next, seed: baseSeed + assigned++ * 100003 });
    };
    for (let t = 0; t < threads; t++) {
      const worker = new Worker(new URL('./balance-worker.js', import.meta.url), { type: 'module' });
      running.workers.push(worker);
      worker.onmessage = ({ data }) => {
        if (!running) return;
        if (data.type === 'error') { sendNote.textContent = `Simulation error: ${data.message}`; stop(); return; }
        if (data.type === 'game') {
          const r = data.result;
          const cell = ((starters.wins[r.a] ??= {})[r.b] ??= [0, 0]);
          cell[0] += r.winner === 0 ? 1 : r.winner === 'draw' ? 0.5 : 0;
          cell[1]++;
          starters.games++;
          if (!frame) frame = setTimeout(() => {
            frame = 0;
            if (!running) return;
            progressFill.style.width = `${(100 * starters.games) / starters.total}%`;
            progressText.textContent = `Starter decks: ${starters.games.toLocaleString()} / ${starters.total.toLocaleString()} games`;
          }, 120);
          return;
        }
        running.busy--;
        assign(worker);
      };
      worker.onerror = e => { sendNote.textContent = `Simulation error: ${e.message}`; stop(); };
      assign(worker);
    }
  }

  function finishStarters(partial = false) {
    running = null;
    starters.finishedAt = new Date();
    starters.partial = partial;
    starterBtn.textContent = 'Check starter decks';
    starterBtn.classList.remove('danger');
    runBtn.disabled = false;
    renderChips();
    progressFill.style.width = '100%';
    progressText.textContent = `Starter decks: ${starters.games.toLocaleString()} games`;
    starters.rows = starterRows(starters);
    const full = results.archetypes, vars = results.variants;
    const rateIn = (s, key) => (s && crossRate(s, key) != null ? `${(crossRate(s, key) * 100).toFixed(1)}%` : '–');
    starterTable.replaceChildren(
      h('table', { class: 'bl-table' },
        h('thead', null, h('tr', null, ['Archetype', 'Free starter', 'vs full decks', 'Worst matchup', 'Full deck (last run)', 'vs other variants (last run)', 'Verdict'].map(t => h('th', null, t)))),
        h('tbody', null, starters.rows.map((r, i) => h('tr', { class: 'rise', style: { '--i': i, '--deck': deck(r.id).color } },
          h('td', { class: 'bl-td-deck' }, deckEmblem(deck(r.id)), ' ', deck(r.id).name),
          h('td', null, r.name),
          h('td', { class: r.rate < STARTER_FLOOR ? 'bad' : r.rate >= STARTER_TARGET ? 'good' : '' }, `${(r.rate * 100).toFixed(1)}%`),
          h('td', null, r.worst ? `${deck(r.worst[0]).name} ${pct(r.worst[1])}` : '–'),
          h('td', null, rateIn(full, r.id)),
          h('td', null, rateIn(vars, `${r.id}:starter:0`)),
          h('td', null, h('span', { class: `bl-verdict ${r.verdict.kind}`, title: r.verdict.why }, r.verdict.label)))))),
      h('p', { class: 'muted bl-legend' }, `${starters.gamesPer} games per matchup. Pass is ${pct(STARTER_TARGET)} or more against the full decks; Buff needed is under ${pct(STARTER_FLOOR)}. If a starter fails, strengthen its list in src/data/starters.js rather than weakening the other decks.`));
    sendBtn.disabled = false;
  }

  function finish() {
    const seconds = (performance.now() - running.started) / 1000;
    running = null;
    stats.seconds = seconds;
    stats.finishedAt = new Date();
    if (seconds > 2) { prefs.rate = stats.games / seconds; storage.set('metadeck.balance', prefs); }
    runBtn.textContent = 'Check game balance';
    runBtn.classList.add('primary');
    runBtn.classList.remove('danger');
    starterBtn.disabled = false;
    renderChips();
    activeGrid.replaceChildren(h('p', { class: 'muted bl-empty' }, `All ${stats.games.toLocaleString()} games finished in ${duration(seconds)}.`));
    paintLive(new Map());
    paintFinal();
    sendBtn.disabled = false;
  }

  function stop(byUser = false) {
    if (!running) return;
    for (const w of running.workers) w.terminate();
    if (running.starters) {
      if (byUser && starters.games) finishStarters(true);
      else { running = null; starterBtn.textContent = 'Check starter decks'; starterBtn.classList.remove('danger'); runBtn.disabled = false; renderChips(); }
      return;
    }
    starterBtn.disabled = false;
    running = null;
    runBtn.textContent = 'Check game balance';
    runBtn.classList.add('primary');
    runBtn.classList.remove('danger');
    renderChips();
    if (byUser) {
      activeGrid.replaceChildren(h('p', { class: 'muted bl-empty' }, `Stopped after ${stats.games.toLocaleString()} games.`));
      if (stats.games) { stats.partial = true; stats.finishedAt = new Date(); paintFinal(); sendBtn.disabled = false; }
    }
    if (!stats.games) results[stats.scope] = stats = null;
  }

  // ---------- painting ----------
  function pushFeed(m) {
    const rate = m.n ? m.wins[0] / m.n : 0.5;
    const winner = rate >= 0.5 ? m.a : m.b;
    const item = h('li', { class: 'bl-feed-item', style: { '--deck': ENTRY[winner].color } },
      h('span', null, icon(ENTRY[m.a]), ' ', ENTRY[m.a].name),
      h('b', null, `${m.wins[0].toLocaleString()} – ${m.wins[1].toLocaleString()}`),
      h('span', null, ENTRY[m.b].name, ' ', icon(ENTRY[m.b])));
    feed.prepend(item);
    while (feed.children.length > 14) feed.lastChild.remove();
    for (const [r, c, w] of [[m.a, m.b, m.wins[0]], [m.b, m.a, m.wins[1]]]) {
      const cell = cells[r][c];
      paintCell(cell, w / (m.n || 1));
      cell.classList.add('done');
    }
  }

  function paintCell(cell, rate) {
    cell.textContent = `${Math.round(rate * 100)}%`;
    cell.style.setProperty('--wr', rate);
    cell.classList.toggle('good', rate > FAVORED);
    cell.classList.toggle('bad', rate < UNFAVORED);
  }

  function paintLive(live) {
    const done = stats.games;
    progressFill.style.width = `${(100 * done) / stats.total}%`;
    progressText.textContent = `${done.toLocaleString()} / ${stats.total.toLocaleString()} games`;
    const secs = (performance.now() - (running?.started ?? performance.now())) / 1000;
    rateText.textContent = running && secs > 0.5 ? `${Math.round(done / secs)} games/s · ${duration((stats.total - done) / (done / secs || 1))} left` : '';
    for (const m of live.values()) {
      m.scoreA.textContent = m.wins[0];
      m.scoreB.textContent = m.wins[1];
      m.split.style.width = `${m.n ? (100 * m.wins[0]) / m.n : 50}%`;
      m.count.textContent = `${m.n.toLocaleString()} / ${prefs.games.toLocaleString()}`;
      paintCell(cells[m.a][m.b], m.wins[0] / (m.n || 1));
      paintCell(cells[m.b][m.a], m.wins[1] / (m.n || 1));
      cells[m.a][m.b].classList.add('live');
      cells[m.b][m.a].classList.add('live');
    }
    for (const id of ids) for (const c of ids) if (cells[id]?.[c]?.classList.contains('done')) cells[id][c].classList.remove('live');
    paintBoard();
  }

  function paintBoard() {
    const rate = Object.fromEntries(ids.map(id => [id, crossRate(stats, id)]));
    const order = [...ids].sort((x, y) => (rate[y] ?? -1) - (rate[x] ?? -1));
    const before = new Map(order.map(id => [id, rows[id].el.getBoundingClientRect().top]));
    for (const id of order) {
      const r = rows[id];
      r.fill.style.width = `${(rate[id] ?? 0) * 100}%`;
      r.pct.textContent = rate[id] != null ? `${(rate[id] * 100).toFixed(1)}%` : '–';
      board.append(r.el);
    }
    // FLIP: slide rows to their new place in the ranking.
    for (const id of order) {
      const el = rows[id].el;
      const dy = before.get(id) - el.getBoundingClientRect().top;
      if (!dy) continue;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.16,1,.3,1)' });
    }
  }

  function paintFinal() {
    const report = analyze(stats);
    stats.report = report;
    for (const d of report.decks) {
      const badge = rows[d.id].badge;
      badge.textContent = d.verdict.label;
      badge.className = `bl-verdict ${d.verdict.kind}`;
    }
    summary.replaceChildren(
      stat('Games', stats.games.toLocaleString()),
      stat('Avg length', `${report.avgTurns.toFixed(1)} turns`),
      stat('First player wins', `${(report.firstRate * 100).toFixed(0)}%`),
      stat('Draws', stats.draws),
      stat('Matchup noise', `±${Math.round(report.noise * 100)}%`),
    );
    const cellDeck = id => h('td', { class: 'bl-td-deck' }, icon(ENTRY[id]), ' ', ENTRY[id].name);
    verdictTable.replaceChildren(
      stats.gamesPer < 100 ? h('p', { class: 'bl-warn' }, `Only ${stats.gamesPer} games per matchup: treat these verdicts as rough. Use 100 or more before tuning a deck.`) : '',
      h('table', { class: 'bl-table' },
      h('thead', null, h('tr', null, ['Deck', stats.scope === 'variants' ? 'Theme' : null, 'Overall', 'Favored', 'Even', 'Unfavored', 'Best', 'Worst', 'Spread', 'Verdict'].filter(Boolean).map(t => h('th', null, t)))),
      h('tbody', null, report.decks.map((d, i) => h('tr', { class: 'rise', style: { '--i': i, '--deck': ENTRY[d.id].color } },
        cellDeck(d.id),
        stats.scope === 'variants' ? h('td', { class: 'muted' }, deck(ENTRY[d.id].arch).name) : '',
        h('td', null, pct(d.rate)),
        h('td', { class: 'good' }, d.favored), h('td', null, d.even), h('td', { class: 'bad' }, d.unfavored),
        h('td', null, `${label(d.best[0])} ${pct(d.best[1])}`),
        h('td', null, `${label(d.worst[0])} ${pct(d.worst[1])}`),
        h('td', null, pct(d.best[1] - d.worst[1])),
        h('td', null, h('span', { class: `bl-verdict ${d.verdict.kind}`, title: d.verdict.why }, d.verdict.label)))))),
      h('p', { class: 'muted bl-legend' },
        `Favored is above ${pct(FAVORED)}, unfavored below ${pct(UNFAVORED)}. A deck needs tuning when it has no favored matchup (weak to everything), no unfavored matchup (strong against everything), or an overall rate outside 45–55%.${stats.scope === 'variants' ? ' Only matchups against other themes count here.' : ''} With ${stats.gamesPer} games per matchup a single matchup can be off by about ±${Math.round(report.noise * 100)}%.`));
    if (stats.scope === 'variants') {
      themeTable.replaceChildren(
        h('table', { class: 'bl-table' },
          h('thead', null, h('tr', null, ['Variant', 'Theme', 'vs other themes', 'Theme average', 'vs own theme', 'Head to head', 'Verdict'].map(t => h('th', null, t)))),
          h('tbody', null, report.themes.flatMap(t => t.variants).map((v, i) => h('tr', { class: 'rise', style: { '--i': i, '--deck': ENTRY[v.id].color } },
            cellDeck(v.id),
            h('td', { class: 'muted' }, deck(archOf(v.id)).name),
            h('td', null, pct(v.rate)),
            h('td', { class: 'muted' }, pct(report.themes.find(t => t.arch === archOf(v.id)).avg)),
            h('td', { class: v.sibRate > FAVORED ? 'good' : v.sibRate < UNFAVORED ? 'bad' : '' }, v.sibRate != null ? pct(v.sibRate) : '–'),
            h('td', null, v.siblings.map(([op, r]) => `${ENTRY[op].name} ${pct(r)}`).join(' · ') || '–'),
            h('td', null, h('span', { class: `bl-verdict ${v.verdict.kind}`, title: v.verdict.why }, v.verdict.label)))))),
        h('p', { class: 'muted bl-legend' }, `Dominates theme means it beats each of its theme's other variants above ${pct(FAVORED)}, so they look obsolete next to it; Outclassed loses to all of them below ${pct(UNFAVORED)}. Lags theme wins ${pct(THEME_LAG)} or more less against other themes than its theme's best variant.`));
    }
    if (stats.scope === 'variants') {
      const order = Object.keys(STYLES);
      const vsCell = x => h('td', { class: x == null ? 'muted' : x > FAVORED ? 'good' : x < UNFAVORED ? 'bad' : '' }, x == null ? '–' : pct(x));
      styleTable.replaceChildren(
        h('table', { class: 'bl-table' },
          h('thead', null, h('tr', null, ['Style', 'Variants', 'vs other styles', ...order.map(o => `vs ${o}`), 'Verdict'].map(t => h('th', null, t)))),
          h('tbody', null, report.styles.map((st, i) => h('tr', { class: 'rise', style: { '--i': i } },
            h('td', { title: STYLES[st.style] }, h('b', null, st.style)),
            h('td', null, st.members.length),
            vsCell(st.rate),
            order.map(o => (o === st.style ? h('td', { class: 'muted' }, '·') : vsCell(st.vs[o]))),
            h('td', null, h('span', { class: `bl-verdict ${st.verdict.kind}`, title: st.verdict.why }, st.verdict.label)))))),
        h('table', { class: 'bl-table' },
          h('thead', null, h('tr', null, ['Style', 'Variants, best first (vs other themes)'].map(t => h('th', null, t)))),
          h('tbody', null, report.styles.map((st, i) => h('tr', { class: 'rise', style: { '--i': i } },
            h('td', null, h('b', null, st.style), h('br'), h('small', { class: 'muted' }, STYLES[st.style])),
            h('td', { class: 'wrap' }, st.members.map(d => `${ENTRY[d.id].name} ${pct(d.rate)}`).join(' · ')))))),
        h('p', { class: 'muted bl-legend' }, `Each row pools every game its style's variants played against the column style (same-theme games left out). Style tags live in src/data/starters.js. Dominant is over ${pct(FAVORED)} against the other styles, Behind under ${pct(UNFAVORED)}.`));
    }
    const sb = report.snowball;
    const rateCell =(c, good) => h('td', { class: c && good(c[0] / c[1]) ? '' : c ? 'bad' : 'muted' }, c ? pct(c[0] / c[1]) : '–');
    const inTarget = x => x <= SNOWBALL_TARGET[1];
    const turns = LEAD_TURNS.filter(t => t >= SNOWBALL_TURN); // per deck, turn 6 leads are too rare to read
    snowballTable.replaceChildren(
      h('div', { class: 'bl-summary' },
        LEAD_TURNS.map(t => stat(`Leader at turn ${t} wins`, sb.all[t] ? pct(sb.all[t][0] / sb.all[t][1]) : '–')),
        stat('Lead changes per game', sb.flips.toFixed(1)),
        stat('Never change lead', pct(sb.flipless))),
      h('p', null, h('span', { class: `bl-verdict ${sb.verdict.kind}` }, sb.verdict.label), ' ', sb.verdict.why),
      h('table', { class: 'bl-table' },
        h('thead', null, h('tr', null, ['Deck', ...turns.map(t => `Converts lead · T${t}`), ...turns.map(t => `Comes back · T${t}`), 'Verdict'].map(t => h('th', null, t)))),
        h('tbody', null, sb.decks.map((d, i) => h('tr', { class: 'rise', style: { '--i': i, '--deck': ENTRY[d.id].color } },
          cellDeck(d.id),
          turns.map(t => rateCell(d.lead[t], inTarget)),
          turns.map(t => rateCell(d.behind[t], x => x >= 1 - SNOWBALL_TARGET[1])),
          h('td', null, h('span', { class: `bl-verdict ${d.verdict.kind}`, title: d.verdict.why }, d.verdict.label)))))),
      h('p', { class: 'muted bl-legend' }, `A side leads when its board (ATK + health), plus half its HP lead, plus 2 per extra card in hand, is ${LEAD_MIN}+ points ahead at the start of that turn. Target: the leader at turn ${SNOWBALL_TURN} wins ${pct(SNOWBALL_TARGET[0])}–${pct(SNOWBALL_TARGET[1])}. Above that an early lead decides too many games; below it the early turns barely matter. The AI never plays for a comeback on purpose, so humans may see somewhat different numbers.`));
    const line = c => h('tr', { style: { '--deck': deck(c.deck).color } },
      h('td', { class: c.delta >= 0 ? 'good' : 'bad' }, `${c.delta >= 0 ? '+' : ''}${(c.delta * 100).toFixed(0)}%`),
      h('td', { class: 'bl-td-deck' }, deckEmblem(deck(c.deck)), ' ', deck(c.deck).name),
      h('td', null, c.cost), h('td', null, c.name), h('td', { class: 'muted' }, `${(c.playRate * 100).toFixed(0)}% of games`));
    const head = h('thead', null, h('tr', null, ['Δ win rate', 'Deck', 'Cost', 'Card', 'Played in'].map(t => h('th', null, t))));
    cardTable.replaceChildren(
      h('div', null, h('h3', null, 'Over-perform their deck'), h('table', { class: 'bl-table' }, head, h('tbody', null, report.cards.slice(0, 12).map(line)))),
      h('div', null, h('h3', null, 'Under-perform their deck'), h('table', { class: 'bl-table' }, head.cloneNode(true), h('tbody', null, report.cards.slice(-12).reverse().map(line)))),
      report.rare.length ? h('p', { class: 'muted bl-legend' }, `Rarely played (under 15% of games): ${report.rare.join(', ')}.`) : '',
      h('p', { class: 'muted bl-legend' }, `Δ is the ${stats.scope === 'variants' ? 'theme' : 'deck'}’s win rate in games where the card was played, minus its win rate in games that were at the same turn with the same lead (ahead, even or behind) when the card came down. So a 7-drop isn't flattered by the game lasting long enough to cast it, and a catch-up card isn't blamed for being played from behind.`));
  }

  async function sendToClaude() {
    if (!Object.values(results).some(s => s?.report) && !starters?.rows) return;
    const markdown = toMarkdown(results, starters);
    sendBtn.disabled = true;
    let saved = null;
    try {
      const res = await fetch('/api/meta-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown }) });
      if (res.ok) saved = (await res.json()).path;
    } catch { /* static hosting without the local server */ }
    let copied = false;
    try { await navigator.clipboard.writeText(markdown); copied = true; } catch { /* clipboard blocked */ }
    if (!saved && !copied) {
      const a = h('a', { href: URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' })), download: 'meta-report.md' });
      a.click();
    }
    sendBtn.disabled = false;
    sendNote.replaceChildren(saved
      ? h('span', null, 'Saved to ', h('code', null, saved), copied ? ' and copied to your clipboard.' : '.', ' Tell Claude “read the meta report”.')
      : h('span', null, copied ? 'Copied to your clipboard. Paste it into your chat with Claude.' : 'Downloaded meta-report.md. Attach it in your chat with Claude.'));
    sendNote.classList.remove('flash');
    void sendNote.offsetWidth;
    sendNote.classList.add('flash');
  }
}

function stopRun() { if (running) { for (const w of running.workers) w.terminate(); running = null; } }

const stat = (label, value) => h('div', { class: 'bl-stat rise' }, h('span', null, label), h('b', null, value));
const pct = x => `${Math.round(x * 100)}%`;
const duration = secs => (secs < 90 ? `${Math.max(1, Math.round(secs))}s` : secs < 5400 ? `${Math.round(secs / 60)} min` : `${(secs / 3600).toFixed(1)} h`);
const archOf = id => ENTRY[id].arch;
const archName = arch => DECKS.find(d => d.id === arch).name;
// A deck's name, with its theme for a variant ('Blitz Squad (FPS)').
const label = id => (ENTRY[id].key === ENTRY[id].arch ? ENTRY[id].name : `${ENTRY[id].name} (${archName(ENTRY[id].arch)})`);

// ---------- statistics ----------
function newStats(scope) {
  const ids = SCOPES[scope].entries.map(e => e.key);
  const archs = DECKS.map(d => d.id);
  return {
    scope, ids, games: 0, assigned: 0, draws: 0, turns: 0, decided: 0, firstWins: 0,
    played: Object.fromEntries(ids.map(id => [id, 0])),
    archPlayed: Object.fromEntries(archs.map(id => [id, 0])),
    total: 0, grid: {}, cards: newCardTally(), lead: newLeadTally(),
  };
}

function addGame(s, r) {
  s.games++;
  s.turns += r.turns;
  s.played[r.a]++; s.played[r.b]++;
  tallyLead(s.lead, r);
  for (const [me, op] of [[r.a, r.b], [r.b, r.a]]) ((s.grid[me] ??= {})[op] ??= [0, 0])[1]++;
  if (r.winner === 'draw') { s.draws++; s.grid[r.a][r.b][0] += 0.5; s.grid[r.b][r.a][0] += 0.5; }
  else {
    const w = r.winner === 0 ? r.a : r.b, l = w === r.a ? r.b : r.a;
    s.grid[w][l][0]++;
    s.decided++;
    if (r.winner === r.first) s.firstWins++;
  }
  const archOfSide = side => archOf(side === 0 ? r.a : r.b);
  s.archPlayed[archOfSide(0)]++;
  s.archPlayed[archOfSide(1)]++;
  tallyCards(s.cards, r, archOfSide);
}

// A deck's win rate over the opponents `keep` accepts, or null before it has played one.
function rateVs(s, id, keep) {
  let w = 0, n = 0;
  for (const [op, [ow, on]] of Object.entries(s.grid[id] ?? {})) if (keep(op)) { w += ow; n += on; }
  return n ? w / n : null;
}
// Win rate against other themes. A variant's games against its own theme are reported separately.
const crossRate = (s, id) => rateVs(s, id, op => !sameTheme(id, op));

function analyze(s) {
  const decks = s.ids.filter(id => s.played[id]).map(id => {
    const all = Object.entries(s.grid[id] ?? {}).map(([op, [w, n]]) => [op, w / n]).sort((a, b) => b[1] - a[1]);
    const m = all.filter(([op]) => !sameTheme(id, op));
    const rate = crossRate(s, id);
    const favored = m.filter(x => x[1] > FAVORED).length, unfavored = m.filter(x => x[1] < UNFAVORED).length;
    let verdict = { kind: 'ok', label: 'Healthy', why: 'Has matchups it wins and matchups it loses.' };
    if (rate < 0.45 || (favored === 0 && rate < 0.5)) verdict = { kind: 'weak', label: 'Underpowered', why: favored === 0 ? 'No favored matchup: weak to everything.' : 'Overall win rate under 45%.' };
    else if (rate > 0.55 || (unfavored === 0 && rate > 0.5)) verdict = { kind: 'strong', label: 'Overpowered', why: unfavored === 0 ? 'No unfavored matchup: strong against everything.' : 'Overall win rate over 55%.' };
    else if (favored === 0 || unfavored === 0) verdict = { kind: 'watch', label: 'Watch', why: favored === 0 ? 'No favored matchup.' : 'No unfavored matchup.' };
    return { id, rate, favored, unfavored, even: m.length - favored - unfavored, best: m[0], worst: m.at(-1), matchups: m, siblings: all.filter(([op]) => sameTheme(id, op)), verdict };
  }).filter(d => d.matchups.length).sort((a, b) => b.rate - a.rate);

  // Variants grouped by theme, with how each does against its own theme's other variants.
  const themes = s.scope !== 'variants' ? [] : DECKS.map(t => {
    const vs = decks.filter(d => archOf(d.id) === t.id);
    if (!vs.length) return null;
    const top = Math.max(...vs.map(d => d.rate));
    const variants = vs.map(d => {
      const sibRate = rateVs(s, d.id, op => op !== d.id && sameTheme(d.id, op));
      let verdict = { kind: 'ok', label: 'Distinct', why: `Holds its own next to the other ${t.name} variants.` };
      if (d.siblings.length && d.siblings.every(x => x[1] > FAVORED)) verdict = { kind: 'strong', label: 'Dominates theme', why: `Beats every other ${t.name} variant: they look obsolete next to it.` };
      else if (d.siblings.length && d.siblings.every(x => x[1] < UNFAVORED)) verdict = { kind: 'weak', label: 'Outclassed', why: `Loses to every other ${t.name} variant.` };
      else if (d.rate < top - THEME_LAG) verdict = { kind: 'watch', label: 'Lags theme', why: `Wins ${pct(top - d.rate)} less against other themes than the best ${t.name} variant.` };
      return { ...d, sibRate, verdict };
    });
    return { arch: t.id, avg: vs.reduce((n, d) => n + d.rate, 0) / vs.length, variants };
  }).filter(Boolean);

  // Variants grouped by play style: each style's pooled win rate against the other styles, and against each one.
  // Same-theme games are left out, as everywhere else.
  const styles = s.scope !== 'variants' ? [] : Object.keys(STYLES).map(style => {
    const members = decks.filter(d => ENTRY[d.id].style === style);
    if (!members.length) return null;
    const pooled = keep => {
      let w = 0, n = 0;
      for (const d of members) for (const [op, [ow, on]] of Object.entries(s.grid[d.id] ?? {})) if (!sameTheme(d.id, op) && keep(op)) { w += ow; n += on; }
      return n ? w / n : null;
    };
    const rate = pooled(op => ENTRY[op].style !== style);
    const vs = Object.fromEntries(Object.keys(STYLES).filter(o => o !== style).map(o => [o, pooled(op => ENTRY[op].style === o)]));
    let verdict = { kind: 'ok', label: 'Even', why: `Wins ${pct(rate)} against the other styles.` };
    if (rate > FAVORED) verdict = { kind: 'strong', label: 'Dominant', why: `Wins ${pct(rate)} against the other styles: this style is ahead of the meta.` };
    else if (rate < UNFAVORED) verdict = { kind: 'weak', label: 'Behind', why: `Wins only ${pct(rate)} against the other styles.` };
    return { style, rate, vs, members: [...members].sort((a, b) => b.rate - a.rate), verdict };
  }).filter(Boolean).sort((a, b) => b.rate - a.rate);

  const minN = Math.max(10, s.gamesPer * 0.6);
  const cards = [];
  const rare = [];
  const impact = cardImpact(s.cards);
  for (const d of DECKS) {
    if (!s.archPlayed[d.id]) continue;
    for (const c of d.cards) {
      const st = impact[c.cardId];
      const playRate = (st?.n ?? 0) / s.archPlayed[d.id];
      if (playRate < 0.15) rare.push(CARDS[c.cardId].displayName);
      if (!st || st.n < minN) continue;
      cards.push({ deck: d.id, name: CARDS[c.cardId].displayName, cost: c.cost, delta: st.delta, playRate });
    }
  }
  cards.sort((a, b) => b.delta - a.delta);
  return {
    decks, themes, styles, cards, rare, snowball: snowballOf(s),
    avgTurns: s.turns / (s.games || 1),
    firstRate: s.firstWins / (s.decided || 1),
    noise: 1.96 * Math.sqrt(0.25 / Math.max(1, s.gamesPer)), // 95% interval on one matchup
  };
}

// The snowball check: how often a lead at each of LEAD_TURNS converts, overall and per deck, most snowbally deck first.
function snowballOf(s) {
  const t = s.lead;
  const rate = c => (c ? c[0] / c[1] : null);
  const judge = (x, who) => x == null ? { kind: 'watch', label: 'Too few games', why: `Not enough games with a lead at turn ${SNOWBALL_TURN}.` }
    : x > SNOWBALL_TARGET[1] ? { kind: 'weak', label: 'Snowbally', why: `${who} ahead at turn ${SNOWBALL_TURN} wins ${pct(x)}: an early lead decides too many games.` }
    : x < SNOWBALL_TARGET[0] ? { kind: 'watch', label: 'Swingy', why: `${who} ahead at turn ${SNOWBALL_TURN} wins only ${pct(x)}: the early turns barely matter.` }
    : { kind: 'ok', label: 'Back and forth', why: `${who} ahead at turn ${SNOWBALL_TURN} wins ${pct(x)}: leads matter but can be overturned.` };
  const decks = s.ids.filter(id => t.lead[id] || t.behind[id]).map(id => ({
    id, lead: t.lead[id] ?? {}, behind: t.behind[id] ?? {}, verdict: judge(rate(t.lead[id]?.[SNOWBALL_TURN]), 'This deck'),
  })).sort((a, b) => (rate(b.lead[SNOWBALL_TURN]) ?? 0) - (rate(a.lead[SNOWBALL_TURN]) ?? 0));
  return {
    all: t.all, decks, games: t.games,
    flips: t.flips / (t.games || 1), flipless: t.flipless / (t.games || 1),
    verdict: judge(rate(t.all[SNOWBALL_TURN]), 'The side'),
  };
}

// One row per archetype for the new player check, weakest starter first.
function starterRows(st) {
  return DECKS.map(d => d.id).filter(id => st.wins[id]).map(id => {
    const m = Object.entries(st.wins[id]).map(([op, [w, n]]) => [op, w / n]).sort((a, b) => a[1] - b[1]);
    const totals = Object.values(st.wins[id]).reduce((t, [w, n]) => [t[0] + w, t[1] + n], [0, 0]);
    const rate = totals[0] / (totals[1] || 1);
    const verdict = rate >= STARTER_TARGET ? { kind: 'ok', label: 'Pass', why: `Wins ${pct(rate)} against the full decks.` }
      : rate >= STARTER_FLOOR ? { kind: 'watch', label: 'Watch', why: `Between ${pct(STARTER_FLOOR)} and ${pct(STARTER_TARGET)}: new players will struggle a little.` }
      : { kind: 'weak', label: 'Buff needed', why: `Under ${pct(STARTER_FLOOR)}: new players with this deck will lose too often.` };
    return { id, name: starterDecks(id)[0].name, rate, worst: m[0], matchups: m, verdict };
  }).sort((a, b) => a.rate - b.rate);
}

function toMarkdown(results, st = null) {
  const out = [];
  out.push('# MetaDeck meta report', '');
  if (st?.rows) {
    out.push('## New player check', '', `Each archetype's free starter deck against every other archetype's full deck, ${st.gamesPer} games per matchup${st.partial ? ' (stopped early)' : ''}. Target ${pct(STARTER_TARGET)} or more; under ${pct(STARTER_FLOOR)} needs a buff.`, '');
    out.push('| Archetype | Free starter | vs full decks | Worst matchup | Verdict |', '|---|---|---|---|---|');
    for (const r of st.rows) out.push(`| ${archName(r.id)} | ${r.name} | ${(r.rate * 100).toFixed(1)}% | ${r.worst ? `${archName(r.worst[0])} ${pct(r.worst[1])}` : '–'} | ${r.verdict.label} |`);
    out.push('');
  }
  for (const s of [results.archetypes, results.variants]) if (s?.report) out.push(...runMarkdown(s));
  return out.join('\n');
}

function runMarkdown(s) {
  const r = s.report;
  const variants = s.scope === 'variants';
  const h3 = title => `### ${title}`;
  const out = [];
  out.push(variants ? '## Every starter variant' : '## Archetype pools', '');
  out.push(`Generated ${s.finishedAt.toISOString()} by the Balance lab. ${s.games} AI-vs-AI games, ${s.gamesPer} per matchup${s.partial ? ' (stopped early, so some matchups are incomplete)' : ''}.`);
  if (variants) out.push(`All ${s.ids.length} starter variants, each against every other theme's variants and against its own theme's other variants. Overall rates count only games against other themes.`);
  out.push(`Average length ${r.avgTurns.toFixed(1)} turns · first player wins ${pct(r.firstRate)} · draws ${s.draws} · one matchup's 95% noise ±${Math.round(r.noise * 100)}%.`, '');
  out.push(h3('Balance check'), '', '| Deck | Overall | Favored (>55%) | Even | Unfavored (<45%) | Best | Worst | Spread | Verdict |', '|---|---|---|---|---|---|---|---|---|');
  for (const d of r.decks) out.push(`| ${label(d.id)} | ${(d.rate * 100).toFixed(1)}% | ${d.favored} | ${d.even} | ${d.unfavored} | ${label(d.best[0])} ${pct(d.best[1])} | ${label(d.worst[0])} ${pct(d.worst[1])} | ${pct(d.best[1] - d.worst[1])} | ${d.verdict.label}: ${d.verdict.why} |`);
  if (variants) {
    out.push('', h3('Within each theme'), '', '| Theme | Variant | vs other themes | Theme average | vs own theme | Head to head | Verdict |', '|---|---|---|---|---|---|---|');
    for (const t of r.themes) for (const v of t.variants) {
      out.push(`| ${archName(t.arch)} | ${ENTRY[v.id].name} | ${(v.rate * 100).toFixed(1)}% | ${(t.avg * 100).toFixed(1)}% | ${v.sibRate != null ? pct(v.sibRate) : '–'} | ${v.siblings.map(([op, x]) => `${ENTRY[op].name} ${pct(x)}`).join(', ') || '–'} | ${v.verdict.label}: ${v.verdict.why} |`);
    }
  }
  if (variants && r.styles.length) {
    const order = Object.keys(STYLES);
    const cell = x => (x == null ? '–' : pct(x));
    out.push('', h3('Play styles'), '', "Each row pools every game its style's variants played against the column style (same-theme games left out).", '');
    out.push(`| Style | Variants | vs other styles | ${order.map(o => `vs ${o}`).join(' | ')} | Verdict |`, `|---|---|---|${order.map(() => '---').join('|')}|---|`);
    for (const st of r.styles) out.push(`| ${st.style} | ${st.members.map(d => `${ENTRY[d.id].name} ${pct(d.rate)}`).join(', ')} | ${(st.rate * 100).toFixed(1)}% | ${order.map(o => (o === st.style ? '·' : cell(st.vs[o]))).join(' | ')} | ${st.verdict.label}: ${st.verdict.why} |`);
  }
  const ids = s.ids;
  out.push('', h3("Matchups (row deck's win rate vs column deck)"), '', `| | ${ids.map(id => ENTRY[id].name).join(' | ')} |`, `|---|${ids.map(() => '---').join('|')}|`);
  for (const row of ids) out.push(`| **${label(row)}** | ${ids.map(c => (row === c ? '·' : s.grid[row]?.[c] ? pct(s.grid[row][c][0] / s.grid[row][c][1]) : '–')).join(' | ')} |`);
  const sb = r.snowball;
  const cellPct = c => (c ? pct(c[0] / c[1]) : '–');
  out.push('', h3('Snowball check'), '', `${sb.verdict.label}: ${sb.verdict.why} Target ${pct(SNOWBALL_TARGET[0])}–${pct(SNOWBALL_TARGET[1])}.`,
    `Leader wins: ${LEAD_TURNS.map(t => `turn ${t} ${cellPct(sb.all[t])}`).join(' · ')} · ${sb.flips.toFixed(1)} lead changes per game · ${pct(sb.flipless)} of games never change lead.`,
    `A side leads when its board (ATK + health) + half its HP lead + 2 per extra card in hand is ${LEAD_MIN}+ points ahead at the start of the turn. "Converts" is the deck's win rate when ahead; "Comes back" its win rate when behind.`, '');
  out.push(`| Deck | ${LEAD_TURNS.map(t => `Converts T${t}`).join(' | ')} | ${LEAD_TURNS.map(t => `Comes back T${t}`).join(' | ')} | Verdict |`, `|---|${LEAD_TURNS.map(() => '---|---').join('|')}|---|`);
  for (const d of sb.decks) out.push(`| ${label(d.id)} | ${LEAD_TURNS.map(t => cellPct(d.lead[t])).join(' | ')} | ${LEAD_TURNS.map(t => cellPct(d.behind[t])).join(' | ')} | ${d.verdict.label} |`);
  const cardLine = c => `| ${c.delta >= 0 ? '+' : ''}${(c.delta * 100).toFixed(0)}% | ${archName(c.deck)} | ${c.cost} | ${c.name} | ${(c.playRate * 100).toFixed(0)}% |`;
  out.push('', h3('Cards that over-perform their deck'), '', "Δ is the card's win rate when played minus its deck's win rate in games at the same turn and lead (ahead, even or behind) when it came down.", '', '| Δ | Deck | Cost | Card | Played in |', '|---|---|---|---|---|', ...r.cards.slice(0, 15).map(cardLine));
  out.push('', h3('Cards that under-perform their deck'), '', '| Δ | Deck | Cost | Card | Played in |', '|---|---|---|---|---|', ...r.cards.slice(-15).reverse().map(cardLine));
  if (r.rare.length) out.push('', `Rarely played (<15% of games): ${r.rare.join(', ')}`);
  out.push('');
  return out;
}
