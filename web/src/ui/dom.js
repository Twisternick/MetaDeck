// Tiny DOM helpers: h('div', { class: 'x', onclick }, ...children)

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) el.style.setProperty(prop, v);
    } else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

// The page's UI scale: styles.css sets `zoom` on <html> for big screens (1440p, 4K). Measured boxes
// (getBoundingClientRect), pointer positions and the window size come in screen pixels, but styles are set
// in page pixels, so convert with these before doing any maths that ends up in a style.
let zoomCache = 0;
export const uiZoom = () => (zoomCache ||= parseFloat(getComputedStyle(document.documentElement).zoom) || 1);
addEventListener('resize', () => { zoomCache = 0; });
// An element's box in page pixels.
export function rectOf(el) {
  const r = el.getBoundingClientRect();
  const z = uiZoom();
  return z === 1 ? r : new DOMRect(r.x / z, r.y / z, r.width / z, r.height / z);
}
// A pointer coordinate (clientX / clientY) in page pixels.
export const pt = v => v / uiZoom();
// The window's size in page pixels.
export const viewW = () => innerWidth / uiZoom();
export const viewH = () => innerHeight / uiZoom();
