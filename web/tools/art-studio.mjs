// Art Studio: a local page for making card art by hand with any image generator (ChatGPT, Gemini, ...).
// `npm run art`, then open http://localhost:5174. It copies each slot's prompt, takes the image you paste
// or drop, crops it in the browser and saves it as assets/img/<slot>.webp, where the game picks it up.
// Only listens on 127.0.0.1, since it writes files.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAVE_PATH } from './art-studio/slots.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || process.argv[2]) || 5174;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png', '.webp': 'image/webp',
};
const ART_DIRS = ['cards', 'decks', 'heroes', 'ui'];
const MAX_BYTES = 8 * 1024 * 1024;

// Slot keys (e.g. "cards/RPG_M01_LevelOneAdventurer") that already have a .webp or .png.
function existingArt() {
  const keys = new Set();
  for (const dir of ART_DIRS) {
    const full = path.join(root, 'assets/img', dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) if (/\.(webp|png)$/.test(f)) keys.add(`${dir}/${f.replace(/\.\w+$/, '')}`);
  }
  return [...keys];
}

function saveArt(req, res, rel) {
  if (!SAVE_PATH.test(rel)) { res.writeHead(400).end('Bad path'); return; }
  const chunks = [];
  let size = 0;
  req.on('data', c => {
    size += c.length;
    if (size > MAX_BYTES) { res.writeHead(413).end('Too large'); req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    if (res.headersSent) return;
    const body = Buffer.concat(chunks);
    // RIFF....WEBP: refuse anything that isn't a WebP image.
    if (body.toString('ascii', 0, 4) !== 'RIFF' || body.toString('ascii', 8, 12) !== 'WEBP') {
      res.writeHead(415).end('Expected a WebP image'); return;
    }
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
    console.log(`saved ${rel} (${Math.round(body.length / 1024)} KB)`);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true }));
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const urlPath = decodeURIComponent(url.pathname);
  if (urlPath === '/') { res.writeHead(302, { Location: '/tools/art-studio/' }).end(); return; }
  if (urlPath === '/api/existing') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }).end(JSON.stringify(existingArt()));
    return;
  }
  if (urlPath === '/api/art' && req.method === 'PUT') { saveArt(req, res, url.searchParams.get('path') ?? ''); return; }

  let file = path.normalize(path.join(root, urlPath));
  if (!file.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }
  if (urlPath.endsWith('/')) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

server.listen(port, '127.0.0.1', () => console.log(`MetaDeck Art Studio at http://localhost:${port}`));
