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
import { normalizeProfile, runOp, FOUNDER, makeFounder, unmakeFounder } from '../src/data/economy.js';
import { CARDS, MAX_COPIES } from '../src/data/index.js';
import { offensiveName } from './names.mjs';

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 30;
const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 200;
const FAILS_PER_WINDOW = 10;      // failed sign-ins per address
const FAIL_WINDOW_MS = 10 * 60_000;
const SIGNUPS_PER_HOUR = 5;       // new accounts per address
const CACHE_MAX = 5000;           // accounts kept in memory
export const MIN_AGE = 13;        // accounts are for players this old or older (COPPA); guests can play at any age

export const nameError = name => (!NAME_RE.test(name ?? '') ? 'Names are 3–20 letters, digits or underscores.'
  : offensiveName(name) ? 'That name isn’t allowed. Pick another one.' : null);
export const BANNED = 'This account has been banned for breaking the rules.';
export const passwordError = pw => (typeof pw === 'string' && pw.length >= PASSWORD_MIN && pw.length <= PASSWORD_MAX
  ? null : `Passwords need at least ${PASSWORD_MIN} characters.`);

// The age check at sign-up asks for the birth year only. Someone who could be under MIN_AGE (their birth
// year is less than MIN_AGE years ago) is refused, and an account found to be under age can't sign in.
export const TOO_YOUNG = `MetaDeck accounts are for players ${MIN_AGE} and older. You can keep playing as a guest; your progress stays in this browser.`;
export function birthYearError(year, now = new Date()) {
  const y = now.getUTCFullYear();
  if (!Number.isInteger(year) || year < y - 120 || year > y) return 'Choose the year you were born.';
  return y - year < MIN_AGE ? TOO_YOUNG : null;
}
const tooYoung = (user, now) => user.birthYear != null && now.getUTCFullYear() - user.birthYear < MIN_AGE;

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
// `founderSlots`: how many of the first sign-ups become Meta Founders (FOUNDER in economy.js; 0 turns it off).
export function createAccounts({ file = null, legacy = null, now = () => new Date(), rng = Math.random, founderSlots = FOUNDER.slots } = {}) {
  const db = openDb(file);
  const q = {
    user: db.prepare('SELECT * FROM users WHERE key = ?'),
    putUser: db.prepare(`INSERT INTO users (key, name, salt, hash, recovery, created, profile, birth_year, rating, rd, vol, rank, banned)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET name = excluded.name, salt = excluded.salt, hash = excluded.hash,
      recovery = excluded.recovery, profile = excluded.profile, birth_year = excluded.birth_year,
      rating = excluded.rating, rd = excluded.rd, vol = excluded.vol, rank = excluded.rank, banned = excluded.banned`),
    userMatches: db.prepare('SELECT at, kind, deck0, deck1, winner, turns, seconds, ending, p0 = ? AS seat0 FROM matches WHERE p0 = ? OR p1 = ? ORDER BY at'),
    userEvents: db.prepare('SELECT at, name, data FROM events WHERE user = ? ORDER BY at'),
    delUser: db.prepare('DELETE FROM users WHERE key = ?'),
    forgetMatches0: db.prepare('UPDATE matches SET p0 = NULL WHERE p0 = ?'),
    forgetMatches1: db.prepare('UPDATE matches SET p1 = NULL WHERE p1 = ?'),
    forgetEvents: db.prepare('DELETE FROM events WHERE user = ?'),
    forgetReports: db.prepare('UPDATE reports SET reporter = NULL WHERE reporter = ?'),
    forgetFeedback: db.prepare('UPDATE feedback SET user = NULL, user_name = NULL WHERE user = ?'),
    userFeedback: db.prepare('SELECT at, kind, message FROM feedback WHERE user = ? ORDER BY at'),
    forgetPurchases: db.prepare('UPDATE purchases SET user = NULL, user_name = NULL WHERE user = ?'),
    session: db.prepare('SELECT user FROM sessions WHERE hash = ? AND expires >= ?'),
    addSession: db.prepare('INSERT INTO sessions (hash, user, expires) VALUES (?, ?, ?)'),
    dropExpired: db.prepare('DELETE FROM sessions WHERE expires < ?'),
    dropSession: db.prepare('DELETE FROM sessions WHERE hash = ?'),
    dropSessions: db.prepare('DELETE FROM sessions WHERE user = ? AND hash IS NOT ?'),
    devices: db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE user = ? AND expires > ?'),
    count: db.prepare('SELECT COUNT(*) AS n FROM users'),
    founders: db.prepare(`SELECT COUNT(*) AS n, MAX(json_extract(profile, '$.founder')) AS top FROM users WHERE json_extract(profile, '$.founder') IS NOT NULL`),
    founderList: db.prepare(`SELECT key, name, created, json_extract(profile, '$.founder') AS n, json_extract(profile, '$.founderGems') AS gems
      FROM users WHERE json_extract(profile, '$.founder') IS NOT NULL ORDER BY n`),
  };
  const fails = new Map();   // address -> { n, until }
  const signups = new Map(); // address -> { n, until }

  // ------------------------------------------------------------ storage
  // Loaded accounts by key, least recently used first. A user is { key, name, salt, hash, recovery,
  // created, profile, birthYear, rating, rd, vol, rank, banned }; `saved` holds its row as last written,
  // so an unchanged account isn't rewritten. `rating`/`rd`/`vol` are the hidden Glicko-2 rating
  // (server/rating.mjs) and `rank` the visible ranked state (src/data/ranked.js), or null before ranked play.
  const cache = new Map();
  const saved = new WeakMap();
  const rowOf = u => [u.key, u.name, u.salt, u.hash, u.recovery ?? null, u.created, JSON.stringify(u.profile), u.birthYear ?? null,
    u.rating ?? 1500, u.rd ?? 350, u.vol ?? 0.06, u.rank ? JSON.stringify(u.rank) : null, u.banned ? 1 : 0];
  function getUser(k) {
    if (typeof k !== 'string') return null;
    let user = cache.get(k);
    if (user) { cache.delete(k); cache.set(k, user); return user; }
    const row = q.user.get(k);
    if (!row) return null;
    user = { key: row.key, name: row.name, salt: row.salt, hash: row.hash, recovery: row.recovery ?? undefined, created: row.created, profile: JSON.parse(row.profile), birthYear: row.birth_year ?? null,
      rating: row.rating, rd: row.rd, vol: row.vol, rank: row.rank ? JSON.parse(row.rank) : null, banned: !!row.banned };
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
    const user = s ? getUser(s.user) : null;
    return user && !tooYoung(user, now()) && !user.banned ? user : null;
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
    async signUp(name, password, ip = '', birthYear = null) {
      const bad = nameError(name) ?? passwordError(password) ?? birthYearError(birthYear, now());
      if (bad) return { ok: false, reason: bad };
      if (limited(signups, ip, SIGNUPS_PER_HOUR)) return { ok: false, reason: 'Too many new accounts from your network. Try again later.' };
      if (getUser(key(name))) return { ok: false, reason: 'That name is taken.' };
      const pw = await hashPassword(password);
      if (getUser(key(name))) return { ok: false, reason: 'That name is taken.' };
      bump(signups, ip, 3_600_000);
      const user = { key: key(name), name, ...pw, created: now().toISOString(), profile: normalizeProfile(null, now(), rng), birthYear };
      // One of the first founderSlots accounts: the next founder number (checked and written with no await
      // in between, so two sign-ups can't take the same number).
      const f = q.founders.get();
      if (f.n < founderSlots) makeFounder(user.profile, (f.top ?? 0) + 1);
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
      if (tooYoung(user, now())) return { ok: false, reason: TOO_YOUNG };
      if (user.banned) return { ok: false, reason: BANNED };
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
        q.forgetReports.run(user.key);
        q.forgetFeedback.run(user.key);
        q.forgetPurchases.run(user.key); // the payment record stays (for accounting), without the account
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
      return { name: user.name, profile, info: { created: user.created, recovery: !!user.recovery, devices: devices(key(user.name)), birthYear: user.birthYear } };
    },

    // Signed in: the birth year, for an account made before sign-up asked for it (it can't be changed
    // once set). An account that turns out to be under age is signed out everywhere and can't sign in.
    setBirthYear(token, year) {
      const user = userFor(token);
      if (!user) return { ok: false, status: 401, reason: 'Please sign in again.' };
      if (user.birthYear != null) return { ok: false, reason: 'Your birth year is already set.' };
      const bad = birthYearError(year, now());
      if (bad && bad !== TOO_YOUNG) return { ok: false, reason: bad };
      user.birthYear = year;
      put(user);
      if (bad) { dropSessions(user.key); return { ok: false, status: 403, tooYoung: true, reason: TOO_YOUNG }; }
      return { ok: true };
    },

    // Signed in: everything stored about the account, as one JSON document (the right to a copy of
    // your data). The password hash and recovery-code hash are left out: they're only useful to an attacker.
    exportData(token) {
      const user = userFor(token);
      if (!user) return null;
      return {
        exported: now().toISOString(),
        account: { name: user.name, created: user.created, birthYear: user.birthYear, hasRecoveryCode: !!user.recovery, devicesSignedIn: devices(user.key) },
        profile: profileOf(user),
        matches: q.userMatches.all(user.key, user.key, user.key).map(({ seat0, ...m }) => ({ ...m, you: seat0 ? 0 : 1 })),
        events: q.userEvents.all(user.key).map(e => ({ ...e, data: e.data ? JSON.parse(e.data) : null })),
        feedback: q.userFeedback.all(user.key),
      };
    },

    // Apply one economy operation for the signed-in player. `testPurchases` comes from the server
    // (only on this machine), never from the client.
    act(token, op, args, { testPurchases = false, country = null } = {}) {
      const user = userFor(token);
      if (!user) return { status: 401, body: { ok: false, reason: 'Please sign in again.' } };
      if (op === 'testPurchase' && !testPurchases) return { status: 403, body: { ok: false, reason: 'Payments are not connected yet.' } };
      // An account's vs-AI results go through the checked replay in server/ai-match.mjs instead.
      if (op === 'recordMatch') return { status: 403, body: { ok: false, reason: 'Match results are checked by the server.' } };
      const profile = profileOf(user);
      const result = runOp(profile, op, args, { now: now(), rng, testPurchases, online: false, country });
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

    // Admin: ban or unban an account (tools/moderate.mjs). A ban signs it out everywhere.
    setBanned(name, on = true) {
      const user = typeof name === 'string' ? getUser(key(name)) : null;
      if (!user) return { ok: false, reason: `No account named ${name}.` };
      user.banned = !!on;
      put(user);
      if (on) dropSessions(user.key);
      return { ok: true, name: user.name, banned: user.banned };
    },

    // Admin: rename an account (tools/moderate.mjs), e.g. for a name that broke the rules. Its key changes
    // too, so every table that points at the account follows; sessions stay signed in.
    rename(from, to) {
      const user = typeof from === 'string' ? getUser(key(from)) : null;
      if (!user) return { ok: false, reason: `No account named ${from}.` };
      const bad = !NAME_RE.test(to ?? '') ? 'Names are 3–20 letters, digits or underscores.' : null;
      if (bad) return { ok: false, reason: bad };
      const newKey = key(to);
      if (newKey !== user.key && getUser(newKey)) return { ok: false, reason: 'That name is taken.' };
      const oldKey = user.key;
      transaction(db, () => {
        db.exec('PRAGMA defer_foreign_keys = ON');
        db.prepare('UPDATE users SET key = ?, name = ? WHERE key = ?').run(newKey, to, oldKey);
        for (const [table, col] of [['sessions', 'user'], ['tickets', 'user'], ['matches', 'p0'], ['matches', 'p1'], ['events', 'user'],
          ['friends', 'user'], ['friends', 'friend'], ['blocks', 'user'], ['blocks', 'blocked'], ['reports', 'reporter'], ['reports', 'reported'], ['feedback', 'user']]) {
          db.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`).run(newKey, oldKey);
        }
      });
      cache.delete(oldKey);
      return { ok: true, from: user.name, to };
    },

    // How many founder places there are and how many are left (public: the title screen and menu advertise it).
    founderSpots() {
      const taken = q.founders.get().n;
      return { slots: founderSlots, taken, left: Math.max(0, founderSlots - taken) };
    },

    // Admin (tools/moderate.mjs): the Meta Founders, and making or unmaking one by hand. A new founder gets
    // the next number, even past founderSlots.
    founders: () => q.founderList.all(),
    setFounder(name, on = true) {
      const user = typeof name === 'string' ? getUser(key(name)) : null;
      if (!user) return { ok: false, reason: `No account named ${name}.` };
      const p = profileOf(user);
      const changed = on ? makeFounder(p, (q.founders.get().top ?? 0) + 1) : unmakeFounder(p);
      put(user);
      return { ok: true, name: user.name, founder: p.founder, changed };
    },
    // Unmake every founder (before launch, so test accounts don't use up the slots). Returns how many.
    resetFounders() {
      const list = q.founderList.all();
      transaction(db, () => { for (const f of list) { const u = getUser(f.key); unmakeFounder(profileOf(u)); put(u); } });
      return list.length;
    },

    names: () => db.prepare('SELECT name FROM users ORDER BY name').all().map(r => r.name),
    // Write the WAL back into the main file (on shutdown, and before a test reads the file).
    flush() { try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* in memory, or closed */ } },
    close() { this.flush(); db.close(); },
    db, now, rng,
    // For server/social.mjs, which builds on the same accounts.
    userByKey: getUser, userForToken: userFor, save: put, profileOf, sessionsOf: k => devices(k),
  };
}
