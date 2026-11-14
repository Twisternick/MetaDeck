// Admin: how the game is doing, from the database's analytics events and match history.
//
//   npm run report [-- --days 14]
//
// Per day: visitors (counted without cookies, so one person on two days counts twice), sign-ups, matches
// started in the browser by mode, matches the server recorded, and packs opened. Then retention for
// accounts: of the accounts made long enough ago, how many came back to play a recorded match on day 1
// and within days 2–7 after signing up. Safe to run while the server is running.

import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './admin-call.mjs';
import { openDb } from '../server/db.mjs';

const args = process.argv.slice(2);
const days = Math.max(1, Number(args[args.indexOf('--days') + 1]) || 14);
const file = path.join(dataDir, 'metadeck.db');
if (!fs.existsSync(file)) { console.error(`No database at ${file}. Start the server once first.`); process.exit(1); }
const db = openDb(file);

const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
const perDay = new Map();
const row = day => perDay.get(day) ?? perDay.set(day, { visitors: 0, signups: 0, ai: 0, online: 0, watch: 0, recorded: 0, packs: 0 }).get(day);
for (const r of db.prepare(`SELECT day, COUNT(DISTINCT visitor) AS n FROM events WHERE name = 'visit' AND day >= ? GROUP BY day`).all(since)) row(r.day).visitors = r.n;
for (const r of db.prepare(`SELECT day, COUNT(*) AS n FROM events WHERE name = 'signup' AND day >= ? GROUP BY day`).all(since)) row(r.day).signups = r.n;
for (const r of db.prepare(`SELECT day, json_extract(data, '$.mode') AS mode, COUNT(*) AS n FROM events WHERE name = 'match_start' AND day >= ? GROUP BY day, mode`).all(since)) {
  if (['ai', 'online', 'watch'].includes(r.mode)) row(r.day)[r.mode] = r.n;
}
for (const r of db.prepare(`SELECT day, COUNT(*) AS n FROM events WHERE name = 'pack_open' AND day >= ? GROUP BY day`).all(since)) row(r.day).packs = r.n;
for (const r of db.prepare(`SELECT substr(at, 1, 10) AS day, COUNT(*) AS n FROM matches WHERE at >= ? GROUP BY day`).all(since)) row(r.day).recorded = r.n;

const cols = ['day', 'visitors', 'signups', 'vs AI', 'online', 'watch', 'recorded', 'packs'];
const table = [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b))
  .map(([day, r]) => [day, r.visitors, r.signups, r.ai, r.online, r.watch, r.recorded, r.packs].map(String));
const widths = cols.map((c, i) => Math.max(c.length, ...table.map(t => t[i].length)));
const line = cells => cells.map((c, i) => (i ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join('  ');
console.log(`Last ${days} days (matches started are counted in the browser; recorded ones are those the server ran or checked)\n`);
console.log(line(cols));
for (const t of table) console.log(line(t));
if (!table.length) console.log('(no events yet)');

// Retention: did an account play a recorded match on the day after it was made, and in days 2–7?
const accounts = db.prepare('SELECT key, created FROM users').all();
const played = db.prepare('SELECT 1 FROM matches WHERE (p0 = ? OR p1 = ?) AND at >= ? AND at < ? LIMIT 1');
const day = 86_400_000;
const back = (u, from, to) => {
  const t = Date.parse(u.created);
  return !!played.get(u.key, u.key, new Date(t + from * day).toISOString(), new Date(t + to * day).toISOString());
};
const old1 = accounts.filter(u => Date.now() - Date.parse(u.created) > 2 * day);
const old7 = accounts.filter(u => Date.now() - Date.parse(u.created) > 8 * day);
const pct = (n, of) => (of ? `${Math.round((100 * n) / of)}% (${n} of ${of})` : 'not enough accounts yet');
// Gem purchases (server/payments.mjs) in the same period: completed, revenue per currency, and reversals.
const bought = db.prepare(`SELECT status, currency, COUNT(*) AS n, SUM(CAST(amount AS INTEGER)) AS total
  FROM purchases WHERE created >= ? AND status != 'pending' GROUP BY status, currency`).all(since);
if (bought.length) {
  console.log('\nGem purchases');
  for (const r of bought) console.log(`  ${r.status.padEnd(16)} ${String(r.n).padStart(4)}  ${((r.total ?? 0) / 100).toFixed(2)} ${r.currency ?? ''}`);
}

console.log(`\nAccounts: ${accounts.length}`);
console.log(`Back on day 1:     ${pct(old1.filter(u => back(u, 1, 2)).length, old1.length)}`);
console.log(`Back in days 2–7:  ${pct(old7.filter(u => back(u, 2, 8)).length, old7.length)}`);
db.close();
