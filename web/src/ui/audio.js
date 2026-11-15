// Sound effects and music.
//
// Every sound is a named slot, like the art slots: assets/audio/<name>.mp3 is played if it exists and
// skipped silently if it doesn't, so the game works with no sounds at all and gets better as files are
// added (assets/audio/README.md lists every slot and where to find sounds for it). Effects go through
// Web Audio, so many short sounds can overlap with no lag, and each play varies its pitch and volume a
// little so repeats don't sound robotic. Music is a looping <audio> element that fades between tracks
// and pauses while the tab is hidden.
//
// Browsers only allow sound after the player has interacted with the page, so nothing plays until the
// first click or key press. Volumes (master, music, effects, mute) are saved per browser.

import { storage } from './dom.js';
import { CARDS, DECKS } from '../data/index.js';

// name -> { vol: relative loudness 0..1, vary: pitch variation (0.06 = ±6%) }
export const SLOTS = {
  // interface
  click: { vol: 0.5, vary: 0.05 }, hover: { vol: 0.18, vary: 0.08 }, back: { vol: 0.5 }, error: { vol: 0.6 },
  coin: { vol: 0.6, vary: 0.06 }, reward: { vol: 0.8 }, unlock: { vol: 0.8 },
  // match
  draw: { vol: 0.45, vary: 0.08 }, pickup: { vol: 0.35, vary: 0.08 }, drop: { vol: 0.4 },
  play: { vol: 0.32, vary: 0.05 }, summon: { vol: 0.7, vary: 0.05 }, spell: { vol: 0.7, vary: 0.05 },
  attack: { vol: 0.6, vary: 0.08 }, hit: { vol: 0.7, vary: 0.1 }, crit: { vol: 0.9 }, 'hero-hit': { vol: 0.8, vary: 0.06 },
  death: { vol: 0.7, vary: 0.08 }, heal: { vol: 0.6 }, buff: { vol: 0.55, vary: 0.06 }, debuff: { vol: 0.55, vary: 0.06 },
  shield: { vol: 0.6 }, keyword: { vol: 0.30, vary: 0.06 }, fizzle: { vol: 0.5 },
  'your-turn': { vol: 0.8 }, 'enemy-turn': { vol: 0.5 }, alert: { vol: 0.8 }, tick: { vol: 0.5 },
  victory: { vol: 0.9 }, defeat: { vol: 0.8 }, tie: { vol: 0.65 },
  ...Object.fromEntries(DECKS.map(deck => [`summon-${deck.id}`, { vol: 0.62, vary: 0.04 }])),
  // packs
  'pack-open': { vol: 0.8 }, flip: { vol: 0.5, vary: 0.08 }, 'reveal-rare': { vol: 0.7 }, 'reveal-epic': { vol: 0.8 },
  'reveal-legendary': { vol: 1 }, shine: { vol: 0.7 },
};
export const MUSIC = ['music-menu', 'music-match'];
const FALLBACK = name => (name.startsWith('summon-') ? 'summon' : null);

const KEY = 'metadeck.audio';
const settings = { master: 0.8, music: 0.45, sfx: 0.8, muted: false, ...storage.get(KEY, {}) };

let ctx = null;
let out = null;              // effects gain node
const buffers = new Map();   // name -> AudioBuffer | null (missing) | Promise
const starts = new Map();    // name -> seconds of leading silence (MP3 encoder padding) to skip
const recent = new Map();    // name -> last play time, so a burst of one sound doesn't stack up
let unlocked = false;
let wantedTrack = null;
let track = null;
const playingTracks = new Set(); // Includes the outgoing track during a crossfade.

const url = name => `assets/audio/${name}.mp3`;
const effectsVolume = () => (settings.muted ? 0 : settings.master * settings.sfx);
const musicVolume = () => (settings.muted ? 0 : settings.master * settings.music);

function load(name) {
  if (buffers.has(name)) return buffers.get(name);
  const p = fetch(url(name))
    .then(r => (r.ok ? r.arrayBuffer() : null))
    .then(data => (data ? ctx.decodeAudioData(data) : null))
    .catch(() => null)
    .then(buf => { buffers.set(name, buf); if (buf) starts.set(name, leadingSilence(buf)); return buf; });
  buffers.set(name, p);
  return p;
}

// Most MP3 encoders pad the start with ~25 ms of silence; skipping it keeps effects tight on the action.
function leadingSilence(buf) {
  const d = buf.getChannelData(0), limit = Math.min(d.length, buf.sampleRate * 0.1);
  let i = 0;
  while (i < limit && Math.abs(d[i]) < 0.003) i++;
  return i < limit ? Math.max(0, i - buf.sampleRate * 0.001) / buf.sampleRate : 0;
}

// Play one effect. Options: volume (×), pitch (×), delay (ms). Unknown or missing sounds do nothing.
export function sfx(name, { volume = 1, pitch = 1, delay = 0 } = {}) {
  if (!unlocked || !ctx || effectsVolume() === 0 || !SLOTS[name]) return;
  const now = performance.now();
  if (now - (recent.get(name) ?? -Infinity) < 35) return;
  recent.set(name, now);
  const slot = SLOTS[name];
  const start = buf => {
    if (!buf) {
      const fb = FALLBACK(name);
      if (fb) sfx(fb, { volume, pitch, delay });
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const vary = slot.vary ?? 0;
    src.playbackRate.value = pitch * (1 + (Math.random() * 2 - 1) * vary);
    const gain = ctx.createGain();
    gain.gain.value = slot.vol * volume * (1 - Math.random() * vary);
    src.connect(gain).connect(out);
    src.start(ctx.currentTime + delay / 1000, starts.get(name) ?? 0);
  };
  const b = buffers.get(name);
  if (b instanceof AudioBuffer || b === null) start(b);
  else Promise.resolve(b ?? load(name)).then(start);
}

// Switch the music to `name` (one of MUSIC), or stop it with null. Tracks crossfade.
export function music(name) {
  wantedTrack = name;
  if (!unlocked || track?.name === name) return;
  const old = track;
  track = null;
  if (old) fade(old, 0, 600, () => { old.el.pause(); playingTracks.delete(old); });
  if (!name) return;
  const el = new Audio(url(name));
  el.loop = true;
  el.volume = 0;
  const next = { name, el, level: 0, frame: 0 };
  el.addEventListener('error', () => { playingTracks.delete(next); if (track === next) track = null; }, { once: true });
  track = next;
  playingTracks.add(next);
  el.play().then(() => { if (track === next) fade(next, 1, 1200); }).catch(() => {});
}

function fade(item, to, ms, done) {
  cancelAnimationFrame(item.frame);
  const from = item.level;
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    item.level = from + (to - from) * k;
    item.el.volume = item.level * musicVolume();
    if (k < 1) item.frame = requestAnimationFrame(step); else done?.();
  };
  item.frame = requestAnimationFrame(step);
}

export const audioSettings = () => ({ ...settings });
export function setAudio(changes) {
  Object.assign(settings, changes);
  storage.set(KEY, settings);
  if (out) out.gain.value = effectsVolume();
  for (const item of playingTracks) item.el.volume = item.level * musicVolume();
}

function unlock() {
  if (unlocked) return;
  const AC = window.AudioContext ?? window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  out = ctx.createGain();
  out.gain.value = effectsVolume();
  out.connect(ctx.destination);
  unlocked = true;
  ctx.resume?.();
  for (const n of ['click', 'hover', 'draw', 'play', 'attack', 'hit']) load(n);
  if (wantedTrack) music(wantedTrack);
}

// Once at startup: unlock on the first interaction, give every button a click (and a soft hover),
// and pause the music while the tab is hidden.
export function installAudio() {
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, unlock, { capture: true, once: false });
  document.addEventListener('click', e => {
    const btn = e.target instanceof Element ? e.target.closest('button, .btn, [role="button"]') : null;
    if (!btn || btn.disabled || btn.hasAttribute('data-own-click-sound')) return;
    const label = btn.getAttribute('aria-label') || btn.textContent.trim();
    sfx(/^(←|Back\b|Main menu\b|Cancel\b|Close\b)/i.test(label) ? 'back' : 'click');
  }, { capture: true });
  let lastHover = null;
  document.addEventListener('pointerover', e => {
    const btn = e.target instanceof Element ? e.target.closest('button:not([disabled]), .deck-tile') : null;
    if (btn && btn !== lastHover && e.pointerType === 'mouse') sfx('hover');
    lastHover = btn;
  });
  document.addEventListener('visibilitychange', () => {
    if (!track) return;
    if (document.hidden) track.el.pause(); else track.el.play().catch(() => {});
  });
}

// The sounds for a batch of engine events (state.events), spaced out a little so they don't all land at once.
export function playEvents(events, { humanPid = 0 } = {}) {
  let t = 0;
  const at = (name, opts = {}) => { sfx(name, { ...opts, delay: t }); t += 40; };
  for (const e of events) {
    switch (e.type) {
      case 'draw': if (humanPid === null || e.pid === humanPid) at('draw'); break;
      case 'play': { const def = CARDS[e.id]; if (def) at(def.type === 'Spell' ? 'spell' : 'play'); break; }
      case 'summon': at(SLOTS[`summon-${e.deckId}`] ? `summon-${e.deckId}` : 'summon'); break;
      case 'attack': at('attack'); break;
      case 'damage':
        if (e.amount === 'HEADSHOT') at('crit');
        else if (e.pid !== undefined && e.uid === undefined) at('hero-hit');
        else if (e.amount) at('hit', { volume: Math.min(1.3, 0.7 + e.amount * 0.1) });
        break;
      case 'death': at('death'); break;
      case 'heal': at('heal'); break;
      case 'buff': case 'levelup': at('buff'); break;
      case 'debuff': case 'silence': case 'suppress': at('debuff'); break;
      case 'shield': case 'checkpoint': at('shield'); break;
      case 'keyword': at(e.text === 'Lost' ? 'debuff' : 'keyword'); break;
      case 'fizzle': at('fizzle'); break;
    }
  }
}
