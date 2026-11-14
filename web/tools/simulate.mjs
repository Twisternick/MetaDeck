// Balance simulator: AI-vs-AI round robin between every pair of decks (mirrors excluded).
//
//   node tools/simulate.mjs [--games 20] [--deck FPS] [--seed 1] [--variants] [--cards] [--json out.json]
//
// By default the decks are the ten archetype pools. --variants plays every starter variant instead: each one
// against the other themes' variants and against its own theme's other variants. Win rates then count only
// games against other themes, and a second grid shows each theme's variants against each other.
// --games is per pairing, split evenly so each deck goes first half the time.
// Prints each deck's overall win rate, the full matchup grid, first-player win rate and game length.
// --cards adds each card's "win rate when played" against its deck's win rate from the same turn and lead (see
// src/engine/card-stats.js). The outliers are the cards most worth re-costing.

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
  const { DECKS, deckList, starterDecks } = await import('../src/data/index.js');
  const games = Number(args.games ?? 20);
  const baseSeed = Number(args.seed ?? 1);
  // Each deck: { key, arch, name, cards }. Keys are the archetype id, or 'FPS:starter:0' for a variant.
  const decks = 'variants' in args
    ? DECKS.flatMap(d => starterDecks(d.id).map(s => ({ key: s.key, arch: d.id, name: s.name, cards: s.cards })))
    : DECKS.map(d => ({ key: d.id, arch: d.id, name: d.id, cards: deckList(d.id) }));
  const ids = decks.map(d => d.key);
  const byKey = Object.fromEntries(decks.map(d => [d.key, d]));
  const jobs = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (args.deck && decks[i].arch !== args.deck && decks[j].arch !== args.deck) continue;
      for (let g = 0; g < games; g++) jobs.push({ a: ids[i], b: ids[j], aArch: decks[i].arch, bArch: decks[j].arch, aCards: decks[i].cards, bCards: decks[j].cards, first: g % 2, seed: baseSeed * 100003 + jobs.length });
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

  report(ids, byKey, results, (Date.now() - started) / 1000);
  await snowballReport(ids, byKey, results);
  if ('cards' in args) await cardReport(results, byKey);
  if (args.json) fs.writeFileSync(args.json, JSON.stringify(results));
}

async function work() {
  const { createGame, applyAction } = await import('../src/engine/game.js');
  const { chooseAction } = await import('../src/engine/ai.js');
  const { leadTracker } = await import('../src/engine/snowball.js');
  const out = [];
  for (const job of workerData) {
    const state = createGame({ decks: [job.aCards, job.bCards], deckIds: [job.aArch, job.bArch], seed: job.seed, firstPlayer: job.first });
    const played = [new Map(), new Map()]; // card id -> turn it was first played
    const lead = leadTracker();
    let guard = 0;
    while (!state.over && guard++ < 4000) {
      const action = chooseAction(state);
      const res = applyAction(state, action);
      if (!res.ok) throw new Error(`AI chose an illegal action: ${JSON.stringify(action)} (${res.reason})`);
      for (const e of state.events) if (e.type === 'play' && !played[e.pid].has(e.id)) played[e.pid].set(e.id, state.turn);
      lead.watch(state);
      state.log.length = 0;
      state.events.length = 0;
    }
    out.push({ a: job.a, b: job.b, first: job.first, winner: state.winner, turns: state.turn, played: played.map(p => [...p]), ...lead.result() });
  }
  parentPort.postMessage(out);
}

function report(ids, byKey, results, seconds) {
  const sameTheme = (x, y) => byKey[x].arch === byKey[y].arch;
  // wins / played count only games against other themes; same-theme games go in the grid alone.
  const wins = Object.fromEntries(ids.map(id => [id, 0]));
  const played = Object.fromEntries(ids.map(id => [id, 0]));
  const grid = {};
  let firstWins = 0, decided = 0, draws = 0, turns = 0;
  for (const r of results) {
    const cross = !sameTheme(r.a, r.b);
    if (cross) { played[r.a]++; played[r.b]++; }
    turns += r.turns;
    grid[r.a] ??= {}; grid[r.b] ??= {};
    grid[r.a][r.b] ??= [0, 0]; grid[r.b][r.a] ??= [0, 0];
    grid[r.a][r.b][1]++; grid[r.b][r.a][1]++;
    if (r.winner === 'draw') { draws++; if (cross) { wins[r.a] += 0.5; wins[r.b] += 0.5; } continue; }
    const winnerId = r.winner === 0 ? r.a : r.b;
    const loserId = winnerId === r.a ? r.b : r.a;
    if (cross) wins[winnerId]++;
    grid[winnerId][loserId][0]++;
    decided++;
    if (r.winner === r.first) firstWins++;
  }
  const pct = (w, n) => (n ? `${((100 * w) / n).toFixed(0)}%` : '  -');
  console.log(`\n${results.length} games in ${seconds.toFixed(1)}s · avg length ${(turns / results.length).toFixed(1)} turns · draws ${draws} · first player wins ${pct(firstWins, decided)}\n`);
  const name = id => (byKey[id].name === byKey[id].arch ? id : `${byKey[id].name} (${byKey[id].arch})`);
  const w = Math.max(15, ...ids.map(id => name(id).length));
  console.log(`${'Deck'.padEnd(w)} Win rate${ids.length > 10 ? ' (vs other themes)' : ''}`);
  for (const id of [...ids].sort((x, y) => wins[y] / (played[y] || 1) - wins[x] / (played[x] || 1))) {
    if (!played[id]) continue;
    const rate = wins[id] / played[id];
    console.log(`${name(id).padEnd(w)} ${pct(wins[id], played[id]).padStart(4)}  ${'█'.repeat(Math.round(rate * 40))}`);
  }
  const short = id => byKey[id].name.slice(0, 6).padStart(7);
  console.log(`\nMatchups (row deck's win rate vs column deck)\n${''.padEnd(12)}${ids.map(short).join('')}`);
  for (const r of ids) {
    if (!grid[r]) continue;
    console.log(byKey[r].name.slice(0, 11).padEnd(12) + ids.map(c => (grid[r]?.[c] ? pct(...grid[r][c]).padStart(7) : '      ·')).join(''));
  }
  const archs = [...new Set(ids.map(id => byKey[id].arch))].filter(a => ids.filter(id => byKey[id].arch === a).length > 1);
  if (!archs.length) return;
  console.log('\nWithin each theme (row variant vs column variant · its win rate vs other themes)');
  for (const a of archs) {
    const vs = ids.filter(id => byKey[id].arch === a && grid[id]);
    if (!vs.length) continue;
    console.log(`\n${a}\n${''.padEnd(20)}${vs.map(short).join('')}`);
    for (const r of vs) {
      console.log(byKey[r].name.slice(0, 19).padEnd(20) + vs.map(c => (r === c ? '      ·' : grid[r][c] ? pct(...grid[r][c]).padStart(7) : '      -')).join('') + `   ${pct(wins[r], played[r])}`);
    }
  }
}

// How often the side ahead at turns 6 / 8 / 12 goes on to win, overall and per deck (see src/engine/snowball.js).
async function snowballReport(ids, byKey, results) {
  const { LEAD_TURNS, LEAD_MIN, newLeadTally, tallyLead } = await import('../src/engine/snowball.js');
  const t = newLeadTally();
  for (const r of results) tallyLead(t, r);
  if (!t.games) return;
  const pct = c => (c ? `${((100 * c[0]) / c[1]).toFixed(0)}%` : '-');
  console.log(`\nSnowball (a lead is ${LEAD_MIN}+ points) · ${(t.flips / t.games).toFixed(1)} lead changes per game · ${pct([t.flipless, t.games])} of games never change lead`);
  console.log(`Leader wins: ${LEAD_TURNS.map(turn => `turn ${turn} ${pct(t.all[turn])}`).join(' · ')}`);
  console.log(`${'Deck'.padEnd(15)}${LEAD_TURNS.map(turn => `lead T${turn}`.padStart(9)).join('')}${LEAD_TURNS.map(turn => `back T${turn}`.padStart(9)).join('')}`);
  for (const id of ids) {
    if (!t.lead[id] && !t.behind[id]) continue;
    console.log(byKey[id].name.slice(0, 14).padEnd(15) + LEAD_TURNS.map(turn => pct(t.lead[id]?.[turn]).padStart(9)).join('') + LEAD_TURNS.map(turn => pct(t.behind[id]?.[turn]).padStart(9)).join(''));
  }
}

async function cardReport(results, byKey) {
  const { CARDS, DECKS } = await import('../src/data/index.js');
  const { newCardTally, tallyCards, cardImpact } = await import('../src/engine/card-stats.js');
  const t = newCardTally();
  const deckGames = {}; // per archetype
  for (const r of results) {
    const deckOf = side => byKey[side === 0 ? r.a : r.b].arch;
    for (const side of [0, 1]) deckGames[deckOf(side)] = (deckGames[deckOf(side)] ?? 0) + 1;
    tallyCards(t, r, deckOf);
  }
  const impact = cardImpact(t);
  const rows = [];
  for (const d of DECKS) {
    if (!deckGames[d.id]) continue;
    for (const c of d.cards) {
      const st = impact[c.cardId];
      if (!st || st.n < 20) continue;
      rows.push({ deck: d.id, name: CARDS[c.cardId].displayName, cost: c.cost, delta: st.delta, playRate: st.n / deckGames[d.id] });
    }
  }
  rows.sort((x, y) => y.delta - x.delta);
  const line = r => `  ${(r.delta >= 0 ? '+' : '') + (100 * r.delta).toFixed(0)}%`.padEnd(8) + `${r.deck.padEnd(12)} ${r.cost}  ${r.name.padEnd(24)} played in ${(100 * r.playRate).toFixed(0)}% of games`;
  console.log('\nCards that over-perform their deck (win rate when played minus the deck\'s win rate from the same turn and lead):');
  rows.slice(0, 15).forEach(r => console.log(line(r)));
  console.log('\nCards that under-perform:');
  rows.slice(-15).forEach(r => console.log(line(r)));
  const unplayed = rows.filter(r => r.playRate < 0.15);
  if (unplayed.length) console.log(`\nRarely played (<15% of games): ${unplayed.map(r => r.name).join(', ')}`);
}
