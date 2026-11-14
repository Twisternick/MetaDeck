// Analytics events, browser error reports and the update check (server side: server/telemetry.mjs).
//
// Nothing here stores anything in the browser: events carry only their name and a few fields, and the
// server counts visitors without cookies. On a static host there's no /api, and every call just fails
// quietly.

import { h } from './dom.js';

const ERRORS_PER_PAGE = 10;
const VERSION_CHECK_MS = 10 * 60_000;

let version = null; // the version this page loaded, from /api/version
let errors = 0;
const reported = new Set();

function post(url, body) {
  try {
    fetch(url, {
      method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => {});
  } catch { /* no fetch, or the body can't be sent */ }
}

// One analytics event. Names and fields are listed in EVENTS in server/telemetry.mjs.
export function track(name, data = {}) {
  post('/api/event', { name, data });
}

function reportError(err) {
  const key = `${err.message}|${err.source}|${err.line}`;
  if (errors >= ERRORS_PER_PAGE || reported.has(key)) return;
  errors++;
  reported.add(key);
  post('/api/client-error', { ...err, version });
}

// A bar across the top of the screen: an update to reload for, or the server's maintenance notice.
export function showBanner(text, { action = null, kind = 'info' } = {}) {
  document.querySelector(`.site-banner[data-kind="${kind}"]`)?.remove();
  const bar = h('div', { class: 'site-banner', 'data-kind': kind, role: 'status' },
    h('span', null, text),
    action ? h('button', { class: 'btn primary small', onclick: action.onclick }, action.label) : null,
    h('button', { class: 'btn ghost small', 'aria-label': 'Dismiss', onclick: () => bar.remove() }, '✕'));
  document.body.append(bar);
}

async function checkVersion() {
  let now;
  try {
    const res = await fetch('/api/version', { cache: 'no-store' });
    if (!res.ok) return;
    now = (await res.json()).version;
  } catch { return; }
  if (!now) return;
  if (version === null) { version = now; return; }
  if (now !== version && !document.querySelector('.site-banner[data-kind="update"]')) {
    showBanner('MetaDeck has been updated.', { kind: 'update', action: { label: 'Reload', onclick: () => location.reload() } });
  }
}

export function installTelemetry() {
  window.addEventListener('error', e => reportError({ message: String(e.message ?? 'error'), source: e.filename ?? '', line: e.lineno ?? 0, stack: String(e.error?.stack ?? '') }));
  window.addEventListener('unhandledrejection', e => reportError({ message: String(e.reason?.message ?? e.reason ?? 'rejection'), source: '', line: 0, stack: String(e.reason?.stack ?? '') }));
  checkVersion();
  setInterval(checkVersion, VERSION_CHECK_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
  track('visit');
}
