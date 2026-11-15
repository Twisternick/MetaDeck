// Admin: player feedback from the game's Feedback dialog.
//
//   npm run feedback                       open feedback, oldest first
//   npm run feedback -- --all              resolved feedback too
//   npm run feedback -- --kind bug         only one kind (bug, idea, balance, other)
//   npm run feedback -- done <id> [<id>…]  mark feedback dealt with
//
// While the server is running it asks the server (with the admin token, from this machine only);
// otherwise it reads the database directly. Set DATA_DIR if the server uses another data folder.

import path from 'node:path';
import { adminCall, dataDir } from './admin-call.mjs';
import { openDb } from '../server/db.mjs';
import { createFeedback, FEEDBACK_KINDS } from '../server/feedback.mjs';

const argv = process.argv.slice(2);
const flag = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const args = argv.filter((x, i) => !x.startsWith('--') && !['--port', '--kind'].includes(argv[i - 1]));
const all = argv.includes('--all');
const kind = flag('--kind');
if (kind && !Object.hasOwn(FEEDBACK_KINDS, kind)) { console.error(`--kind is one of: ${Object.keys(FEEDBACK_KINDS).join(', ')}`); process.exit(1); }

let db = null;
const offline = () => createFeedback({ db: (db ??= openDb(path.join(dataDir, 'metadeck.db'))) });

async function call(route, body, direct) {
  const r = await adminCall(route, body);
  return r ? r.body : direct(offline());
}

if (args[0] === 'done') {
  const ids = args.slice(1);
  if (!ids.length) { console.error('Usage: npm run feedback -- done <id> [<id>…]'); process.exit(1); }
  for (const id of ids) {
    const r = await call('feedbackdone', { id: Number(id) }, f => ({ ok: f.resolve(id) }));
    console.log(r.ok ? `Feedback #${id} resolved.` : `No feedback #${id}.`);
  }
} else if (args.length) {
  console.error('Usage: npm run feedback [-- --all] [--kind bug|idea|balance|other] | done <id> [<id>…]');
  process.exit(1);
} else {
  const r = await call('feedback', { resolved: all }, f => ({ ok: true, feedback: f.list({ resolved: all }) }));
  const rows = r.feedback.filter(x => !kind || x.kind === kind);
  if (!rows.length) console.log(all ? 'No resolved feedback.' : 'No open feedback.');
  for (const x of rows) {
    const where = [x.screen && `on ${x.screen}`, x.version && `v${x.version}`].filter(Boolean).join(', ');
    console.log(`#${x.id}  ${x.at.slice(0, 16).replace('T', ' ')}  ${FEEDBACK_KINDS[x.kind] ?? x.kind}  from ${x.user_name ?? 'a guest'}${where ? `  (${where})` : ''}`);
    for (const line of x.message.split('\n')) console.log(`      ${line}`);
  }
  if (rows.length && !all) console.log(`\n${rows.length} open. Resolve with: npm run feedback -- done <id>`);
}
db?.close();
