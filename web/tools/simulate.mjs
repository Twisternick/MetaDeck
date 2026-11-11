// Balance simulator: AI-vs-AI round robin between every pair of decks (mirrors excluded).
//
//   node tools/simulate.mjs [--games 20] [--deck FPS] [--seed 1] [--cards] [--json out.json]
//
// --games is per pairing, split evenly so each deck goes first half the time.
// Prints each deck's overall win rate, the full matchup grid, first-player win rate and game length.
// --cards adds each card's "win rate when played" relative to its deck — the outliers are the cards
// most worth re-costing.

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);

if (isMainThread) await main();
else await work();

async function main() {
  const { DECKS } = await import('../src/data/index.js');
  const games = Number(args.games ?? 20);
  const baseSeed = Number(args.seed ?? 1);
  const ids = DECKS.map(d => d.id);
  const jobs = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (args.deck && ids[i] !== args.deck && ids[j] !== args.deck) continue;
      for (let g = 0; g < games; g++) jobs.push({ a: ids[i], b: ids[j], first: g % 2, seed: baseSeed * 100003 + jobs.length });
    }
  }

  const threads = Math.max(1, Math.min(os.cpus().length - 1, 12));
  const chunks = Array.from({ length: threads }, (_, t) => jobs.filter((_, k) => k % threads === t));
  const started = Date.now();
  const results = (await Promise.all(chunks.map(chunk => new Promise((resolve, reject) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: chunk, argv: [] });
    w.on('message', resolve);
    w.on('error', reject);
  })))).flat();

  report(ids, results, (Date.now() - started) / 1000);
  if ('cards' in args) await cardReport(results);
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(results));
}

async function work() {
  const { createGame, applyAction } = await import('../src/engine/game.js');
  const { chooseAction } = await import('../src/engine/ai.js');
  const { deckList } = await import('../src/data/index.js');
  const out = [];
  for (const job of workerData) {
    const state = createGame({ decks: [deckList(job.a), deckList(job.b)], deckIds: [job.a, job.b], seed: job.seed, firstPlayer: job.first });
    const played = [new Set(), new Set()];
    let guard = 0;
    while (!state.over && guard++ < 4000) {
      const action = chooseAction(state);
      const res = applyAction(state, action);
      if (!res.ok) throw new Error(`AI chose an illegal action: ${JSON.stringify(action)} (${res.reason})`);
      for (const e of state.events) if (e.type === 'play') played[e.pid].add(e.id);
      state.log.length = 0;
      state.events.length = 0;
    }
    out.push({ a: job.a, b: job.b, first: job.first, winner: state.winner, turns: state.turn, played: played.map(p => [...p]) });
  }
  parentPort.postMessage(out);
}

function report(ids, results, seconds) {
  const wins = Object.fromEntries(ids.map(id => [id, 0]));
  const played = Object.fromEntries(ids.map(id => [id, 0]));
  const grid = {};
  let firstWins = 0, decided = 0, draws = 0, turns = 0;
  for (const r of results) {
    played[r.a]++; played[r.b]++;
    turns += r.turns;
    grid[r.a] ??= {}; grid[r.b] ??= {};
    grid[r.a][r.b] ??= [0, 0]; grid[r.b][r.a] ??= [0, 0];
    grid[r.a][r.b][1]++; grid[r.b][r.a][1]++;
    if (r.winner === 'draw') { draws++; wins[r.a] += 0.5; wins[r.b] += 0.5; continue; }
    const winnerId = r.winner === 0 ? r.a : r.b;
    const loserId = winnerId === r.a ? r.b : r.a;
    wins[winnerId]++;
    grid[winnerId][loserId][0]++;
    decided++;
    if (r.winner === r.first) firstWins++;
  }
  const pct = (w, n) => (n ? `${((100 * w) / n).toFixed(0)}%` : '  -');
  console.log(`\n${results.length} games in ${seconds.toFixed(1)}s · avg length ${(turns / results.length).toFixed(1)} turns · draws ${draws} · first player wins ${pct(firstWins, decided)}\n`);
  console.log('Deck            Win rate');
  for (const id of [...ids].sort((x, y) => wins[y] / (played[y] || 1) - wins[x] / (played[x] || 1))) {
    if (!played[id]) continue;
    const rate = wins[id] / played[id];
    console.log(`${id.padEnd(15)} ${pct(wins[id], played[id]).padStart(4)}  ${'█'.repeat(Math.round(rate * 40))}`);
  }
  const short = id => id.slice(0, 6).padStart(7);
  console.log(`\nMatchups (row deck's win rate vs column deck)\n${''.padEnd(12)}${ids.map(short).join('')}`);
  for (const r of ids) {
    if (!played[r]) continue;
    console.log(r.slice(0, 11).padEnd(12) + ids.map(c => (grid[r]?.[c] ? pct(...grid[r][c]).padStart(7) : '      ·')).join(''));
  }
}

async function cardReport(results) {
  const { CARDS, DECKS } = await import('../src/data/index.js');
  const stats = {};
  const deckWins = {}, deckGames = {};
  for (const r of results) {
    for (const side of [0, 1]) {
      const deck = side === 0 ? r.a : r.b;
      const won = r.winner === side ? 1 : r.winner === 'draw' ? 0.5 : 0;
      deckWins[deck] = (deckWins[deck] ?? 0) + won;
      deckGames[deck] = (deckGames[deck] ?? 0) + 1;
      for (const id of r.played[side]) {
        stats[id] ??= { w: 0, n: 0 };
        stats[id].w += won;
        stats[id].n++;
      }
    }
  }
  const rows = [];
  for (const d of DECKS) {
    if (!deckGames[d.id]) continue;
    const base = deckWins[d.id] / deckGames[d.id];
    for (const c of d.cards) {
      const st = stats[c.cardId];
      if (!st || st.n < 20) continue;
      rows.push({ deck: d.id, name: CARDS[c.cardId].displayName, cost: c.cost, rate: st.w / st.n, delta: st.w / st.n - base, playRate: st.n / deckGames[d.id] });
    }
  }
  rows.sort((x, y) => y.delta - x.delta);
  const line = r => `  ${(r.delta >= 0 ? '+' : '') + (100 * r.delta).toFixed(0)}%`.padEnd(8) + `${r.deck.padEnd(12)} ${r.cost}  ${r.name.padEnd(24)} played in ${(100 * r.playRate).toFixed(0)}% of games`;
  console.log('\nCards that over-perform their deck (win rate when played minus deck win rate):');
  rows.slice(0, 15).forEach(r => console.log(line(r)));
  console.log('\nCards that under-perform:');
  rows.slice(-15).forEach(r => console.log(line(r)));
  const unplayed = rows.filter(r => r.playRate < 0.15);
  if (unplayed.length) console.log(`\nRarely played (<15% of games): ${unplayed.map(r => r.name).join(', ')}`);
}
