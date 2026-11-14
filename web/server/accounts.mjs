// Player accounts: sign up and sign in with a name and password, stay signed in with a session cookie,
// and keep the player's profile (collection, Gold, Gems, Dust, quests, season, cosmetics) on the server,
// so it follows the account to any device and can't be edited from the browser. Every change to a
// profile is one of the named operations in src/data/economy.js (runOp), with the same rules the game shows.
//
// There's no email, so a forgotten password is reset with the account's recovery code: shown once when
// the account is made (and again whenever the player makes a new one), and used up by a reset, which
// hands out a fresh code. Signed in, a player can change their password, make a new recovery code, sign
// out their other devices, or delete the account; each of those asks for the password again.
//
// Storage is the SQLite database (server/db.mjs): every change is written through at once, and recently
// used accounts are cached in memory. Passwords are salted scrypt hashes; sessions and recovery codes are
// stored as SHA-256 hashes (both are long and random), so the database never holds anything that signs
// someone in. An old data/accounts.json (from before the database) is imported on first start.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { openDb, transaction } from './db.mjs';
import { normalizeProfile, runOp } from '../src/data/economy.js';
import { CARDS, MAX_COPIES } from '../src/data/index.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 30;
const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const FAILS_PER_WINDOW = 10;      // failed sign-ins per address
const FAIL_WINDOW_MS = 10 * 60_000;
const SIGNUPS_PER_HOUR = 5;       // new accounts per address
const CACHE_MAX = 5000;           // accounts kept in memory

export const nameError = name => (NAME_RE.test(name ?? '') ? null : 'Names are 3–20 letters, digits or underscores.');
export const passwordError = pw => (typeof pw === 'string' && pw.length >= PASSWORD_MIN && pw.length <= PASSWORD_MAX
  ? null : `Passwords need at least ${PASSWORD_MIN} characters.`);

const sha = s => crypto.createHash('sha256').update(s).digest('hex');
const key = name => name.toLowerCase();

// Recovery codes: 16 characters (80 bits) from an alphabet without look-alikes, shown as XXXX-XXXX-XXXX-XXXX.
// Typing one back ignores case, spaces and dashes, and reads O as 0 and I or L as 1.
const CODE_ABC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function newRecoveryCode() {
  const raw = [...crypto.randomBytes(16)].map(b => CODE_ABC[b % 32]).join('');
  return raw.match(/.{4}/g).join('-');
}
const codeKey = code => String(code ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');

async function hashPassword(password, salt = crypto.randomBytes(16)) {
  const hash = await scrypt(password, salt, 64);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

// The accounts in a data folder: metadeck.db, importing accounts.json from before the database.
export const accountsIn = (dataDir, opts = {}) =>
  createAccounts({ file: path.join(dataDir, 'metadeck.db'), legacy: path.join(dataDir, 'accounts.json'), ...opts });

// `file` is the database (null keeps it in memory, for tests); `legacy` an accounts.json to import.
export function createAccounts({ file = null, legacy = null, now = () => new Date(), rng = Math.random } = {}) {
  const db = openDb(file);
  const q = {
    user: db.prepare('SELECT * FROM users WHERE key = ?'),
    putUser: db.prepare(`INSERT INTO users (key, name, salt, hash, recovery, created, profile) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET name = excluded.name, salt = excluded.salt, hash = excluded.hash,
      recovery = excluded.recovery, profile = excluded.profile`),
    delUser: db.prepare('DELETE FROM users WHERE key = ?'),
    forgetMatches0: db.prepare('UPDATE matches SET p0 = NULL WHERE p0 = ?'),
    forgetMatches1: db.prepare('UPDATE matches SET p1 = NULL WHERE p1 = ?'),
    forgetEvents: db.prepare('DELETE FROM events WHERE user = ?'),
    session: db.prepare('SELECT user FROM sessions WHERE hash = ? AND expires >= ?'),
    addSession: db.prepare('INSERT INTO sessions (hash, user, expires) VALUES (?, ?, ?)'),
    dropExpired: db.prepare('DELETE FROM sessions WHERE expires < ?'),
    dropSession: db.prepare('DELETE FROM sessions WHERE hash = ?'),
    dropSessions: db.prepare('DELETE FROM sessions WHERE user = ? AND hash IS NOT ?'),
    devices: db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user = ? AND expires > ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM users'),
  };
  const fails = new Map();   // address -> { n, until }
  const signups = new Map(); // address -> { n, until }

  // ------------------------------------------------------------ storage
  // Loaded accounts by key, least recently used first. A user is { key, name, salt, hash, recovery,
  // created, profile }; `saved` holds its row as last written, so an unchanged account isn't rewritten.
  const cache = new Map();
  const saved = new WeakMap();
  const rowOf = u => [u.key, u.name, u.salt, u.hash, u.recovery ?? null, u.created, JSON.stringify(u.profile)];
  function getUser(k) {
    if (typeof k !== 'string') return null;
    let user = cache.get(k);
    if (user) { cache.delete(k); cache.set(k, user); return user; }
    const row = q.user.get(k);
    if (!row) return null;
    user = { key: row.key, name: row.name, salt: row.salt, hash: row.hash, recovery: row.recovery ?? undefined, created: row.created, profile: JSON.parse(row.profile) };
    saved.set(user, rowOf(user));
    cache.set(k, user);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return user;
  }
  function put(user) {
    const row = rowOf(user);
    const before = saved.get(user);
    if (before && before.every((v, i) => v === row[i])) return;
    q.putUser.run(...row);
    saved.set(user, row);
    if (!cache.has(user.key)) cache.set(user.key, user);
  }

  // Accounts from the JSON file used before the database: imported once, then the file is renamed.
  if (legacy && fs.existsSync(legacy) && q.count.get().n === 0) {
    let old;
    try { old = JSON.parse(fs.readFileSync(legacy, 'utf8')); } catch (err) { throw new Error(`Can't read ${legacy}: ${err.message}`); }
    const users = Object.entries(old.users ?? {});
    transaction(db, () => {
      for (const [k, u] of users) put({ key: k, name: u.name, salt: u.salt, hash: u.hash, recovery: u.recovery, created: u.created, profile: u.profile ?? normalizeProfile(null, now(), rng) });
      for (const [h, s] of Object.entries(old.sessions ?? {})) if (s.expires >= now().getTime() && getUser(s.user)) q.addSession.run(h, s.user, s.expires);
    });
    fs.renameSync(legacy, `${legacy}.imported`);
    console.log(`Imported ${users.length} accounts from ${legacy} into the database.`);
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
    q.dropExpired.run(now().getTime()); // tidy up while we're here
    q.addSession.run(sha(token), userKey, now().getTime() + SESSION_DAYS * 86_400_000);
    return token;
  }
  function userFor(token) {
    if (typeof token !== 'string' || !token) return null;
    const s = q.session.get(sha(token), now().getTime());
    return s ? getUser(s.user) : null;
  }
  // Check a signed-in player's password again before a sensitive change. Wrong guesses count toward the
  // same per-address limit as sign-in. Returns null when it's right, or the reason it isn't.
  async function confirm(user, password, ip) {
    if (limited(fails, ip, FAILS_PER_WINDOW)) return 'Too many wrong passwords. Wait a few minutes and try again.';
    const check = await hashPassword(typeof password === 'string' ? password.slice(0, PASSWORD_MAX) : '', Buffer.from(user.salt, 'hex'));
    if (crypto.timingSafeEqual(Buffer.from(check.hash, 'hex'), Buffer.from(user.hash, 'hex'))) return null;
    bump(fails, ip, FAIL_WINDOW_MS);
    return 'That password isn’t right.';
  }
  // Give the account a new recovery code (replacing any old one) and return it, for showing once.
  function issueCode(user) {
    const code = newRecoveryCode();
    user.recovery = sha(codeKey(code));
    put(user);
    return code;
  }
  // Sign the account out of every session except `keep` (a token hash). Returns how many ended.
  const dropSessions = (userKey, keep = null) => Number(q.dropSessions.run(userKey, keep).changes);
  const devices = userKey => q.devices.get(userKey, now().getTime()).n;

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
      if (getUser(key(name))) return { ok: false, reason: 'That name is taken.' };
      const pw = await hashPassword(password);
      if (getUser(key(name))) return { ok: false, reason: 'That name is taken.' };
      bump(signups, ip, 3_600_000);
      const user = { key: key(name), name, ...pw, created: now().toISOString(), profile: normalizeProfile(null, now(), rng) };
      put(user);
      return { ok: true, token: newSession(key(name)), name, recoveryCode: issueCode(user) };
    },

    async signIn(name, password, ip = '') {
      if (limited(fails, ip, FAILS_PER_WINDOW)) return { ok: false, reason: 'Too many wrong passwords. Wait a few minutes and try again.' };
      const user = typeof name === 'string' ? getUser(key(name)) : null;
      // Hash even when the name doesn't exist, so the response time doesn't reveal which names are taken.
      const check = await hashPassword(typeof password === 'string' ? password.slice(0, PASSWORD_MAX) : '', user ? Buffer.from(user.salt, 'hex') : crypto.randomBytes(16));
      if (!user || !crypto.timingSafeEqual(Buffer.from(check.hash, 'hex'), Buffer.from(user.hash, 'hex'))) {
        bump(fails, ip, FAIL_WINDOW_MS);
        return { ok: false, reason: 'Wrong name or password.' };
      }
      return { ok: true, token: newSession(key(name)), name: user.name };
    },

    // Forgotten password: the name, the recovery code and a new password. The code is used up; the
    // account is signed out everywhere, signed in here, and given a new code to save.
    async resetPassword(name, code, password, ip = '') {
      if (limited(fails, ip, FAILS_PER_WINDOW)) return { ok: false, reason: 'Too many tries. Wait a few minutes and try again.' };
      const bad = passwordError(password);
      if (bad) return { ok: false, reason: bad };
      const user = typeof name === 'string' ? getUser(key(name.trim())) : null;
      const given = Buffer.from(sha(codeKey(code)), 'hex');
      const want = Buffer.from(user?.recovery ?? sha(crypto.randomBytes(16)), 'hex');
      if (!user || !crypto.timingSafeEqual(given, want)) {
        bump(fails, ip, FAIL_WINDOW_MS);
        return { ok: false, reason: 'That name and recovery code don’t match.' };
      }
      Object.assign(user, await hashPassword(password));
      put(user);
      dropSessions(key(user.name));
      return { ok: true, token: newSession(key(user.name)), name: user.name, recoveryCode: issueCode(user) };
    },

    // Signed in: change the password (the current one first). Other devices are signed out; this one stays.
    async changePassword(token, current, password, ip = '') {
      const user = userFor(token);
      if (!user) return { ok: false, status: 401, reason: 'Please sign in again.' };
      const wrong = await confirm(user, current, ip);
      if (wrong) return { ok: false, reason: wrong };
      const bad = passwordError(password);
      if (bad) return { ok: false, reason: bad };
      Object.assign(user, await hashPassword(password));
      put(user);
      return { ok: true, signedOut: dropSessions(key(user.name), sha(token)) };
    },

    // Signed in: replace the recovery code (the password first). Returns the new code, to show once.
    async newRecoveryCode(token, password, ip = '') {
      const user = userFor(token);
      if (!user) return { ok: false, status: 401, reason: 'Please sign in again.' };
      const wrong = await confirm(user, password, ip);
      if (wrong) return { ok: false, reason: wrong };
      return { ok: true, recoveryCode: issueCode(user) };
    },

    // Signed in: sign out every other device.
    signOutOthers(token) {
      const user = userFor(token);
      if (!user) return { ok: false, status: 401, reason: 'Please sign in again.' };
      return { ok: true, signedOut: dropSessions(key(user.name), sha(token)) };
    },

    // Signed in: delete the account for good (the password first, and the name typed out).
    async deleteAccount(token, password, confirmName, ip = '') {
      const user = userFor(token);
      if (!user) return { ok: false, status: 401, reason: 'Please sign in again.' };
      if (typeof confirmName !== 'string' || key(confirmName.trim()) !== key(user.name)) return { ok: false, reason: `Type ${user.name} to confirm.` };
      const wrong = await confirm(user, password, ip);
      if (wrong) return { ok: false, reason: wrong };
      // Sessions and tickets go with the row; match history and analytics keep no trace of the account.
      transaction(db, () => {
        q.delUser.run(user.key);
        q.forgetMatches0.run(user.key);
        q.forgetMatches1.run(user.key);
        q.forgetEvents.run(user.key);
      });
      cache.delete(user.key);
      return { ok: true };
    },

    signOut(token) {
      if (typeof token === 'string') q.dropSession.run(sha(token));
    },

    // { name, profile, info } for a signed-in session, or null. `info` is for the account screen: when the
    // account was made, whether it has a recovery code, and how many devices are signed in (this one too).
    me(token) {
      const user = userFor(token);
      if (!user) return null;
      const profile = profileOf(user);
      put(user);
      return { name: user.name, profile, info: { created: user.created, recovery: !!user.recovery, devices: devices(key(user.name)) } };
    },

    // Apply one economy operation for the signed-in player. `testPurchases` comes from the server
    // (only on this machine), never from the client.
    act(token, op, args, { testPurchases = false } = {}) {
      const user = userFor(token);
      if (!user) return { status: 401, body: { ok: false, reason: 'Please sign in again.' } };
      if (op === 'testPurchase' && !testPurchases) return { status: 403, body: { ok: false, reason: 'Payments are not connected yet.' } };
      // An account's vs-AI results go through the checked replay in server/ai-match.mjs instead.
      if (op === 'recordMatch') return { status: 403, body: { ok: false, reason: 'Match results are checked by the server.' } };
      const profile = profileOf(user);
      const result = runOp(profile, op, args, { now: now(), rng, testPurchases, online: false });
      put(user);
      return { status: 200, body: { ...result, profile } };
    },

    // The account behind a session token, for the online lobby and vs-AI matches: { name, key } or null.
    accountFor(token) {
      const user = userFor(token);
      return user ? { name: user.name, key: key(user.name) } : null;
    },
    profileFor(account) {
      const user = account && getUser(account.key);
      return user ? profileOf(user) : null;
    },
    // Pay out a match the server ran (online) or checked (a vs-AI replay). Online games skip the vs-AI
    // rate limit and earn more season XP.
    recordResult(account, { deckId, won, damage, online = true }) {
      const user = account && getUser(account.key);
      if (!user) return null;
      const res = runOp(profileOf(user), 'recordMatch', { deckId, won, damage }, { now: now(), rng, online });
      put(user);
      return res.ok ? res.out : null;
    },
    recordOnline(account, result) { return this.recordResult(account, { ...result, online: true }); },

    // Admin: add currency to an account (tools/grant.mjs); `holo` turns the whole collection into full
    // sets of hologram copies. Returns the new balances, or null.
    grant(name, { gold = 0, gems = 0, dust = 0, holo = false } = {}) {
      const user = typeof name === 'string' ? getUser(key(name)) : null;
      if (!user) return null;
      const p = profileOf(user);
      const add = (field, n) => { p[field] = Math.max(0, Math.min(1e9, p[field] + (Math.floor(Number(n)) || 0))); };
      add('gold', gold); add('gems', gems); add('dust', dust);
      if (holo === true) for (const id of Object.keys(CARDS)) if (CARDS[id].deckId) p.cards[id] = { n: 0, p: 0, h: MAX_COPIES };
      put(user);
      const holos = Object.values(p.cards).filter(c => c.h > 0).length;
      return { name: user.name, gold: p.gold, gems: p.gems, dust: p.dust, holos };
    },

    // Admin: set an account's password (tools/set-password.mjs). Signs the account out everywhere.
    async setPassword(name, password) {
      const user = typeof name === 'string' ? getUser(key(name)) : null;
      if (!user) return { ok: false, reason: `No account named ${name}.` };
      const bad = passwordError(password);
      if (bad) return { ok: false, reason: bad };
      Object.assign(user, await hashPassword(password));
      put(user);
      dropSessions(key(user.name));
      return { ok: true, name: user.name };
    },

    // Admin: how many players there are (tools/users.mjs). Reads stored data only, so it never rolls a profile.
    stats() {
      const t = now().getTime();
      const users = db.prepare(`SELECT u.name, u.created, COALESCE(json_extract(u.profile, '$.stats.games'), 0) AS games,
          EXISTS (SELECT 1 FROM sessions s WHERE s.user = u.key AND s.expires > ?) AS signedIn
        FROM users u ORDER BY u.created DESC`).all(t)
        .map(u => ({ name: u.name, created: u.created, games: u.games, signedIn: !!u.signedIn }));
      const since = days => users.filter(u => t - Date.parse(u.created) < days * 86_400_000).length;
      return {
        accounts: users.length,
        new24h: since(1),
        new7d: since(7),
        signedIn: users.filter(u => u.signedIn).length,
        users,
      };
    },

    names: () => db.prepare('SELECT name FROM users ORDER BY name').all().map(r => r.name),
    // Write the WAL back into the main file (on shutdown, and before a test reads the file).
    flush() { try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* in memory, or closed */ } },
    close() { this.flush(); db.close(); },
    db,
  };
}
