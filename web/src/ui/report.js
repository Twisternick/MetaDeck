// Report a player (and optionally block them): a reason from a fixed list and an optional note, sent
// to the operator's report queue (server/social.mjs, npm run reports).

import { h } from './dom.js';
import { reportPlayer, blockPlayer, signedIn } from './profile.js';
import { toast } from './packs.js';

const REASONS = {
  name: 'Offensive name', cheating: 'Cheating or exploiting', stalling: 'Stalling or quitting on purpose',
  abuse: 'Harassment or abusive emotes', other: 'Something else',
};

export function reportDialog(name) {
  const close = () => overlay.remove();
  if (!signedIn()) { toast('Sign in to report a player.', 'bad'); return; }
  const reason = h('select', { class: 'acct-input', 'aria-label': 'Reason' },
    h('option', { value: '' }, 'Choose a reason…'),
    Object.entries(REASONS).map(([id, label]) => h('option', { value: id }, label)));
  const note = h('textarea', { class: 'acct-input', rows: '3', maxlength: '500', placeholder: 'Anything that helps (optional)', 'aria-label': 'Details' });
  const block = h('input', { type: 'checkbox' });
  const err = h('p', { class: 'acct-error', role: 'alert' });
  const send = async e => {
    e.preventDefault();
    if (!reason.value) { err.textContent = 'Choose a reason.'; reason.focus(); return; }
    const r = await reportPlayer(name, reason.value, note.value);
    if (!r.ok) { err.textContent = r.reason; return; }
    if (block.checked) await blockPlayer(name);
    close();
    toast(block.checked ? `Thanks. ${name} is reported and blocked.` : `Thanks. ${name} is reported.`);
  };
  const overlay = h('div', { class: 'overlay report-overlay', onclick: e => { if (e.target === overlay) close(); } },
    h('form', { class: 'dialog report-dialog', onsubmit: send },
      h('h2', null, `Report ${name}`),
      h('p', { class: 'muted' }, 'Reports go to the people who run MetaDeck. They aren’t shown to the player.'),
      reason, note,
      h('label', { class: 'setting-row check' }, block, h('span', null, `Also block ${name} (you won’t be matched again)`)),
      err,
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cancel'),
        h('button', { class: 'btn danger', type: 'submit' }, 'Send report'))));
  document.body.append(overlay);
  reason.focus();
}
