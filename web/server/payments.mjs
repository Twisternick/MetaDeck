// Real-money Gem purchases through Paddle (Paddle Billing), which is the merchant of record: Paddle
// sells to the player and handles payment details, tax, invoices, refunds and chargebacks.
//
//   1. POST /api/shop/checkout { bundle, adult, consent } from a signed-in adult. The server creates a
//      Paddle transaction for the bundle's price, with the account in its custom_data, records it as
//      pending, and sends the browser to /checkout.html?_ptxn=<id>, where Paddle.js opens the checkout.
//   2. Paddle calls POST /api/paddle/webhook. Each call is checked (its HMAC signature, how recent it
//      is, and that it hasn't been handled before) before anything happens:
//        transaction.completed            -> credit the bundle's Gems (once per transaction)
//        adjustment.created/updated, approved:
//          refund / chargeback            -> take the Gems back (spent ones become debt, see economy.js)
//          chargeback_reverse             -> give them back again
//   Gems are never credited from the browser's word, only from Paddle's signed webhook.
//
// Configuration lives in DATA_DIR/paddle.json (never served or committed):
//   { "apiKey": "pdl_sdbx_apikey_…", "clientToken": "test_…", "webhookSecret": "pdl_ntfset_…",
//     "prices": { "gems-100": "pri_…", "gems-550": "pri_…", … } }
// A sandbox API key (pdl_sdbx_…) talks to Paddle's sandbox, a live one to the real thing. Without the
// file, payments are off and the shop says Gems are coming soon. HOSTING.md has the setup steps.

import crypto from 'node:crypto';
import fs from 'node:fs';
import { GEM_BUNDLES, PURCHASE_MIN_AGE, creditGems, takeBackGems, addGems } from '../src/data/economy.js';
import { transaction } from './db.mjs';

const SIGNATURE_TOLERANCE_S = 300;  // webhooks older (or newer) than this are refused
const CHECKOUTS_PER_HOUR = 10;

export function loadPaddleConfig(file) {
  if (!fs.existsSync(file)) return null;
  let c;
  try { c = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { throw new Error(`Can't read ${file}: ${err.message}`); }
  const missing = ['apiKey', 'clientToken', 'webhookSecret'].filter(k => typeof c[k] !== 'string' || !c[k]);
  if (missing.length) throw new Error(`${file} is missing ${missing.join(', ')}.`);
  const prices = Object.fromEntries(Object.entries(c.prices ?? {}).filter(([id, p]) => GEM_BUNDLES.some(b => b.id === id) && /^pri_[a-z0-9]+$/.test(p)));
  return { apiKey: c.apiKey, clientToken: c.clientToken, webhookSecret: c.webhookSecret, prices, sandbox: c.apiKey.startsWith('pdl_sdbx_') };
}

export function createPayments({ accounts, config = null, fetch = globalThis.fetch, now = () => new Date() }) {
  const db = accounts.db;
  const enabled = !!config && Object.keys(config.prices).length > 0;
  const base = config?.sandbox ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
  const q = {
    get: db.prepare('SELECT * FROM purchases WHERE txn = ?'),
    add: db.prepare(`INSERT INTO purchases (txn, user, user_name, bundle, gems, status, country, consent_at, created)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`),
    complete: db.prepare(`INSERT INTO purchases (txn, user, user_name, bundle, gems, status, amount, currency, created, completed)
      VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)
      ON CONFLICT(txn) DO UPDATE SET status = 'completed', amount = excluded.amount, currency = excluded.currency, completed = excluded.completed`),
    reverse: db.prepare('UPDATE purchases SET status = ?, gems_back = ?, reversed = ? WHERE txn = ?'),
    seen: db.prepare('INSERT OR IGNORE INTO webhook_events (id, at) VALUES (?, ?)'),
    recent: db.prepare('SELECT COUNT(*) AS n FROM purchases WHERE user = ? AND created > ?'),
  };
  const fail = (status, reason) => ({ ok: false, status, reason });
  const bundleFor = priceId => Object.entries(config?.prices ?? {}).find(([, p]) => p === priceId)?.[0] ?? null;

  // Check a Paddle-Signature header ("ts=…;h1=…", possibly several h1 during a secret rotation).
  function verify(raw, header) {
    if (!config || typeof header !== 'string') return false;
    const parts = header.split(';').map(p => p.split('='));
    const ts = parts.find(([k]) => k === 'ts')?.[1];
    const sigs = parts.filter(([k]) => k === 'h1').map(([, v]) => v);
    if (!/^\d+$/.test(ts ?? '') || !sigs.length) return false;
    if (Math.abs(now().getTime() / 1000 - Number(ts)) > SIGNATURE_TOLERANCE_S) return false;
    const want = Buffer.from(crypto.createHmac('sha256', config.webhookSecret).update(`${ts}:`).update(raw).digest('hex'));
    return sigs.some(s => { const got = Buffer.from(s); return got.length === want.length && crypto.timingSafeEqual(got, want); });
  }

  function completed(data) {
    const txn = data.id;
    const row = q.get.get(txn);
    if (row?.status === 'completed' || row?.status === 'refunded' || row?.status === 'chargeback') return 'already handled';
    const custom = data.custom_data ?? {};
    const paidFor = (data.items ?? []).map(i => bundleFor(i.price?.id)).filter(Boolean);
    const bundle = row?.bundle ?? custom.bundle;
    if (!bundle || !paidFor.includes(bundle)) {
      console.error(`payments: ${txn} doesn't match its bundle (${bundle} vs ${paidFor.join(', ') || 'no known price'}); no Gems credited.`);
      return 'mismatch';
    }
    const gems = GEM_BUNDLES.find(b => b.id === bundle).gems;
    const userKey = row?.user ?? custom.account ?? null;
    const user = userKey ? accounts.userByKey(userKey) : null;
    const totals = data.details?.totals ?? {};
    const t = now();
    q.complete.run(txn, user?.key ?? null, user?.name ?? row?.user_name ?? null, bundle, gems, String(totals.total ?? ''), totals.currency_code ?? null, row?.created ?? t.toISOString(), t.toISOString());
    if (!user) {
      console.error(`payments: ${txn} was paid for an account that no longer exists (${userKey}). Refund it in Paddle.`);
      return 'no account';
    }
    creditGems(accounts.profileOf(user), bundle, t, false, { txn, paid: { amount: totals.total ?? null, currency: totals.currency_code ?? null } });
    accounts.save(user);
    console.log(`payments: ${user.name} bought ${bundle} (${txn}).`);
    return 'credited';
  }

  function adjusted(data) {
    if (data.status !== 'approved') return 'not approved yet';
    const row = q.get.get(data.transaction_id);
    if (!row) return 'unknown transaction';
    const user = row.user ? accounts.userByKey(row.user) : null;
    const t = now();
    if (data.action === 'refund' || data.action === 'chargeback') {
      if (row.status !== 'completed' && row.status !== 'partly refunded') return 'nothing to take back';
      // A partial refund takes back its share of the Gems; amounts are in the currency's smallest unit.
      const share = data.type === 'partial' && Number(row.amount) > 0
        ? Math.min(1, Number(data.totals?.total ?? 0) / Number(row.amount)) : 1;
      const back = Math.min(row.gems - (row.gems_back ?? 0), Math.round(row.gems * share));
      const total = (row.gems_back ?? 0) + back;
      const status = total >= row.gems ? (data.action === 'refund' ? 'refunded' : 'chargeback') : 'partly refunded';
      q.reverse.run(status, total, t.toISOString(), row.txn);
      if (user && back > 0) {
        const r = takeBackGems(accounts.profileOf(user), back, row.txn, status, t);
        accounts.save(user);
        console.log(`payments: ${data.action} on ${row.txn} for ${user.name}: took back ${r.taken} Gems${r.debt ? `, ${r.debt} as debt` : ''}.`);
      }
      return data.action;
    }
    if (data.action === 'chargeback_reverse' && row.status === 'chargeback') {
      q.reverse.run('completed', 0, t.toISOString(), row.txn);
      if (user) {
        const p = accounts.profileOf(user);
        addGems(p, row.gems_back ?? row.gems);
        const purchase = p.purchases.find(x => x.txn === row.txn);
        if (purchase) delete purchase.status;
        accounts.save(user);
      }
      return 'chargeback reversed';
    }
    return 'ignored';
  }

  return {
    enabled,

    // What the shop needs to know (public).
    publicConfig() {
      return enabled
        ? { enabled: true, sandbox: config.sandbox, clientToken: config.clientToken, bundles: Object.keys(config.prices), minAge: PURCHASE_MIN_AGE }
        : { enabled: false };
    },

    // Start a purchase. Returns { ok, url } (where to send the browser) or { ok: false, status, reason }.
    async checkout(token, body, { country = null } = {}) {
      if (!enabled) return fail(503, 'Gem purchases aren’t available yet.');
      const user = accounts.userForToken(token);
      if (!user) return fail(401, 'Sign in to buy Gems.');
      if (user.birthYear == null) return fail(400, 'Set your birth year in Account first.');
      if (now().getUTCFullYear() - user.birthYear < PURCHASE_MIN_AGE) return fail(403, `Gem purchases are for players ${PURCHASE_MIN_AGE} and older.`);
      const { bundle, adult, consent } = body ?? {};
      if (adult !== true || consent !== true) return fail(400, 'Please tick both boxes to continue.');
      const priceId = config.prices[bundle];
      if (!priceId) return fail(400, 'That bundle isn’t for sale.');
      if (q.recent.get(user.key, new Date(now().getTime() - 3_600_000).toISOString()).n >= CHECKOUTS_PER_HOUR) {
        return fail(429, 'Too many purchases started in the last hour. Try again later.');
      }
      let res, json;
      try {
        res = await fetch(`${base}/transactions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ price_id: priceId, quantity: 1 }], custom_data: { account: user.key, bundle } }),
        });
        json = await res.json().catch(() => null);
      } catch (err) {
        console.error('payments: Paddle unreachable:', err.message);
        return fail(502, 'The payment service didn’t answer. Try again in a minute.');
      }
      const txn = json?.data?.id;
      if (!res.ok || typeof txn !== 'string' || !/^txn_[a-z0-9]+$/.test(txn)) {
        console.error(`payments: creating a transaction failed (${res.status}):`, JSON.stringify(json?.error ?? json).slice(0, 500));
        return fail(502, 'The payment service refused that. Try again in a minute.');
      }
      const t = now().toISOString();
      q.add.run(txn, user.key, user.name, bundle, GEM_BUNDLES.find(b => b.id === bundle).gems, country, t, t);
      return { ok: true, url: `/checkout.html?_ptxn=${encodeURIComponent(txn)}` };
    },

    // Handle one webhook call. `raw` is the body exactly as received (a Buffer).
    webhook(raw, signature) {
      if (!enabled) return { status: 404, body: { ok: false } };
      if (!verify(raw, signature)) return { status: 401, body: { ok: false, reason: 'Bad signature.' } };
      let event;
      try { event = JSON.parse(raw.toString('utf8')); } catch { return { status: 400, body: { ok: false } }; }
      if (typeof event?.event_id !== 'string' || !event.data) return { status: 400, body: { ok: false } };
      // Handle it and remember its id in one transaction: a retry of a handled event does nothing,
      // and a failure part-way leaves no trace, so Paddle's retry runs it again.
      const result = transaction(db, () => {
        if (Number(q.seen.run(event.event_id, now().toISOString()).changes) === 0) return 'duplicate';
        if (event.event_type === 'transaction.completed') return completed(event.data);
        if (event.event_type === 'adjustment.created' || event.event_type === 'adjustment.updated') return adjusted(event.data);
        return 'ignored';
      });
      return { status: 200, body: { ok: true, result } };
    },

    // An account's purchases, newest first (for the operator; players see theirs in their profile).
    purchasesOf: userKey => db.prepare('SELECT * FROM purchases WHERE user = ? ORDER BY created DESC').all(userKey),
  };
}
