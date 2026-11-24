// URLs for art and sound that carry the file's stamp (assets/img/ui/pack.webp?v=…), read once from
// GET /api/assets (server/asset-stamps.mjs). A redrawn image gets a new URL, so no browser or
// Cloudflare keeps showing the old one, while unchanged files stay cached. On a static host there's no
// /api, and the URLs go out unstamped.

const stamps = await fetch('/api/assets').then(r => (r.ok ? r.json() : null)).catch(() => null);

// 'assets/img/ui/pack.webp' -> 'assets/img/ui/pack.webp?v=3pn6mwu6xmls' (a leading / is kept).
export function assetUrl(path) {
  const v = stamps?.[path.replace(/^\//, '')];
  return v ? `${path}?v=${v}` : path;
}

// True when the server says the file isn't there, so the game needn't ask for it and get a 404.
export const assetMissing = path => !!stamps && !(path.replace(/^\//, '') in stamps);
