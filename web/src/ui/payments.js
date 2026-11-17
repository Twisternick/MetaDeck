// Buying Gems with real money (server/payments.mjs): the shop's configuration, the purchase dialog
// (an 18+ confirmation and consent to immediate delivery, which ends the 14-day right to withdraw),
// and waiting for the Gems after the player comes back from the checkout.

import { h } from './dom.js';
import { signedIn, profile, reload } from './profile.js';
import { toast } from './packs.js';
import { NO_PAID_PACKS, PURCHASE_MIN_AGE } from '../data/economy.js';

let config = null;
// { enabled, sandbox, clientToken, bundles, minAge, country }; { enabled: false } without payments or a server.
export async function shopConfig() {
  if (config) return config;
  try { config = await (await fetch('/api/shop/config', { cache: 'no-store' })).json(); } catch { config = null; }
  return (config ??= { enabled: false });
}
export const cachedShopConfig = () => config;

// Paid packs aren't sold for Gems where the law restricts them (the server enforces this; the shop explains it).
export const paidPacksBlocked = () => NO_PAID_PACKS.has(signedIn()?.country ?? config?.country ?? '');

// Why this player can't buy Gems right now, or null when they can.
export function cantBuy() {
  const me = signedIn();
  if (!me) return 'Sign in to buy Gems: purchases are kept on your account.';
  if (me.birthYear == null) return 'Set your birth year in Account first.';
  if (new Date().getUTCFullYear() - me.birthYear < PURCHASE_MIN_AGE) return `Gem purchases are for players ${PURCHASE_MIN_AGE} and older.`;
  return null;
}

// Confirm, then start the checkout: the server answers with the checkout page to go to.
export function purchaseDialog(bundle, priceLabel) {
  const close = () => overlay.remove();
  const adult = h('input', { type: 'checkbox' });
  const consent = h('input', { type: 'checkbox' });
  const err = h('p', { class: 'acct-error', role: 'alert' });
  const go = h('button', { class: 'btn primary', type: 'submit' }, `Continue to payment · ${priceLabel}`);
  const submit = async e => {
    e.preventDefault();
    if (!adult.checked || !consent.checked) { err.textContent = 'Please tick both boxes to continue.'; return; }
    go.disabled = true;
    go.textContent = 'Opening checkout…';
    let r;
    try {
      const res = await fetch('/api/shop/checkout', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: bundle.id, adult: true, consent: true }),
      });
      r = await res.json();
    } catch { r = { ok: false, reason: 'Can’t reach the server. Check your connection.' }; }
    if (!r.ok) { err.textContent = r.reason; go.disabled = false; go.textContent = `Continue to payment · ${priceLabel}`; return; }
    sessionStorage.setItem('metadeck.gemsBefore', String(profile().gems));
    location.href = r.url;
  };
  const overlay = h('div', { class: 'overlay', onclick: e => { if (e.target === overlay) close(); } },
    h('form', { class: 'dialog purchase-dialog', onsubmit: submit },
      h('h2', null, `${bundle.gems.toLocaleString()} Gems`),
      h('p', { class: 'muted' }, `${priceLabel} in US dollars. The checkout shows the price in your currency, with any tax.`),
      h('label', { class: 'setting-row check' }, adult, h('span', null, `I’m ${PURCHASE_MIN_AGE} or older.`)),
      h('label', { class: 'setting-row check' }, consent, h('span', null,
        'I want the Gems delivered to my account straight away, and I understand that this means I lose my 14-day right to cancel the purchase once they’re delivered.')),
      h('p', { class: 'acct-note' }, 'Payment is handled by Paddle, our reseller and merchant of record. See the ',
        h('a', { href: 'legal/terms.html', target: '_blank', rel: 'noopener' }, 'Terms'), ' and the ',
        h('a', { href: 'legal/refunds.html', target: '_blank', rel: 'noopener' }, 'Refund Policy'), '.'),
      err,
      h('div', { class: 'dialog-actions' },
        h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cancel'),
        go)));
  document.body.append(overlay);
}

// Back from the checkout (?purchase=success|closed): tidy the URL, and after a success wait for the
// webhook to credit the Gems, checking the account a few times.
export async function returnedFromCheckout() {
  const params = new URLSearchParams(location.search);
  const outcome = params.get('purchase');
  if (!outcome) return;
  params.delete('purchase');
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
  if (outcome !== 'success') return;
  const before = Number(sessionStorage.getItem('metadeck.gemsBefore') ?? NaN);
  sessionStorage.removeItem('metadeck.gemsBefore');
  toast('Thanks for your purchase! Your Gems are on the way…');
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 2500));
    await reload();
    if (!Number.isFinite(before) || profile().gems > before) {
      toast('Your Gems have arrived.');
      return;
    }
  }
  toast('Your payment went through; the Gems can take a few minutes to arrive. If they don’t, contact us.', 'bad');
}
