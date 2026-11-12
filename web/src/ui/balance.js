// Balance lab: an AI-vs-AI round robin between every pair of decks, run in Web Workers so the page
// stays live. Shows the matchups being played, then the full balance tables, and can hand the
// results to Claude (saved to web/reports/ by the local server, and copied to the clipboard).

import { h, storage } from './dom.js';
import { removeFx } from './fx.js';
import { DECKS, CARDS } from '../data/index.js';

const GAME_OPTIONS = [20, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const CHUNK = 250; // games per worker job, so big matchups spread across every thread
const FAVORED = 0.55, UNFAVORED = 0.45;

let running = null; // the live run, so leaving the screen can stop its workers

export function balanceLab(root, { onBack }) {
  removeFx();
  stopRun();
  const prefs = storage.get('metadeck.balance', { games: 100 });
  const ids = DECKS.map(d => d.id);
  const deck = id => DECKS.find(d => d.id === id);
  let stats = null; // results of the current or last run

  // ---------- static layout; live updates only touch text, widths and classes ----------
  const progressFill = h('div', { class: 'bl-progress-fill' });
  const progressText = h('span', null, 'Ready');
  const rateText = h('span', { class: 'bl-rate' });
  const runBtn = h('button', { class: 'btn primary big', onclick: () => (running ? stop(true) : start()) }, 'Check game balance');
  const sendBtn = h('button', { class: 'btn primary big online', disabled: true, onclick: () => sendToClaude() }, 'Send stats to Claude');
  const sendNote = h('p', { class: 'bl-send-note muted' });
  const gameChips = h('div', { class: 'chips' });
  const estimate = h('span', { class: 'bl-estimate muted' });
  const pairings = (ids.length * (ids.length - 1)) / 2;
  const renderChips = () => {
    gameChips.replaceChildren(...GAME_OPTIONS.map(n => h('button', {
      class: `chip${prefs.games === n ? ' selected' : ''}`, disabled: running ? true : null,
      onclick: () => { prefs.games = n; storage.set('metadeck.balance', prefs); renderChips(); },
    }, n.toLocaleString())));
    const total = pairings * prefs.games;
    estimate.textContent = `${pairings} matchups × ${prefs.games.toLocaleString()} = ${total.toLocaleString()} games · about ${duration(total / (prefs.rate || 200))}`;
  };
  renderChips();

  const activeGrid = h('div', { class: 'bl-active' }, h('p', { class: 'muted bl-empty' }, 'Matchups appear here while the simulation runs.'));
  const feed = h('ol', { class: 'bl-feed' });
  const summary = h('div', { class: 'bl-summary' });
  const board = h('div', { class: 'bl-board' });
  const rows = {};
  for (const id of ids) {
    const d = deck(id);
    const fill = h('div', { class: 'bl-bar-fill' });
    const pct = h('span', { class: 'bl-pct' }, '–');
    const badge = h('span', { class: 'bl-verdict' });
    rows[id] = { el: h('div', { class: 'bl-row', style: { '--deck': d.color } },
      h('span', { class: 'bl-emblem' }, d.icon), h('span', { class: 'bl-name' }, d.name),
      h('div', { class: 'bl-bar' }, h('i', { class: 'bl-mid' }), fill), pct, badge), fill, pct, badge };
    board.append(rows[id].el);
  }

  const cells = {};
  const grid = h('div', { class: 'bl-grid', style: { '--n': ids.length } },
    h('span', { class: 'bl-corner' }, 'row vs col'),
    ids.map(c => h('span', { class: 'bl-col', style: { '--deck': deck(c).color }, title: deck(c).name }, deck(c).icon, h('b', null, deck(c).name))),
    ids.map(r => [
      h('span', { class: 'bl-rowhead', style: { '--deck': deck(r).color } }, deck(r).icon, ' ', deck(r).name),
      ids.map(c => {
        if (r === c) return h('span', { class: 'bl-cell self' }, '·');
        const cell = h('span', { class: 'bl-cell' }, '');
        (cells[r] ??= {})[c] = cell;
        return cell;
      }),
    ]));
  const verdictTable = h('div', { class: 'bl-table-wrap' });
  const cardTable = h('div', { class: 'bl-cards' });

  root.replaceChildren(h('main', { class: 'balance' },
    h('header', { class: 'page-head' },
      h('button', { class: 'btn ghost small', onclick: () => { stop(); onBack(); } }, '← Menu'),
      h('h1', null, 'Balance lab')),
    h('section', { class: 'bl-controls rise' },
      h('div', { class: 'bl-control-text' },
        h('p', null, 'Plays every deck against every other deck with the built-in AI on both sides, each deck going first half the time.'),
        h('div', { class: 'bl-games' }, h('span', { class: 'muted' }, 'Games per matchup'), gameChips), estimate),
      h('div', { class: 'bl-actions' }, runBtn, sendBtn)),
    sendNote,
    h('div', { class: 'bl-progress rise', style: { '--i': 1 } }, progressFill, h('div', { class: 'bl-progress-text' }, progressText, rateText)),
    h('div', { class: 'bl-live rise', style: { '--i': 2 } },
      h('section', null, h('h2', null, 'Active matchups'), activeGrid),
      h('section', null, h('h2', null, 'Finished matchups'), feed)),
    summary,
    h('section', { class: 'rise', style: { '--i': 3 } }, h('h2', null, 'Win rate'), board),
    h('section', { class: 'rise', style: { '--i': 4 } }, h('h2', null, "Matchups · row deck's win rate"), h('div', { class: 'bl-grid-wrap' }, grid)),
    h('section', { class: 'rise', style: { '--i': 5 } }, h('h2', null, 'Balance check'), verdictTable),
    h('section', { class: 'rise', style: { '--i': 6 } }, h('h2', null, 'Card outliers'), cardTable),
  ));

  // ---------- running ----------
  function start() {
    stats = newStats(ids);
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
    activeGrid.replaceChildren();
    feed.replaceChildren();
    for (const id of ids) for (const c of ids) if (cells[id]?.[c]) { cells[id][c].textContent = ''; cells[id][c].className = 'bl-cell'; cells[id][c].style.removeProperty('--wr'); }
    verdictTable.replaceChildren();
    cardTable.replaceChildren();
    summary.replaceChildren();
    sendBtn.disabled = true;
    sendNote.textContent = '';

    running = { workers: [], started: performance.now(), busy: 0 };
    runBtn.textContent = 'Stop';
    runBtn.classList.remove('primary');
    runBtn.classList.add('danger');
    renderChips();

    const card = next => {
      const scoreA = h('b', null, '0'), scoreB = h('b', null, '0');
      const split = h('div', { class: 'bl-split-fill' });
      const count = h('span', { class: 'bl-count' }, `0 / ${prefs.games.toLocaleString()}`);
      const el = h('div', { class: 'bl-match', style: { '--a': deck(next.a).color, '--b': deck(next.b).color } },
        h('div', { class: 'bl-side' }, h('span', { class: 'bl-emblem' }, deck(next.a).icon), h('span', null, deck(next.a).name), scoreA),
        h('div', { class: 'bl-vs' }, 'VS'),
        h('div', { class: 'bl-side right' }, scoreB, h('span', null, deck(next.b).name), h('span', { class: 'bl-emblem' }, deck(next.b).icon)),
        h('div', { class: 'bl-split' }, split), count);
      activeGrid.append(el);
      return { a: next.a, b: next.b, wins: [0, 0], n: 0, chunksLeft: next.chunks, scoreA, scoreB, split, count, el };
    };

    const assign = worker => {
      const next = queue.shift();
      if (!next) { worker.terminate(); if (!running.busy) finish(); return; }
      if (!live.has(next.key)) live.set(next.key, card(next));
      running.busy++;
      worker.postMessage({ key: next.key, a: next.a, b: next.b, games: next.games, seed: baseSeed + stats.assigned * 100003 });
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

  function finish() {
    const seconds = (performance.now() - running.started) / 1000;
    running = null;
    stats.seconds = seconds;
    stats.finishedAt = new Date();
    if (seconds > 2) { prefs.rate = stats.games / seconds; storage.set('metadeck.balance', prefs); }
    runBtn.textContent = 'Check game balance';
    runBtn.classList.add('primary');
    runBtn.classList.remove('danger');
    renderChips();
    activeGrid.replaceChildren(h('p', { class: 'muted bl-empty' }, `All ${stats.games.toLocaleString()} games finished in ${duration(seconds)}.`));
    paintLive(new Map());
    paintFinal();
    sendBtn.disabled = false;
  }

  function stop(byUser = false) {
    if (!running) return;
    for (const w of running.workers) w.terminate();
    running = null;
    runBtn.textContent = 'Check game balance';
    runBtn.classList.add('primary');
    runBtn.classList.remove('danger');
    renderChips();
    if (byUser) {
      activeGrid.replaceChildren(h('p', { class: 'muted bl-empty' }, `Stopped after ${stats.games.toLocaleString()} games.`));
      if (stats.games) { stats.partial = true; stats.finishedAt = new Date(); paintFinal(); sendBtn.disabled = false; }
    }
  }

  // ---------- painting ----------
  function pushFeed(m) {
    const rate = m.n ? m.wins[0] / m.n : 0.5;
    const winner = rate >= 0.5 ? m.a : m.b;
    const item = h('li', { class: 'bl-feed-item', style: { '--deck': deck(winner).color } },
      h('span', null, deck(m.a).icon, ' ', deck(m.a).name),
      h('b', null, `${m.wins[0].toLocaleString()} – ${m.wins[1].toLocaleString()}`),
      h('span', null, deck(m.b).name, ' ', deck(m.b).icon));
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
    const order = [...ids].sort((x, y) => winRate(stats, y) - winRate(stats, x));
    const before = new Map(order.map(id => [id, rows[id].el.getBoundingClientRect().top]));
    for (const id of order) {
      const rate = winRate(stats, id);
      const r = rows[id];
      r.fill.style.width = `${(stats.played[id] ? rate : 0) * 100}%`;
      r.pct.textContent = stats.played[id] ? `${(rate * 100).toFixed(1)}%` : '–';
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
    const report = analyze(stats, ids);
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
    verdictTable.replaceChildren(
      stats.gamesPer < 100 ? h('p', { class: 'bl-warn' }, `Only ${stats.gamesPer} games per matchup: treat these verdicts as rough. Use 100 or more before tuning a deck.`) : null,
      h('table', { class: 'bl-table' },
      h('thead', null, h('tr', null, ['Deck', 'Overall', 'Favored', 'Even', 'Unfavored', 'Best', 'Worst', 'Spread', 'Verdict'].map(t => h('th', null, t)))),
      h('tbody', null, report.decks.map((d, i) => h('tr', { class: 'rise', style: { '--i': i, '--deck': deck(d.id).color } },
        h('td', { class: 'bl-td-deck' }, deck(d.id).icon, ' ', deck(d.id).name),
        h('td', null, pct(d.rate)),
        h('td', { class: 'good' }, d.favored), h('td', null, d.even), h('td', { class: 'bad' }, d.unfavored),
        h('td', null, `${deck(d.best[0]).name} ${pct(d.best[1])}`),
        h('td', null, `${deck(d.worst[0]).name} ${pct(d.worst[1])}`),
        h('td', null, pct(d.best[1] - d.worst[1])),
        h('td', null, h('span', { class: `bl-verdict ${d.verdict.kind}`, title: d.verdict.why }, d.verdict.label)))))),
      h('p', { class: 'muted bl-legend' },
        `Favored is above ${pct(FAVORED)}, unfavored below ${pct(UNFAVORED)}. A deck needs tuning when it has no favored matchup (weak to everything), no unfavored matchup (strong against everything), or an overall rate outside 45–55%. With ${stats.gamesPer} games per matchup a single matchup can be off by about ±${Math.round(report.noise * 100)}%.`));
    const line = c => h('tr', { style: { '--deck': deck(c.deck).color } },
      h('td', { class: c.delta >= 0 ? 'good' : 'bad' }, `${c.delta >= 0 ? '+' : ''}${(c.delta * 100).toFixed(0)}%`),
      h('td', { class: 'bl-td-deck' }, deck(c.deck).icon, ' ', deck(c.deck).name),
      h('td', null, c.cost), h('td', null, c.name), h('td', { class: 'muted' }, `${(c.playRate * 100).toFixed(0)}% of games`));
    const head = h('thead', null, h('tr', null, ['Δ win rate', 'Deck', 'Cost', 'Card', 'Played in'].map(t => h('th', null, t))));
    cardTable.replaceChildren(
      h('div', null, h('h3', null, 'Over-perform their deck'), h('table', { class: 'bl-table' }, head, h('tbody', null, report.cards.slice(0, 12).map(line)))),
      h('div', null, h('h3', null, 'Under-perform their deck'), h('table', { class: 'bl-table' }, head.cloneNode(true), h('tbody', null, report.cards.slice(-12).reverse().map(line)))),
      report.rare.length ? h('p', { class: 'muted bl-legend' }, `Rarely played (under 15% of games): ${report.rare.join(', ')}.`) : null,
      h('p', { class: 'muted bl-legend' }, 'Δ is the deck’s win rate in games where the card was played, minus the deck’s overall win rate. Expensive cards score high partly because games that reach them run long.'));
  }

  async function sendToClaude() {
    if (!stats?.report) return;
    const markdown = toMarkdown(stats, ids);
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

// ---------- statistics ----------
function newStats(ids) {
  return {
    games: 0, assigned: 0, draws: 0, turns: 0, decided: 0, firstWins: 0,
    wins: Object.fromEntries(ids.map(id => [id, 0])), played: Object.fromEntries(ids.map(id => [id, 0])),
    total: 0, grid: {}, cardStats: {},
  };
}

function addGame(s, r) {
  s.games++;
  s.turns += r.turns;
  s.played[r.a]++; s.played[r.b]++;
  for (const [me, op] of [[r.a, r.b], [r.b, r.a]]) ((s.grid[me] ??= {})[op] ??= [0, 0])[1]++;
  if (r.winner === 'draw') { s.draws++; s.wins[r.a] += 0.5; s.wins[r.b] += 0.5; s.grid[r.a][r.b][0] += 0.5; s.grid[r.b][r.a][0] += 0.5; }
  else {
    const w = r.winner === 0 ? r.a : r.b, l = w === r.a ? r.b : r.a;
    s.wins[w]++;
    s.grid[w][l][0]++;
    s.decided++;
    if (r.winner === r.first) s.firstWins++;
  }
  for (const side of [0, 1]) {
    const won = r.winner === side ? 1 : r.winner === 'draw' ? 0.5 : 0;
    const d = side === 0 ? r.a : r.b;
    for (const id of r.played[side]) { const c = (s.cardStats[id] ??= { w: 0, n: 0, deck: d }); c.w += won; c.n++; }
  }
}

const winRate = (s, id) => (s.played[id] ? s.wins[id] / s.played[id] : 0);

function analyze(s, ids) {
  const decks = ids.filter(id => s.played[id]).map(id => {
    const m = Object.entries(s.grid[id] ?? {}).map(([op, [w, n]]) => [op, w / n]).sort((a, b) => b[1] - a[1]);
    const rate = winRate(s, id);
    const favored = m.filter(x => x[1] > FAVORED).length, unfavored = m.filter(x => x[1] < UNFAVORED).length;
    let verdict = { kind: 'ok', label: 'Healthy', why: 'Has matchups it wins and matchups it loses.' };
    if (rate < 0.45 || (favored === 0 && rate < 0.5)) verdict = { kind: 'weak', label: 'Underpowered', why: favored === 0 ? 'No favored matchup: weak to everything.' : 'Overall win rate under 45%.' };
    else if (rate > 0.55 || (unfavored === 0 && rate > 0.5)) verdict = { kind: 'strong', label: 'Overpowered', why: unfavored === 0 ? 'No unfavored matchup: strong against everything.' : 'Overall win rate over 55%.' };
    else if (favored === 0 || unfavored === 0) verdict = { kind: 'watch', label: 'Watch', why: favored === 0 ? 'No favored matchup.' : 'No unfavored matchup.' };
    return { id, rate, favored, unfavored, even: m.length - favored - unfavored, best: m[0], worst: m.at(-1), matchups: m, verdict };
  }).sort((a, b) => b.rate - a.rate);

  const base = Object.fromEntries(ids.map(id => [id, winRate(s, id)]));
  const minN = Math.max(10, s.gamesPer * 0.6);
  const cards = [];
  const rare = [];
  for (const d of DECKS) {
    if (!s.played[d.id]) continue;
    for (const c of d.cards) {
      const st = s.cardStats[c.cardId];
      const playRate = (st?.n ?? 0) / s.played[d.id];
      if (playRate < 0.15) rare.push(CARDS[c.cardId].displayName);
      if (!st || st.n < minN) continue;
      cards.push({ deck: d.id, name: CARDS[c.cardId].displayName, cost: c.cost, delta: st.w / st.n - base[d.id], playRate });
    }
  }
  cards.sort((a, b) => b.delta - a.delta);
  return {
    decks, cards, rare,
    avgTurns: s.turns / (s.games || 1),
    firstRate: s.firstWins / (s.decided || 1),
    noise: 1.96 * Math.sqrt(0.25 / Math.max(1, s.gamesPer)), // 95% interval on one matchup
  };
}

function toMarkdown(s, ids) {
  const r = s.report;
  const name = id => DECKS.find(d => d.id === id).name;
  const out = [];
  out.push('# MetaDeck meta report', '');
  out.push(`Generated ${s.finishedAt.toISOString()} by the Balance lab. ${s.games} AI-vs-AI games, ${s.gamesPer} per matchup${s.partial ? ' (stopped early, so some matchups are incomplete)' : ''}.`);
  out.push(`Average length ${r.avgTurns.toFixed(1)} turns · first player wins ${pct(r.firstRate)} · draws ${s.draws} · one matchup's 95% noise ±${Math.round(r.noise * 100)}%.`, '');
  out.push('## Balance check', '', '| Deck | Overall | Favored (>55%) | Even | Unfavored (<45%) | Best | Worst | Spread | Verdict |', '|---|---|---|---|---|---|---|---|---|');
  for (const d of r.decks) out.push(`| ${name(d.id)} | ${(d.rate * 100).toFixed(1)}% | ${d.favored} | ${d.even} | ${d.unfavored} | ${name(d.best[0])} ${pct(d.best[1])} | ${name(d.worst[0])} ${pct(d.worst[1])} | ${pct(d.best[1] - d.worst[1])} | ${d.verdict.label}: ${d.verdict.why} |`);
  out.push('', "## Matchups (row deck's win rate vs column deck)", '', `| | ${ids.map(name).join(' | ')} |`, `|---|${ids.map(() => '---').join('|')}|`);
  for (const row of ids) out.push(`| **${name(row)}** | ${ids.map(c => (row === c ? '·' : s.grid[row]?.[c] ? pct(s.grid[row][c][0] / s.grid[row][c][1]) : '–')).join(' | ')} |`);
  const cardLine = c => `| ${c.delta >= 0 ? '+' : ''}${(c.delta * 100).toFixed(0)}% | ${name(c.deck)} | ${c.cost} | ${c.name} | ${(c.playRate * 100).toFixed(0)}% |`;
  out.push('', '## Cards that over-perform their deck', '', '| Δ | Deck | Cost | Card | Played in |', '|---|---|---|---|---|', ...r.cards.slice(0, 15).map(cardLine));
  out.push('', '## Cards that under-perform their deck', '', '| Δ | Deck | Cost | Card | Played in |', '|---|---|---|---|---|', ...r.cards.slice(-15).reverse().map(cardLine));
  if (r.rare.length) out.push('', `Rarely played (<15% of games): ${r.rare.join(', ')}`);
  out.push('');
  return out.join('\n');
}
