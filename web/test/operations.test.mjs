// Running the server in public: the real server (serve.mjs in a child process) for health checks,
// caching, the update check, analytics and the admin routes; plus the lobby's maintenance mode,
// database backups and the analytics rules on their own.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acceptWebSocket } from '../server/ws.mjs';
import { createLobby } from '../server/lobby.mjs';
import { openDb, backup, logMatch } from '../server/db.mjs';
import { createTelemetry } from '../server/telemetry.mjs';
import { starterDecks } from '../src/data/index.js';

let site, siteUrl, dataDir, adminToken;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadeck-ops-'));
  site = spawn(process.execPath, [fileURLToPath(new URL('../serve.mjs', import.meta.url)), '0'], {
    stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, DATA_DIR: dataDir, BACKUP_DIR: path.join(dataDir, 'backups'), TRUST_PROXY: '' },
  });
  siteUrl = await new Promise((resolve, reject) => {
    site.stdout.on('data', d => { const m = /http:\/\/localhost:(\d+)/.exec(String(d)); if (m) resolve(`http://127.0.0.1:${m[1]}`); });
    site.on('exit', () => reject(new Error('serve.mjs exited')));
  });
  adminToken = fs.readFileSync(path.join(dataDir, 'admin-token'), 'utf8');
});

after(async () => {
  site.kill();
  await new Promise(r => site.once('exit', r));
  fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

// A raw request, so the test can set Host and proxy headers that fetch won't.
function request(pathname, { method = 'GET', headers = {}, body = null } = {}) {
  const u = new URL(siteUrl);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path: pathname, method, headers: { host: `localhost:${u.port}`, ...headers } }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (body !== null) { req.setHeader('content-type', 'application/json'); req.end(JSON.stringify(body)); } else req.end();
  });
}

test('search engines get readable text and a robots.txt; the sitemap waits for PUBLIC_URL', async () => {
  const page = await request('/');
  assert.match(page.text, /<h1>MetaDeck<\/h1>/);
  assert.doesNotMatch(page.text, /rel="canonical"|ld\+json/, 'absolute URLs only with PUBLIC_URL');
  const robots = await request('/robots.txt');
  assert.equal(robots.status, 200);
  assert.match(robots.text, /Disallow: \/api\//);
  assert.doesNotMatch(robots.text, /Sitemap:/);
  assert.equal((await request('/sitemap.xml')).status, 404);
});

test('the content pages are served with the security headers and revalidate by ETag', async () => {
  for (const p of ['/decks', '/decks/horror', '/decks/card-game', '/cards', '/how-to-play', '/meta']) {
    const r = await request(p);
    assert.equal(r.status, 200, p);
    assert.match(r.headers['content-type'], /text\/html/);
    assert.match(r.headers['content-security-policy'], /script-src 'self'/);
    assert.doesNotMatch(r.text, /https?:\/\/(?!localhost)(?!www\.w3)/, `${p} loads nothing from third parties`);
    assert.equal((await request(p, { headers: { 'if-none-match': r.headers.etag } })).status, 304, p);
  }
  assert.equal((await request('/decks/minecraft')).status, 404);
  assert.equal((await request('/pages.css')).status, 200);
  assert.equal((await request('/src/ui/card-search.js')).status, 200);
});

test('with PUBLIC_URL the page gets a canonical link and structured data, and the sitemap lists the pages', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadeck-seo-'));
  const proc = spawn(process.execPath, [fileURLToPath(new URL('../serve.mjs', import.meta.url)), '0'], {
    stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, DATA_DIR: dir, PUBLIC_URL: 'https://play.example.com/' },
  });
  try {
    const base = await new Promise((resolve, reject) => {
      proc.stdout.on('data', d => { const m = /http:\/\/localhost:(\d+)/.exec(String(d)); if (m) resolve(`http://127.0.0.1:${m[1]}`); });
      proc.on('exit', () => reject(new Error('serve.mjs exited')));
    });
    const page = await (await fetch(`${base}/`)).text();
    assert.match(page, /<link rel="canonical" href="https:\/\/play\.example\.com\/">/);
    const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/.exec(page)[1]);
    assert.equal(ld['@type'], 'VideoGame');
    assert.equal(ld.image, 'https://play.example.com/assets/img/ui/key-art.webp');
    assert.match(await (await fetch(`${base}/robots.txt`)).text(), /Sitemap: https:\/\/play\.example\.com\/sitemap\.xml/);
    const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
    assert.match(sitemap, /<loc>https:\/\/play\.example\.com\/<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/play\.example\.com\/legal\/privacy\.html<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/play\.example\.com\/decks\/city-builder<\/loc>/);
    assert.match(await (await fetch(`${base}/decks/horror`)).text(), /<link rel="canonical" href="https:\/\/play\.example\.com\/decks\/horror">/);
  } finally {
    proc.kill();
    await new Promise(r => proc.once('exit', r));
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('the privacy and terms pages are served, and nothing else in legal/', async () => {
  for (const page of ['privacy', 'terms']) {
    const r = await request(`/legal/${page}.html`);
    assert.equal(r.status, 200, page);
    assert.match(r.text, /<h1>/);
  }
  assert.equal((await request('/legal/legal.css')).status, 200);
});

test('the page loads nothing from third parties: fonts are served from here', async () => {
  const page = await request('/index.html');
  assert.doesNotMatch(page.text, /https?:\/\/(?!localhost)/, 'no external URLs in index.html');
  assert.doesNotMatch(page.headers['content-security-policy'], /https:/, 'the CSP allows only this site');
  const css = await request('/styles.css');
  for (const [, file] of css.text.matchAll(/url\('(assets\/fonts\/[^']+\.woff2)'\)/g)) {
    const font = await request(`/${file}`);
    assert.equal(font.status, 200, file);
    assert.equal(font.headers['content-type'], 'font/woff2');
  }
  assert.equal((await request('/legal/../serve.mjs')).status, 404);
});

test('only the game’s own sound slots are served, never the sound libraries next to them', async () => {
  const slot = fs.readdirSync(new URL('../assets/audio/', import.meta.url)).find(f => /^[a-z0-9-]+\.mp3$/.test(f));
  if (slot) assert.equal((await request(`/assets/audio/${slot}`)).status, 200, slot);
  for (const p of ['/assets/audio/Some%20Library/hit.wav', '/assets/audio/License%20-%20GDC%20Game%20Audio.pdf', '/assets/audio/Readme.txt', '/assets/audio/sub/click.mp3']) {
    assert.equal((await request(p)).status, 404, p);
  }
  assert.equal((await request('/assets/fonts/rajdhani-700-latin.woff2')).status, 200, 'other assets are unaffected');
});

test('only the checkout page may load Paddle; payments are off without a configuration', async () => {
  const page = await request('/checkout.html');
  assert.equal(page.status, 200);
  const csp = page.headers['content-security-policy'];
  assert.match(csp, /script-src 'self' https:\/\/\*\.paddle\.com/);
  assert.match(csp, /frame-src https:\/\/\*\.paddle\.com/);
  assert.doesNotMatch((await request('/index.html')).headers['content-security-policy'], /paddle/);
  assert.equal((await request('/api/shop/config')).json.enabled, false);
  assert.equal((await request('/api/paddle/webhook', { method: 'POST', body: {} })).status, 404);
  assert.equal((await request('/api/shop/checkout', { method: 'POST', body: { bundle: 'gems-100' } })).status, 503);
});

test('the founder spots left are public, and a sign-up takes one', async () => {
  const before = (await request('/api/founders')).json;
  assert.equal(before.slots, 100);
  assert.equal(before.left, before.slots - before.taken);
  await request('/api/account/signup', { method: 'POST', body: { name: 'Spot_Taker', password: 'longenough', birthYear: 1990 } });
  assert.equal((await request('/api/founders')).json.left, before.left - 1);
});

test('health check and version', async () => {
  const h = await request('/healthz');
  assert.equal(h.status, 200);
  assert.equal(h.json.ok, true);
  assert.match(h.json.version, /^[0-9a-f]{10}$/);
  assert.equal((await request('/api/version')).json.version, h.json.version);
});

test('files have ETags; art is cacheable in public but not on localhost', async () => {
  const first = await request('/index.html');
  assert.equal(first.status, 200);
  assert.ok(first.headers.etag);
  assert.equal(first.headers['cache-control'], 'no-cache');
  const again = await request('/index.html', { headers: { 'if-none-match': first.headers.etag } });
  assert.equal(again.status, 304);
  assert.equal(again.text, '');

  const art = fs.readdirSync(new URL('../assets/img/cards/', import.meta.url)).find(f => f.endsWith('.webp'));
  assert.equal((await request(`/assets/img/cards/${art}`)).headers['cache-control'], 'no-cache');
  assert.match((await request(`/assets/img/cards/${art}`, { headers: { host: 'metadeck.example' } })).headers['cache-control'], /public, max-age=\d+/);
  assert.equal((await request('/src/ui/app.js', { headers: { host: 'metadeck.example' } })).headers['cache-control'], 'no-cache');
});

test("admin routes need the token, and a tunnel's headers make a local request count as outside", async () => {
  assert.equal((await request('/api/admin/ping', { method: 'POST', body: {} })).status, 403);
  assert.equal((await request('/api/admin/ping', { method: 'POST', body: {}, headers: { 'x-admin-token': adminToken } })).status, 200);
  // cloudflared connects from localhost and may pass Host: localhost, but it always adds its own headers.
  for (const h of ['cf-connecting-ip', 'cf-ray', 'x-forwarded-for']) {
    const r = await request('/api/admin/ping', { method: 'POST', body: {}, headers: { 'x-admin-token': adminToken, [h]: '203.0.113.9' } });
    assert.equal(r.status, 403, h);
  }
  // Test purchases are only for this machine as well.
  const signup = await request('/api/account/signup', { method: 'POST', body: { name: 'Tunnel_1', password: 'longenough', birthYear: 2000 }, headers: { 'cf-connecting-ip': '203.0.113.9' } });
  assert.equal(signup.json.testPurchases, false);
});

test('admin backup writes a copy of the database', async () => {
  const r = await request('/api/admin/backup', { method: 'POST', body: {}, headers: { 'x-admin-token': adminToken } });
  assert.equal(r.status, 200, r.text);
  assert.ok(fs.existsSync(r.json.file));
  const copy = openDb(r.json.file);
  assert.ok(copy.prepare('SELECT COUNT(*) AS n FROM users').get().n >= 1);
  copy.close();
});

test('analytics events and error reports are accepted only from the game page', async () => {
  assert.equal((await request('/api/event', { method: 'POST', body: { name: 'visit' } })).status, 202);
  assert.equal((await request('/api/event', { method: 'POST', body: { name: 'visit' }, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request('/api/client-error', { method: 'POST', body: { message: 'test error from operations.test' } })).status, 202);
  const log = fs.readdirSync(path.join(dataDir, 'logs')).map(f => fs.readFileSync(path.join(dataDir, 'logs', f), 'utf8')).join('');
  assert.match(log, /client: test error from operations\.test/);
});

test('feedback is taken from the game page only, and the admin route lists and resolves it', async () => {
  const body = { kind: 'bug', message: 'feedback from operations.test', screen: 'menu' };
  assert.equal((await request('/api/feedback', { method: 'POST', body, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request('/api/feedback', { method: 'GET' })).status, 405);
  assert.equal((await request('/api/feedback', { method: 'POST', body: { kind: 'bug', message: '' } })).status, 400);
  const sent = await request('/api/feedback', { method: 'POST', body });
  assert.equal(sent.status, 200, sent.text);
  assert.equal((await request('/api/admin/feedback', { method: 'POST', body: {} })).status, 403);
  const admin = h => request(h.route, { method: 'POST', body: h.body ?? {}, headers: { 'x-admin-token': adminToken } });
  const list = await admin({ route: '/api/admin/feedback' });
  const mine = list.json.feedback.find(x => x.message === body.message);
  assert.ok(mine);
  assert.equal((await admin({ route: '/api/admin/feedbackdone', body: { id: mine.id } })).json.ok, true);
  assert.equal((await admin({ route: '/api/admin/feedback' })).json.feedback.some(x => x.id === mine.id), false);
});

test('telemetry keeps only listed events and fields, and no raw address', () => {
  const db = openDb(null);
  const t = createTelemetry({ db });
  assert.equal(t.track('visit', {}, { ip: '198.51.100.7', ua: 'test' }), true);
  assert.equal(t.track('match_end', { mode: 'ai', deck: 'FPS', won: true, secret: 'x' }, { ip: '198.51.100.7', ua: 'test' }), true);
  assert.equal(t.track('drop_tables', {}, { ip: '198.51.100.7' }), false);
  const rows = db.prepare('SELECT * FROM events').all();
  assert.equal(rows.length, 2);
  assert.deepEqual(JSON.parse(rows[1].data), { mode: 'ai', deck: 'FPS', won: true });
  assert.ok(rows.every(r => !String(r.visitor).includes('198.51')));
  assert.equal(rows[0].visitor, db.prepare('SELECT visitor FROM events WHERE id = 2').get().visitor, 'same visitor on the same day');
  db.close();
});

test('backups keep a copy per day and delete old ones', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metadeck-backup-'));
  const db = openDb(null);
  logMatch(db, { kind: 'ai', players: [null, null], decks: ['FPS', 'RPG'], winner: 0, turns: 9 });
  fs.writeFileSync(path.join(dir, 'metadeck-2000-01-01.db'), '');
  const file = backup(db, dir, { now: new Date('2026-11-14T03:00:00Z') });
  assert.equal(path.basename(file), 'metadeck-2026-11-14.db');
  assert.equal(backup(db, dir, { now: new Date('2026-11-14T09:00:00Z') }), null, 'once a day');
  assert.ok(!fs.existsSync(path.join(dir, 'metadeck-2000-01-01.db')), 'old copies are deleted');
  const copy = openDb(file);
  assert.equal(copy.prepare('SELECT COUNT(*) AS n FROM matches').get().n, 1);
  copy.close();
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('maintenance warns everyone, stops new matches, and waits for running ones', async () => {
  const lobby = createLobby({ turnMs: 5000, graceMs: 200 });
  const server = http.createServer((req, res) => res.end());
  server.on('upgrade', (req, socket) => acceptWebSocket(req, socket, ws => lobby.connect(ws)));
  await new Promise(r => server.listen(0, r));
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
  const client = async name => {
    const ws = new WebSocket(url);
    const inbox = [];
    const waiters = [];
    ws.onmessage = e => { const m = JSON.parse(e.data); const i = waiters.findIndex(w => w.t === m.t); if (i >= 0) waiters.splice(i, 1)[0].resolve(m); else inbox.push(m); };
    await new Promise(r => { ws.onopen = r; });
    const c = {
      send: m => ws.send(JSON.stringify(m)),
      next: t => { const i = inbox.findIndex(m => m.t === t); return i >= 0 ? Promise.resolve(inbox.splice(i, 1)[0]) : new Promise(resolve => waiters.push({ t, resolve })); },
      close: () => ws.close(),
    };
    c.send({ t: 'hello', name });
    await c.next('welcome');
    return c;
  };
  const deck = id => { const d = starterDecks(id)[0]; return { archetype: d.archetype, cards: d.cards, name: d.name }; };

  const a = await client('Ana'), b = await client('Ben'), c = await client('Cy');
  a.send({ t: 'queue', deck: deck('FPS') });
  await a.next('queued');
  b.send({ t: 'queue', deck: deck('RPG') });
  await Promise.all([a.next('start'), b.next('start')]);

  let idle = 0;
  assert.equal(lobby.maintenance(1, () => idle++), true);
  assert.equal((await c.next('notice')).kind, 'restart');
  c.send({ t: 'queue', deck: deck('Horror') });
  assert.match((await c.next('error')).message, /restart/);
  assert.equal(idle, 0, 'a match is still running');
  a.send({ t: 'leave' });
  await b.next('update');
  await new Promise(r => setTimeout(r, 50));
  assert.equal(idle, 1, 'ready once the last match ends');
  for (const x of [a, b, c]) x.close();
  lobby.close();
  server.close();
});
