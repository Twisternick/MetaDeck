// Admin: get the running server ready to restart for an update.
//
//   npm run maintenance -- [minutes] [--stay] [--port 5173]
//
// Everyone connected is told the server is restarting; no new online match can start, and players
// waiting in the queue or in a room are sent back to the lobby. Once no match is still being played
// (or after twice the warning time, at the latest) the server exits, and the supervisor in HOSTING.md
// (tools/windows/run-server.cmd) starts it again with the new code. --stay keeps the server running and
// only logs that it's safe to restart. `minutes` defaults to 5; 0 restarts as soon as no match is running.
//
// Update steps: git pull, then npm run maintenance.

import { adminCall } from './admin-call.mjs';

const args = process.argv.slice(2);
const minutes = Number(args.find(a => /^\d+(\.\d+)?$/.test(a)) ?? 5);
const r = await adminCall('maintenance', { minutes, exit: !args.includes('--stay') }, args);
if (!r) { console.error('No MetaDeck server is running on this machine (or it was started with another DATA_DIR).'); process.exit(1); }
if (!r.body?.ok) { console.error(r.body?.reason ?? `Server answered ${r.status}`); process.exit(1); }
const { started, matches } = r.body;
console.log(started
  ? `Maintenance started on port ${r.port}: players warned, no new matches. ${matches ? `Waiting for ${matches} match${matches === 1 ? '' : 'es'} to finish.` : 'No matches running.'}`
  : 'Maintenance was already under way.');
console.log(args.includes('--stay') ? 'The server log says when it is safe to restart.' : 'The server exits once no match is running; the supervisor restarts it.');
