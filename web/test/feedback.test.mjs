// Player feedback (server/feedback.mjs): what's accepted and kept, the rate limit, and how it follows an
// account through a rename, a data export and deletion.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.mjs';
import { createAccounts } from '../server/accounts.mjs';
import { createFeedback, FEEDBACK_MAX } from '../server/feedback.mjs';

test('feedback needs a listed kind and a real message, and keeps only short context', () => {
  const f = createFeedback({ db: openDb(null) });
  assert.equal(f.submit({ kind: 'rant', message: 'a long enough message' }).ok, false);
  assert.equal(f.submit({ kind: 'bug', message: 'hey' }).ok, false);
  assert.equal(f.submit({ kind: 'bug', message: 'x'.repeat(FEEDBACK_MAX + 1) }).ok, false);
  assert.equal(f.submit(null).ok, false);
  const r = f.submit({ kind: 'bug', message: '  The attack arrow\nstuck on screen\u0007  ', screen: 'match<script>', version: 'v1.2.3'.repeat(9) }, { ip: '198.51.100.1' });
  assert.equal(r.ok, true);
  const [row] = f.list();
  assert.equal(row.kind, 'bug');
  assert.equal(row.message, 'The attack arrow\nstuck on screen', 'line breaks kept, control characters gone');
  assert.equal(row.screen, 'matchscript');
  assert.equal(row.version.length, 20);
  assert.equal(row.user_name, null, 'a guest');
  assert.equal('ip' in row, false);
});

test('feedback is rate limited per address, and resolving moves it out of the open list', () => {
  const f = createFeedback({ db: openDb(null) });
  const send = ip => f.submit({ kind: 'idea', message: 'More decks please' }, { ip });
  for (let i = 0; i < 5; i++) assert.equal(send('198.51.100.2').ok, true);
  const limited = send('198.51.100.2');
  assert.equal(limited.ok, false);
  assert.equal(limited.status, 429);
  assert.equal(send('198.51.100.3').ok, true, 'another address is unaffected');
  const id = f.list()[0].id;
  assert.equal(f.resolve(id), true);
  assert.equal(f.resolve(9999), false);
  assert.equal(f.list().length, 5);
  assert.equal(f.list({ resolved: true }).length, 1);
});

test('a signed-in player’s feedback follows a rename, is in their export, and loses its name on deletion', async () => {
  const accounts = createAccounts();
  const f = createFeedback({ db: accounts.db });
  const { token } = await accounts.signUp('Feedback_Fan', 'longenough', '10.30.0.1', 1995);
  assert.equal(f.submit({ kind: 'balance', message: 'The RPG deck is too slow' }, { user: accounts.accountFor(token) }).ok, true);
  assert.equal(f.list()[0].user_name, 'Feedback_Fan');

  assert.equal(accounts.rename('Feedback_Fan', 'Renamed_Fan').ok, true);
  assert.equal(accounts.db.prepare('SELECT user FROM feedback').get().user, 'renamed_fan');
  const exported = accounts.exportData(token);
  assert.deepEqual(exported.feedback.map(x => x.message), ['The RPG deck is too slow']);

  assert.equal((await accounts.deleteAccount(token, 'longenough', 'Renamed_Fan')).ok, true);
  const row = accounts.db.prepare('SELECT user, user_name, message FROM feedback').get();
  assert.equal(row.user, null);
  assert.equal(row.user_name, null);
  assert.equal(row.message, 'The RPG deck is too slow', 'the feedback itself stays');
  accounts.close();
});
