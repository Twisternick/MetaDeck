// Admin: add Gold, Gems or Dust to an account.
//
//   npm run grant -- <name> [--gold N] [--gems N] [--dust N] [--port 5173]
//
// While the server is running it asks the server (with the admin token it wrote to data/admin-token,
// from this machine only), so the change lands in the live account. With no server running, it edits
// data/accounts.json directly. Set DATA_DIR if the server uses another data folder.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAccounts } from '../server/accounts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const args = process.argv.slice(2);
const name = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a));
const flag = f => { const i = args.indexOf(`--${f}`); return i >= 0 ? Number(args[i + 1]) : 0; };
const amounts = { gold: flag('gold'), gems: flag('gems'), dust: flag('dust') };
const ports = flag('port') ? [flag('port')] : [5173, 5181, ...[...new Set([process.env.PORT].filter(Boolean).map(Number))]];

if (!name || Object.values(amounts).some(n => !Number.isFinite(n))) {
  console.error('Usage: npm run grant -- <name> [--gold N] [--gems N] [--dust N] [--port 5173]');
  process.exit(1);
}

const show = r => console.log(`${r.name}: ${r.gold.toLocaleString()} Gold · ${r.gems.toLocaleString()} Gems · ${r.dust.toLocaleString()} Dust`);

async function viaServer() {
  let token;
  try { token = fs.readFileSync(path.join(dataDir, 'admin-token'), 'utf8').trim(); } catch { return false; }
  for (const port of ports) {
    let res;
    try {
      res = await fetch(`http://localhost:${port}/api/account/grant`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: JSON.stringify({ name, ...amounts }),
      });
    } catch { continue; } // nothing listening on that port
    const body = await res.json().catch(() => null);
    if (res.status === 403 || !body) continue; // another server, or one started with a different token
    if (!body.ok) { console.error(body.reason); process.exit(1); }
    show(body);
    console.log(`(via the server on port ${port})`);
    return true;
  }
  return false;
}

if (!(await viaServer())) {
  const accounts = createAccounts({ file: path.join(dataDir, 'accounts.json') });
  const r = accounts.grant(name, amounts);
  if (!r) {
    const names = accounts.names();
    console.error(`No account named "${name}".${names.length ? ` Accounts: ${names.join(', ')}` : ' Create one in the game first (Sign in → Create account).'}`);
    process.exit(1);
  }
  accounts.flush();
  show(r);
  console.log('(server not running: edited data/accounts.json)');
}
