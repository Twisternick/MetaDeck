// Gem purchases through Paddle (server/payments.mjs) against a fake Paddle API: who may buy, creating
// the checkout, signed webhooks crediting Gems exactly once, refunds and chargebacks taking them back
// (with debt when they were spent), and the regional rule on paid packs.

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createAccounts } from '../server/accounts.mjs';
import { createPayments } from '../server/payments.mjs';
import { runOp, normalizeProfile } from '../src/data/economy.js';

const SECRET = 'pdl_ntfset_test_secret';
const config = {
  apiKey: 'pdl_sdbx_apikey_test', clientToken: 'test_token', webhookSecret: SECRET, sandbox: true,
  prices: { 'gems-100': 'pri_aaa', 'gems-1200': 'pri_bbb' },
};

let accounts, payments, calls, nextTxn;
beforeEach(() => {
  accounts = createAccounts();
  calls = [];
  nextTxn = 1;
  const fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return { ok: true, status: 201, json: async () => ({ data: { id: `txn_${String(nextTxn++).padStart(3, '0')}abc`, status: 'ready' } }) };
  };
  payments = createPayments({ accounts, config, fetch });
});
afterEach(() => accounts.close());

async function adult(name = 'Buyer_1', birthYear = 1990) {
  const r = await accounts.signUp(name, 'longenough', `10.9.${Math.random()}`, birthYear);
  return { token: r.token, user: () => accounts.userByKey(name.toLowerCase()) };
}
const sign = (body, ts = Math.floor(Date.now() / 1000)) =>
  `ts=${ts};h1=${crypto.createHmac('sha256', SECRET).update(`${ts}:${body}`).digest('hex')}`;
let eventN = 0;
function hook(type, data, { sig = null, eventId = `evt_${++eventN}` } = {}) {
  const body = JSON.stringify({ event_id: eventId, event_type: type, occurred_at: new Date().toISOString(), notification_id: `ntf_${eventN}`, data });
  return payments.webhook(Buffer.from(body), sig ?? sign(body));
}
const completed = (txn, account, bundle = 'gems-100', price = 'pri_aaa', total = '99') => ({
  id: txn, status: 'completed', custom_data: { account, bundle }, items: [{ price: { id: price }, quantity: 1 }],
  details: { totals: { total, currency_code: 'USD' } },
});

test('only signed-in adults who consent can start a purchase', async () => {
  const kid = await adult('Kid_1', new Date().getUTCFullYear() - 15);
  const grown = await adult();
  assert.equal((await payments.checkout('nope', { bundle: 'gems-100', adult: true, consent: true })).status, 401);
  assert.equal((await payments.checkout(kid.token, { bundle: 'gems-100', adult: true, consent: true })).status, 403);
  assert.equal((await payments.checkout(grown.token, { bundle: 'gems-100', adult: true })).status, 400, 'consent needed');
  assert.equal((await payments.checkout(grown.token, { bundle: 'gems-550', adult: true, consent: true })).status, 400, 'no price set up');
  assert.equal(calls.length, 0);

  const r = await payments.checkout(grown.token, { bundle: 'gems-100', adult: true, consent: true }, { country: 'DE' });
  assert.equal(r.ok, true);
  assert.equal(r.url, '/checkout.html?_ptxn=txn_001abc');
  assert.equal(calls[0].url, 'https://sandbox-api.paddle.com/transactions');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer pdl_sdbx_apikey_test');
  assert.deepEqual(calls[0].body, { items: [{ price_id: 'pri_aaa', quantity: 1 }], custom_data: { account: 'buyer_1', bundle: 'gems-100' } });
  const row = accounts.db.prepare('SELECT * FROM purchases').get();
  assert.equal(row.status, 'pending');
  assert.equal(row.country, 'DE');
  assert.ok(row.consent_at);
  assert.equal(grown.user().profile.gems, 0, 'nothing credited until Paddle confirms');
});

test('webhooks need a valid, recent signature', async () => {
  const body = '{"event_id":"evt_x","event_type":"transaction.completed","data":{}}';
  assert.equal(payments.webhook(Buffer.from(body), 'ts=1;h1=abc').status, 401);
  assert.equal(payments.webhook(Buffer.from(body), sign(body, Math.floor(Date.now() / 1000) - 3600)).status, 401, 'too old');
  assert.equal(payments.webhook(Buffer.from(body), sign(body + ' ')).status, 401, 'body changed');
  assert.equal(payments.webhook(Buffer.from(body), undefined).status, 401);
});

test('a completed transaction credits the Gems exactly once', async () => {
  const b = await adult();
  const { url } = await payments.checkout(b.token, { bundle: 'gems-1200', adult: true, consent: true });
  const txn = url.split('=')[1];
  const data = completed(txn, 'buyer_1', 'gems-1200', 'pri_bbb', '999');
  assert.equal(hook('transaction.completed', data, { eventId: 'evt_same' }).body.result, 'credited');
  assert.equal(b.user().profile.gems, 1200);
  assert.equal(hook('transaction.completed', data, { eventId: 'evt_same' }).body.result, 'duplicate');
  assert.equal(hook('transaction.completed', data).body.result, 'already handled');
  assert.equal(b.user().profile.gems, 1200);
  const p = b.user().profile.purchases.at(-1);
  assert.deepEqual([p.txn, p.gems, p.paid.amount, p.paid.currency], [txn, 1200, '999', 'USD']);
  assert.equal(accounts.db.prepare('SELECT status FROM purchases WHERE txn = ?').get(txn).status, 'completed');
});

test('a transaction whose price doesn’t match its bundle credits nothing', async () => {
  const b = await adult();
  const { url } = await payments.checkout(b.token, { bundle: 'gems-1200', adult: true, consent: true });
  const txn = url.split('=')[1];
  assert.equal(hook('transaction.completed', completed(txn, 'buyer_1', 'gems-1200', 'pri_aaa')).body.result, 'mismatch');
  assert.equal(b.user().profile.gems, 0);
});

test('refunds take Gems back; spent ones become debt that blocks Gem spending until repaid', async () => {
  const b = await adult();
  const { url } = await payments.checkout(b.token, { bundle: 'gems-1200', adult: true, consent: true });
  const txn = url.split('=')[1];
  hook('transaction.completed', completed(txn, 'buyer_1', 'gems-1200', 'pri_bbb', '999'));
  const p = () => b.user().profile;
  assert.equal(runOp(p(), 'buySeasonPass', {}).ok, true); // spends 1000 of the 1200
  assert.equal(hook('adjustment.created', { action: 'refund', status: 'pending_approval', type: 'full', transaction_id: txn }).body.result, 'not approved yet');
  assert.equal(p().gems, 200);
  assert.equal(hook('adjustment.updated', { action: 'refund', status: 'approved', type: 'full', transaction_id: txn, totals: { total: '999' } }).body.result, 'refund');
  assert.equal(p().gems, 0);
  assert.equal(p().gemDebt, 1000);
  assert.equal(p().purchases.at(-1).status, 'refunded');
  assert.match(runOp(p(), 'buyPack', { kind: 'any', currency: 'gems' }).reason, /refund/);
  assert.equal(runOp(p(), 'buyPack', { kind: 'any', currency: 'gold' }).ok, true, 'Gold still works');
  assert.equal(normalizeProfile(JSON.parse(JSON.stringify(p()))).gemDebt, 1000, 'debt survives a reload');

  // A new purchase pays the debt off first.
  const second = (await payments.checkout(b.token, { bundle: 'gems-1200', adult: true, consent: true })).url.split('=')[1];
  hook('transaction.completed', completed(second, 'buyer_1', 'gems-1200', 'pri_bbb', '999'));
  assert.equal(p().gemDebt, 0);
  assert.equal(p().gems, 200);
});

test('partial refunds take back their share; chargebacks and their reversal', async () => {
  const b = await adult();
  const txn = (await payments.checkout(b.token, { bundle: 'gems-1200', adult: true, consent: true })).url.split('=')[1];
  hook('transaction.completed', completed(txn, 'buyer_1', 'gems-1200', 'pri_bbb', '1000'));
  hook('adjustment.created', { action: 'refund', status: 'approved', type: 'partial', transaction_id: txn, totals: { total: '250' } });
  assert.equal(b.user().profile.gems, 900);
  assert.equal(accounts.db.prepare('SELECT status, gems_back FROM purchases WHERE txn = ?').get(txn).gems_back, 300);

  const b2 = await adult('Buyer_2');
  const t2 = (await payments.checkout(b2.token, { bundle: 'gems-100', adult: true, consent: true })).url.split('=')[1];
  hook('transaction.completed', completed(t2, 'buyer_2'));
  hook('adjustment.created', { action: 'chargeback', status: 'approved', type: 'full', transaction_id: t2 });
  assert.equal(b2.user().profile.gems, 0);
  hook('adjustment.created', { action: 'chargeback_reverse', status: 'approved', type: 'full', transaction_id: t2 });
  assert.equal(b2.user().profile.gems, 100);
  assert.equal(accounts.db.prepare('SELECT status FROM purchases WHERE txn = ?').get(t2).status, 'completed');
});

test('a deleted account’s purchase record stays, without the account', async () => {
  const b = await adult();
  const txn = (await payments.checkout(b.token, { bundle: 'gems-100', adult: true, consent: true })).url.split('=')[1];
  hook('transaction.completed', completed(txn, 'buyer_1'));
  assert.equal((await accounts.deleteAccount(b.token, 'longenough', 'Buyer_1')).ok, true);
  const row = accounts.db.prepare('SELECT * FROM purchases WHERE txn = ?').get(txn);
  assert.equal(row.user, null);
  assert.equal(row.status, 'completed');
});

test('packs can’t be bought with Gems where paid packs are restricted', () => {
  const p = normalizeProfile(null);
  p.gems = 1000;
  assert.match(runOp(p, 'buyPack', { kind: 'any', currency: 'gems' }, { country: 'BE' }).reason, /your country/);
  assert.equal(runOp(p, 'buyPack', { kind: 'any', currency: 'gold' }, { country: 'BE' }).ok, true);
  assert.equal(runOp(p, 'buyPack', { kind: 'any', currency: 'gems' }, { country: 'NL' }).ok, true);
});

test('without a configuration payments are off', () => {
  const off = createPayments({ accounts, config: null });
  assert.equal(off.enabled, false);
  assert.deepEqual(off.publicConfig(), { enabled: false });
  assert.equal(off.webhook(Buffer.from('{}'), 'x').status, 404);
});
