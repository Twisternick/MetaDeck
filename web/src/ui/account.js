// Account screen: sign up or sign in (so your cards and purchases follow you to any device), reset a
// forgotten password with the account's recovery code, or, while signed in, see the account and manage
// it: change the password, make a new recovery code, sign out other devices, delete the account.
// Guests keep playing with a profile stored in this browser.

import { h } from './dom.js';
import { removeFx, confetti, motionOK } from './fx.js';
import {
  profile, signedIn, signIn, signUp, signOut, resetPassword, changePassword, newRecoveryCode, signOutOthers, deleteAccount, reload, walletBar,
  setBirthYear, downloadMyData,
} from './profile.js';
import { toast } from './packs.js';
import { founderWelcome, founderBadge } from './founder.js';
import { seasonTier, unopenedPacks } from '../data/economy.js';

const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const PW_MIN = 8;
const NAME_RULE = 'Names are 3–20 letters, digits or underscores.';
const MIN_AGE = 13; // as server/accounts.mjs
const AGE_BLOCK_KEY = 'metadeck.ageBlock';
const AGE_BLOCK_MS = 24 * 3_600_000;
const TOO_YOUNG = `MetaDeck accounts are for players ${MIN_AGE} and older. You can keep playing as a guest; your progress stays in this browser.`;
// After an under-age answer, sign-up stays closed in this browser for a day (so the answer isn't just retried).
const ageBlocked = () => { try { return Date.now() - Number(localStorage.getItem(AGE_BLOCK_KEY) || 0) < AGE_BLOCK_MS; } catch { return false; } };
const blockAge = () => { try { localStorage.setItem(AGE_BLOCK_KEY, String(Date.now())); } catch { /* storage unavailable */ } };
const tooYoung = year => new Date().getFullYear() - year < MIN_AGE;

// A birth-year picker: this year back 100 years, with a neutral "choose" first (no default that passes).
function birthYearField(label = 'Year you were born') {
  const id = `acct-f${++fieldId}`;
  const now = new Date().getFullYear();
  const input = h('select', { class: 'acct-input', id, required: true, 'aria-describedby': `${id}-hint` },
    h('option', { value: '' }, 'Choose…'),
    Array.from({ length: 101 }, (_, i) => h('option', { value: String(now - i) }, String(now - i))));
  const hintEl = h('span', { class: 'acct-hint', id: `${id}-hint` }, 'Only the year is kept. It’s never shown to other players.');
  const el = h('div', { class: 'acct-field' }, h('div', { class: 'acct-label-row' }, h('label', { for: id }, label)), h('div', { class: 'acct-input-wrap' }, input), hintEl);
  return { el, input, value: () => Number(input.value) || null };
}
const legalNote = () => h('p', { class: 'acct-note' }, 'By creating an account you agree to the ',
  h('a', { href: 'legal/terms.html', target: '_blank', rel: 'noopener' }, 'Terms of Service'), ' and the ',
  h('a', { href: 'legal/privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy Policy'), '.');

// ------------------------------------------------------------ fields

let fieldId = 0;
// A labelled input with a hint line under it. Returns { el, input, hint(text, tone) }.
function field(label, attrs, extra = null) {
  const id = `acct-f${++fieldId}`;
  const input = h('input', { class: 'acct-input', id, spellcheck: 'false', autocapitalize: 'off', ...attrs, 'aria-describedby': `${id}-hint` });
  const hintEl = h('span', { class: 'acct-hint', id: `${id}-hint` });
  const el = h('div', { class: 'acct-field' },
    h('div', { class: 'acct-label-row' }, h('label', { for: id }, label)),
    h('div', { class: 'acct-input-wrap' }, input, extra),
    hintEl);
  const hint = (text = '', tone = '') => {
    hintEl.textContent = text;
    hintEl.dataset.tone = tone;
    input.setAttribute('aria-invalid', String(tone === 'bad'));
  };
  return { el, input, hint };
}

// A password field with a show/hide toggle and a caps-lock warning. `rate` adds a strength meter
// (for new passwords); `name` is used to mark passwords that contain the account name as weak.
function passwordField(label, { autocomplete, rate = false, name = () => '' } = {}) {
  const toggle = h('button', { type: 'button', class: 'acct-reveal', 'aria-label': 'Show password', 'aria-pressed': 'false' }, 'Show');
  const f = field(label, { type: 'password', autocomplete, required: true, maxlength: '200' }, toggle);
  toggle.addEventListener('click', () => {
    const show = f.input.type === 'password';
    f.input.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Hide' : 'Show';
    toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    toggle.setAttribute('aria-pressed', String(show));
    f.input.focus();
  });
  const meter = rate ? h('div', { class: 'acct-meter', 'aria-hidden': 'true' }, h('i')) : null;
  if (meter) f.el.insertBefore(meter, f.el.lastChild);
  let caps = false;
  const update = () => {
    if (meter) {
      const s = strength(f.input.value, name());
      meter.dataset.level = s.level;
      meter.style.setProperty('--fill', `${s.level * 25}%`);
      if (caps) f.hint('Caps Lock is on.', 'warn');
      else if (f.input.value) f.hint(s.label, s.level >= 3 ? 'good' : s.level === 0 ? 'bad' : 'warn');
      else f.hint(`At least ${PW_MIN} characters. A few unrelated words make a strong one.`);
    } else f.hint(caps ? 'Caps Lock is on.' : '', caps ? 'warn' : '');
  };
  const capsCheck = e => { if (e.getModifierState) { caps = e.getModifierState('CapsLock'); update(); } };
  f.input.addEventListener('keydown', capsCheck);
  f.input.addEventListener('keyup', capsCheck);
  f.input.addEventListener('input', update);
  f.update = update;
  update();
  return f;
}

// A rough guide, not a rule: the server only enforces the minimum length.
function strength(pw, name) {
  if (pw.length < PW_MIN) return { level: 0, label: `Too short: ${PW_MIN - pw.length} more character${PW_MIN - pw.length === 1 ? '' : 's'}.` };
  const lower = pw.toLowerCase();
  if ((name && lower.includes(name.toLowerCase())) || /^(.)\1+$/.test(pw) || /^(password|12345678|qwerty|letmein|metadeck)/.test(lower)) {
    return { level: 1, label: 'Easy to guess. Avoid your name and common passwords.' };
  }
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(re => re.test(pw)).length;
  const score = (pw.length >= 12) + (pw.length >= 16) + (kinds >= 3);
  return [
    { level: 2, label: 'OK. Longer is stronger.' },
    { level: 3, label: 'Good password.' },
    { level: 4, label: 'Strong password.' },
    { level: 4, label: 'Strong password.' },
  ][score];
}

// "New password" + "type it again", with live checks. Returns { els, value, check() }.
function newPasswordPair(name = () => '') {
  const pw = passwordField('New password', { autocomplete: 'new-password', rate: true, name });
  const again = passwordField('Type it again', { autocomplete: 'new-password' });
  const match = () => {
    if (!again.input.value) return again.update();
    if (again.input.value === pw.input.value) again.hint('Passwords match.', 'good');
    else again.hint('The passwords don’t match yet.', 'bad');
  };
  pw.input.addEventListener('input', match);
  again.input.addEventListener('input', match);
  return {
    els: [pw.el, again.el],
    input: pw.input,
    value: () => pw.input.value,
    // Returns the first problem as { input, reason }, or null.
    check() {
      if (pw.input.value.length < PW_MIN) return { input: pw.input, reason: `Passwords need at least ${PW_MIN} characters.` };
      if (pw.input.value !== again.input.value) return { input: again.input, reason: 'The passwords don’t match.' };
      return null;
    },
  };
}

// Wire a form's submit: client checks first, then the busy state, then the call. `run` returns the
// server's answer; on failure the reason shows in the form's error line and the form shakes.
function submitter(form, button, busyLabel, { check = () => null, run, done, retry = null }) {
  const err = h('p', { class: 'acct-error', role: 'alert' });
  const label = button.textContent;
  const fail = (reason, input = null) => {
    // A field already showing its own problem doesn't need it repeated under the form.
    err.textContent = input?.getAttribute('aria-invalid') === 'true' ? '' : reason ?? 'Something went wrong.';
    form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
    input?.focus();
    input?.select?.();
  };
  form.noValidate = true;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (button.disabled) return;
    err.textContent = '';
    const bad = check();
    if (bad) return fail(bad.reason, bad.input);
    button.disabled = true;
    button.textContent = busyLabel;
    form.setAttribute('aria-busy', 'true');
    const r = await run();
    button.disabled = false;
    button.textContent = label;
    form.removeAttribute('aria-busy');
    if (!r.ok) return fail(r.reason, retry);
    done(r);
  });
  return err;
}

// ------------------------------------------------------------ screen

export function accountScreen(root, { onBack, nav, mode = 'signin' }) {
  removeFx();
  const body = h('div', { class: 'acct-body' });
  let draftName = '';       // kept while switching between sign in, sign up and reset
  let reveal = null;        // { code, title, intro, after } while showing a new recovery code
  let openPanel = null;     // which account-management panel is open

  const render = () => {
    const me = signedIn();
    body.replaceChildren(reveal ? codeCard(reveal) : me ? accountCard(me) : authForm());
    body.querySelector('[data-autofocus]')?.focus();
  };
  const go = next => { mode = next; render(); };

  // ---------------------------------------------------------- recovery code, shown once
  function codeCard({ code, title, intro, after }) {
    const copyBtn = h('button', { type: 'button', class: 'btn ghost' }, 'Copy');
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(code); copyBtn.textContent = 'Copied ✓'; }
      catch { select(); copyBtn.textContent = 'Press Ctrl+C'; }
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    });
    const name = signedIn()?.name ?? '';
    const file = URL.createObjectURL(new Blob([
      `MetaDeck recovery code\r\n\r\nAccount: ${name}\r\nRecovery code: ${code}\r\n\r\n`
      + 'If you forget your password, choose "Forgot password?" on the sign-in screen and enter this code.\r\n'
      + 'Each code works once; you get a new one after using it.\r\n',
    ], { type: 'text/plain' }));
    const codeEl = h('output', { class: 'acct-code', tabindex: '0', 'aria-label': `Recovery code ${code.split('').join(' ')}` }, code);
    const select = () => { const r = document.createRange(); r.selectNodeContents(codeEl); getSelection().removeAllRanges(); getSelection().addRange(r); };
    codeEl.addEventListener('click', select);
    const saved = h('input', { type: 'checkbox', id: 'acct-saved' });
    const next = h('button', { class: 'btn primary big', disabled: true }, 'Continue');
    saved.addEventListener('change', () => { next.disabled = !saved.checked; });
    next.addEventListener('click', () => { URL.revokeObjectURL(file); reveal = null; render(); after?.(); });
    return h('section', { class: 'acct-card rise acct-reveal-card' },
      h('div', { class: 'acct-badge', 'aria-hidden': 'true' }, '🔑'),
      h('h2', { tabindex: '-1', 'data-autofocus': true }, title),
      h('p', { class: 'muted' }, intro),
      codeEl,
      h('div', { class: 'acct-actions' },
        copyBtn,
        h('a', { class: 'btn ghost', href: file, download: `metadeck-recovery-${name || 'code'}.txt` }, 'Download')),
      h('p', { class: 'acct-note' }, 'It’s the only way back in if you forget your password: there’s no email reset. Keep it somewhere safe, like a password manager. You won’t see this code again.'),
      h('label', { class: 'acct-check', for: 'acct-saved' }, saved, 'I’ve saved my recovery code'),
      next);
  }

  // ---------------------------------------------------------- signed in
  function accountCard(me) {
    const p = profile();
    const owned = Object.values(p.cards).reduce((s, c) => s + c.n + c.p + (c.h ?? 0), 0);
    const stat = (label, value) => h('div', { class: 'acct-stat' }, h('b', null, value), h('span', null, label));
    const since = me.created ? new Date(me.created).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null;
    return h('div', { class: 'acct-stack' },
      h('section', { class: 'acct-card rise' },
        h('div', { class: 'acct-avatar', 'aria-hidden': 'true' }, me.name.slice(0, 1).toUpperCase()),
        h('h2', null, me.name),
        founderBadge(p.founder),
        since ? h('p', { class: 'acct-since' }, `Member since ${since}`) : null,
        h('p', { class: 'muted' }, 'Your cards, currencies, quests and season progress are saved to this account and follow you to any device.'),
        h('div', { class: 'acct-stats' },
          stat('cards owned', owned.toLocaleString()),
          stat('games played', p.stats.games.toLocaleString()),
          stat('wins', p.stats.wins.toLocaleString()),
          stat('season tier', seasonTier(p)),
          stat('unopened packs', unopenedPacks(p))),
        me.birthYear == null ? birthYearCard() : null,
        h('div', { class: 'acct-actions' },
          h('button', { class: 'btn primary', onclick: onBack }, 'Play'),
          h('button', { class: 'btn ghost', onclick: async () => { await signOut(); toast('Signed out. You’re playing as a guest.'); mode = 'signin'; render(); } }, 'Sign out'))),
      securityCard(me));
  }

  // Accounts made before sign-up asked for a birth year are asked once.
  function birthYearCard() {
    const year = birthYearField();
    const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Save');
    const form = h('form', { class: 'acct-form acct-ask' });
    const err = submitter(form, submit, 'Saving…', {
      check: () => (year.value() ? null : { input: year.input, reason: 'Choose the year you were born.' }),
      run: async () => {
        const r = await setBirthYear(year.value());
        if (r.tooYoung) { mode = 'signin'; setTimeout(render, 4000); } // signed out: back to the sign-in form after they've read why
        return r;
      },
      done: () => { toast('Thanks!'); render(); },
    });
    form.addEventListener('submit', () => { if (year.value() && tooYoung(year.value())) blockAge(); }, { capture: true });
    form.append(h('p', null, h('b', null, 'One quick question.'), ' MetaDeck accounts are for players 13 and older. What year were you born?'), year.el, err, submit);
    return form;
  }

  // Gem purchases on this account, newest first, with what was charged and any refund.
  function purchasesPanel() {
    const list = [...(profile().purchases ?? [])].reverse();
    if (!list.length) return h('p', { class: 'muted small' }, 'No purchases yet.');
    const charged = x => (x.paid?.amount && x.paid?.currency
      ? `${(Number(x.paid.amount) / 100).toFixed(2)} ${x.paid.currency}` : x.test ? 'test, not charged' : `${x.price}`);
    return h('div', null,
      h('ul', { class: 'purchase-list' }, list.map(x => h('li', { class: `purchase-row${x.status ? ' reversed' : ''}` },
        h('b', null, `${x.gems.toLocaleString()} Gems`),
        h('span', null, charged(x)),
        h('span', { class: 'muted' }, new Date(x.at).toLocaleDateString()),
        x.status ? h('span', { class: 'purchase-status' }, x.status === 'chargeback' ? 'Charged back' : x.status === 'partly refunded' ? 'Partly refunded' : 'Refunded') : null))),
      h('p', { class: 'muted small' }, 'Receipts and invoices come from Paddle by email. For a refund, see the ',
        h('a', { href: 'legal/refunds.html', target: '_blank', rel: 'noopener' }, 'Refund Policy'), '.'));
  }

  function dataPanel() {
    const submit = h('button', { class: 'btn ghost', type: 'submit' }, 'Download my data');
    const form = h('form', { class: 'acct-form' });
    const err = submitter(form, submit, 'Preparing…', { run: () => downloadMyData(), done: () => toast('Downloaded.') });
    form.append(
      h('p', { class: 'muted small' }, 'A copy of everything MetaDeck stores about your account — your collection, currencies, match history and the gameplay events linked to you — as a JSON file. See the ',
        h('a', { href: 'legal/privacy.html', target: '_blank', rel: 'noopener' }, 'Privacy Policy'), ' for what we keep and why.'),
      err, submit);
    return form;
  }

  function securityCard(me) {
    // One panel open at a time; the open one survives re-renders.
    const panel = (id, title, status, content) => {
      const d = h('details', { class: `acct-panel${id === 'delete' ? ' danger' : ''}`, open: openPanel === id },
        h('summary', null, h('span', null, title), status ? h('small', null, status) : null),
        h('div', { class: 'acct-panel-body' }, content));
      d.addEventListener('toggle', () => {
        if (d.open) {
          openPanel = id;
          for (const other of d.parentElement.querySelectorAll('details[open]')) if (other !== d) other.open = false;
          d.querySelector('input:not([hidden])')?.focus();
        } else if (openPanel === id) openPanel = null;
      });
      return d;
    };
    const devices = me.devices ?? 1;
    return h('section', { class: 'acct-card rise acct-security' },
      h('h3', null, 'Account & security'),
      me.recovery ? null : h('div', { class: 'acct-warn', role: 'note' },
        h('b', null, 'No recovery code yet.'),
        ' Without one, a forgotten password locks you out. ',
        h('button', { type: 'button', class: 'linkish', onclick: () => { openPanel = 'recovery'; render(); } }, 'Make one now')),
      panel('password', 'Change password', null, changePasswordForm(me)),
      panel('recovery', 'Recovery code', me.recovery ? 'Saved' : 'Not set up', recoveryForm(me)),
      panel('devices', 'Signed-in devices', devices === 1 ? 'Just this one' : `${devices} devices`, devicesPanel(devices)),
      panel('purchases', 'Purchases', (profile().purchases ?? []).length ? `${profile().purchases.length}` : null, purchasesPanel()),
      panel('data', 'Your data', null, dataPanel()),
      panel('delete', 'Delete account', null, deleteForm(me)));
  }

  function changePasswordForm(me) {
    const current = passwordField('Current password', { autocomplete: 'current-password' });
    const pair = newPasswordPair(() => me.name);
    const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Change password');
    const form = h('form', { class: 'acct-form' });
    const err = submitter(form, submit, 'Saving…', {
      check: () => (!current.input.value ? { input: current.input, reason: 'Enter your current password.' }
        : pair.check() ?? (pair.value() === current.input.value ? { input: pair.input, reason: 'That’s the password you have now.' } : null)),
      run: () => changePassword(current.input.value, pair.value()),
      retry: current.input,
      done: r => {
        openPanel = null;
        toast(r.signedOut ? `Password changed. Signed out ${r.signedOut} other device${r.signedOut === 1 ? '' : 's'}.` : 'Password changed.');
        render();
      },
    });
    form.append(
      h('input', { type: 'text', name: 'username', autocomplete: 'username', value: me.name, hidden: true, readonly: true }),
      current.el, ...pair.els, err, submit,
      h('p', { class: 'acct-note' }, 'Other devices are signed out; this one stays signed in.'));
    return form;
  }

  function recoveryForm(me) {
    const pw = passwordField('Your password', { autocomplete: 'current-password' });
    const submit = h('button', { class: 'btn primary', type: 'submit' }, me.recovery ? 'Make a new code' : 'Make my recovery code');
    const form = h('form', { class: 'acct-form' });
    const err = submitter(form, submit, 'Making…', {
      check: () => (pw.input.value ? null : { input: pw.input, reason: 'Enter your password.' }),
      run: () => newRecoveryCode(pw.input.value),
      retry: pw.input,
      done: r => {
        openPanel = null;
        reveal = { code: r.recoveryCode, title: 'Your new recovery code', intro: me.recovery ? 'Your old code no longer works. Save this one instead.' : 'If you ever forget your password, this code lets you set a new one.' };
        render();
      },
    });
    form.append(
      h('p', { class: 'muted small' }, me.recovery
        ? 'Lost your code, or think someone else has seen it? Make a new one; the old one stops working.'
        : 'A recovery code lets you set a new password if you forget yours. There’s no email reset, so make one now and keep it safe.'),
      h('input', { type: 'text', name: 'username', autocomplete: 'username', value: me.name, hidden: true, readonly: true }),
      pw.el, err, submit);
    return form;
  }

  function devicesPanel(devices) {
    const submit = h('button', { class: 'btn ghost', type: 'submit', disabled: devices <= 1 }, 'Sign out everywhere else');
    const form = h('form', { class: 'acct-form' });
    const err = submitter(form, submit, 'Signing out…', {
      run: () => signOutOthers(),
      done: r => {
        toast(r.signedOut ? `Signed out ${r.signedOut} other device${r.signedOut === 1 ? '' : 's'}.` : 'No other devices were signed in.');
        render();
      },
    });
    form.append(
      h('p', { class: 'muted small' }, devices <= 1
        ? 'You’re only signed in here.'
        : `You’re signed in on ${devices} devices or browsers, including this one. Sign the others out if you used a shared computer or think someone else has your password.`),
      err, submit);
    return form;
  }

  function deleteForm(me) {
    const confirmName = field(`Type ${me.name} to confirm`, { type: 'text', autocomplete: 'off', maxlength: '20' });
    const pw = passwordField('Your password', { autocomplete: 'current-password' });
    const submit = h('button', { class: 'btn danger', type: 'submit', disabled: true }, 'Delete my account forever');
    confirmName.input.addEventListener('input', () => { submit.disabled = confirmName.input.value.trim().toLowerCase() !== me.name.toLowerCase(); });
    const form = h('form', { class: 'acct-form' });
    const err = submitter(form, submit, 'Deleting…', {
      check: () => (pw.input.value ? null : { input: pw.input, reason: 'Enter your password.' }),
      run: () => deleteAccount(pw.input.value, confirmName.input.value),
      retry: pw.input,
      done: () => {
        openPanel = null;
        mode = 'signin';
        toast('Your account was deleted. You’re playing as a guest.');
        render();
      },
    });
    form.append(
      h('p', { class: 'acct-note bad' }, 'This deletes your cards, Gold, Gems, Dust, quests and season progress for good, on every device. It can’t be undone, and the name becomes free for anyone to take.'),
      confirmName.el, pw.el, err, submit);
    return form;
  }

  // ---------------------------------------------------------- signed out
  function authForm() {
    const isUp = mode === 'signup';
    const isReset = mode === 'forgot';
    const name = field('Name', {
      type: 'text', name: 'username', autocomplete: 'username', maxlength: '20', required: true, value: draftName,
      'data-autofocus': draftName ? null : true,
    });
    name.input.addEventListener('input', () => {
      draftName = name.input.value;
      if (!isUp) return;
      const v = name.input.value.trim();
      if (!v) name.hint(NAME_RULE);
      else if (NAME_RE.test(v)) name.hint('Looks good. Other players see this name.', 'good');
      else if (v.length < 3) name.hint(`${3 - v.length} more character${3 - v.length === 1 ? '' : 's'}.`, 'warn');
      else name.hint(NAME_RULE, 'bad');
    });
    if (isUp) name.hint(NAME_RULE);

    const tabs = h('div', { class: 'acct-tabs', role: 'tablist', 'aria-label': 'Account' },
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(!isUp && !isReset), class: `col-tab${!isUp && !isReset ? ' selected' : ''}`, onclick: () => go('signin') }, 'Sign in'),
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(isUp), class: `col-tab${isUp ? ' selected' : ''}`, onclick: () => go('signup') }, 'Create account'));

    const form = h('form', { class: 'acct-form' });
    let submit, err;
    if (isReset) {
      const code = field('Recovery code', {
        type: 'text', name: 'recovery-code', autocomplete: 'one-time-code', autocapitalize: 'characters', required: true,
        maxlength: '40', placeholder: 'XXXX-XXXX-XXXX-XXXX', class: 'acct-input mono',
      });
      code.hint('The code you saved when you made your account (or last reset it).');
      const pair = newPasswordPair(() => name.input.value.trim());
      submit = h('button', { class: 'btn primary big', type: 'submit' }, 'Set new password');
      err = submitter(form, submit, 'Checking…', {
        check: () => (!name.input.value.trim() ? { input: name.input, reason: 'Enter your account name.' }
          : code.input.value.replace(/[\s-]/g, '').length < 16 ? { input: code.input, reason: 'Recovery codes are 16 characters, like ABCD-EFGH-JKMN-PQRS.' }
          : pair.check()),
        run: () => resetPassword(name.input.value.trim(), code.input.value, pair.value()),
        done: r => {
          draftName = '';
          toast(`Password changed. Welcome back, ${r.name}.`);
          reveal = { code: r.recoveryCode, title: 'Your new recovery code', intro: 'You used your old code, so it no longer works. Save this one in its place.' };
          render();
        },
      });
      form.append(
        h('div', { class: 'acct-badge', 'aria-hidden': 'true' }, '🔑'),
        h('h2', null, 'Forgot your password?'),
        h('p', { class: 'muted' }, 'Enter your name and your recovery code, then choose a new password. You’ll be signed out everywhere else.'),
        name.el, code.el, ...pair.els, err, submit,
        h('p', { class: 'acct-note' }, 'Lost your recovery code too? Ask whoever runs this server to set a new password for you.'),
        h('button', { type: 'button', class: 'linkish', onclick: () => go('signin') }, '← Back to sign in'));
    } else if (isUp && ageBlocked()) {
      form.append(tabs, h('div', { class: 'acct-badge', 'aria-hidden': 'true' }, '🎮'), h('p', null, TOO_YOUNG),
        h('button', { type: 'button', class: 'btn primary', onclick: onBack }, 'Keep playing'));
    } else if (isUp) {
      const pair = newPasswordPair(() => name.input.value.trim());
      const year = birthYearField();
      submit = h('button', { class: 'btn primary big', type: 'submit' }, 'Create account');
      err = submitter(form, submit, 'Creating…', {
        check: () => {
          if (!NAME_RE.test(name.input.value.trim())) return { input: name.input, reason: NAME_RULE };
          if (!year.value()) return { input: year.input, reason: 'Choose the year you were born.' };
          if (tooYoung(year.value())) { blockAge(); render(); return { input: year.input, reason: TOO_YOUNG }; }
          return pair.check();
        },
        run: () => signUp(name.input.value.trim(), pair.value(), year.value()),
        done: r => {
          draftName = '';
          if (motionOK()) confetti();
          toast(`Welcome, ${r.name}! Your account is ready.`);
          // A Meta Founder hears about it once the code is safely saved.
          const founder = profile().founder;
          reveal = {
            code: r.recoveryCode, title: 'Save your recovery code', intro: `Your account is ready, ${r.name}. One last step: save this code.`,
            after: founder ? () => founderWelcome(founder) : null,
          };
          render();
        },
      });
      form.append(tabs,
        h('p', { class: 'muted' }, 'Save your cards, Gold, Gems and season progress to an account, so they follow you to any device. A new account starts with every free starter deck, 300 Gold and 100 Dust; guest progress stays in this browser.'),
        name.el, year.el, ...pair.els, err, submit, legalNote());
    } else {
      const pw = passwordField('Password', { autocomplete: 'current-password' });
      if (draftName) pw.input.dataset.autofocus = '';
      submit = h('button', { class: 'btn primary big', type: 'submit' }, 'Sign in');
      err = submitter(form, submit, 'Signing in…', {
        check: () => (!name.input.value.trim() ? { input: name.input, reason: 'Enter your name.' }
          : !pw.input.value ? { input: pw.input, reason: 'Enter your password.' } : null),
        run: () => signIn(name.input.value.trim(), pw.input.value),
        retry: pw.input,
        done: r => { draftName = ''; toast(`Welcome back, ${r.name}.`); render(); },
      });
      const forgot = h('button', { type: 'button', class: 'linkish acct-forgot', onclick: () => go('forgot') }, 'Forgot password?');
      pw.el.querySelector('.acct-label-row').append(forgot);
      form.append(tabs,
        h('p', { class: 'muted' }, 'Sign in to load your collection and purchases.'),
        name.el, pw.el, err, submit);
    }
    return h('section', { class: 'acct-card rise' }, form);
  }

  root.replaceChildren(h('main', { class: 'account' },
    h('header', { class: 'page-head' },
      h('button', { class: 'btn ghost small', onclick: onBack }, '← Menu'),
      h('h1', null, 'Account'),
      walletBar({ nav: { shop: nav.shop, collection: nav.collection, season: nav.season } })),
    body));
  render();
  // Refresh the account's details (devices signed in, recovery code) in case they changed elsewhere.
  if (signedIn()) reload().then(() => { if (!body.querySelector('form[aria-busy], input:focus') && !reveal) render(); });
}
