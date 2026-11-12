// Visual effects: pointer tilt + glare, art slots with image fallback, turn banners,
// impact bursts, dissolves, card flights, confetti, button ripples.
// Everything here is DOM + CSS + the Web Animations API. No SVG.

import { h } from './dom.js';

export const motionOK = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rand = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------ pointer tilt
// Any element with data-tilt="<max degrees>" tilts toward the pointer and gets
// --mx/--my (pointer position in %) for glare and foil effects.
let tiltInstalled = false;
export function installTilt() {
  if (tiltInstalled) return;
  tiltInstalled = true;
  let current = null;
  let frame = 0;
  let last = null;
  const reset = el => {
    el.classList.remove('tilting');
    el.style.removeProperty('--rx');
    el.style.removeProperty('--ry');
  };
  const apply = () => {
    frame = 0;
    if (!current || !last) return;
    const r = current.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const px = Math.min(1, Math.max(0, (last.x - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (last.y - r.top) / r.height));
    const max = Number(current.dataset.tilt) || 10;
    current.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    current.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    current.style.setProperty('--ry', `${((px - .5) * max).toFixed(2)}deg`);
    current.style.setProperty('--rx', `${((.5 - py) * max).toFixed(2)}deg`);
  };
  document.addEventListener('pointermove', e => {
    if (!motionOK() || e.pointerType === 'touch') return;
    const el = e.target instanceof Element ? e.target.closest('[data-tilt]') : null;
    if (el !== current) {
      if (current) reset(current);
      current = el;
      if (el) el.classList.add('tilting');
    }
    if (!el) return;
    last = { x: e.clientX, y: e.clientY };
    if (!frame) frame = requestAnimationFrame(apply);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { if (current) { reset(current); current = null; } });
}

// ------------------------------------------------------------ button ripples
let rippleInstalled = false;
export function installRipples() {
  if (rippleInstalled) return;
  rippleInstalled = true;
  document.addEventListener('pointerdown', e => {
    const btn = e.target instanceof Element ? e.target.closest('.btn') : null;
    if (!btn || btn.disabled || !motionOK()) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const ripple = h('span', { class: 'ripple' });
    ripple.style.cssText = `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px;width:${size}px;height:${size}px`;
    btn.append(ripple);
    setTimeout(() => ripple.remove(), 700);
  }, { passive: true });
}

// ------------------------------------------------------------ art slots
// An art slot shows the first image in `candidates` that loads; until then (or if none
// exists) it shows an animated placeholder with the deck emblem. Missing images are
// remembered so re-renders never re-request them, until the tab regains focus (art may
// have been added in the Art Studio meanwhile).
const artStatus = new Map(); // url -> 'ok' | 'missing'
window.addEventListener('focus', () => {
  for (const [url, status] of artStatus) if (status === 'missing') artStatus.delete(url);
});

export function artSlot(className, candidates, emblem, { label = false, alt = '' } = {}) {
  const urls = candidates.filter(u => u && artStatus.get(u) !== 'missing');
  const box = h('div', { class: `art ${className}` });
  const ph = h('div', { class: 'art-ph', 'aria-hidden': 'true' },
    h('span', { class: 'art-emblem' }, emblem),
    label ? h('span', { class: 'art-tag' }, 'ART') : null);
  if (urls.length) {
    let i = 0;
    const img = h('img', { alt, loading: 'lazy', decoding: 'async', draggable: 'false' });
    img.addEventListener('load', () => { artStatus.set(img.getAttribute('src'), 'ok'); box.classList.add('has-img'); });
    img.addEventListener('error', () => {
      artStatus.set(img.getAttribute('src'), 'missing');
      i += 1;
      if (i < urls.length) img.setAttribute('src', urls[i]);
      else img.remove();
    });
    img.setAttribute('src', urls[0]);
    if (artStatus.get(urls[0]) === 'ok') box.classList.add('has-img');
    box.append(img);
  }
  box.append(ph, h('div', { class: 'art-shade' }));
  return box;
}

// Each slot is tried as .webp (what the Art Studio saves), then .png.
const imgUrls = key => [`assets/img/${key}.webp`, `assets/img/${key}.png`];
export const cardArtUrls = (def, ownerDeckId) =>
  [...imgUrls(`cards/${def.cardId}`), ...imgUrls(`decks/${def.deckId ?? ownerDeckId ?? 'token'}`)];
export const deckArtUrls = deckId => imgUrls(`decks/${deckId}`);
export const heroArtUrls = deckId => [...imgUrls(`heroes/${deckId}`), ...imgUrls(`decks/${deckId}`)];
export const cardBackUrls = () => imgUrls('ui/card-back');

// ------------------------------------------------------------ fx layer
let layer = null;
function fxLayer() {
  if (!layer || !layer.isConnected) {
    layer = h('div', { class: 'fx-layer', 'aria-hidden': 'true' });
    document.body.append(layer);
  }
  return layer;
}
const center = rect => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

// A shockwave ring plus a spray of sparks at a point.
export function impact(rect, color = '#ff4d6d', { sparks = 14, size = 1 } = {}) {
  if (!motionOK() || !rect) return;
  const L = fxLayer();
  const { x, y } = center(rect);
  const ring = h('i', { class: 'ring' });
  ring.style.cssText = `left:${x - 10}px;top:${y - 10}px;--c:${color}`;
  L.append(ring);
  ring.animate([
    { transform: 'scale(.3)', opacity: 1 },
    { transform: `scale(${5 * size})`, opacity: 0 },
  ], { duration: 520, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' }).onfinish = () => ring.remove();
  for (let i = 0; i < sparks; i++) {
    const s = h('i', { class: 'spark' });
    const a = rand(0, Math.PI * 2);
    const d = rand(30, 90) * size;
    const sz = rand(4, 9);
    s.style.cssText = `left:${x - sz / 2}px;top:${y - sz / 2}px;width:${sz}px;height:${sz}px;--c:${i % 3 ? color : '#fff'}`;
    L.append(s);
    s.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d + 20}px) scale(0)`, opacity: 0 },
    ], { duration: rand(400, 750), easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }).onfinish = () => s.remove();
  }
}

// Soft rising motes for heals and buffs.
export function sparkle(rect, color = '#34f5a2', count = 10) {
  if (!motionOK() || !rect) return;
  const L = fxLayer();
  for (let i = 0; i < count; i++) {
    const s = h('i', { class: 'spark' });
    const x = rect.left + rand(0, rect.width);
    const y = rect.top + rand(rect.height * .3, rect.height);
    const sz = rand(3, 7);
    s.style.cssText = `left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;--c:${color}`;
    L.append(s);
    s.animate([
      { transform: 'translateY(0) scale(.6)', opacity: 0 },
      { opacity: 1, offset: .25 },
      { transform: `translateY(${-rand(30, 70)}px) scale(1.1)`, opacity: 0 },
    ], { duration: rand(600, 1000), delay: rand(0, 200), easing: 'ease-out', fill: 'forwards' }).onfinish = () => s.remove();
  }
}

// A detached copy of an element, pinned where it was, that dissolves away.
export function dissolve(clone, rect, color = '#ff4d6d') {
  if (!rect) return;
  const g = h('div', { class: 'fx-ghost' }, clone);
  g.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
  document.body.append(g);
  if (!motionOK()) { g.remove(); return; }
  impact(rect, color, { sparks: 18, size: 1.2 });
  g.animate([
    { opacity: 1, filter: 'brightness(1) blur(0)', transform: 'scale(1) rotate(0)' },
    { opacity: 1, filter: 'brightness(2.6) blur(0)', transform: 'scale(1.08) rotate(0)', offset: .18 },
    { opacity: 0, filter: 'brightness(.3) blur(12px)', transform: 'scale(.6) rotate(8deg) translateY(30px)' },
  ], { duration: 700, easing: 'ease-in', fill: 'forwards' }).onfinish = () => g.remove();
}

// A card flies from its hand position to the middle of the table and bursts.
export function castFly(cardEl, fromRect, toRect, color = '#a78bfa') {
  if (!motionOK() || !fromRect || !toRect) return;
  const g = h('div', { class: 'fx-ghost' }, cardEl);
  g.style.cssText = `left:${fromRect.left}px;top:${fromRect.top}px;width:${fromRect.width}px;height:${fromRect.height}px;z-index:96`;
  document.body.append(g);
  const to = center(toRect);
  const from = center(fromRect);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  g.animate([
    { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
    { transform: `translate(${dx * .6}px, ${dy * .6}px) scale(1.5) rotate(-4deg)`, opacity: 1, offset: .45 },
    { transform: `translate(${dx}px, ${dy}px) scale(1.6) rotate(0)`, opacity: 1, offset: .7 },
    { transform: `translate(${dx}px, ${dy}px) scale(2.2)`, opacity: 0, filter: 'brightness(3) blur(10px)' },
  ], { duration: 760, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' }).onfinish = () => {
    g.remove();
    impact({ left: to.x - 20, top: to.y - 20, width: 40, height: 40 }, color, { sparks: 22, size: 1.6 });
  };
}

// Returns a transform that moves `from` most of the way to `to` (for attack lunges).
export function lungeTransform(from, to, amount = .62) {
  const a = center(from);
  const b = center(to);
  return `translate(${((b.x - a.x) * amount).toFixed(1)}px, ${((b.y - a.y) * amount).toFixed(1)}px) scale(1.08)`;
}

// Dashed energy beam from attacker to target, drawn as a rotated div.
export function drawBeam(fromRect, toRect) {
  if (!fromRect || !toRect) return null;
  const a = center(fromRect);
  const b = center(toRect);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  const beam = h('div', { class: 'beam', 'aria-hidden': 'true' });
  beam.style.cssText = `left:${a.x}px;top:${a.y - 3}px;width:${Math.max(0, len - 30)}px;transform:rotate(${angle}deg)`;
  document.body.append(beam);
  return beam;
}

// Full-width turn banner ("YOUR TURN").
export function showBanner(text, cls = '') {
  document.querySelectorAll('.turn-banner').forEach(b => b.remove());
  const el = h('div', { class: `turn-banner ${cls}`, 'aria-hidden': 'true' }, h('div', { class: 'turn-banner-inner' }, text));
  document.body.append(el);
  setTimeout(() => el.remove(), motionOK() ? 1500 : 900);
}

// Confetti rain for victories.
export function confetti(colors = ['#ffc53d', '#22d3ee', '#a78bfa', '#f472b6', '#34f5a2', '#ffffff'], count = 110) {
  if (!motionOK()) return;
  const L = fxLayer();
  for (let i = 0; i < count; i++) {
    const c = h('i', { class: 'confetti' });
    const x = rand(0, 100);
    c.style.cssText = `left:${x}vw;background:${colors[i % colors.length]};width:${rand(6, 12)}px;height:${rand(10, 18)}px`;
    L.append(c);
    c.animate([
      { transform: `translate(0, -5vh) rotate(0deg) rotateY(0)`, opacity: 1 },
      { transform: `translate(${rand(-120, 120)}px, 110vh) rotate(${rand(360, 1080)}deg) rotateY(${rand(360, 1440)}deg)`, opacity: .9 },
    ], { duration: rand(2600, 4600), delay: rand(0, 900), easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'forwards' }).onfinish = () => c.remove();
  }
}

export function removeFx() {
  document.querySelectorAll('.beam, .turn-banner, .fx-ghost, .fx-layer').forEach(el => el.remove());
  layer = null;
}

// ------------------------------------------------------------ targeting arrow
// A curved chain of glowing dots from a source element to the pointer, with a triangle head.
export function createArrow(color = '#ff4d6d', count = 16) {
  const L = fxLayer();
  const dots = Array.from({ length: count }, () => {
    const d = h('i', { class: 'arrow-dot' });
    d.style.setProperty('--c', color);
    L.append(d);
    return d;
  });
  const head = h('i', { class: 'arrow-head' });
  head.style.setProperty('--c', color);
  L.append(head);
  return {
    update(fromRect, x, y) {
      const a = center(fromRect);
      const dist = Math.hypot(x - a.x, y - a.y);
      const cx = (a.x + x) / 2;
      const cy = Math.min(a.y, y) - Math.min(160, dist * .3);
      dots.forEach((d, i) => {
        const t = (i + 1) / (count + 1);
        const px = (1 - t) ** 2 * a.x + 2 * (1 - t) * t * cx + t * t * x;
        const py = (1 - t) ** 2 * a.y + 2 * (1 - t) * t * cy + t * t * y;
        const size = 5 + 9 * t;
        d.style.width = `${size}px`;
        d.style.height = `${size}px`;
        d.style.opacity = `${.45 + .55 * t}`;
        d.style.transform = `translate(${(px - size / 2).toFixed(1)}px, ${(py - size / 2).toFixed(1)}px)`;
      });
      const angle = Math.atan2(y - cy, x - cx) * 180 / Math.PI + 90;
      head.style.transform = `translate(${(x - 17).toFixed(1)}px, ${(y - 17).toFixed(1)}px) rotate(${angle.toFixed(1)}deg)`;
    },
    remove() { dots.forEach(d => d.remove()); head.remove(); },
  };
}

// A card flies from one rect to another (hand → board slot, reveal → slot), then vanishes.
export function flyTo(cardEl, fromRect, toRect, { duration = 320, onDone } = {}) {
  if (!fromRect || !toRect) { onDone?.(); return; }
  const g = h('div', { class: 'fx-ghost' }, cardEl);
  g.style.cssText = `left:${fromRect.left}px;top:${fromRect.top}px;width:${fromRect.width}px;height:${fromRect.height}px;z-index:96`;
  document.body.append(g);
  if (!motionOK()) { g.remove(); onDone?.(); return; }
  const a = center(fromRect);
  const b = center(toRect);
  const scale = toRect.width / fromRect.width;
  g.animate([
    { transform: 'translate(0,0) scale(1)', opacity: 1 },
    { transform: `translate(${(b.x - a.x) * .5}px, ${(b.y - a.y) * .5 - 40}px) scale(${(1 + scale) / 2}) rotate(-3deg)`, opacity: 1, offset: .5 },
    { transform: `translate(${b.x - a.x}px, ${b.y - a.y}px) scale(${scale})`, opacity: .9 },
  ], { duration, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' }).onfinish = () => { g.remove(); onDone?.(); };
}

// Deal a hand card in from a pile: animates from the pile's rect to where the card now sits.
export function dealFrom(cardEl, pileRect, delay = 0) {
  if (!motionOK() || !pileRect) return;
  const r = cardEl.getBoundingClientRect();
  const dx = pileRect.left + pileRect.width / 2 - (r.left + r.width / 2);
  const dy = pileRect.top + pileRect.height / 2 - (r.top + r.height / 2);
  const cs = getComputedStyle(cardEl);
  const lift = cs.getPropertyValue('--lift').trim() || '0px';
  const fan = cs.getPropertyValue('--fan').trim() || '0deg';
  const mirror = cardEl.closest('.hand.theirs');
  const rest = mirror ? `translateY(calc(-1 * ${lift})) rotate(calc(-1 * ${fan}))` : `translateY(${lift}) rotate(${fan})`;
  cardEl.animate([
    { transform: `translate(${dx}px, ${dy}px) rotate(-18deg) scale(.45)`, opacity: .2, filter: 'brightness(1.8)' },
    { opacity: 1, offset: .35 },
    { transform: rest, opacity: 1, filter: 'brightness(1)' },
  ], { duration: 520, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
}

// ------------------------------------------------------------ tooltips
// Any element with data-kw (a keyword or term id) or data-tip (free text, with data-tip-title)
// gets a styled tooltip on hover and keyboard focus. Delegated on the document, so re-rendered
// DOM needs no wiring. `describe(el)` turns an element into { icon, title, text, hint, color }.
let tipsInstalled = false;
let hideTip = () => {};
// Hide the tooltip now (call after re-rendering the DOM under a still pointer).
export const hideTooltip = () => hideTip();
export function installTooltips(describe) {
  if (tipsInstalled) return;
  tipsInstalled = true;
  let tip = null;
  let owner = null;
  let timer = 0;
  const hide = () => { clearTimeout(timer); timer = 0; tip?.remove(); tip = null; owner = null; };
  hideTip = hide;
  const show = el => {
    const info = describe(el);
    if (!info) return;
    hide();
    owner = el;
    // A card in the hand rises and grows on hover; wait for that and sit above the whole card.
    const handCard = el.closest('.hand.mine .card');
    const place = () => {
      if (owner !== el || !el.isConnected) return;
      tip = h('div', { class: 'tooltip', role: 'tooltip', style: { '--kw': info.color } },
        h('div', { class: 'tooltip-head' }, info.icon ? h('i', { 'aria-hidden': 'true' }, info.icon) : null, info.title),
        info.hint ? h('div', { class: 'tooltip-hint' }, info.hint) : null,
        h('div', { class: 'tooltip-text' }, info.text));
      document.body.append(tip);
      position(handCard ?? el);
    };
    if (handCard) timer = setTimeout(place, motionOK() ? 340 : 0); else place();
  };
  const position = anchor => {
    const r = anchor.getBoundingClientRect();
    const w = tip.offsetWidth;
    const hgt = tip.offsetHeight;
    let left = r.left + r.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.top - hgt - 12;
    if (top < 8) { top = r.bottom + 12; tip.classList.add('below'); }
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.style.setProperty('--arrow-x', `${r.left + r.width / 2 - left}px`);
  };
  const target = e => (e.target instanceof Element ? e.target.closest('[data-kw],[data-tip]') : null);
  document.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch') return;
    const el = target(e);
    if (el === owner) return;
    if (el) show(el); else hide();
  }, { passive: true });
  document.addEventListener('pointerout', e => {
    if (!owner) return;
    const to = e.relatedTarget instanceof Element ? e.relatedTarget.closest('[data-kw],[data-tip]') : null;
    if (to !== owner) hide();
  }, { passive: true });
  document.addEventListener('focusin', e => { const el = target(e); if (el) show(el); });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide, { capture: true, passive: true });
  document.addEventListener('scroll', hide, { capture: true, passive: true });
  window.addEventListener('resize', hide);
}

// ------------------------------------------------------------ keyword callouts
// A punchy pill ("⚔️ FIRST STRIKE · Strikes first") that pops out above an element and floats
// away. `stack` offsets further callouts on the same element so they don't overlap.
export function keywordCallout(rect, { icon, name, text, color = '#ffc53d', delay = 0, stack = 0 } = {}) {
  if (!rect) return;
  const el = h('div', { class: 'callout', 'aria-hidden': 'true', style: { '--kw': color } },
    icon ? h('i', null, icon) : null,
    h('span', { class: 'callout-name' }, name),
    text ? h('small', null, text) : null);
  // Near the top edge (the enemy hero) the callout drops below the element instead.
  const below = rect.top - 60 - stack * 36 < 0;
  if (below) el.classList.add('below');
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = below ? `${rect.bottom + 8 + stack * 36}px` : `${rect.top - 6 - stack * 36}px`;
  el.style.animationDelay = `${delay}ms`;
  document.body.append(el);
  // Keep the pill on screen: it is centred on the element, so clamp that centre.
  const half = el.offsetWidth / 2;
  const cx = Math.max(half + 8, Math.min(rect.left + rect.width / 2, window.innerWidth - half - 8));
  el.style.left = `${cx}px`;
  setTimeout(() => el.remove(), (motionOK() ? 1700 : 1100) + delay);
}

// A coloured outline that flares out from an element, plus a short glow on the element itself.
export function flashRing(el, rect, color = '#ffc53d', delay = 0) {
  if (!rect) return;
  setTimeout(() => {
    if (motionOK()) {
      const f = h('div', { class: 'kw-flash', 'aria-hidden': 'true', style: { '--kw': color } });
      f.style.cssText += `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
      document.body.append(f);
      setTimeout(() => f.remove(), 900);
    }
    if (el && el.isConnected) {
      el.style.setProperty('--kw', color);
      el.classList.add('kw-lit');
      setTimeout(() => { el.classList.remove('kw-lit'); }, 900);
    }
  }, delay);
}
