// Admin: how many players MetaDeck has, and who is online right now.
//
//   npm run users [-- --list] [--port 5180]
//
// While the server is running it asks the server (with the admin token from data/admin-token, from this
// machine only), which also knows who is connected. With no server running it reads data/metadeck.db.
// --list prints every account, newest first. Set DATA_DIR if the server uses another data folder.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { accountsIn } from '../server/accounts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const args = process.argv.slice(2);
const list = args.includes('--list');
const portArg = args.indexOf('--port') >= 0 ? Number(args[args.indexOf('--port') + 1]) : 0;
const ports = portArg ? [portArg] : [5180, 5173, 5181];

async function viaServer() {
  let token;
  try { token = fs.readFileSync(path.join(dataDir, 'admin-token'), 'utf8').trim(); } catch { return null; }
  for (const port of ports) {
    let res;
    try {
      res = await fetch(`http://localhost:${port}/api/account/stats`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: '{}',
      });
    } catch { continue; } // nothing listening on that port
    const body = await res.json().catch(() => null);
    if (res.status === 403 || !body?.ok) continue; // another server, or one started with a different token
    return { ...body, port };
  }
  return null;
}

const s = (await viaServer()) ?? { ...accountsIn(dataDir).stats(), online: null };

console.log(`Accounts:   ${s.accounts}  (${s.new24h} new in the last 24 hours, ${s.new7d} in the last 7 days)`);
console.log(`Signed in:  ${s.signedIn}  (accounts with a session that hasn't expired, up to 30 days old)`);
console.log(s.online
  ? `Online now: ${s.online.players} connected · ${s.online.rooms} matches in progress · ${s.online.queue} in the queue  (server on port ${s.port})`
  : 'Online now: unknown (server not running: read data/metadeck.db)');

if (list) {
  console.log('');
  for (const u of s.users) console.log(`  ${u.name.padEnd(20)} joined ${u.created.slice(0, 10)}  ${String(u.games).padStart(5)} games${u.signedIn ? '  · signed in' : ''}`);
}
