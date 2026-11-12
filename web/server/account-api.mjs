// HTTP endpoints for accounts, under /api/account/:
//   POST signup { name, password }    -> sets the session cookie, returns { name, profile }
//   POST signin { name, password }    -> same
//   POST signout
//   GET  me                           -> { name, profile }, or 401 when signed out
//   POST act { op, args }             -> applies one economy operation, returns { ok, ..., profile }
//   POST grant { name, gold, gems, dust } (admin: this machine only, with the admin token)
//   POST password { name, password }      (admin, same rules; signs the account out everywhere)
// Every POST must come from the game's own page as JSON, which a cross-site form can't send; the
// session cookie is HttpOnly and SameSite=Strict on top of that.

const COOKIE = 'md_session';
const BODY_MAX = 16_384;

export function sessionToken(req) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

function readJson(req, res, then) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return send(res, 415, { ok: false, reason: 'Expected JSON.' });
  const chunks = [];
  let size = 0;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > BODY_MAX) { send(res, 413, { ok: false, reason: 'Too large.' }); req.destroy(); return; }
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

// ctx: { accounts, sameOrigin(req), clientIp(req), secure(req), testPurchases(req), isAdmin(req) }
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
      return readJson(req, res, async ({ name, password }) => {
        const r = route === 'signup'
          ? await accounts.signUp(name, password, ctx.clientIp(req))
          : await accounts.signIn(name, password, ctx.clientIp(req));
        if (!r.ok) return send(res, route === 'signup' ? 400 : 401, r);
        send(res, 200, { ok: true, ...accounts.me(r.token), testPurchases: ctx.testPurchases(req) }, { 'Set-Cookie': cookie(r.token, ctx.secure(req)) });
      });
    case 'signout':
      accounts.signOut(sessionToken(req));
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie('', ctx.secure(req), 0) });
    case 'act':
      return readJson(req, res, ({ op, args }) => {
        const r = accounts.act(sessionToken(req), op, args, { testPurchases: ctx.testPurchases(req) });
        send(res, r.status, r.body);
      });
    case 'grant':
      if (!ctx.isAdmin(req)) return send(res, 403, { ok: false, reason: 'Admin only, from this machine.' });
      return readJson(req, res, ({ name, gold, gems, dust }) => {
        const r = accounts.grant(name, { gold, gems, dust });
        r ? send(res, 200, { ok: true, ...r }) : send(res, 404, { ok: false, reason: `No account named ${name}.` });
      });
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
