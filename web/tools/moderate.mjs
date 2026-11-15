// Admin: player reports, renames and bans.
//
//   npm run reports                          open reports, oldest first, with how many each player has against them
//   npm run moderate -- reports [--all]      the same (--all: resolved ones too)
//   npm run moderate -- resolve <id>         mark a report dealt with
//   npm run moderate -- rename <name> <new>  rename an account (friends, history and sessions follow it)
//   npm run moderate -- ban <name>           ban an account: signed out everywhere, can't sign in
//   npm run moderate -- unban <name>
//   npm run moderate -- founders             the Meta Founders, by number, and whether their Gems are paid
//   npm run moderate -- founder <name>       make an account a Meta Founder (the next number)
//   npm run moderate -- unfounder <name>     take it away (Gems already paid stay)
//   npm run moderate -- founders --reset     unmake every founder: run once before launch, so test accounts
//                                            don't use up the first 100 places
//
// While the server is running it asks the server (with the admin token, from this machine only), so the
// change takes effect at once; otherwise it edits the database directly. Set DATA_DIR if the server uses
// another data folder. Words that names may not contain can be added to DATA_DIR/blocked-names.txt.

import { adminCall, dataDir } from './admin-call.mjs';
import { accountsIn } from '../server/accounts.mjs';
import { createSocial } from '../server/social.mjs';

const argv = process.argv.slice(2);
const portAt = argv.indexOf('--port');
const [cmd = 'reports', a, b] = argv.filter((x, i) => !x.startsWith('--') && !(portAt >= 0 && i === portAt + 1));
const all = argv.includes('--all');

let local = null;
const offline = () => (local ??= (() => { const accounts = accountsIn(dataDir); return { accounts, social: createSocial({ accounts }) }; })());

async function call(route, body, direct) {
  const r = await adminCall(route, body);
  if (r) return r.body;
  const out = direct(offline());
  return out;
}

function usage() {
  console.error('Usage: npm run moderate -- reports [--all] | resolve <id> | rename <name> <new name> | ban <name> | unban <name> | founders [--reset] | founder <name> | unfounder <name>');
  process.exit(1);
}

switch (cmd) {
  case 'reports': {
    const r = await call('reports', { resolved: all }, ({ social }) => ({ ok: true, reports: social.reports({ resolved: all }) }));
    if (!r.reports.length) { console.log(all ? 'No resolved reports.' : 'No open reports.'); break; }
    for (const x of r.reports) {
      console.log(`#${x.id}  ${x.at.slice(0, 16).replace('T', ' ')}  ${x.reported_name} (${x.against} open)  ${x.reason}  by ${x.reporter ?? '(deleted account)'}`);
      if (x.note) console.log(`      "${x.note}"`);
    }
    console.log(`\nResolve one with: npm run moderate -- resolve <id>`);
    break;
  }
  case 'resolve': {
    if (!a) usage();
    const r = await call('resolve', { id: Number(a) }, ({ social }) => ({ ok: social.resolveReport(a) }));
    console.log(r.ok ? `Report #${a} resolved.` : `No report #${a}.`);
    break;
  }
  case 'rename': {
    if (!a || !b) usage();
    const r = await call('rename', { from: a, to: b }, ({ accounts }) => accounts.rename(a, b));
    console.log(r.ok ? `Renamed ${r.from} to ${r.to}.` : r.reason);
    if (!r.ok) process.exitCode = 1;
    break;
  }
  case 'ban':
  case 'unban': {
    if (!a) usage();
    const on = cmd === 'ban';
    const r = await call('ban', { name: a, on }, ({ accounts }) => accounts.setBanned(a, on));
    console.log(r.ok ? `${r.name} is ${r.banned ? 'banned' : 'no longer banned'}.` : r.reason);
    if (!r.ok) process.exitCode = 1;
    break;
  }
  case 'founders': {
    if (argv.includes('--reset')) {
      const r = await call('resetfounders', {}, ({ accounts }) => ({ ok: true, reset: accounts.resetFounders() }));
      console.log(`Unmade ${r.reset} founder${r.reset === 1 ? '' : 's'}. The next sign-up is Meta Founder #1.`);
      break;
    }
    const r = await call('founders', {}, ({ accounts }) => ({ ok: true, founders: accounts.founders() }));
    if (!r.founders.length) { console.log('No Meta Founders yet.'); break; }
    for (const f of r.founders) console.log(`#${String(f.n).padEnd(4)} ${f.name.padEnd(22)} ${f.created.slice(0, 10)}  Gems ${f.gems === 'paid' ? 'paid' : 'after 3 matches'}`);
    break;
  }
  case 'founder':
  case 'unfounder': {
    if (!a) usage();
    const on = cmd === 'founder';
    const r = await call('founder', { name: a, on }, ({ accounts }) => accounts.setFounder(a, on));
    console.log(!r.ok ? r.reason : on ? (r.changed ? `${r.name} is Meta Founder #${r.founder}.` : `${r.name} already is Meta Founder #${r.founder}.`) : `${r.name} is no longer a Meta Founder.`);
    if (!r.ok) process.exitCode = 1;
    break;
  }
  default: usage();
}
local?.accounts.close();
