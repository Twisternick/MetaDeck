// Zero-dependency server for local play: `npm start`, then open http://localhost:5173
// It serves the static site (ES modules don't load from file://) and runs online matchmaking on /ws.
//
// Other people connect to it for online play, so it only serves the game itself (index.html,
// styles.css, src/ and assets/), sends strict security headers, accepts the game's socket only from
// pages it served, and only takes Balance lab reports from this machine. Behind a reverse proxy, set
// TRUST_PROXY=1 so the per-address connection cap sees each player's address instead of the proxy's.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptWebSocket } from './server/ws.mjs';
import { createLobby } from './server/lobby.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || process.argv[2]) || 5173;
const trustProxy = process.env.TRUST_PROXY === '1';
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.ttf': 'font/ttf', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
// The only paths the game loads. Everything else in web/ (the server, tools, tests, reports) stays private.
const PUBLIC = [/^\/index\.html$/, /^\/styles\.css$/, /^\/src\//, /^\/assets\//];

const lobby = createLobby();

function securityHeaders(req) {
  const host = req.headers.host ?? '';
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "worker-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      `connect-src 'self' ws://${host} wss://${host}`,
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
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  };
}

const loopback = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const localHost = host => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host ?? '');

// A request from a page this server served: no Origin (not a browser) or an Origin naming this host.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  const host = (trustProxy && req.headers['x-forwarded-host']) || req.headers.host;
  try { return new URL(origin).host === host; } catch { return false; }
}

const clientIp = req => (trustProxy && String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim()) || req.socket.remoteAddress || '';

// The Balance lab's "Send stats to Claude" button saves its report here, where Claude can read it.
// It writes a file, so it only accepts requests from this machine, addressed to localhost (which stops
// DNS rebinding), from the game's own page, as JSON (which a cross-site form can't send).
const reportFile = path.join(root, 'reports', 'meta-latest.md');
function saveReport(req, res) {
  const local = loopback.has(req.socket.remoteAddress) && localHost(req.headers.host) && sameOrigin(req)
    && /^application\/json\b/i.test(req.headers['content-type'] ?? '');
  if (!local) { res.writeHead(403).end('Reports can only be saved from the machine running the server.'); return; }
  const chunks = [];
  let size = 0;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > 1_000_000) { res.writeHead(413).end('Too large'); req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    let markdown;
    try { ({ markdown } = JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { /* handled below */ }
    if (typeof markdown !== 'string' || !markdown) { res.writeHead(400).end('Expected { markdown }'); return; }
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFile(reportFile, markdown, err => {
      if (err) { res.writeHead(500).end('Could not save the report'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ path: 'web/reports/meta-latest.md' }));
    });
  });
}

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end('Bad request'); return; }
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.resolve(root, '.' + urlPath);
  const ok = !urlPath.includes('\0') && !urlPath.split(/[\\/]/).some(part => part.startsWith('.'))
    && file.startsWith(root + path.sep) && PUBLIC.some(re => re.test(urlPath.replaceAll('\\', '/')));
  if (!ok) { res.writeHead(404).end('Not found'); return; }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, {
      ...securityHeaders(req),
      'Content-Type': types[path.extname(file)] ?? 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  try {
    if (req.url === '/api/meta-report') {
      if (req.method === 'POST') saveReport(req, res); else res.writeHead(405, { Allow: 'POST' }).end();
      return;
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
    lobby.connect(ws);
  });
});

server.listen(port, () => console.log(`MetaDeck running at http://localhost:${server.address().port}`));
