// HTTP endpoints for accounts, under /api/account/:
//   POST signup { name, password }    -> sets the session cookie, returns { name, profile, info, recoveryCode }
//   POST signin { name, password }    -> same, without the recovery code
//   POST reset { name, code, password } -> forgotten password: like signup, with a fresh recovery code
//   POST signout
//   GET  me                           -> { name, profile, info }, or 401 when signed out
//   POST newpassword { current, password } -> { signedOut } (other devices signed out; this one stays)
//   POST recovery { password }        -> { recoveryCode } (replaces the old code)
//   POST signoutothers                -> { signedOut }
//   POST delete { password, confirm } -> deletes the account and clears the cookie
//   POST act { op, args }             -> applies one economy operation, returns { ok, ..., profile }
//   POST aistart { myDeck, myCards, oppDeck, oppCards } -> { ticket, seed, firstPlayer } for a checked vs-AI match
//   POST aifinish { ticket, moves }   -> replays the match on the server and pays it out: { won, out, profile }
//   POST grant { name, gold, gems, dust, holo } (admin: this machine only, with the admin token)
//   POST password { name, password }      (admin, same rules; signs the account out everywhere)
//   POST stats                            (admin) -> account counts, every account, and who is online now
// Every POST must come from the game's own page as JSON, which a cross-site form can't send; the
// session cookie is HttpOnly and SameSite=Strict on top of that.

const COOKIE = 'md_session';
const BODY_MAX = 16_384;
const MOVES_MAX = 262_144; // aifinish carries every move of a match

export function sessionToken(req) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

function readJson(req, res, then, max = BODY_MAX) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return send(res, 415, { ok: false, reason: 'Expected JSON.' });
  const chunks = [];
  let size = 0;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > max) { send(res, 413, { ok: false, reason: 'Too large.' }); req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    let body;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(res, 400, { ok: false, reason: 'Bad JSON.' }); }
    if (!body || typeof body !== 'object') return send(res, 400, { ok: false, reason: 'Bad request.' });
    Promise.resolve(then(body)).catch(err => { console.error('account api:', err); if (!res.headersSent) send(res, 500, { ok: false, reason: 'Server error.' }); });
  });
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }).end(JSON.stringify(body));
}

const cookie = (token, secure, maxAge = 30 * 86_400) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;

// ctx: { accounts, aiMatches, track(name, data, req, user), sameOrigin(req), clientIp(req), secure(req), testPurchases(req), isAdmin(req), online() }
export function handleAccountApi(req, res, route, ctx) {
  const { accounts } = ctx;
  const post = req.method === 'POST';
  if (post && !ctx.sameOrigin(req)) return send(res, 403, { ok: false, reason: 'Forbidden.' });

  if (route === 'me' && req.method === 'GET') {
    const me = accounts.me(sessionToken(req));
    return me ? send(res, 200, { ok: true, ...me, testPurchases: ctx.testPurchases(req) }) : send(res, 401, { ok: false, reason: 'Signed out.' });
  }
  if (!post) return send(res, 405, { ok: false, reason: 'Method not allowed.' }, { Allow: 'POST' });

  switch (route) {
    case 'signup':
    case 'signin':
    case 'reset':
      return readJson(req, res, async ({ name, password, code }) => {
        const ip = ctx.clientIp(req);
        const r = route === 'signup' ? await accounts.signUp(name, password, ip)
          : route === 'reset' ? await accounts.resetPassword(name, code, password, ip)
          : await accounts.signIn(name, password, ip);
        if (!r.ok) return send(res, route === 'signin' ? 401 : 400, r);
        if (route === 'signup') ctx.track?.('signup', {}, req, accounts.accountFor(r.token)?.key ?? null);
        send(res, 200, { ok: true, ...accounts.me(r.token), recoveryCode: r.recoveryCode, testPurchases: ctx.testPurchases(req) },
          { 'Set-Cookie': cookie(r.token, ctx.secure(req)) });
      });
    case 'signout':
      accounts.signOut(sessionToken(req));
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('', ctx.secure(req), 0) });
    case 'newpassword':
      return readJson(req, res, async ({ current, password }) => {
        const r = await accounts.changePassword(sessionToken(req), current, password, ctx.clientIp(req));
        send(res, r.status ?? (r.ok ? 200 : 400), r);
      });
    case 'recovery':
      return readJson(req, res, async ({ password }) => {
        const r = await accounts.newRecoveryCode(sessionToken(req), password, ctx.clientIp(req));
        send(res, r.status ?? (r.ok ? 200 : 400), r);
      });
    case 'signoutothers': {
      const r = accounts.signOutOthers(sessionToken(req));
      return send(res, r.status ?? 200, r);
    }
    case 'delete':
      return readJson(req, res, async ({ password, confirm }) => {
        const r = await accounts.deleteAccount(sessionToken(req), password, confirm, ctx.clientIp(req));
        send(res, r.status ?? (r.ok ? 200 : 400), r, r.ok ? { 'Set-Cookie': cookie('', ctx.secure(req), 0) } : {});
      });
    case 'act':
      return readJson(req, res, ({ op, args }) => {
        const r = accounts.act(sessionToken(req), op, args, { testPurchases: ctx.testPurchases(req) });
        send(res, r.status, r.body);
      });
    case 'aistart':
    case 'aifinish': {
      const account = accounts.accountFor(sessionToken(req));
      if (!account) return send(res, 401, { ok: false, reason: 'Please sign in again.' });
      if (!ctx.aiMatches) return send(res, 404, { ok: false, reason: 'Not found.' });
      return readJson(req, res, body => {
        const r = route === 'aistart' ? ctx.aiMatches.start(account, body) : ctx.aiMatches.finish(account, body);
        const extra = route === 'aifinish' && r.ok ? { profile: accounts.profileFor(account) } : {};
        send(res, r.status ?? 200, { ...r, ...extra });
      }, route === 'aifinish' ? MOVES_MAX : BODY_MAX);
    }
    case 'grant':
      if (!ctx.isAdmin(req)) return send(res, 403, { ok: false, reason: 'Admin only, from this machine.' });
      return readJson(req, res, ({ name, gold, gems, dust, holo }) => {
        const r = accounts.grant(name, { gold, gems, dust, holo });
        r ? send(res, 200, { ok: true, ...r }) : send(res, 404, { ok: false, reason: `No account named ${name}.` });
      });
    case 'stats':
      if (!ctx.isAdmin(req)) return send(res, 403, { ok: false, reason: 'Admin only, from this machine.' });
      return send(res, 200, { ok: true, ...accounts.stats(), online: ctx.online?.() ?? null });
    case 'password':
      if (!ctx.isAdmin(req)) return send(res, 403, { ok: false, reason: 'Admin only, from this machine.' });
      return readJson(req, res, async ({ name, password }) => {
        const r = await accounts.setPassword(name, password);
        send(res, r.ok ? 200 : 400, r);
      });
    default:
      return send(res, 404, { ok: false, reason: 'Not found.' });
  }
}
