// Art Studio page: pick a slot, copy its prompt, paste or drop the generated image, frame it, save.
// In batch mode one image holds four cards in a 2×2 grid; the studio splits it back into cards.
import { DECKS } from '../../src/data/index.js';
import { allSlots, batchable, batchPrompt, BATCH } from './slots.js';
import { REDO_REASONS, REDO_THEMES } from './redo.js';

const $ = id => document.getElementById(id);
const slots = allSlots();
const deckOf = Object.fromEntries(DECKS.map(d => [d.id, d]));
const FLAGGED = 'Flagged';
const groups = [...DECKS.map(d => ({ id: d.id, name: d.name, icon: d.icon, color: d.color })),
  { id: 'Extras', name: 'Tokens & extras', icon: '✨', color: '#9aa3c7' },
  { id: FLAGGED, name: 'Flagged for redo', icon: '⚑', color: '#ff4d6d' }];
const colorOf = g => deckOf[g]?.color ?? '#9aa3c7';
const iconOf = g => deckOf[g]?.icon ?? '✨';
const PANELS = BATCH.cols * BATCH.rows;

let done = new Set();
let sizes = {};          // key -> size in bytes of the image on disk
// Flagged in redo.js and not yet replaced: no image, or still the exact file that was flagged.
const flagged = s => s.redo.length > 0 && (!done.has(s.key) || s.redo.some(r => sizes[s.key] === r.bytes));
const needsWork = s => !done.has(s.key) || flagged(s);
const inGroup = (s, g) => (g === FLAGGED ? flagged(s) : s.group === g);
let group = DECKS[0].id;
let batch = [];          // slots the next pasted image is for, in panel order
const stamp = new Map(); // key -> cache-buster after a save
const views = new Map(); // key -> slot element

const pref = (k, fallback) => { try { return localStorage.getItem(`artStudio.${k}`) ?? fallback; } catch { return fallback; } };
const setPref = (k, v) => { try { localStorage.setItem(`artStudio.${k}`, v); } catch { /* private mode */ } };

let toastTimer;
function toast(msg, bad = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast show${bad ? ' bad' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
}

const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) n.setAttribute(k, v);
  }
  n.append(...kids.flat().filter(k => k != null));
  return n;
};

// ------------------------------------------------------------ rendering
function thumb(slot) {
  const box = el('div', { class: `thumb${slot.kind === 'back' ? ' tall' : ''}`, style: `--ar:${slot.w}/${slot.h}` },
    el('div', { class: 'ph' }, iconOf(slot.group)),
    el('span', { class: `badge${flagged(slot) ? ' redo' : ''}` }, !done.has(slot.key) ? 'NEEDED' : flagged(slot) ? 'REDO' : 'DONE'));
  if (done.has(slot.key)) {
    const v = stamp.get(slot.key) ?? '';
    const img = el('img', { alt: '', loading: 'lazy', src: `/assets/img/${slot.key}.webp?v=${v}` });
    img.addEventListener('error', () => {
      if (img.src.includes('.webp')) img.src = `/assets/img/${slot.key}.png?v=${v}`;
      else img.remove();
    });
    img.addEventListener('load', () => box.classList.add('has-img'));
    box.prepend(img);
  }
  return box;
}

function slotView(slot, i) {
  const card = el('article', { class: 'slot', style: `--c:${colorOf(slot.group)};animation-delay:${Math.min(i, 24) * 18}ms` },
    thumb(slot),
    el('div', { class: 'info' },
      el('div', { class: 'name' }, slot.name),
      el('div', { class: 'sub' }, slot.sub),
      flagged(slot) ? slot.redo.map(r => el('div', { class: `flag ${r.why}` },
        el('b', {}, `⚑ ${REDO_REASONS[r.why].label}`), ` ${r.note}`)) : null,
      el('div', { class: 'key' }, `${slot.key}.webp · ${slot.w}×${slot.h}`),
      el('details', {}, el('summary', {}, 'Prompt'), el('pre', {}, slot.prompt)),
      el('div', { class: 'row' },
        el('button', { class: 'btn primary grow', onclick: () => copyPrompt(slot) }, 'Copy prompt'),
        el('button', { class: 'btn', title: 'Choose an image file', onclick: () => pickFile(slot) }, 'File…'))));
  card.addEventListener('click', e => { if (!e.target.closest('button, summary, pre')) activate(batchFor(slot)); });
  card.addEventListener('dragover', e => { e.preventDefault(); card.classList.add('drag'); });
  card.addEventListener('dragleave', () => card.classList.remove('drag'));
  card.addEventListener('drop', e => { e.preventDefault(); card.classList.remove('drag'); activate(batchFor(slot)); takeDrop(e.dataTransfer); });
  views.set(slot.key, card);
  return card;
}

const inBatch = s => batch.some(b => b.key === s.key);
const visible = () => slots.filter(s => (inGroup(s, group) || (group === FLAGGED && inBatch(s)))
  && (group === FLAGGED || !$('missingOnly').checked || needsWork(s) || inBatch(s)));

function renderTabs() {
  $('tabs').replaceChildren(...groups.map(g => {
    const on = g.id === group ? ' on' : '';
    if (g.id === FLAGGED) {
      const n = slots.filter(flagged).length;
      return el('button', {
        class: `tab flagged${on}${n ? '' : ' complete'}`, style: `--c:${g.color}`, title: 'Images the art audit flagged for redoing',
        onclick: () => { group = g.id; setPref('group', group); render(); },
      }, `${g.icon} ${g.name}`, el('small', {}, `${n}`));
    }
    const all = slots.filter(s => s.group === g.id);
    const n = all.filter(s => !needsWork(s)).length;
    const flags = all.filter(flagged).length;
    return el('button', {
      class: `tab${on}${n === all.length ? ' complete' : ''}`, style: `--c:${g.color}`,
      onclick: () => { group = g.id; setPref('group', group); render(); },
    }, `${g.icon} ${g.name}`, el('small', {}, `${n}/${all.length}`), flags ? el('small', { class: 'flags' }, `⚑${flags}`) : null);
  }));
  const total = slots.filter(s => !needsWork(s)).length;
  const flags = slots.filter(s => done.has(s.key) && flagged(s)).length;
  $('bar').style.width = `${(total / slots.length) * 100}%`;
  $('count').textContent = `${total} / ${slots.length} images${flags ? ` · ${flags} to redo` : ''}`;
}

function render() {
  views.clear();
  renderTabs();
  const list = visible();
  // A deck whose whole style is flagged gets a banner while any of its images still need redoing.
  const theme = REDO_THEMES[group];
  const left = theme ? slots.filter(s => s.group === group && s.redo.some(r => r.why === 'theme') && flagged(s)).length : 0;
  $('theme').hidden = !left;
  if (left) {
    $('theme').replaceChildren(el('b', {}, '⚑ Theme rework'),
      ` This deck's whole art style is flagged for reworking: ${theme.note} `, el('small', {}, `${left} images still to redo.`));
  }
  $('grid').replaceChildren(...(list.length ? list.map(slotView)
    : [el('p', { class: 'sub' }, group === FLAGGED ? 'Nothing is flagged for redoing.'
      : 'Every image in this group is done. Untick "Missing or flagged only" to redo one.')]));
  activate(batch);
}

// ------------------------------------------------------------ batches
// What the current tab is working through: flagged images on the Flagged tab, else missing or flagged ones.
const wanted = s => (group === FLAGGED ? flagged(s) : needsWork(s));

// `slot` plus, in batch mode, the next wanted cards after it in the same group and art style.
function batchFor(slot) {
  if (!$('batchMode').checked || slot.kind !== 'card') return [slot];
  const order = slots.filter(s => s.group === slot.group);
  const start = order.indexOf(slot);
  const rest = order.slice(start + 1).concat(order.slice(0, start))
    .filter(s => wanted(s) && batchable(slot, s));
  return [slot, ...rest].slice(0, PANELS);
}

function activate(list) {
  batch = list;
  for (const [key, v] of views) {
    const i = batch.findIndex(b => b.key === key);
    v.classList.toggle('active', i >= 0);
    if (i >= 0 && batch.length > 1) v.dataset.pos = BATCH.positions[i];
    else delete v.dataset.pos;
  }
}

const promptFor = list => (list.length > 1 ? batchPrompt(list) : list[0].prompt);

async function copyPrompt(slot) {
  activate(batchFor(slot));
  try {
    await navigator.clipboard.writeText(promptFor(batch));
    toast(batch.length > 1
      ? `Prompt for ${batch.length} cards copied (${batch.map(s => s.name).join(', ')}).`
      : `Prompt for ${slot.name} copied. Copy the image back and return here.`);
  } catch {
    toast('Couldn\'t write to the clipboard: open "Prompt" and copy it by hand.', true);
  }
}

// ------------------------------------------------------------ taking images
function pickFile(slot) {
  activate(batchFor(slot));
  const input = el('input', { type: 'file', accept: 'image/*' });
  input.addEventListener('change', () => input.files[0] && openCrop(input.files[0]));
  input.click();
}

function takeDrop(dt) {
  const file = [...dt.files].find(f => f.type.startsWith('image/'));
  if (file) openCrop(file);
  else toast('Drop an image file, or right-click the image → Copy image, then Ctrl+V.', true);
}

// Identifies a clipboard image, so switching back to this tab doesn't reopen one already handled.
let lastImage = '';
const signature = async blob => `${blob.size}:${new Uint8Array(await blob.slice(-256).arrayBuffer()).join(',')}`;

document.addEventListener('paste', async e => {
  if (!$('crop').hidden) return;
  const item = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
  if (!item) return;
  e.preventDefault();
  if (!batch.length) { toast('Click "Copy prompt" on a card first, so the image knows where to go.', true); return; }
  const file = item.getAsFile();
  lastImage = await signature(file);
  openCrop(file);
});

// When the tab regains focus with a new image on the clipboard, open it without waiting for Ctrl+V.
async function grabClipboard() {
  if (!$('autoGrab').checked || !$('crop').hidden || !batch.length || !navigator.clipboard?.read) return;
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find(t => t.startsWith('image/'));
      if (!type) continue;
      const blob = await item.getType(type);
      const sig = await signature(blob);
      if (sig === lastImage) return;
      lastImage = sig;
      openCrop(blob);
      return;
    }
  } catch { /* permission not granted yet, or the page isn't focused: Ctrl+V still works */ }
}
window.addEventListener('focus', grabClipboard);

// ------------------------------------------------------------ cropping
// One cell per slot in the batch. `src` is the part of the image the cell may use: the whole image for a
// single slot, or one grid panel (trimmed a little to drop the dividing lines) in a batch.
let img = null;
let cells = [];

const coverScale = c => Math.max(c.slot.w / c.src.w, c.slot.h / c.src.h);

function clampPan(c) {
  const s = coverScale(c) * c.zoom;
  const maxX = Math.max(0, (c.src.w * s - c.slot.w) / 2);
  const maxY = Math.max(0, (c.src.h * s - c.slot.h) / 2);
  c.x = Math.min(maxX, Math.max(-maxX, c.x));
  c.y = Math.min(maxY, Math.max(-maxY, c.y));
}

function draw(c, target = c.ctx, w = c.canvas.width, h = c.canvas.height) {
  const k = w / c.slot.w;
  const s = coverScale(c) * c.zoom * k;
  const dw = c.src.w * s, dh = c.src.h * s;
  target.imageSmoothingQuality = 'high';
  target.clearRect(0, 0, w, h);
  target.drawImage(img, c.src.x, c.src.y, c.src.w, c.src.h, (w - dw) / 2 + c.x * k, (h - dh) / 2 + c.y * k, dw, dh);
}

function panels() {
  if (batch.length === 1) return [{ x: 0, y: 0, w: img.width, h: img.height }];
  const pw = img.width / BATCH.cols, ph = img.height / BATCH.rows;
  const trim = 0.015;
  return batch.map((_, i) => {
    const col = i % BATCH.cols, row = Math.floor(i / BATCH.cols);
    return { x: col * pw + pw * trim, y: row * ph + ph * trim, w: pw * (1 - 2 * trim), h: ph * (1 - 2 * trim) };
  });
}

function cellView(c) {
  c.canvas = el('canvas', { width: c.slot.w, height: c.slot.h });
  c.ctx = c.canvas.getContext('2d');
  let from = null;
  c.canvas.addEventListener('pointerdown', e => { from = { px: e.clientX, py: e.clientY, x: c.x, y: c.y }; c.canvas.setPointerCapture(e.pointerId); });
  c.canvas.addEventListener('pointermove', e => {
    if (!from) return;
    const k = c.slot.w / c.canvas.getBoundingClientRect().width;
    c.x = from.x + (e.clientX - from.px) * k;
    c.y = from.y + (e.clientY - from.py) * k;
    clampPan(c);
    draw(c);
  });
  c.canvas.addEventListener('pointerup', () => { from = null; });
  c.canvas.addEventListener('wheel', e => {
    e.preventDefault();
    c.zoom = Math.min(4, Math.max(1, c.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
    clampPan(c);
    draw(c);
  }, { passive: false });
  const keep = el('input', { type: 'checkbox', checked: true });
  keep.addEventListener('change', () => { c.keep = keep.checked; fig.classList.toggle('skip', !c.keep); });
  const fig = el('figure', { class: 'cell' }, c.canvas,
    el('figcaption', {}, el('label', {}, keep, ` ${c.slot.name}`)));
  return fig;
}

async function openCrop(blob) {
  try {
    img = await createImageBitmap(blob);
  } catch {
    toast('That file isn\'t an image the browser can read.', true);
    return;
  }
  const src = panels();
  cells = batch.map((slot, i) => ({ slot, src: src[i], zoom: 1, x: 0, y: 0, keep: true }));
  $('cropCells').className = `cells n${cells.length}`;
  $('cropCells').replaceChildren(...cells.map(cellView));
  cells.forEach(c => draw(c));
  $('cropTitle').textContent = cells.length > 1
    ? `${cells.length} cards from one image: untick any to redo later`
    : `${cells[0].slot.name} → ${cells[0].slot.key}.webp`;
  $('crop').hidden = false;
}

const closeCrop = () => { $('crop').hidden = true; img?.close?.(); img = null; cells = []; };

let saving = false;
async function saveCrop() {
  if (saving) return;
  saving = true;
  try {
    const saved = [];
    for (const c of cells.filter(c => c.keep)) {
      const out = new OffscreenCanvas(c.slot.w, c.slot.h);
      draw(c, out.getContext('2d'), c.slot.w, c.slot.h);
      const blob = await out.convertToBlob({ type: 'image/webp', quality: 0.88 });
      if (blob.type !== 'image/webp') { toast('This browser can\'t encode WebP. Use Chrome or Edge.', true); return; }
      const res = await fetch(`/api/art?path=${encodeURIComponent(`assets/img/${c.slot.key}.webp`)}`, { method: 'PUT', body: blob });
      if (!res.ok) { toast(`Save failed for ${c.slot.name}: ${await res.text()}`, true); return; }
      done.add(c.slot.key);
      sizes[c.slot.key] = blob.size;
      stamp.set(c.slot.key, Date.now());
      saved.push(c.slot);
    }
    const last = cells[cells.length - 1].slot;
    closeCrop();
    nextBatch(last, saved);
  } finally {
    saving = false;
  }
}

// Move on to the next wanted slot in this tab, and hand its prompt to the clipboard.
async function nextBatch(after, saved) {
  const order = group === FLAGGED ? slots : slots.filter(s => s.group === after.group);
  const next = order.slice(order.indexOf(after) + 1).concat(order).find(wanted);
  batch = next ? batchFor(next) : [];
  render();
  for (const s of saved) views.get(s.key)?.classList.add('saved');
  const what = saved.length === 1 ? saved[0].name : `${saved.length} cards`;
  toast(`Saved ${what}.`);
  if (!next) return;
  views.get(next.key)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if ($('autoCopy').checked) {
    try {
      await navigator.clipboard.writeText(promptFor(batch));
      toast(`Saved ${what}. Next prompt copied: ${batch.map(s => s.name).join(', ')}.`);
    } catch { /* needs a fresh click */ }
  }
}

$('cropSave').addEventListener('click', saveCrop);
$('cropCancel').addEventListener('click', closeCrop);
document.addEventListener('keydown', e => {
  if ($('crop').hidden) return;
  if (e.key === 'Enter') { e.preventDefault(); saveCrop(); }
  if (e.key === 'Escape') closeCrop();
});

// ------------------------------------------------------------ start
for (const id of ['missingOnly', 'autoCopy', 'batchMode', 'autoGrab']) {
  $(id).checked = pref(id, 'true') === 'true';
  $(id).addEventListener('change', () => {
    setPref(id, $(id).checked);
    if (id === 'batchMode' && batch.length) batch = batchFor(batch[0]);
    render();
  });
}
group = groups.some(g => g.id === pref('group')) ? pref('group') : group;
sizes = await (await fetch('/api/existing')).json();
done = new Set(Object.keys(sizes));
render();
