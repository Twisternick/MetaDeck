// Zero-dependency server for local play: `npm start`, then open http://localhost:5173
// It serves the static site (ES modules don't load from file://) and runs online matchmaking on /ws.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acceptWebSocket } from './server/ws.mjs';
import { createLobby } from './server/lobby.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || process.argv[2]) || 5173;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.ttf': 'font/ttf', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

const lobby = createLobby();

// The Balance lab's "Send stats to Claude" button saves its report here, where Claude can read it.
const reportFile = path.join(root, 'reports', 'meta-latest.md');
function saveReport(req, res) {
  let body = '';
  req.setEncoding('utf8');
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 1_000_000) { res.writeHead(413).end('Too large'); req.destroy(); }
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    let markdown;
    try { ({ markdown } = JSON.parse(body)); } catch { /* handled below */ }
    if (typeof markdown !== 'string' || !markdown) { res.writeHead(400).end('Expected { markdown }'); return; }
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, markdown);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ path: 'web/reports/meta-latest.md' }));
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/meta-report') { saveReport(req, res); return; }
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.normalize(path.join(root, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

server.on('upgrade', (req, socket) => {
  if (new URL(req.url, 'http://x').pathname !== '/ws') { socket.destroy(); return; }
  acceptWebSocket(req, socket, ws => lobby.connect(ws));
});

server.listen(port, () => console.log(`MetaDeck running at http://localhost:${port}`));
