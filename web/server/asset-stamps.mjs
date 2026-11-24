// A stamp for every file the game serves from assets/ (its size and modification time), so pages ask for
// assets/img/ui/pack.webp?v=<stamp>. A redrawn image gets a new URL that no browser or Cloudflare has
// cached yet, while an unchanged one keeps its URL and can be cached for good. The stylesheets and pages
// are stamped as they're sent; the game's code reads the stamps from GET /api/assets (src/ui/assets.js).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Art is replaced while the server runs (tools/art.mjs, git pull), so the stamps are re-read when they're
// more than a few seconds old. A walk of the ~900 files takes a few milliseconds.
const FRESH_MS = 5000;

export function createAssetStamps(root, isPublic) {
  let cached = null;
  let readAt = 0;

  function read() {
    const map = {};
    const walk = dir => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue; // never served (.gitkeep)
        const f = path.join(dir, e.name);
        const rel = path.relative(root, f).replaceAll('\\', '/');
        // Folders nothing is served from (the sound libraries in assets/audio) aren't walked.
        if (e.isDirectory()) { if (['webp', 'mp3'].some(ext => isPublic(`/${rel}/x.${ext}`))) walk(f); continue; }
        if (!isPublic('/' + rel)) continue;
        const stat = fs.statSync(f, { throwIfNoEntry: false });
        if (stat) map[rel] = stat.size.toString(36) + Math.floor(stat.mtimeMs).toString(36);
      }
    };
    walk(path.join(root, 'assets'));
    const json = JSON.stringify(map);
    return { map, json, tag: crypto.createHash('sha1').update(json).digest('hex').slice(0, 10) };
  }

  const current = () => {
    if (!cached || Date.now() - readAt > FRESH_MS) { cached = read(); readAt = Date.now(); }
    return cached;
  };

  return {
    // { 'assets/img/ui/pack.webp': '3pn6mwu6xmls', ... } as JSON, and a tag that changes with it.
    json: () => current().json,
    tag: () => current().tag,
    // True when ?v=<stamp> names the file as it is now, so the response may be cached forever.
    isCurrent: (urlPath, v) => !!v && current().map[urlPath.replace(/^\//, '')] === v,
    // Adds ?v=<stamp> to every assets/ URL in a stylesheet or page: url(assets/…), url('assets/…'),
    // src="/assets/…". Files that don't exist are left alone.
    stamp(text) {
      const { map } = current();
      return text.replace(/(["'(])(\/?)(assets\/[^"'()?#\s]+)(?=["')])/g, (m, open, slash, rel) =>
        (map[rel] ? `${open}${slash}${rel}?v=${map[rel]}` : m));
    },
  };
}
