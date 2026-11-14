// Cookieless analytics and browser error reports.
//
// Analytics: the browser sends a few named events (POST /api/event { name, data }), and the server adds
// some of its own (sign-ups). Nothing is stored in the browser to recognise it later: a guest is
// counted with a visitor id hashed from their address, browser and a random salt that changes every
// day (and is never stored), so visitors can be counted per day but not followed from one day to the
// next. Signed-in players' events carry their account, which is what retention is measured on. Event
// names and fields are a fixed list, so the table can't fill with junk. `npm run report` reads it.
//
// Errors: the browser's uncaught errors arrive at POST /api/client-error and go to the server log.
// Both are rate limited per address.

import crypto from 'node:crypto';

// Each event and the fields it may carry. Field values are short strings, numbers or booleans.
export const EVENTS = {
  visit: [],
  match_start: ['mode', 'deck'],      // mode: ai | online | watch
  match_end: ['mode', 'deck', 'won'],
  pack_open: ['kind'],
  signup: [],                         // sent by the server
};
const EVENTS_PER_HOUR = 300;
const ERRORS_PER_HOUR = 30;

export function createTelemetry({ db, now = () => new Date() }) {
  const insert = db.prepare('INSERT INTO events (at, day, visitor, user, name, data) VALUES (?, ?, ?, ?, ?, ?)');
  const salt = { day: null, value: null };
  const counts = new Map(); // `${kind}:${ip}` -> { n, until }

  function allowed(kind, ip, max) {
    const k = `${kind}:${ip}`;
    const e = counts.get(k);
    const t = Date.now();
    if (!e || e.until <= t) {
      if (counts.size > 50_000) counts.clear();
      counts.set(k, { n: 1, until: t + 3_600_000 });
      return true;
    }
    return ++e.n <= max;
  }

  function visitor(ip, ua) {
    const day = now().toISOString().slice(0, 10);
    if (salt.day !== day) { salt.day = day; salt.value = crypto.randomBytes(16).toString('hex'); }
    return crypto.createHash('sha256').update(`${salt.value}|${ip}|${ua}`).digest('base64url').slice(0, 16);
  }

  return {
    // Record one event. `who` is { ip, ua, user } (user: an account key or null). Returns false if refused.
    track(name, data, { ip = '', ua = '', user = null } = {}) {
      const fields = Object.hasOwn(EVENTS, name) ? EVENTS[name] : null;
      if (!fields || !allowed('event', ip, EVENTS_PER_HOUR)) return false;
      const clean = {};
      for (const f of fields) {
        const v = data?.[f];
        if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) clean[f] = v;
        else if (typeof v === 'string' && v.length <= 40) clean[f] = v.replace(/[^\w:-]/g, '');
      }
      const at = now();
      insert.run(at.toISOString(), at.toISOString().slice(0, 10), visitor(ip, String(ua).slice(0, 300)), user, name,
        Object.keys(clean).length ? JSON.stringify(clean) : null);
      return true;
    },

    // Log a browser error. Returns false if refused.
    clientError(body, ip = '') {
      if (!body || typeof body !== 'object' || !allowed('error', ip, ERRORS_PER_HOUR)) return false;
      const s = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').slice(0, n);
      const where = body.source ? ` at ${s(body.source, 200)}:${Number(body.line) || 0}` : '';
      console.error(`client: ${s(body.message, 500)}${where} [version ${s(body.version, 20)}] ${s(body.stack, 2000)}`);
      return true;
    },
  };
}
