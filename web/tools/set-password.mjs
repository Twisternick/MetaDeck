// Admin: set an account's password. It asks for the new password twice, showing a dot per character, so the
// password never appears on screen, in your shell history or in a process list.
//
//   npm run set-password -- <name> [--port 5180]
//
// While the server is running it goes through the server (with the admin token from data/admin-token,
// from this machine only); with no server running it edits data/accounts.json directly. Either way the
// account is signed out everywhere. Set DATA_DIR if the server uses another data folder.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAccounts, passwordError } from '../server/accounts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const args = process.argv.slice(2);
const name = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port');
const portArg = args.indexOf('--port') >= 0 ? Number(args[args.indexOf('--port') + 1]) : 0;
const ports = portArg ? [portArg] : [5180, 5173, 5181];

if (!name) {
  console.error('Usage: npm run set-password -- <name> [--port 5180]');
  process.exit(1);
}

// Read a line, showing a dot per character instead of the character. Terminal escape sequences (arrow
// keys, the markers some terminals wrap a paste in) are dropped rather than ending up in the password.
function ask(prompt) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY) return reject(new Error('Run this in a terminal, so the password can be typed at a hidden prompt.'));
    process.stdout.write(prompt);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');
    let value = '';
    let escape = null; // characters of an escape sequence being skipped
    const onData = chunk => {
      for (const ch of chunk) {
        if (escape !== null) {
          escape += ch;
          // ESC [ ... ends at a byte in @..~; ESC O x and ESC x are two or three bytes.
          const csi = escape.startsWith('[');
          if ((csi && escape.length > 1 && ch >= '@' && ch <= '~') || (!csi && (escape !== 'O' || escape.length > 1))) escape = null;
          continue;
        }
        if (ch === '\u001b') { escape = ''; continue; }
        if (ch === '\r' || ch === '\n') { if (value || ch === '\r') { done(); return; } continue; }
        if (ch === '\u0003') { done(); process.stdout.write('\n'); process.exit(130); }
        if (ch === '\u007f' || ch === '\b') { if (value) { value = value.slice(0, -1); process.stdout.write('\b \b'); } }
        else if (ch >= ' ') { value += ch; process.stdout.write('•'); }
      }
    };
    const done = () => {
      input.removeListener('data', onData);
      input.setRawMode(false);
      input.pause();
      process.stdout.write('\n');
      resolve(value);
    };
    input.on('data', onData);
  });
}

const password = await ask(`New password for ${name}: `).catch(err => { console.error(err.message); process.exit(1); });
const bad = passwordError(password);
if (bad) { console.error(bad); process.exit(1); }
console.log(`(${password.length} characters${password !== password.trim() ? ', including a space at the start or end' : ''})`);
if (await ask('Type it again: ') !== password) { console.error('The passwords don’t match. Nothing changed.'); process.exit(1); }

async function viaServer() {
  let token;
  try { token = fs.readFileSync(path.join(dataDir, 'admin-token'), 'utf8').trim(); } catch { return false; }
  for (const port of ports) {
    let res;
    try {
      res = await fetch(`http://localhost:${port}/api/account/password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: JSON.stringify({ name, password }),
      });
    } catch { continue; }
    const body = await res.json().catch(() => null);
    if (res.status === 403 || !body) continue; // another server, or one started with a different token
    if (!body.ok) { console.error(body.reason); process.exit(1); }
    console.log(`Password set for ${body.name} (via the server on port ${port}). It's signed out everywhere.`);
    return true;
  }
  return false;
}

if (!(await viaServer())) {
  const accounts = createAccounts({ file: path.join(dataDir, 'accounts.json') });
  const r = await accounts.setPassword(name, password);
  if (!r.ok) { console.error(r.reason); process.exit(1); }
  accounts.flush();
  console.log(`Password set for ${r.name} (server not running: edited data/accounts.json).`);
}
