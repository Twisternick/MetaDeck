// The Feedback dialog: a kind (bug, idea, balance, other) and a message, sent to the operator
// (server/feedback.mjs, npm run feedback). Guests can send it too. It opens from the menu's footer,
// from Settings, and from a link to the site ending in #feedback, which can be shared anywhere.

import { h } from './dom.js';
import { signedIn } from './profile.js';
import { pageVersion } from './telemetry.js';
import { toast } from './packs.js';

const KINDS = { bug: 'Bug', idea: 'Idea', balance: 'Balance', other: 'Something else' };
const HINTS = {
  bug: 'What happened, and what did you expect? Which deck or card, if it matters.',
  idea: 'What would make MetaDeck more fun for you?',
  balance: 'Which card or deck feels too strong or too weak, and why?',
  other: 'Anything at all.',
};
const MAX = 1000; // FEEDBACK_MAX in server/feedback.mjs

// `screen` says where it was opened from ('menu', 'match', …), so a bug report comes with some context.
export function feedbackDialog({ screen = 'menu', kind: startKind = null } = {}) {
  if (document.querySelector('.feedback-dialog')) return;
  let kind = startKind;
  const chips = Object.entries(KINDS).map(([id, label]) => h('button', {
    type: 'button', class: 'chip', 'aria-pressed': 'false', 'data-kind': id,
    onclick: () => pick(id),
  }, label));
  const message = h('textarea', { class: 'acct-input', rows: '5', maxlength: String(MAX), 'aria-label': 'Your feedback',
    placeholder: 'Pick a kind first.', oninput: () => { count.textContent = `${message.value.length} / ${MAX}`; } });
  const count = h('span', { class: 'feedback-count muted' }, `0 / ${MAX}`);
  const err = h('p', { class: 'acct-error', role: 'alert' });
  const sendBtn = h('button', { class: 'btn primary', type: 'submit' }, 'Send feedback');

  function pick(id) {
    kind = id;
    for (const c of chips) {
      const on = c.dataset.kind === id;
      c.classList.toggle('selected', on);
      c.setAttribute('aria-pressed', String(on));
    }
    message.placeholder = HINTS[id];
    err.textContent = '';
    message.focus();
  }

  async function send(e) {
    e.preventDefault();
    if (!kind) { err.textContent = 'Pick what kind of feedback this is.'; chips[0].focus(); return; }
    if (message.value.trim().length < 5) { err.textContent = 'Tell us a little more.'; message.focus(); return; }
    sendBtn.disabled = true;
    let r;
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, message: message.value, screen, version: pageVersion() }),
      });
      r = await res.json().catch(() => ({ ok: false }));
    } catch {
      r = { ok: false };
    }
    sendBtn.disabled = false;
    if (!r.ok) { err.textContent = r.reason ?? 'Couldn’t send it. Check your connection and try again.'; return; }
    dialog.close();
    toast('Thanks! Your feedback was sent.');
  }

  const dialog = h('dialog', { class: 'dialog settings-dialog feedback-dialog', 'aria-labelledby': 'feedback-title',
    onkeydown: e => e.stopPropagation(), onclose: () => dialog.remove() },
    h('form', { class: 'dialog-scroll', onsubmit: send },
      h('h2', { id: 'feedback-title' }, 'Feedback'),
      h('p', { class: 'feedback-lead muted' }, 'Found a bug, have an idea, or think a card is broken? It goes straight to the people making MetaDeck, and we read all of it.'),
      h('div', { class: 'feedback-kinds', role: 'group', 'aria-label': 'Kind of feedback' }, chips),
      message,
      h('div', { class: 'feedback-meta' },
        h('span', { class: 'muted' }, signedIn() ? `Sent as ${signedIn().name}.` : 'Sent without a name. Sign in if you’d like us to know it’s you.'),
        count),
      err,
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => dialog.close() }, 'Cancel'),
        sendBtn)));
  document.body.append(dialog);
  dialog.showModal();
  if (kind) pick(kind); else chips[0].focus();
}

// Open the dialog when the address ends in #feedback (now, and whenever it changes to it), then clear
// the hash so a reload doesn't open it again.
export function installFeedbackLink() {
  const check = () => {
    const m = /^#feedback(?:-(bug|idea|balance|other))?$/.exec(location.hash);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    feedbackDialog({ screen: 'link', kind: m[1] ?? null });
  };
  window.addEventListener('hashchange', check);
  check();
}
