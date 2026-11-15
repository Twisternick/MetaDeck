// Player feedback: bug reports, ideas and balance notes from the game's Feedback dialog
// (POST /api/feedback), for the operator to read with `npm run feedback`.
//
// Guests can send it too, since most first-time players haven't signed up. A signed-in player's
// feedback carries their account so it can be followed up in game; nothing else identifies the sender
// (no address, no browser string). It's rate limited per address, in memory, like telemetry.

export const FEEDBACK_KINDS = { bug: 'Bug', idea: 'Idea', balance: 'Balance', other: 'Something else' };
export const FEEDBACK_MAX = 1000;
const PER_HOUR = 5;

export function createFeedback({ db, now = () => new Date() }) {
  const q = {
    add: db.prepare('INSERT INTO feedback (at, kind, message, screen, version, user, user_name) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    list: db.prepare('SELECT id, at, kind, message, screen, version, user_name FROM feedback WHERE resolved = ? ORDER BY at'),
    resolve: db.prepare('UPDATE feedback SET resolved = 1 WHERE id = ?'),
  };
  const counts = new Map(); // ip -> { n, until }

  function allowed(ip) {
    const t = Date.now();
    const e = counts.get(ip);
    if (!e || e.until <= t) {
      if (counts.size > 50_000) counts.clear();
      counts.set(ip, { n: 1, until: t + 3_600_000 });
      return true;
    }
    return ++e.n <= PER_HOUR;
  }

  return {
    // Save one piece of feedback. `user` is the sender's account ({ key, name }) or null for a guest.
    submit(body, { ip = '', user = null } = {}) {
      const kind = typeof body?.kind === 'string' && Object.hasOwn(FEEDBACK_KINDS, body.kind) ? body.kind : null;
      if (!kind) return { ok: false, reason: 'Pick what kind of feedback this is.' };
      const message = typeof body.message === 'string' ? body.message.replace(/[\u0000-\u0009\u000b-\u001f]+/g, ' ').trim() : '';
      if (message.length < 5) return { ok: false, reason: 'Tell us a little more.' };
      if (message.length > FEEDBACK_MAX) return { ok: false, reason: `Keep it under ${FEEDBACK_MAX} characters.` };
      if (!allowed(ip)) return { ok: false, status: 429, reason: 'You’ve sent a lot of feedback this hour. Thanks! Try again later.' };
      const short = (v, n) => (typeof v === 'string' ? v.replace(/[^\w .:-]/g, '').slice(0, n) : '') || null;
      q.add.run(now().toISOString(), kind, message, short(body.screen, 40), short(body.version, 20), user?.key ?? null, user?.name ?? null);
      console.log(`Feedback (${kind}) from ${user?.name ?? 'a guest'}`);
      return { ok: true };
    },

    // Admin (npm run feedback).
    list({ resolved = false } = {}) { return q.list.all(resolved ? 1 : 0); },
    resolve(id) { return Number(q.resolve.run(Number(id)).changes) > 0; },
  };
}
