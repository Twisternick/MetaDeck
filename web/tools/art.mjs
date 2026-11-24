// Art tool: makes the game's artwork through the Codex CLI, so Claude (or you) can fill an art slot with
// one command. Codex draws the image with its built-in image_gen tool on your signed-in ChatGPT plan (no
// API key); this script collects the file, crops it to the slot and saves assets/img/<slot>.webp.
//
//   node tools/art.mjs list [missing|flagged|all] [--group RPG]     slots and whether they have art
//   node tools/art.mjs prompt <slot>                                 print a slot's prompt
//   node tools/art.mjs make <slot...> [options]                      generate and place art
//   node tools/art.mjs make --flagged [--group G] [--limit N]        ... for every flagged (or --missing) slot
//   node tools/art.mjs place <slot> <image> [--focus F] [--force]    crop and place an image you made yourself
//
// make options:
//   --note "..."    a one-off correction added to the prompt ("the sword is missing", "make it brighter")
//   --fix           edit the current image instead of drawing a new one (use with --note)
//   --ref <file>    attach a reference image (repeatable). UI slots attach the key art by themselves.
//   --batch         draw up to four cards of the same art style in one 2×2 image, then split it
//   --focus <f>     where to crop from: centre (default), top, bottom, left, right, entropy, attention
//   --jobs <n>      Codex runs at once (default 1)
//   --out <dir>     save into <dir> instead of assets/img, to look before placing
//
// A slot is its path under assets/img without the extension, e.g. cards/RPG_M15_FinalBoss or ui/icon-gold.
// Each run keeps the raw image, Codex's last message and a log in tools/art/_incoming/ (not committed).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { allSlots, batchable, batchPrompt, BATCH, SAVE_PATH } from './art/slots.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG = path.join(root, 'assets/img');
const INCOMING = path.join(root, 'tools/art/_incoming');
const KEY_ART = path.join(IMG, 'ui/key-art.webp');
const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const TIMEOUT_MS = 10 * 60 * 1000;
const QUALITY = 88;

// ------------------------------------------------------------ finding Codex and sharp

// The codex binary. CODEX_BIN wins, then `codex` on PATH, then the newest copy inside the Codex desktop
// app. A copy only counts with codex-code-mode-host.exe beside it: image_gen needs that file.
function findCodex() {
  const usable = f => f && fs.existsSync(f) && (process.platform !== 'win32' || fs.existsSync(path.join(path.dirname(f), 'codex-code-mode-host.exe')));
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  try {
    const found = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['codex'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/).filter(Boolean).find(usable);
    if (found) return found;
  } catch { /* not on PATH */ }
  const bin = path.join(process.env.LOCALAPPDATA ?? '', 'OpenAI/Codex/bin');
  const copies = fs.existsSync(bin)
    ? fs.readdirSync(bin).map(d => path.join(bin, d, process.platform === 'win32' ? 'codex.exe' : 'codex')).filter(usable)
    : [];
  copies.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (copies[0]) return copies[0];
  fail('Codex not found. Install the Codex desktop app or CLI and sign in, or set CODEX_BIN to codex.exe. '
    + 'A copy without codex-code-mode-host.exe beside it is incomplete: reinstall it.');
}

// sharp crops and encodes WebP. The game has no dependencies, so this uses a local install if there is one
// and otherwise the copy bundled with the Codex desktop app.
async function loadSharp() {
  try { return (await import('sharp')).default; } catch { /* not installed here */ }
  const runtimes = path.join(process.env.LOCALAPPDATA ?? '', 'OpenAI/Codex/runtimes');
  const dirs = fs.existsSync(runtimes)
    ? fs.readdirSync(runtimes).flatMap(r => fs.readdirSync(path.join(runtimes, r)).map(v => path.join(runtimes, r, v, 'bin/node_modules')))
      .filter(d => fs.existsSync(path.join(d, 'sharp')))
    : [];
  dirs.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  for (const d of dirs) {
    try { return createRequire(path.join(d, 'x.js'))('sharp'); } catch { /* try the next */ }
  }
  fail('sharp not found. Run `npm i --no-save sharp` in web/, or install the Codex desktop app (it bundles sharp).');
}

function fail(msg) { console.error(`error: ${msg}`); process.exit(1); }

// ------------------------------------------------------------ slots

const slots = allSlots();
const byKey = new Map(slots.map(s => [s.key, s]));

const artFile = key => ['webp', 'png'].map(ext => path.join(IMG, `${key}.${ext}`)).find(f => fs.existsSync(f));

// A flag in redo.js holds while the flagged file (same size in bytes) is still in place.
const flagged = s => {
  const f = artFile(s.key);
  return s.redo.length > 0 && (!f || s.redo.some(r => fs.statSync(f).size === r.bytes));
};
const status = s => (!artFile(s.key) ? 'missing' : flagged(s) ? 'flagged' : 'done');

function slot(key) {
  const s = byKey.get(key.replace(/\\/g, '/').replace(/^(assets\/img\/)?/, '').replace(/\.(webp|png)$/, ''));
  if (!s) fail(`no slot "${key}". \`node tools/art.mjs list all\` lists them.`);
  return s;
}

// ------------------------------------------------------------ sizes and cropping

const up16 = n => Math.ceil(n / 16) * 16;
// The size asked of image_gen: the slot's shape, about twice its size, long edge 1024–2048 and both edges
// multiples of 16. A batch is a 2×2 grid of card panels.
function genSize(s, batch) {
  const [w, h] = batch ? [s.w * BATCH.cols, s.h * BATCH.rows] : [s.w, s.h];
  const long = Math.min(2048, Math.max(1024, up16(2 * Math.max(w, h))));
  return w >= h ? [long, up16(long * h / w)] : [up16(long * w / h), long];
}

const FOCUS = ['centre', 'top', 'bottom', 'left', 'right', 'entropy', 'attention'];

// Crops (or, for transparent cut-outs, fits whole) `region` of `src` into the slot and writes the WebP.
async function place(sharp, src, s, { region, focus = 'centre', out = IMG } = {}) {
  let img = sharp(src);
  if (region) img = img.extract(region);
  // a 9-slice border is cut to its drawn rim and stretched to fill the slot, so its corners land on the slot edges
  const position = ['entropy', 'attention'].includes(focus) ? sharp.strategy[focus] : focus;
  if (s.trim) img = sharp(await img.trim({ threshold: 8 }).toBuffer()).resize(s.w, s.h, { fit: 'fill' });
  else img = s.fit
    ? img.resize(s.w, s.h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    : img.resize(s.w, s.h, { fit: 'cover', position });
  const rel = `assets/img/${s.key}.webp`;
  if (!SAVE_PATH.test(rel)) fail(`refusing to write ${rel}`);
  const file = path.join(out, `${s.key}.webp`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const info = await img.webp({ quality: QUALITY, alphaQuality: 100 }).toFile(file);
  return { file, kb: Math.round(info.size / 1024) };
}

// The four panels of a batch image, trimmed a little to drop the dividing lines.
async function panels(sharp, src, n) {
  const { width, height } = await sharp(src).metadata();
  const pw = width / BATCH.cols, ph = height / BATCH.rows, trim = 0.015;
  return Array.from({ length: n }, (_, i) => {
    const col = i % BATCH.cols, row = Math.floor(i / BATCH.cols);
    return {
      left: Math.round(col * pw + pw * trim), top: Math.round(row * ph + ph * trim),
      width: Math.round(pw * (1 - 2 * trim)), height: Math.round(ph * (1 - 2 * trim)),
    };
  });
}

// A transparent slot needs real transparency, or it would sit on the screen as a coloured box.
async function opaque(sharp, src) { return (await sharp(src).stats()).isOpaque; }

// ------------------------------------------------------------ Codex

// What Codex is told around the slot prompt: draw once, touch nothing, name the file.
function codexPrompt(list, { note, fix, refs }) {
  const s = list[0];
  const [w, h] = genSize(s, list.length > 1);
  const art = list.length > 1 ? batchPrompt(list) : s.prompt;
  const attached = [
    fix && 'The first attached image is the current version of this artwork. Edit it: keep what works and change only what the correction asks.',
    refs.length > (fix ? 1 : 0) && 'The other attached image(s) are style references: match their style, materials, colours and lighting, not their composition or subject.',
  ].filter(Boolean);
  return [
    `Make ${fix ? 'an edited version of an image' : 'one image'} with your built-in image_gen tool (not the CLI, no API key), `
      + `at ${w}×${h} pixels${s.fit ? ' with a real transparent background (alpha), not a checkerboard or a solid colour' : ''}.`,
    ...attached,
    'Do not read files, run shell commands, or copy, move, convert or resize the result: a script collects it from your generated images folder. '
      + 'When the image is done, reply with only its full file path.',
    '',
    'IMAGE PROMPT:',
    art,
    note && `\nCORRECTION (most important): ${note}`,
  ].filter(x => x !== false && x != null).join('\n');
}

// Runs one Codex session and returns the path of the image it made.
function runCodex(codex, prompt, images, base) {
  const args = ['exec', '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral', '--json',
    '-c', 'mcp_servers.node_repl.enabled=false', '-C', INCOMING, '-o', `${base}-codex-last-message.txt`];
  for (const f of images) args.push('--image', f);
  args.push('-');
  const log = fs.createWriteStream(`${base}-codex.log`);
  log.write(`$ ${codex} ${args.join(' ')}\n\n${prompt}\n\n`);
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(codex, args, { cwd: INCOMING, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let thread = null, out = '', err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Codex took over ${TIMEOUT_MS / 60000} minutes`)); }, TIMEOUT_MS);
    child.stdout.on('data', d => {
      log.write(d); out += d;
      thread ??= out.match(/"thread_id":"([^"]+)"/)?.[1] ?? null;
    });
    child.stderr.on('data', d => { log.write(d); err += d; });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer); log.end();
      // The path Codex named, else the newest image in this run's own folder (safe with parallel runs).
      const named = (() => {
        try { return fs.readFileSync(`${base}-codex-last-message.txt`, 'utf8').match(/[A-Za-z]:[\\/][^\s"'`]+?\.(png|webp|jpe?g)|\/[^\s"'`]+?\.(png|webp|jpe?g)/i)?.[0]; } catch { return null; }
      })();
      const dir = thread && path.join(CODEX_HOME, 'generated_images', thread);
      const newest = dir && fs.existsSync(dir)
        ? fs.readdirSync(dir).map(f => path.join(dir, f)).filter(f => /\.(png|webp|jpe?g)$/i.test(f) && fs.statSync(f).mtimeMs >= started - 5000)
          .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0]
        : null;
      const file = [named, newest].find(f => f && fs.existsSync(f));
      if (file) { resolve(file); return; }
      const why = /usage limit|rate limit|quota/i.test(out + err) ? 'the ChatGPT plan\'s usage limit is reached'
        : /log ?in|sign ?in|unauthori[sz]ed|401/i.test(out + err) ? 'Codex is not signed in (run `codex login` or open the Codex app)'
          : `Codex exited with code ${code} and made no image`;
      reject(new Error(`${why}. Log: ${path.relative(root, `${base}-codex.log`)}`));
    });
    child.stdin.end(prompt);
  });
}

// ------------------------------------------------------------ commands

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
const safe = key => key.replace(/\//g, '_');

// Generates art for one job (a single slot, or up to four batched cards) and places it.
async function make(codex, sharp, list, opts) {
  const base = path.join(INCOMING, `${safe(list[0].key)}${list.length > 1 ? `+${list.length - 1}` : ''}-${stamp()}`);
  const refs = [];
  if (opts.fix) {
    const current = artFile(list[0].key);
    if (!current) throw new Error(`${list[0].key} has no image to fix yet`);
    refs.push(current);
  }
  if (/reference image/.test(list[0].prompt) && fs.existsSync(KEY_ART)) refs.push(KEY_ART);
  refs.push(...opts.refs);
  const names = list.map(s => s.key).join(', ');
  console.log(`… ${names}: drawing with Codex`);
  const raw = await runCodex(codex, codexPrompt(list, { ...opts, refs }), refs, base);
  const kept = `${base}${path.extname(raw)}`;
  fs.copyFileSync(raw, kept);
  if (list[0].fit && await opaque(sharp, kept) && !opts.force) {
    throw new Error(`${names}: the image came back without a transparent background, so it was not placed. `
      + `Retry, or place it anyway: node tools/art.mjs place ${list[0].key} ${path.relative(root, kept)} --force`);
  }
  const regions = list.length > 1 ? await panels(sharp, kept, list.length) : [null];
  const done = [];
  for (const [i, s] of list.entries()) {
    const r = await place(sharp, kept, s, { region: regions[i], focus: opts.focus, out: opts.out });
    done.push(`${path.relative(root, r.file)} (${r.kb} KB)`);
  }
  console.log(`✓ ${done.join(', ')}  ← ${path.relative(root, kept)}`);
}

// Groups the chosen slots into jobs: with --batch, cards of the same art style four to an image.
function jobs(list, batch) {
  if (!batch) return list.map(s => [s]);
  const out = [];
  for (const s of list) {
    const open = out.find(j => j.length < BATCH.positions.length && batchable(j[0], s));
    if (open) open.push(s); else out.push([s]);
  }
  return out;
}

function parse(argv) {
  const opts = { refs: [], jobs: 1, focus: 'centre', out: IMG, keys: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i] ?? fail(`${a} needs a value`);
    if (a === '--note') opts.note = next();
    else if (a === '--fix') opts.fix = true;
    else if (a === '--ref') opts.refs.push(path.resolve(next()));
    else if (a === '--batch') opts.batch = true;
    else if (a === '--focus') opts.focus = next();
    else if (a === '--jobs') opts.jobs = Math.max(1, Number(next()) || 1);
    else if (a === '--out') opts.out = path.resolve(next());
    else if (a === '--group') opts.group = next();
    else if (a === '--limit') opts.limit = Number(next());
    else if (a === '--missing' || a === '--flagged') opts.select = a.slice(2);
    else if (a === '--force') opts.force = true;
    else if (a.startsWith('--')) fail(`unknown option ${a}`);
    else opts.keys.push(a);
  }
  if (!FOCUS.includes(opts.focus)) fail(`--focus is one of ${FOCUS.join(', ')}`);
  for (const f of opts.refs) if (!fs.existsSync(f)) fail(`no file ${f}`);
  return opts;
}

const pick = (which, opts) => slots
  .filter(s => which === 'all' || status(s) === which || (which === 'todo' && status(s) !== 'done'))
  .filter(s => !opts.group || s.group === opts.group)
  .slice(0, opts.limit || undefined);

const [cmd, ...rest] = process.argv.slice(2);
const opts = parse(rest);

if (cmd === 'list') {
  const which = opts.keys[0] ?? 'todo';
  if (!['missing', 'flagged', 'all', 'todo'].includes(which)) fail('list missing | flagged | all');
  const list = pick(which, opts);
  for (const s of list) {
    const why = status(s) === 'flagged' ? `  ⚑ ${s.redo.map(r => r.note).join(' ')}` : '';
    console.log(`${status(s).padEnd(8)} ${s.key.padEnd(40)} ${s.name}${why}`);
  }
  console.log(`\n${list.length} slot(s). ${slots.filter(s => status(s) === 'missing').length} missing and ${slots.filter(s => status(s) === 'flagged').length} flagged of ${slots.length}.`);
} else if (cmd === 'prompt') {
  if (!opts.keys.length) fail('prompt <slot>');
  const list = opts.keys.map(slot);
  console.log(list.length > 1 ? batchPrompt(list) : list[0].prompt);
} else if (cmd === 'place') {
  const [key, file] = opts.keys;
  if (!key || !file || !fs.existsSync(file)) fail('place <slot> <image file>');
  const s = slot(key), sharp = await loadSharp();
  if (s.fit && await opaque(sharp, file) && !opts.force) fail(`${s.key} needs a transparent background and this image has none. Add --force to place it anyway.`);
  const r = await place(sharp, file, s, opts);
  console.log(`✓ ${path.relative(root, r.file)} (${r.kb} KB)`);
} else if (cmd === 'make') {
  const list = opts.select ? pick(opts.select, opts) : opts.keys.map(slot);
  if (!list.length) fail(opts.select ? `no ${opts.select} slots` : 'make <slot...>, or --missing / --flagged');
  if (opts.fix && (list.length > 1 || opts.batch)) fail('--fix works on one slot at a time');
  const codex = findCodex(), sharp = await loadSharp();
  fs.mkdirSync(INCOMING, { recursive: true });
  const queue = jobs(list, opts.batch);
  let failed = 0;
  await Promise.all(Array.from({ length: Math.min(opts.jobs, queue.length) }, async () => {
    for (let job; (job = queue.shift());) {
      try { await make(codex, sharp, job, opts); } catch (e) { failed++; console.error(`✗ ${e.message}`); }
    }
  }));
  if (failed) process.exit(1);
} else {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n\n')[0].replace(/^\/\/ ?/gm, ''));
}
