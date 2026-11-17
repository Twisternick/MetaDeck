// Zero-dependency server for local play: `npm start`, then open http://localhost:5173
// It serves the static site (ES modules don't load from file://) and runs online matchmaking on /ws.
//
// Other people connect to it for online play, so it only serves the game itself (index.html,
// styles.css, src/ and assets/), sends strict security headers, accepts the game's socket only from
// pages it served, and only takes Balance lab reports from this machine. Behind a reverse proxy or a
// Cloudflare Tunnel, set TRUST_PROXY=1 so rate limits see each player's address instead of the proxy's
// (see HOSTING.md).
//
// Player accounts (server/accounts.mjs), match history and analytics are kept in data/metadeck.db, or
// DATA_DIR if set. That folder is never served. On startup the server writes data/admin-token, which the
// admin tools (grant, set-password, users, maintenance) use to talk to it from this machine.
//
// Environment: PORT, DATA_DIR, TRUST_PROXY=1, LOG_DIR (default DATA_DIR/logs), BACKUP_DIR (nightly
// database copies, kept BACKUP_DAYS days, default 14). Real-money Gem purchases are configured in
// DATA_DIR/paddle.json (server/payments.mjs). Who runs the game and the contact address shown to players
// are in DATA_DIR/site.json (server/site.mjs).

import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptWebSocket } from './server/ws.mjs';
import { createLobby } from './server/lobby.mjs';
import { accountsIn } from './server/accounts.mjs';
import { createSocial } from './server/social.mjs';
import { createPayments, loadPaddleConfig } from './server/payments.mjs';
import { loadBlockedNames } from './server/names.mjs';
import { createAiMatches } from './server/ai-match.mjs';
import { createTelemetry } from './server/telemetry.mjs';
import { createFeedback } from './server/feedback.mjs';
import { createSite, loadSiteConfig } from './server/site.mjs';
import { installLog } from './server/log.mjs';
import { backup } from './server/db.mjs';
import { createPages } from './server/pages.mjs';
import { createLiveMeta } from './server/live-meta.mjs';
import { handleAccountApi, sessionToken } from './server/account-api.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const portArg = process.env.PORT || process.argv[2];
const port = portArg !== undefined && /^\d+$/.test(portArg) ? Number(portArg) : 5173; // 0 picks a free port (the tests)
const trustProxy = process.env.TRUST_PROXY === '1';
// The site's public address (e.g. https://play.example.com), when set: link previews need absolute URLs,
// so index.html's share image gets it prefixed and an og:url is added.
const publicUrl = (process.env.PUBLIC_URL ?? '').replace(/\/+$/, '');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.ttf': 'font/ttf', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};
// The only paths the game loads, plus the privacy and terms pages. Everything else in web/ (the server,
// tools, tests, reports) stays private. In assets/audio only the game's own sound slots are served
// (click.mp3, play-RPG.mp3, …): the sound libraries they were cut from may sit in subfolders there, and
// their licences forbid handing out the original files.
const PUBLIC = [/^\/index\.html$/, /^\/checkout\.html$/, /^\/styles\.css$/, /^\/pages\.css$/,/^\/src\//, /^\/assets\/(?!audio\/)/,
  /^\/assets\/audio\/[A-Za-z0-9-]+\.(mp3|ogg)$/, /^\/legal\/[a-z-]+\.(html|css)$/];

const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
fs.mkdirSync(dataDir, { recursive: true });
installLog(path.resolve(process.env.LOG_DIR || path.join(dataDir, 'logs')));
process.on('uncaughtException', err => {
  // Unknown state: log it and stop, and let the supervisor (HOSTING.md) start a fresh process.
  console.error('fatal:', err);
  try { accounts.close(); } catch { /* already closed */ }
  process.exit(1);
});
process.on('unhandledRejection', err => console.error('unhandled rejection:', err));
// A live database in a synced folder risks corruption, and sends password hashes to the cloud. Compared
// with the folders Windows says OneDrive syncs (a path merely containing the word isn't one), plus the
// usual Dropbox, Google Drive and iCloud folder names.
const syncedRoots = [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial]
  .filter(Boolean).map(p => path.resolve(p).toLowerCase() + path.sep);
const synced = syncedRoots.some(r => (dataDir.toLowerCase() + path.sep).startsWith(r))
  || /[\\/](dropbox|google drive|icloud ?drive)[\\/]/i.test(dataDir + path.sep);
if (synced) {
  console.warn(`Warning: the data folder ${dataDir} is inside a synced folder. Set DATA_DIR to a folder outside it (see HOSTING.md).`);
}

loadBlockedNames(path.join(dataDir, 'blocked-names.txt'));
// FOUNDER_SLOTS: how many first sign-ups become Meta Founders (default 100; 0 turns it off).
const accounts = accountsIn(dataDir, process.env.FOUNDER_SLOTS !== undefined ? { founderSlots: Math.max(0, Number(process.env.FOUNDER_SLOTS) || 0) } : {});
const social = createSocial({ accounts });
const payments = createPayments({ accounts, config: loadPaddleConfig(path.join(dataDir, 'paddle.json')) });
if (payments.enabled) console.log(`Gem purchases are on (Paddle ${payments.publicConfig().sandbox ? 'sandbox' : 'live'}).`);
const site = createSite(loadSiteConfig(path.join(dataDir, 'site.json')));
if (site.missing.length) console.warn(`The legal pages still show placeholders for ${site.missing.join(', ')}. Fill them in DATA_DIR/site.json (see HOSTING.md).`);
const aiMatches = createAiMatches({ accounts });
const telemetry = createTelemetry({ db: accounts.db });
const feedback = createFeedback({ db: accounts.db });
const liveMeta = createLiveMeta({ db: accounts.db });
const lobby = createLobby({ accounts, social });
const adminToken = crypto.randomBytes(24).toString('base64url');
fs.writeFileSync(path.join(dataDir, 'admin-token'), adminToken, { mode: 0o600 });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { accounts.close(); process.exit(0); });

// The build version: a hash of every file the browser loads except the art and sound. A page that
// finds a different version (GET /api/version) knows the game was updated under it and offers a reload.
function buildVersion() {
  const h = crypto.createHash('sha1');
  const add = f => h.update(path.relative(root, f)).update('\0').update(fs.readFileSync(f)).update('\0');
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f); else add(f);
    }
  };
  add(path.join(root, 'index.html'));
  add(path.join(root, 'styles.css'));
  walk(path.join(root, 'src'));
  return h.digest('hex').slice(0, 10);
}
const version = buildVersion();
const startedAt = Date.now();

// Nightly copies of the database, when BACKUP_DIR is set: one shortly after startup, then every 6 hours
// a check whether today's copy exists yet.
const backupDir = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : null;
function runBackup(force = false) {
  if (!backupDir) return null;
  try {
    const file = backup(accounts.db, backupDir, { keepDays: Number(process.env.BACKUP_DAYS) || 14, force });
    if (file) console.log(`Backed up the database to ${file}`);
    return file;
  } catch (err) {
    console.error('backup failed:', err);
    return null;
  }
}
if (backupDir) {
  setTimeout(runBackup, 60_000).unref();
  setInterval(runBackup, 6 * 3_600_000).unref();
}

// The checkout page (checkout.html) is the only page allowed to load anything from another site: Paddle's
// checkout script, its frame and its API. The game itself loads nothing from third parties.
const PADDLE = 'https://*.paddle.com';
function securityHeaders(req, { checkout = false } = {}) {
  const host = req.headers.host ?? '';
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      checkout ? `script-src 'self' ${PADDLE}` : "script-src 'self'",
      "worker-src 'self'",
      checkout ? `style-src 'self' 'unsafe-inline' ${PADDLE}` : "style-src 'self' 'unsafe-inline'",
      checkout ? `font-src 'self' ${PADDLE}` : "font-src 'self'",
      checkout ? `img-src 'self' data: blob: ${PADDLE}` : "img-src 'self' data: blob:",
      ...(checkout ? [`frame-src ${PADDLE}`] : []),
      "media-src 'self'",
      checkout ? `connect-src 'self' ${PADDLE}` : `connect-src 'self' ws://${host} wss://${host}`,
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': `camera=(), microphone=(), geolocation=(), payment=(${checkout ? '"https://buy.paddle.com" "https://sandbox-buy.paddle.com"' : ''}), usb=()`,
  };
}

const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const localHost = host => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host ?? '');
// Headers a proxy or tunnel adds. A request carrying any of them came from outside, even though it
// arrives from localhost (cloudflared connects from this machine).
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'x-real-ip', 'forwarded', 'cf-connecting-ip', 'cf-ray', 'true-client-ip'];
const proxied = req => PROXY_HEADERS.some(h => req.headers[h] !== undefined);
let warnedProxy = false;

// A request from a page this server served: no Origin (not a browser) or an Origin naming this host.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = (trustProxy && req.headers['x-forwarded-host']) || req.headers.host;
  try { return new URL(origin).host === host; } catch { return false; }
}

function clientIp(req) {
  if (!trustProxy) {
    if (!warnedProxy && proxied(req)) {
      warnedProxy = true;
      console.warn('Requests are arriving through a proxy or tunnel, but TRUST_PROXY is not set: every player shares one address for rate limits. Set TRUST_PROXY=1.');
    }
    return req.socket.remoteAddress || '';
  }
  return String(req.headers['cf-connecting-ip'] ?? '').trim()
    || String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
    || req.socket.remoteAddress || '';
}

// Requests made on this machine, to localhost, not relayed by a proxy: the Balance lab report, test
// purchases and the admin tools. Checking the proxy headers too means a tunnel that rewrites the Host
// header to localhost still can't hand these to the world.
const fromThisMachine = req => loopback.has(req.socket.remoteAddress) && localHost(req.headers.host) && !proxied(req);

function readBody(req, res, max, then) {
  const chunks = [];
  let size = 0;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > max) { res.writeHead(413).end('Too large'); req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    let body = null;
    try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* handled by the caller */ }
    then(body);
  });
}
const json = (res, status, body) => res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
const isJson = req => /^application\/json\b/i.test(req.headers['content-type'] ?? '');

// The Balance lab's "Send stats to Claude" button saves its report here, where Claude can read it.
// It writes a file, so it only accepts requests from this machine, addressed to localhost (which stops
// DNS rebinding), from the game's own page, as JSON (which a cross-site form can't send).
const reportFile = path.join(root, 'reports', 'meta-latest.md');
const pages = createPages({ publicUrl, reportFile });
function saveReport(req, res) {
  if (!fromThisMachine(req) || !sameOrigin(req) || !isJson(req)) { res.writeHead(403).end('Reports can only be saved from the machine running the server.'); return; }
  readBody(req, res, 1_000_000, body => {
    const markdown = body?.markdown;
    if (typeof markdown !== 'string' || !markdown) { res.writeHead(400).end('Expected { markdown }'); return; }
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFile(reportFile, markdown, err => {
      if (err) { res.writeHead(500).end('Could not save the report'); return; }
      json(res, 200, { path: 'web/reports/meta-latest.md' });
    });
  });
}

// For search engines. Crawlers may read everything the game serves except the API. The sitemap and
// the game's structured data (schema.org) need absolute URLs, so they're only sent when PUBLIC_URL is set.
const crawlerPages = () => ['/', ...pages.paths(), '/legal/terms.html', '/legal/privacy.html', '/legal/refunds.html'];
function serveCrawlerFile(req, res, urlPath) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
  let body;
  if (urlPath === '/robots.txt') {
    body = `User-agent: *\nDisallow: /api/\n${publicUrl ? `\nSitemap: ${publicUrl}/sitemap.xml\n` : ''}`;
  } else {
    if (!publicUrl) { res.writeHead(404).end('Not found'); return; }
    body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + crawlerPages().map(p => `  <url><loc>${publicUrl}${p}</loc></url>\n`).join('') + '</urlset>\n';
  }
  const type = urlPath === '/robots.txt' ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8';
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  res.end(req.method === 'HEAD' ? undefined : body);
}
const gameJsonLd = () => JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'VideoGame',
  name: 'MetaDeck',
  url: `${publicUrl}/`,
  image: `${publicUrl}/assets/img/ui/key-art.webp`,
  description: 'A free online card battler where every deck is a video game genre: FPS, Horror, Platformer, RPG, Racing, Fighting, Sports, Strategy, City Builder and Card Game.',
  genre: ['Card battler', 'Collectible card game', 'Strategy'],
  gamePlatform: 'Web browser',
  applicationCategory: 'Game',
  operatingSystem: 'Any',
  playMode: ['SinglePlayer', 'MultiPlayer'],
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
}).replaceAll('<', '\\u003c');

// Static files. Each has an ETag, so a browser revalidating gets a tiny 304 instead of the file.
// Art, sound and fonts may be cached for a day (and used stale for a week while refreshing), so a
// proxy like Cloudflare can serve them; the code is always revalidated so updates show up at once.
// On localhost everything is revalidated, so new art from the Art Studio appears on the next load.
function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end('Bad request'); return; }
  if (urlPath === '/robots.txt' || urlPath === '/sitemap.xml') { serveCrawlerFile(req, res, urlPath); return; }
  // The content pages (decks, cards, meta, how to play) are built from the card data, not read from disk.
  const page = pages.render(urlPath);
  if (page) {
    const headers = { ...securityHeaders(req), ETag: page.etag, 'Cache-Control': 'no-cache' };
    if (req.headers['if-none-match'] === page.etag) { res.writeHead(304, headers).end(); return; }
    res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(page.html) });
    res.end(req.method === 'HEAD' ? undefined : page.html);
    return;
  }
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.resolve(root, '.' + urlPath);
  const ok = !urlPath.includes('\0') && !urlPath.split(/[\\/]/).some(part => part.startsWith('.'))
    && file.startsWith(root + path.sep) && PUBLIC.some(re => re.test(urlPath.replaceAll('\\', '/')));
  if (!ok) { res.writeHead(404).end('Not found'); return; }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
    // index.html and the legal pages are filled in from the settings as they're sent, so their ETag
    // covers those too.
    const filled = urlPath === '/index.html' || /^\/legal\/.+\.html$/.test(urlPath);
    const etag = `W/"${stat.size.toString(36)}-${Math.floor(stat.mtimeMs).toString(36)}${filled ? `-${site.tag}` : ''}"`;
    const media = urlPath.startsWith('/assets/') && !localHost(req.headers.host);
    const headers = {
      ...securityHeaders(req, { checkout: urlPath === '/checkout.html' }),
      ETag: etag,
      'Cache-Control': media ? 'public, max-age=86400, stale-while-revalidate=604800' : 'no-cache',
    };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers).end(); return; }
    const type = types[path.extname(file)] ?? 'application/octet-stream';
    if (filled) {
      let html = fs.readFileSync(file, 'utf8');
      if (urlPath === '/index.html') {
        if (publicUrl) {
          html = html.replaceAll('content="assets/', `content="${publicUrl}/assets/`)
            .replace('<meta property="og:type"', `<meta property="og:url" content="${publicUrl}/">\n  <meta property="og:type"`)
            .replace('</head>', `  <link rel="canonical" href="${publicUrl}/">\n  <script type="application/ld+json">${gameJsonLd()}</script>\n</head>`);
        }
        // The footer's Contact link reads this.
        if (site.contactEmail) html = html.replace('<meta name="theme-color"', `<meta name="contact" content="${site.contactEmail}">\n  <meta name="theme-color"`);
      } else {
        html = site.fill(html);
      }
      const page = Buffer.from(html);
      res.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Length': page.length });
      res.end(req.method === 'HEAD' ? undefined : page);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Length': stat.size });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}

const isAdmin = req => {
  const given = Buffer.from(String(req.headers['x-admin-token'] ?? ''));
  const want = Buffer.from(adminToken);
  return fromThisMachine(req) && given.length === want.length && crypto.timingSafeEqual(given, want);
};
const track = (name, data, req, user = null) => {
  try { return telemetry.track(name, data, { ip: clientIp(req), ua: req.headers['user-agent'] ?? '', user }); }
  catch (err) { console.error('telemetry:', err); return false; }
};

// The visitor's country, for regional rules (economy.js NO_PAID_PACKS): Cloudflare's CF-IPCountry
// header, trusted only behind the tunnel (TRUST_PROXY=1). Unknown otherwise.
const country = req => {
  const c = trustProxy ? String(req.headers['cf-ipcountry'] ?? '').toUpperCase() : '';
  return /^[A-Z]{2}$/.test(c) && c !== 'XX' ? c : null;
};

// Account endpoints. Test purchases (Gems for free, clearly labelled) are only offered to a browser on this
// machine; a deployed server never grants them.
const accountCtx = {
  accounts, social, aiMatches, sameOrigin, clientIp, isAdmin, track, country,
  secure: req => !!req.socket.encrypted || (trustProxy && req.headers['x-forwarded-proto'] === 'https'),
  testPurchases: fromThisMachine,
  online: () => lobby.stats(),
};

// Health check for uptime monitors: 200 while the database answers, 503 otherwise.
function health(res) {
  let db = true;
  try { accounts.db.prepare('SELECT 1').get(); } catch { db = false; }
  json(res, db ? 200 : 503, { ok: db, version, uptime: Math.round((Date.now() - startedAt) / 1000), ...lobby.stats() });
}

// Admin, from this machine with the admin token (tools/maintenance.mjs and tools/backup.mjs):
//   POST /api/admin/maintenance { minutes, exit }   POST /api/admin/backup   POST /api/admin/ping
//   POST /api/admin/reports { resolved }   resolve { id }   rename { from, to }   ban { name, on }
//   POST /api/admin/founders   founder { name, on }   resetfounders
//   POST /api/admin/feedback { resolved }   feedbackdone { id }
function admin(req, res, route) {
  if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
  if (!isAdmin(req)) return json(res, 403, { ok: false, reason: 'Admin only, from this machine.' });
  readBody(req, res, 4096, body => {
    if (route === 'ping') return json(res, 200, { ok: true });
    // Moderation (tools/moderate.mjs).
    if (route === 'reports') return json(res, 200, { ok: true, reports: social.reports({ resolved: body?.resolved === true }) });
    if (route === 'resolve') return json(res, 200, { ok: social.resolveReport(body?.id) });
    if (route === 'rename') { const r = accounts.rename(body?.from, body?.to); return json(res, r.ok ? 200 : 400, r); }
    if (route === 'ban') { const r = accounts.setBanned(body?.name, body?.on !== false); return json(res, r.ok ? 200 : 400, r); }
    if (route === 'founders') return json(res, 200, { ok: true, founders: accounts.founders() });
    if (route === 'founder') { const r = accounts.setFounder(body?.name, body?.on !== false); return json(res, r.ok ? 200 : 400, r); }
    if (route === 'resetfounders') return json(res, 200, { ok: true, reset: accounts.resetFounders() });
    // Player feedback (tools/feedback.mjs).
    if (route === 'feedback') return json(res, 200, { ok: true, feedback: feedback.list({ resolved: body?.resolved === true }) });
    if (route === 'feedbackdone') return json(res, 200, { ok: feedback.resolve(body?.id) });
    if (route === 'backup') {
      if (!backupDir) return json(res, 400, { ok: false, reason: 'Set BACKUP_DIR to turn on backups.' });
      const file = runBackup(true);
      return json(res, file ? 200 : 500, file ? { ok: true, file } : { ok: false, reason: 'The backup failed; see the log.' });
    }
    if (route === 'maintenance') {
      const minutes = Math.max(0, Math.min(60, Number(body?.minutes) || 0));
      const exit = body?.exit !== false;
      const started = lobby.maintenance(minutes, () => {
        console.log(exit ? 'Maintenance: no matches running, shutting down.' : 'Maintenance: no matches running. Safe to restart.');
        if (exit) setTimeout(() => { accounts.close(); process.exit(0); }, 500);
      });
      console.log(`Maintenance requested: ${minutes} minute warning${exit ? ', then exit' : ''}.`);
      return json(res, 200, { ok: true, started, ...lobby.stats() });
    }
    json(res, 404, { ok: false, reason: 'Not found.' });
  });
}

const server = http.createServer((req, res) => {
  try {
    const pathname = new URL(req.url, 'http://x').pathname;
    const route = /^\/api\/account\/([a-z]+)$/.exec(pathname);
    if (route) { handleAccountApi(req, res, route[1], accountCtx); return; }
    const adminRoute = /^\/api\/admin\/([a-z]+)$/.exec(pathname);
    if (adminRoute) { admin(req, res, adminRoute[1]); return; }
    switch (pathname) {
      case '/api/meta-report':
        if (req.method === 'POST') saveReport(req, res); else res.writeHead(405, { Allow: 'POST' }).end();
        return;
      case '/healthz':
        return health(res);
      case '/api/version':
        return json(res, 200, { version });
      case '/api/live-meta': {
        const q = new URL(req.url, 'http://x').searchParams;
        return json(res, 200, liveMeta.get({ days: q.get('days'), source: q.get('source') }));
      }
      case '/api/founders':
        return json(res, 200, accounts.founderSpots());
      case '/api/shop/config':
        return json(res, 200, { ...payments.publicConfig(), country: country(req) });
      case '/api/shop/checkout':
        if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
        if (!sameOrigin(req) || !isJson(req)) return json(res, 403, { ok: false });
        return readBody(req, res, 4096, body => {
          payments.checkout(sessionToken(req), body, { country: country(req) })
            .then(r => json(res, r.status ?? 200, r))
            .catch(err => { console.error('checkout:', err); json(res, 500, { ok: false, reason: 'Server error.' }); });
        });
      case '/api/paddle/webhook': {
        // From Paddle's servers: no Origin to check; the signature is what counts. The raw body is kept
        // byte for byte, because the signature covers it exactly.
        if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
        const chunks = [];
        let size = 0;
        req.on('data', c => { size += c.length; if (size > 1_000_000) { res.writeHead(413).end(); req.destroy(); } else chunks.push(c); });
        req.on('end', () => {
          if (res.writableEnded) return;
          try {
            const r = payments.webhook(Buffer.concat(chunks), req.headers['paddle-signature']);
            json(res, r.status, r.body);
          } catch (err) {
            console.error('paddle webhook:', err); // Paddle retries on an error
            json(res, 500, { ok: false });
          }
        });
        return;
      }
      case '/api/feedback':
        if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
        if (!sameOrigin(req) || !isJson(req)) return json(res, 403, { ok: false });
        return readBody(req, res, 8192, body => {
          const r = feedback.submit(body, { ip: clientIp(req), user: accounts.accountFor(sessionToken(req)) });
          json(res, r.ok ? 200 : r.status ?? 400, r);
        });
      case '/api/event':
      case '/api/client-error':
        if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
        if (!sameOrigin(req) || !isJson(req)) return json(res, 403, { ok: false });
        return readBody(req, res, 8192, body => {
          if (pathname === '/api/client-error') telemetry.clientError(body, clientIp(req));
          else track(String(body?.name ?? ''), body?.data, req, accounts.accountFor(sessionToken(req))?.key ?? null);
          json(res, 202, { ok: true });
        });
    }
    serveStatic(req, res);
  } catch (err) {
    console.error('http:', err);
    if (!res.headersSent) res.writeHead(500).end();
    else res.destroy();
  }
});
// Drop clients that dribble out their request headers to tie up connections.
server.headersTimeout = 10_000;
server.requestTimeout = 30_000;

server.on('upgrade', (req, socket) => {
  socket.on('error', () => socket.destroy());
  let pathname;
  try { pathname = new URL(req.url, 'http://x').pathname; } catch { pathname = null; }
  // Only the game's own page may open the socket: another site can't play (or spam) as its visitors.
  if (pathname !== '/ws' || !sameOrigin(req)) { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  acceptWebSocket(req, socket, ws => {
    ws.ip = clientIp(req);
    ws.account = accounts.accountFor(sessionToken(req));
    lobby.connect(ws);
  });
});

server.listen(port, () => console.log(`MetaDeck running at http://localhost:${server.address().port} (version ${version})`));
