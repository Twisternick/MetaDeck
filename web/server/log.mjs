// The server's log. Everything written with console.log / warn / error still goes to the console, and
// is also appended to <dir>/YYYY-MM-DD.log as one JSON object per line ({ at, level, msg }). Files
// older than `keepDays` are deleted when a new day's file starts.

import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

export function installLog(dir, { keepDays = 30 } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  let day = null;
  let file = null;

  function rotate(today) {
    day = today;
    file = path.join(dir, `${today}.log`);
    const cutoff = new Date(Date.now() - keepDays * 86_400_000).toISOString().slice(0, 10);
    for (const f of fs.readdirSync(dir)) {
      const m = /^(\d{4}-\d{2}-\d{2})\.log$/.exec(f);
      if (m && m[1] < cutoff) fs.rmSync(path.join(dir, f), { force: true });
    }
  }

  function write(level, args) {
    const at = new Date().toISOString();
    if (at.slice(0, 10) !== day) rotate(at.slice(0, 10));
    try { fs.appendFileSync(file, JSON.stringify({ at, level, msg: util.format(...args) }) + '\n'); } catch { /* disk full or locked: the console still has it */ }
  }

  for (const level of ['log', 'warn', 'error']) {
    const original = console[level].bind(console);
    console[level] = (...args) => { original(...args); write(level === 'log' ? 'info' : level, args); };
  }
}
