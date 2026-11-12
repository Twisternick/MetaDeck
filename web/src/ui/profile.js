// The player's profile (collection, currencies, quests, season, cosmetics) and their account.
// Signed in, the profile lives on the server (server/accounts.mjs): every change is a named operation the
// server applies, so cards and purchases follow the account and can't be edited in the browser. As a
// guest, the same operations run on a profile kept in this browser's localStorage.
// The rules live in data/economy.js; this file also draws the shared wallet bar.

import { h, storage } from './dom.js';
import { normalizeProfile, runOp, unopenedPacks, seasonTier } from '../data/economy.js';

const KEY = 'metadeck.profile';
let current = null;
let account = null;   // { name } while signed in
let serverTestPurchases = false;

export const signedIn = () => account;
export function profile() {
  if (!current) { current = normalizeProfile(storage.get(KEY, null)); saveLocal(); }
  return current;
}
const saveLocal = () => { if (!account) storage.set(KEY, current); };

function refreshWallets() {
  for (const el of document.querySelectorAll('.wallet')) el.replaceWith(walletBar({ ...el._opts, quiet: true }));
}

async function api(path, body) {
  const res = await fetch(`/api/account/${path}`, body === undefined
    ? { credentials: 'same-origin' }
    : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data = null;
  try { data = await res.json(); } catch { /* not our server */ }
  return { status: res.status, data: data ?? { ok: false, reason: 'The server didn’t answer. Accounts need `npm start`.' } };
}

function adopt(data) {
  account = { name: data.name };
  current = normalizeProfile(data.profile);
  serverTestPurchases = !!data.testPurchases;
  refreshWallets();
}

// Called once at startup: picks up an existing session, or stays a guest (also on a static host).
export async function initAccount() {
  try {
    const { status, data } = await api('me');
    if (status === 200 && data.ok) adopt(data);
  } catch { /* offline or no server: guest */ }
}

export async function signUp(name, password) { return authenticate('signup', name, password); }
export async function signIn(name, password) { return authenticate('signin', name, password); }
async function authenticate(path, name, password) {
  try {
    const { data } = await api(path, { name, password });
    if (data.ok) adopt(data);
    return data;
  } catch {
    return { ok: false, reason: 'Can’t reach the server. Accounts need `npm start`.' };
  }
}

export async function signOut() {
  try { await api('signout', {}); } catch { /* signed out locally anyway */ }
  account = null;
  current = null;
  serverTestPurchases = false;
  refreshWallets();
}

// Re-read the account's profile (after the server changed it, e.g. online match rewards).
export async function reload() {
  if (!account) return;
  const { status, data } = await api('me');
  if (status === 200 && data.ok) adopt(data); else if (status === 401) { account = null; current = null; refreshWallets(); }
}

// Apply one economy operation (see OPS in data/economy.js). Resolves to its result: { ok, reason?, ... }.
export async function act(op, args = {}) {
  if (!account) {
    const result = runOp(profile(), op, args, { testPurchases: testPurchasesAllowed() });
    saveLocal();
    refreshWallets();
    return result;
  }
  try {
    const { status, data } = await api('act', { op, args });
    if (data.profile) current = normalizeProfile(data.profile);
    if (status === 401) { account = null; current = null; }
    refreshWallets();
    return data;
  } catch {
    return { ok: false, reason: 'Can’t reach the server. Check your connection.' };
  }
}

// Real payments are not connected. On a local or test host the shop can credit Gems as a clearly
// labelled test purchase, so the whole flow can be tried without charging anyone. For an account the
// server decides (only for a browser on the machine running it).
export const testPurchasesAllowed = () => {
  if (account) return serverTestPurchases;
  const host = location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost') || host.endsWith('.test');
};

const fmt = n => n.toLocaleString();

// Gold · Gems · Dust, the account, plus quick links. `nav` is { shop, collection, season, account } callbacks.
export function walletBar(opts = {}) {
  const p = profile();
  const packs = unopenedPacks(p);
  const quests = p.quests.length;
  const nav = opts.nav ?? {};
  const coin = (cls, icon, value, label) => h('span', { class: `coin ${cls}`, 'data-tip': label, 'data-tip-title': `${icon} ${label.split(':')[0]}` },
    h('i', { 'aria-hidden': 'true' }, icon), h('b', null, fmt(value)));
  const el = h('div', { class: `wallet${opts.quiet ? '' : ' rise'}` },
    coin('gold', '🪙', p.gold, 'Gold: earned by winning, quests and the season track. Buys packs.'),
    coin('gems', '💎', p.gems, 'Gems: the premium currency. Buys packs, cosmetics and the premium season track.'),
    coin('dust', '✨', p.dust, 'Dust: from duplicates and disenchanting. Crafts any card.'),
    h('span', { class: 'wallet-nav' },
      // badges sit beside the button, not inside it: .btn clips its children for the ripple
      nav.season ? h('span', { class: 'nav-slot' },
        h('button', { class: 'btn ghost small', onclick: nav.season }, `Season · Tier ${seasonTier(p)}`),
        quests ? h('span', { class: 'nav-badge' }, quests) : null) : null,
      nav.collection ? h('span', { class: 'nav-slot' },
        h('button', { class: 'btn ghost small', onclick: nav.collection }, 'Collection'),
        packs ? h('span', { class: 'nav-badge' }, packs) : null) : null,
      nav.shop ? h('button', { class: 'btn primary small', onclick: nav.shop }, 'Shop') : null,
      nav.account ? h('button', {
        class: `btn small account-btn${account ? ' ghost' : ' guest'}`, onclick: nav.account,
        title: account ? 'Your account' : 'Playing as a guest: progress stays in this browser',
      }, account ? `👤 ${account.name}` : 'Sign in') : null));
  el._opts = opts;
  return el;
}
