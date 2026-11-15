// Everything between players, built on the accounts (server/accounts.mjs): friends, blocks, reports,
// ranked results (hidden rating and visible rank), the leaderboard, and each player's match history.
//
// Friends: a request is one 'pending' row (requester -> target); accepting it makes two 'accepted'
// rows, one each way. Blocking someone ends any friendship or request between you, and the server
// never pairs, befriends or lets them challenge you while it stands.
//
// Reports go to the operator (npm run reports). Players can file a few a day, and one per player a day.
//
// Ranked: quick-find matches between two signed-in players. Each result updates both hidden ratings
// (Glicko-2, which matchmaking uses) and both ranks (stars, which players see). The same pair only
// counts for ranked a few times a day, so two players can't trade wins to climb.

import { rate, START } from './rating.mjs';
import { applyResult, rollSeason, rankOf } from '../src/data/ranked.js';
import { grantReward, founderTitle } from '../src/data/economy.js';

const MAX_FRIENDS = 200;
const REPORTS_PER_DAY = 10;
export const REPORT_REASONS = { name: 'Offensive name', cheating: 'Cheating or exploiting', stalling: 'Stalling or quitting on purpose', abuse: 'Harassment or abusive emotes', other: 'Something else' };
const PAIR_RANKED_PER_DAY = 3; // ranked games between the same two players that count, per 24 hours
const HISTORY = 50;

export function createSocial({ accounts }) {
  const { db, now, rng } = accounts;
  const key = name => (typeof name === 'string' ? name.trim().toLowerCase() : '');
  let presence = () => null; // key -> 'lobby' | 'match' | null, from the online lobby

  const q = {
    rel: db.prepare('SELECT status FROM friends WHERE user = ? AND friend = ?'),
    putRel: db.prepare(`INSERT INTO friends (user, friend, status, at) VALUES (?, ?, ?, ?)
      ON CONFLICT(user, friend) DO UPDATE SET status = excluded.status, at = excluded.at`),
    dropRel: db.prepare('DELETE FROM friends WHERE (user = ? AND friend = ?) OR (user = ? AND friend = ?)'),
    friendCount: db.prepare("SELECT COUNT(*) AS n FROM friends WHERE user = ? AND status = 'accepted'"),
    mine: db.prepare(`SELECT f.friend AS k, u.name, f.status, json_extract(u.profile, '$.founder') AS founder
      FROM friends f JOIN users u ON u.key = f.friend WHERE f.user = ? AND u.banned = 0`),
    incoming: db.prepare(`SELECT f.user AS k, u.name FROM friends f JOIN users u ON u.key = f.user WHERE f.friend = ? AND f.status = 'pending' AND u.banned = 0`),
    blockedBy: db.prepare('SELECT 1 FROM blocks WHERE (user = ? AND blocked = ?) OR (user = ? AND blocked = ?) LIMIT 1'),
    block: db.prepare('INSERT OR IGNORE INTO blocks (user, blocked, at) VALUES (?, ?, ?)'),
    unblock: db.prepare('DELETE FROM blocks WHERE user = ? AND blocked = ?'),
    myBlocks: db.prepare('SELECT u.name FROM blocks b JOIN users u ON u.key = b.blocked WHERE b.user = ? ORDER BY u.name'),
    reportsToday: db.prepare('SELECT COUNT(*) AS n FROM reports WHERE reporter = ? AND at > ?'),
    reportedToday: db.prepare('SELECT 1 FROM reports WHERE reporter = ? AND reported = ? AND at > ? LIMIT 1'),
    addReport: db.prepare('INSERT INTO reports (at, reporter, reported, reported_name, reason, note) VALUES (?, ?, ?, ?, ?, ?)'),
    openReports: db.prepare(`SELECT r.id, r.at, r.reported_name, r.reason, r.note, rep.name AS reporter,
        (SELECT COUNT(*) FROM reports x WHERE x.reported = r.reported AND x.resolved = 0) AS against
      FROM reports r LEFT JOIN users rep ON rep.key = r.reporter WHERE r.resolved = ? ORDER BY r.at`),
    resolve: db.prepare('UPDATE reports SET resolved = 1 WHERE id = ?'),
    pairGames: db.prepare('SELECT COUNT(*) AS n FROM matches WHERE rated = 1 AND at > ? AND ((p0 = ? AND p1 = ?) OR (p0 = ? AND p1 = ?))'),
    history: db.prepare(`SELECT m.id, m.at, m.kind, m.deck0, m.deck1, m.winner, m.turns, m.seconds, m.ending, m.rated, m.stars0, m.stars1,
        m.p0 = ? AS seat0, u0.name AS name0, u1.name AS name1
      FROM matches m LEFT JOIN users u0 ON u0.key = m.p0 LEFT JOIN users u1 ON u1.key = m.p1
      WHERE m.p0 = ? OR m.p1 = ? ORDER BY m.at DESC LIMIT ?`),
    byDeck: db.prepare(`SELECT deck, COUNT(*) AS games, SUM(won) AS wins FROM (
        SELECT deck0 AS deck, winner = 0 AS won FROM matches WHERE p0 = ?
        UNION ALL SELECT deck1 AS deck, winner = 1 AS won FROM matches WHERE p1 = ?) GROUP BY deck`),
    board: db.prepare(`SELECT name, rank, rating, json_extract(profile, '$.founder') AS founder FROM users WHERE banned = 0 AND rank IS NOT NULL AND json_extract(rank, '$.season') = ?
        AND json_extract(rank, '$.games') > 0
      ORDER BY json_extract(rank, '$.stars') DESC, rating DESC LIMIT ?`),
  };
  const iso = (msAgo = 0) => new Date(now().getTime() - msAgo).toISOString();
  const blocked = (a, b) => !!q.blockedBy.get(a, b, b, a);
  const signedIn = token => accounts.userForToken(token);
  const target = name => { const u = accounts.userByKey(key(name)); return u && !u.banned ? u : null; };
  const fail = (reason, status = 400) => ({ ok: false, status, reason });
  const NO_ONE = 'There’s no player with that name.';

  // The account's rank in the current season, granting last season's rewards the first time it's seen
  // after the month rolls over. Returns the rank state (with \`notice\` until the player has seen it).
  function rankState(user) {
    const { rank, ended } = rollSeason(user.rank, now());
    if (ended) {
      const p = accounts.profileOf(user);
      ended.rewards = ended.rewards.map(r => grantReward(p, r, rng));
      rank.notice = ended;
    } else if (user.rank?.notice) rank.notice = user.rank.notice;
    if (JSON.stringify(rank) !== JSON.stringify(user.rank)) { user.rank = rank; accounts.save(user); }
    return rank;
  }
  const publicRank = r => ({ ...rankOf(r.stars), stars: r.stars, peak: r.peak, peakLabel: rankOf(r.peak).label, streak: r.streak, games: r.games, wins: r.wins, season: r.season });

  return {
    setPresence(fn) { presence = fn; },
    blocked,

    // ---------------------------------------------------------------- friends
    friends(token) {
      const me = signedIn(token);
      if (!me) return fail('Please sign in again.', 401);
      const rows = q.mine.all(me.key);
      return {
        ok: true,
        friends: rows.filter(r => r.status === 'accepted').map(r => ({ name: r.name, title: founderTitle(r.founder), presence: presence(r.k) }))
          .sort((a, b) => (!!b.presence - !!a.presence) || a.name.localeCompare(b.name)),
        outgoing: rows.filter(r => r.status === 'pending').map(r => r.name),
        incoming: q.incoming.all(me.key).map(r => r.name),
        blocked: q.myBlocks.all(me.key).map(r => r.name),
      };
    },

    // Send a request, or accept one they sent.
    addFriend(token, name) {
      const me = signedIn(token);
      if (!me) return fail('Please sign in again.', 401);
      const them = target(name);
      if (!them) return fail(NO_ONE);
      if (them.key === me.key) return fail('That’s you!');
      if (blocked(me.key, them.key)) return fail('You can’t add that player.');
      const mine = q.rel.get(me.key, them.key)?.status;
      if (mine === 'accepted') return fail(`${them.name} is already your friend.`);
      if (q.friendCount.get(me.key).n >= MAX_FRIENDS) return fail(`You can have up to ${MAX_FRIENDS} friends.`);
      if (q.rel.get(them.key, me.key)?.status === 'pending') {
        q.putRel.run(me.key, them.key, 'accepted', iso());
        q.putRel.run(them.key, me.key, 'accepted', iso());
        return { ok: true, accepted: true, name: them.name };
      }
      if (mine === 'pending') return fail(`You already asked ${them.name}.`);
      q.putRel.run(me.key, them.key, 'pending', iso());
      return { ok: true, requested: true, name: them.name };
    },

    // Unfriend, cancel a request, or decline one.
    removeFriend(token, name) {
      const me = signedIn(token);
      if (!me) return fail('Please sign in again.', 401);
      const them = accounts.userByKey(key(name));
      if (them) q.dropRel.run(me.key, them.key, them.key, me.key);
      return { ok: true };
    },

    areFriends: (a, b) => q.rel.get(a, b)?.status === 'accepted',

    // ---------------------------------------------------------------- blocks and reports
    block(token, name) {
      const me = signedIn(token);
      if (!me) return fail('Please sign in again.', 401);
      const them = accounts.userByKey(key(name));
      if (!them) return fail(NO_ONE);
      if (them.key === me.key) return fail('You can’t block yourself.');
      q.block.run(me.key, them.key, iso());
      q.dropRel.run(me.key, them.key, them.key, me.key);
      return { ok: true, name: them.name };
    },
    unblock(token, name) {
      const me = signedIn(token);
      if (!me) return fail('Please sign in again.', 401);
      const them = accounts.userByKey(key(name));
      if (them) q.unblock.run(me.key, them.key);
      return { ok: true };
    },

    report(token, name, reason, note) {
      const me = signedIn(token);
      if (!me) return fail('Please sign in to report a player.', 401);
      if (!Object.hasOwn(REPORT_REASONS, reason)) return fail('Pick a reason.');
      const them = accounts.userByKey(key(name));
      if (!them) return fail('Only players with an account can be reported.');
      if (them.key === me.key) return fail('You can’t report yourself.');
      const day = iso(86_400_000);
      if (q.reportsToday.get(me.key, day).n >= REPORTS_PER_DAY) return fail('You’ve sent a lot of reports today. Try again tomorrow.');
      if (q.reportedToday.get(me.key, them.key, day)) return { ok: true, duplicate: true }; // already on file
      const text = typeof note === 'string' ? note.replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, 500) : '';
      q.addReport.run(iso(), me.key, them.key, them.name, reason, text || null);
      console.log(`Report: ${me.name} reported ${them.name} (${reason})`);
      return { ok: true };
    },

    // Admin (npm run reports).
    reports({ resolved = false } = {}) { return q.openReports.all(resolved ? 1 : 0); },
    resolveReport(id) { return Number(q.resolve.run(Number(id)).changes) > 0; },

    // ---------------------------------------------------------------- ranked
    rankOf(user) { return publicRank(rankState(user)); },
    seasonSeen(token) {
      const me = signedIn(token);
      if (!me) return fail('Please sign in again.', 401);
      const rank = rankState(me);
      if (rank.notice) { delete rank.notice; me.rank = rank; accounts.save(me); }
      return { ok: true };
    },
    ratingOf(account) { return accounts.userByKey(account?.key)?.rating ?? 1500; },

    // A finished quick-find match between two accounts. `winner` is 0, 1 or null (a draw). Returns each
    // seat's { change, before, after } (public ranks), or null when it doesn't count (the pair's daily limit).
    recordRanked(a, b, winner) {
      const ua = accounts.userByKey(a?.key), ub = accounts.userByKey(b?.key);
      if (!ua || !ub) return null;
      if (q.pairGames.get(iso(86_400_000), ua.key, ub.key, ub.key, ua.key).n >= PAIR_RANKED_PER_DAY) return null;
      const score = winner === 0 ? 1 : winner === 1 ? 0 : 0.5;
      const glicko = u => ({ rating: u.rating ?? START.rating, rd: u.rd ?? START.rd, vol: u.vol ?? START.vol });
      const ra = rate(glicko(ua), glicko(ub), score), rb = rate(glicko(ub), glicko(ua), 1 - score);
      const out = [ua, ub].map((u, seat) => {
        const before = rankState(u);
        let after = before, change = 0;
        if (winner !== null) ({ rank: after, change } = applyResult(before, winner === seat));
        Object.assign(u, seat === 0 ? ra : rb);
        u.rank = after;
        accounts.save(u);
        return { change, before: publicRank(before), after: publicRank(after) };
      });
      return out;
    },

    leaderboard(limit = 50) {
      const season = rollSeason(null, now()).rank.season;
      return q.board.all(season, limit).map((u, i) => {
        const r = JSON.parse(u.rank);
        return { place: i + 1, name: u.name, title: founderTitle(u.founder), ...rankOf(r.stars), stars: r.stars, games: r.games, wins: r.wins };
      });
    },

    // ---------------------------------------------------------------- history
    history(token) {
      const me = signedIn(token);
      if (!me) return fail('Please sign in again.', 401);
      const matches = q.history.all(me.key, me.key, me.key, HISTORY).map(m => {
        const seat = m.seat0 ? 0 : 1;
        return {
          id: m.id, at: m.at, kind: m.kind, rated: !!m.rated, turns: m.turns, seconds: m.seconds, ending: m.ending,
          deck: seat ? m.deck1 : m.deck0, oppDeck: seat ? m.deck0 : m.deck1,
          opponent: m.kind === 'ai' ? null : (seat ? m.name0 : m.name1) ?? 'Guest',
          result: m.winner === null ? 'draw' : m.winner === seat ? 'win' : 'loss',
          stars: seat ? m.stars1 : m.stars0,
        };
      });
      const decks = q.byDeck.all(me.key, me.key).map(d => ({ deck: d.deck, games: d.games, wins: d.wins ?? 0 }));
      return { ok: true, matches, decks, rank: publicRank(rankState(me)) };
    },
  };
}
