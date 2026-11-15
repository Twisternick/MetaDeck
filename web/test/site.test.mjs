// The operator's details from site.json fill the legal pages' placeholders; unset ones stay highlighted,
// and nothing in the file can inject markup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSite, loadSiteConfig } from '../server/site.mjs';

const write = obj => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'md-site-')), 'site.json');
  fs.writeFileSync(file, JSON.stringify(obj));
  return file;
};
const page = 'By <span class="todo">[YOUR NAME OR COMPANY]</span>, <span class="todo">[COUNTRY]</span>. Law: <span class="todo">[COUNTRY / STATE]</span>. Mail <span class="todo">[CONTACT EMAIL]</span>. <span class="todo">[DATE]</span>';

test('a filled site.json replaces every placeholder', () => {
  const site = createSite(loadSiteConfig(write({ operator: 'Meta & Co', country: 'Canada', contactEmail: 'support@metadeck.test', updated: '1 May 2027' })));
  const html = site.fill(page);
  assert.ok(!html.includes('class="todo"'));
  assert.match(html, /By Meta &#38; Co, Canada\. Law: Canada\./);
  assert.match(html, /<a href="mailto:support@metadeck\.test">support@metadeck\.test<\/a>/);
  assert.deepEqual(site.missing, []);
});

test('missing values stay as placeholders and are reported', () => {
  const site = createSite(loadSiteConfig(path.join(os.tmpdir(), 'no-such-dir', 'site.json')));
  assert.equal(site.fill(page), page);
  assert.equal(site.contactEmail, null);
  assert.equal(site.missing.length, 5);
});

test('a malformed email is ignored', () => {
  const site = createSite(loadSiteConfig(write({ contactEmail: '"><script>@x.com' })));
  assert.equal(site.contactEmail, null);
  assert.ok(site.fill(page).includes('[CONTACT EMAIL]'));
});
