// The server's database: one SQLite file (data/metadeck.db, or DATA_DIR) through Node's built-in
// node:sqlite, so the project still has no dependencies. WAL mode lets backups and admin tools read it
// while the server writes.
//
// Tables:
//   users     one row per account: name, password hash, recovery-code hash, birth year, and the economy profile (JSON)
//   sessions  signed-in devices, by SHA-256 of the session token (the database never holds a live token)
//   tickets   the vs-AI match each account is playing (server/ai-match.mjs)
//   matches   every finished match the server ran or checked, for history, stats and ranked
//   events    the cookieless analytics funnel (server/telemetry.mjs)
//   friends   friend requests (pending) and friendships (one accepted row each way)
//   blocks    who blocked whom: never matched, no requests or challenges
//   reports   players reported by other players, for the operator (npm run reports)
//
// Schema changes are numbered steps in MIGRATIONS, tracked by PRAGMA user_version: add a step, never
// edit one that has shipped.

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = [
  `CREATE TABLE users (
     key TEXT PRIMARY KEY, name TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL,
     recovery TEXT, created TEXT NOT NULL, profile TEXT NOT NULL
   );
   CREATE TABLE sessions (
     hash TEXT PRIMARY KEY, user TEXT NOT NULL REFERENCES users(key) ON DELETE CASCADE, expires INTEGER NOT NULL
   );
   CREATE INDEX sessions_user ON sessions(user);
   CREATE TABLE tickets (
     user TEXT PRIMARY KEY REFERENCES users(key) ON DELETE CASCADE, id TEXT NOT NULL, data TEXT NOT NULL, expires INTEGER NOT NULL
   );
   CREATE TABLE matches (
     id INTEGER PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL,
     p0 TEXT, p1 TEXT, deck0 TEXT NOT NULL, deck1 TEXT NOT NULL,
     winner INTEGER, turns INTEGER NOT NULL, seconds INTEGER, ending TEXT NOT NULL
   );
   CREATE INDEX matches_p0 ON matches(p0, at);
   CREATE INDEX matches_p1 ON matches(p1, at);
   CREATE TABLE events (
     id INTEGER PRIMARY KEY, at TEXT NOT NULL, day TEXT NOT NULL, visitor TEXT, user TEXT, name TEXT NOT NULL, data TEXT
   );
   CREATE INDEX events_name ON events(name, day);`,
  // 2: the birth year asked at sign-up (null for accounts made before the age check).
  `ALTER TABLE users ADD COLUMN birth_year INTEGER;`,
  // 3: ranked play (hidden Glicko-2 rating, visible rank), bans, friends, blocks and reports.
  `ALTER TABLE users ADD COLUMN rating REAL NOT NULL DEFAULT 1500;
   ALTER TABLE users ADD COLUMN rd REAL NOT NULL DEFAULT 350;
   ALTER TABLE users ADD COLUMN vol REAL NOT NULL DEFAULT 0.06;
   ALTER TABLE users ADD COLUMN rank TEXT;
   ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE matches ADD COLUMN rated INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE matches ADD COLUMN stars0 INTEGER;
   ALTER TABLE matches ADD COLUMN stars1 INTEGER;
   CREATE TABLE friends (
     user TEXT NOT NULL REFERENCES users(key) ON DELETE CASCADE, friend TEXT NOT NULL REFERENCES users(key) ON DELETE CASCADE,
     status TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (user, friend)
   );
   CREATE INDEX friends_friend ON friends(friend);
   CREATE TABLE blocks (
     user TEXT NOT NULL REFERENCES users(key) ON DELETE CASCADE, blocked TEXT NOT NULL REFERENCES users(key) ON DELETE CASCADE,
     at TEXT NOT NULL, PRIMARY KEY (user, blocked)
   );
   CREATE INDEX blocks_blocked ON blocks(blocked);
   CREATE TABLE reports (
     id INTEGER PRIMARY KEY, at TEXT NOT NULL, reporter TEXT, reported TEXT, reported_name TEXT NOT NULL,
     reason TEXT NOT NULL, note TEXT, resolved INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX reports_open ON reports(resolved, at);`,
];

// Open (or create) the database and bring its schema up to date. `file` null or ':memory:' keeps it in memory.
export function openDb(file) {
  const memory = !file || file === ':memory:';
  if (!memory) fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(memory ? ':memory:' : file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  if (!memory) db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  const version = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = version; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Database migration ${v + 1} failed: ${err.message}`);
    }
  }
  return db;
}

// Run fn inside one transaction; it commits if fn returns and rolls back if it throws.
export function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Record a finished match. `players` are account keys (null for a guest or the AI), `winner` 0, 1 or
// null for a draw, `ending` how it ended: 'hero' (a hero fell), 'left', 'disconnected' or 'inactive'.
// A ranked match also has `stars`: each seat's rank change. Returns the match's id.
export function logMatch(db, { kind, players, decks, winner, turns, seconds = null, ending = 'hero', at = new Date(), rated = false, stars = [null, null] }) {
  return Number(db.prepare(`INSERT INTO matches (at, kind, p0, p1, deck0, deck1, winner, turns, seconds, ending, rated, stars0, stars1)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(at.toISOString(), kind, players[0] ?? null, players[1] ?? null, decks[0], decks[1],
      winner === 0 || winner === 1 ? winner : null, turns, seconds, ending, rated ? 1 : 0, stars[0] ?? null, stars[1] ?? null).lastInsertRowid);
}

// Copy the live database to <dir>/metadeck-YYYY-MM-DD.db (a consistent snapshot, safe while the server
// runs) and delete copies older than `keepDays`. Returns the new file's path, or null if today's exists.
export function backup(db, dir, { keepDays = 14, now = new Date(), force = false } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const day = now.toISOString().slice(0, 10);
  const file = path.join(dir, `metadeck-${day}.db`);
  if (fs.existsSync(file)) {
    if (!force) return null;
    fs.rmSync(file);
  }
  db.prepare('VACUUM INTO ?').run(file);
  const cutoff = new Date(now.getTime() - keepDays * 86_400_000).toISOString().slice(0, 10);
  for (const f of fs.readdirSync(dir)) {
    const m = /^metadeck-(\d{4}-\d{2}-\d{2})\.db$/.exec(f);
    if (m && m[1] < cutoff) fs.rmSync(path.join(dir, f), { force: true });
  }
  return file;
}
