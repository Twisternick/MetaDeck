// The player's profile (collection, currencies, quests, season, cosmetics) and their account.
// Signed in, the profile lives on the server (server/accounts.mjs): every change is a named operation the
// server applies, so cards and purchases follow the account and can't be edited in the browser. As a
// guest, the same operations run on a profile kept in this browser's localStorage.
// The rules live in data/economy.js; this file also draws the shared wallet bar.

import { h, storage } from './dom.js';
import { normalizeProfile, runOp, unopenedPacks, seasonTier } from '../data/economy.js';

const KEY = 'metadeck.profile';
let current = null;
let account = null;   // { name, created, recovery, devices } while signed in
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
  account = { name: data.name, ...data.info, rank: data.rank ?? null };
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

// Each resolves to the server's answer: { ok, reason? , ... }. Sign-up and reset also carry the
// account's new `recoveryCode`, for the player to save.
export async function signUp(name, password, birthYear) { return authenticate('signup', { name, password, birthYear }); }
export async function signIn(name, password) { return authenticate('signin', { name, password }); }
export async function resetPassword(name, code, password) { return authenticate('reset', { name, code, password }); }
async function authenticate(path, body) {
  try {
    const { data } = await api(path, body);
    if (data.ok) adopt(data);
    return data;
  } catch {
    return { ok: false, reason: 'Can’t reach the server. Accounts need `npm start`.' };
  }
}

// Account management while signed in. A 401 means the session ended elsewhere: drop to guest.
// Signed-in GET endpoints (friends, history, leaderboard). A 401 drops to guest.
async function fetchJson(path) {
  try {
    const { status, data } = await api(path);
    if (status === 401) forget();
    return data;
  } catch {
    return { ok: false, reason: 'Can’t reach the server. Check your connection.' };
  }
}

// Friends, blocks and reports (server/social.mjs), match history and the ranked leaderboard.
export const friendsList = () => fetchJson('friends');
export const matchHistory = () => fetchJson('history');
export const leaderboard = () => fetchJson('leaderboard');
export const addFriend = name => manage('friend', { name });
export const removeFriend = name => manage('unfriend', { name });
export const blockPlayer = name => manage('block', { name });
export const unblockPlayer = name => manage('unblock', { name });
export const reportPlayer = (name, reason, note) => manage('report', { name, reason, note });
export async function seasonSeen() {
  const r = await manage('seasonseen');
  if (r.ok && account?.rank) delete account.rank.notice;
  return r;
}

async function manage(path, body = {}) {
  try {
    const { status, data } = await api(path, body);
    if (status === 401) forget();
    return data;
  } catch {
    return { ok: false, reason: 'Can’t reach the server. Check your connection.' };
  }
}
export async function changePassword(current, password) {
  const r = await manage('newpassword', { current, password });
  if (r.ok && account) account.devices = 1;
  return r;
}
export async function newRecoveryCode(password) {
  const r = await manage('recovery', { password });
  if (r.ok && account) account.recovery = true;
  return r;
}
// For an account made before sign-up asked for a birth year. An under-age answer signs the account out.
export async function setBirthYear(year) {
  const r = await manage('birthyear', { year });
  if (r.ok && account) account.birthYear = year;
  if (r.tooYoung) forget();
  return r;
}
// Download everything the server stores about the account, as a JSON file.
export async function downloadMyData() {
  try {
    const res = await fetch('/api/account/export', { credentials: 'same-origin' });
    if (res.status === 401) { forget(); return { ok: false, reason: 'Please sign in again.' }; }
    if (!res.ok) return { ok: false, reason: 'The download didn’t work. Try again.' };
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'metadeck-data.json';
    const url = URL.createObjectURL(await res.blob());
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Can’t reach the server. Check your connection.' };
  }
}
export async function signOutOthers() {
  const r = await manage('signoutothers');
  if (r.ok && account) account.devices = 1;
  return r;
}
export async function deleteAccount(password, confirm) {
  const r = await manage('delete', { password, confirm });
  if (r.ok) forget();
  return r;
}

function forget() {
  account = null;
  current = null;
  serverTestPurchases = false;
  refreshWallets();
}

export async function signOut() {
  try { await api('signout', {}); } catch { /* signed out locally anyway */ }
  forget();
}

// A vs-AI match for an account is dealt by the server and checked by it at the end (server/ai-match.mjs).
// startAiMatch resolves to { ok, ticket, seed, firstPlayer }; finishAiMatch to { ok, won, out } and
// updates the profile with the rewards.
export async function startAiMatch(deal) {
  return manage('aistart', deal);
}
export async function finishAiMatch(ticket, moves) {
  const r = await manage('aifinish', { ticket, moves });
  if (r.profile) { current = normalizeProfile(r.profile); refreshWallets(); }
  return r;
}

// Re-read the account's profile (after the server changed it, e.g. online match rewards).
export async function reload() {
  if (!account) return;
  const { status, data } = await api('me');
  if (status === 200 && data.ok) adopt(data); else if (status === 401) forget();
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
    if (status === 401) forget(); else refreshWallets();
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
