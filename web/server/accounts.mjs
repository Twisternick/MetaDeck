// Player accounts: sign up and sign in with a name and password, stay signed in with a session cookie,
// and keep the player's profile (collection, Gold, Gems, Dust, quests, season, cosmetics) on the server,
// so it follows the account to any device and can't be edited from the browser. Every change to a
// profile is one of the named operations in src/data/economy.js (runOp), with the same rules the game shows.
//
// Storage is one JSON file (data/accounts.json by default), written atomically. Passwords are salted
// scrypt hashes; sessions are stored as SHA-256 hashes of their tokens, so the file never holds anything
// that signs someone in.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { normalizeProfile, runOp } from '../src/data/economy.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 30;
const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const FAILS_PER_WINDOW = 10;      // failed sign-ins per address
const FAIL_WINDOW_MS = 10 * 60_000;
const SIGNUPS_PER_HOUR = 5;       // new accounts per address

export const nameError = name => (NAME_RE.test(name ?? '') ? null : 'Names are 3–20 letters, digits or underscores.');
export const passwordError = pw => (typeof pw === 'string' && pw.length >= PASSWORD_MIN && pw.length <= PASSWORD_MAX
  ? null : `Passwords need at least ${PASSWORD_MIN} characters.`);

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const key = name => name.toLowerCase();

async function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = await scrypt(password, salt, 64);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

export function createAccounts({ file, now = () => new Date(), rng = Math.random } = {}) {
  let db = { users: {}, sessions: {} };
  if (file && fs.existsSync(file)) {
    try { db = { users: {}, sessions: {}, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; }
    catch (err) { throw new Error(`Can't read ${file}: ${err.message}`); }
  }
  const fails = new Map();   // address -> { n, until }
  const signups = new Map(); // address -> { n, until }

  // ------------------------------------------------------------ storage
  let timer = null;
  function save() {
    if (!file || timer) return;
    timer = setTimeout(flush, 100);
  }
  function flush() {
    clearTimeout(timer);
    timer = null;
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  // ------------------------------------------------------------ rate limits
  const limited = (map, ip, max) => { const e = map.get(ip); return !!e && e.until > Date.now() && e.n >= max; };
  const bump = (map, ip, windowMs) => {
    const e = map.get(ip);
    if (!e || e.until <= Date.now()) map.set(ip, { n: 1, until: Date.now() + windowMs });
    else e.n++;
  };

  // ------------------------------------------------------------ sessions
  function newSession(userKey) {
    const token = crypto.randomBytes(32).toString('base64url');
    db.sessions[sha(token)] = { user: userKey, expires: now().getTime() + SESSION_DAYS * 86_400_000 };
    // Drop expired sessions while we're here.
    for (const [h, s] of Object.entries(db.sessions)) if (s.expires < now().getTime()) delete db.sessions[h];
    save();
    return token;
  }
  function userFor(token) {
    if (typeof token !== 'string' || !token) return null;
    const s = db.sessions[sha(token)];
    if (!s || s.expires < now().getTime()) return null;
    return db.users[s.user] ?? null;
  }
  // The stored profile, repaired and rolled into today (new quest, new season).
  function profileOf(user) {
    user.profile = normalizeProfile(user.profile, now(), rng);
    return user.profile;
  }

  return {
    async signUp(name, password, ip = '') {
      const bad = nameError(name) ?? passwordError(password);
      if (bad) return { ok: false, reason: bad };
      if (limited(signups, ip, SIGNUPS_PER_HOUR)) return { ok: false, reason: 'Too many new accounts from your network. Try again later.' };
      if (db.users[key(name)]) return { ok: false, reason: 'That name is taken.' };
      const pw = await hashPassword(password);
      if (db.users[key(name)]) return { ok: false, reason: 'That name is taken.' };
      bump(signups, ip, 3_600_000);
      db.users[key(name)] = { name, ...pw, created: now().toISOString(), profile: normalizeProfile(null, now(), rng) };
      return { ok: true, token: newSession(key(name)), name };
    },

    async signIn(name, password, ip = '') {
      if (limited(fails, ip, FAILS_PER_WINDOW)) return { ok: false, reason: 'Too many wrong passwords. Wait a few minutes and try again.' };
      const user = typeof name === 'string' ? db.users[key(name)] : null;
      // Hash even when the name doesn't exist, so the response time doesn't reveal which names are taken.
      const check = await hashPassword(typeof password === 'string' ? password.slice(0, PASSWORD_MAX) : '', user ? Buffer.from(user.salt, 'hex') : crypto.randomBytes(16));
      if (!user || !crypto.timingSafeEqual(Buffer.from(check.hash, 'hex'), Buffer.from(user.hash, 'hex'))) {
        bump(fails, ip, FAIL_WINDOW_MS);
        return { ok: false, reason: 'Wrong name or password.' };
      }
      return { ok: true, token: newSession(key(name)), name: user.name };
    },

    signOut(token) {
      if (typeof token === 'string' && db.sessions[sha(token)]) { delete db.sessions[sha(token)]; save(); }
    },

    // { name, profile } for a signed-in session, or null.
    me(token) {
      const user = userFor(token);
      if (!user) return null;
      const profile = profileOf(user);
      save();
      return { name: user.name, profile };
    },

    // Apply one economy operation for the signed-in player. `testPurchases` comes from the server
    // (only on this machine), never from the client.
    act(token, op, args, { testPurchases = false } = {}) {
      const user = userFor(token);
      if (!user) return { status: 401, body: { ok: false, reason: 'Please sign in again.' } };
      if (op === 'testPurchase' && !testPurchases) return { status: 403, body: { ok: false, reason: 'Payments are not connected yet.' } };
      const profile = profileOf(user);
      const result = runOp(profile, op, args, { now: now(), rng, testPurchases, online: false });
      save();
      return { status: 200, body: { ...result, profile } };
    },

    // The account behind a session token, for the online lobby: { name, profile } (live) or null.
    accountFor(token) {
      const user = userFor(token);
      return user ? { name: user.name, key: key(user.name) } : null;
    },
    profileFor(account) {
      const user = account && db.users[account.key];
      return user ? profileOf(user) : null;
    },
    // Online match results come from the server's own game, so they skip the vs-AI rate limit.
    recordOnline(account, { deckId, won, damage }) {
      const user = account && db.users[account.key];
      if (!user) return null;
      const res = runOp(profileOf(user), 'recordMatch', { deckId, won, damage }, { now: now(), rng, online: true });
      save();
      return res.ok ? res.out : null;
    },

    // Admin: add currency to an account (tools/grant.mjs). Returns the new balances, or null.
    grant(name, { gold = 0, gems = 0, dust = 0 } = {}) {
      const user = typeof name === 'string' ? db.users[key(name)] : null;
      if (!user) return null;
      const p = profileOf(user);
      const add = (field, n) => { p[field] = Math.max(0, Math.min(1e9, p[field] + (Math.floor(Number(n)) || 0))); };
      add('gold', gold); add('gems', gems); add('dust', dust);
      save();
      return { name: user.name, gold: p.gold, gems: p.gems, dust: p.dust };
    },

    // Admin: set an account's password (tools/set-password.mjs). Signs the account out everywhere.
    async setPassword(name, password) {
      const user = typeof name === 'string' ? db.users[key(name)] : null;
      if (!user) return { ok: false, reason: `No account named ${name}.` };
      const bad = passwordError(password);
      if (bad) return { ok: false, reason: bad };
      Object.assign(user, await hashPassword(password));
      for (const [h, s] of Object.entries(db.sessions)) if (s.user === key(user.name)) delete db.sessions[h];
      save();
      return { ok: true, name: user.name };
    },

    names: () => Object.values(db.users).map(u => u.name),
    flush,
  };
}
