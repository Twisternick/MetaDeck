// Account screen: sign up or sign in (so your cards and purchases follow you to any device), or, while
// signed in, see the account and sign out. Guests keep playing with a profile stored in this browser.

import { h } from './dom.js';
import { removeFx, confetti, motionOK } from './fx.js';
import { profile, signedIn, signIn, signUp, signOut, walletBar } from './profile.js';
import { toast } from './packs.js';
import { seasonTier, unopenedPacks } from '../data/economy.js';

export function accountScreen(root, { onBack, nav, mode = 'signin' }) {
  removeFx();
  const body = h('div', { class: 'acct-body' });

  const render = () => {
    const me = signedIn();
    body.replaceChildren(me ? accountCard(me) : authForm());
  };

  function accountCard(me) {
    const p = profile();
    const owned = Object.values(p.cards).reduce((s, c) => s + c.n + c.p, 0);
    const stat = (label, value) => h('div', { class: 'acct-stat' }, h('b', null, value), h('span', null, label));
    return h('section', { class: 'acct-card rise' },
      h('div', { class: 'acct-avatar', 'aria-hidden': 'true' }, me.name.slice(0, 1).toUpperCase()),
      h('h2', null, me.name),
      h('p', { class: 'muted' }, 'Your cards, currencies, quests and season progress are saved to this account and follow you to any device.'),
      h('div', { class: 'acct-stats' },
        stat('cards owned', owned.toLocaleString()),
        stat('games played', p.stats.games.toLocaleString()),
        stat('wins', p.stats.wins.toLocaleString()),
        stat('season tier', seasonTier(p)),
        stat('unopened packs', unopenedPacks(p))),
      h('div', { class: 'acct-actions' },
        h('button', { class: 'btn primary', onclick: onBack }, 'Play'),
        h('button', { class: 'btn ghost', onclick: async () => { await signOut(); toast('Signed out. You’re playing as a guest.'); render(); } }, 'Sign out')));
  }

  function authForm() {
    const isUp = mode === 'signup';
    const err = h('p', { class: 'acct-error', role: 'alert' });
    const name = h('input', { class: 'acct-input', type: 'text', name: 'username', autocomplete: 'username', maxlength: '20', required: true, placeholder: 'Name', 'aria-label': 'Name', pattern: '[A-Za-z0-9_]{3,20}' });
    const pw = h('input', { class: 'acct-input', type: 'password', name: 'password', autocomplete: isUp ? 'new-password' : 'current-password', minlength: isUp ? '8' : null, required: true, placeholder: 'Password', 'aria-label': 'Password' });
    const pw2 = isUp ? h('input', { class: 'acct-input', type: 'password', name: 'confirm', autocomplete: 'new-password', required: true, placeholder: 'Password again', 'aria-label': 'Password again' }) : null;
    const submit = h('button', { class: 'btn primary big', type: 'submit' }, isUp ? 'Create account' : 'Sign in');
    const form = h('form', {
      class: 'acct-form', novalidate: true,
      onsubmit: async e => {
        e.preventDefault();
        err.textContent = '';
        if (isUp && !/^[A-Za-z0-9_]{3,20}$/.test(name.value)) { err.textContent = 'Names are 3–20 letters, digits or underscores.'; return; }
        if (isUp && pw.value.length < 8) { err.textContent = 'Passwords need at least 8 characters.'; return; }
        if (isUp && pw.value !== pw2.value) { err.textContent = 'The passwords don’t match.'; return; }
        submit.disabled = true;
        submit.textContent = isUp ? 'Creating…' : 'Signing in…';
        const r = await (isUp ? signUp : signIn)(name.value.trim(), pw.value);
        submit.disabled = false;
        submit.textContent = isUp ? 'Create account' : 'Sign in';
        if (!r.ok) { err.textContent = r.reason ?? 'Something went wrong.'; form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); return; }
        if (isUp && motionOK()) confetti();
        toast(isUp ? `Welcome, ${r.name}! Your account is ready.` : `Welcome back, ${r.name}.`);
        render();
      },
    },
      h('div', { class: 'acct-tabs', role: 'tablist' },
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(!isUp), class: `col-tab${isUp ? '' : ' selected'}`, onclick: () => { mode = 'signin'; render(); } }, 'Sign in'),
        h('button', { type: 'button', role: 'tab', 'aria-selected': String(isUp), class: `col-tab${isUp ? ' selected' : ''}`, onclick: () => { mode = 'signup'; render(); } }, 'Create account')),
      h('p', { class: 'muted' }, isUp
        ? 'Save your cards, Gold, Gems and season progress to an account, so they follow you to any device. A new account starts with every free starter deck, 300 Gold and 100 Dust; guest progress stays in this browser.'
        : 'Sign in to load your collection and purchases.'),
      name, pw, pw2, err, submit,
      isUp ? h('p', { class: 'muted small' }, 'Names are 3–20 letters, digits or underscores. Passwords need at least 8 characters.') : null);
    requestAnimationFrame(() => name.focus());
    return h('section', { class: 'acct-card rise' }, form);
  }

  root.replaceChildren(h('main', { class: 'account' },
    h('header', { class: 'page-head' },
      h('button', { class: 'btn ghost small', onclick: onBack }, '← Menu'),
      h('h1', null, 'Account'),
      walletBar({ nav: { shop: nav.shop, collection: nav.collection, season: nav.season } })),
    body));
  render();
}
