// Shared by the admin tools: call the running server's /api/admin/<route> with the admin token it wrote
// to data/admin-token (accepted from this machine only). Tries the usual ports, or PORT / --port.
// Resolves to { status, body, port }, or null when no server with that token is running.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));

export async function adminCall(route, body = {}, args = process.argv.slice(2)) {
  let token;
  try { token = fs.readFileSync(path.join(dataDir, 'admin-token'), 'utf8').trim(); } catch { return null; }
  const i = args.indexOf('--port');
  const ports = i >= 0 ? [Number(args[i + 1])] : [...new Set([Number(process.env.PORT) || 5173, 5173, 5180, 5181])];
  for (const port of ports) {
    let res;
    try {
      res = await fetch(`http://localhost:${port}/api/admin/${route}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token }, body: JSON.stringify(body),
      });
    } catch { continue; } // nothing listening on that port
    if (res.status === 403) continue; // another server, or one started with a different token
    return { status: res.status, body: await res.json().catch(() => null), port };
  }
  return null;
}
