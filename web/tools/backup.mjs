// Admin: back up the database now, or restore a backup.
//
//   npm run backup                    a copy in BACKUP_DIR (via the running server, or directly if it's stopped)
//   npm run backup -- --restore FILE  replace the database with FILE (stop the server first)
//
// The server also makes a copy every night by itself when BACKUP_DIR is set (see HOSTING.md).
// Backups are plain SQLite files named metadeck-YYYY-MM-DD.db.

import fs from 'node:fs';
import path from 'node:path';
import { adminCall, dataDir } from './admin-call.mjs';
import { openDb, backup } from '../server/db.mjs';

const args = process.argv.slice(2);
const live = path.join(dataDir, 'metadeck.db');

if (args.includes('--restore')) {
  const from = args[args.indexOf('--restore') + 1];
  if (!from || !fs.existsSync(from)) { console.error('Usage: npm run backup -- --restore <backup file>'); process.exit(1); }
  if (await adminCall('ping', {}, args)) { console.error('The server is running. Stop it first, then restore.'); process.exit(1); }
  openDb(from).close(); // checks it's a MetaDeck database (and brings an old one up to date)
  if (fs.existsSync(live)) {
    const keep = `${live}.before-restore-${Date.now()}`;
    fs.renameSync(live, keep);
    console.log(`The current database is kept as ${keep}`);
  }
  for (const ext of ['-wal', '-shm']) fs.rmSync(live + ext, { force: true });
  fs.copyFileSync(from, live);
  console.log(`Restored ${from}. Start the server again.`);
  process.exit(0);
}

const r = await adminCall('backup', {}, args);
if (r) {
  if (!r.body?.ok) { console.error(r.body?.reason ?? `Server answered ${r.status}`); process.exit(1); }
  console.log(`Backed up to ${r.body.file} (via the server on port ${r.port}).`);
} else {
  if (!process.env.BACKUP_DIR) { console.error('Set BACKUP_DIR to the folder for backups.'); process.exit(1); }
  if (!fs.existsSync(live)) { console.error(`No database at ${live}.`); process.exit(1); }
  const db = openDb(live);
  const file = backup(db, path.resolve(process.env.BACKUP_DIR), { force: true });
  db.close();
  console.log(`Backed up to ${file} (server not running).`);
}
