// Who runs the game and how to reach them, from DATA_DIR/site.json. It lives with the data, not in the
// repo, so the public source names no person: whoever hosts MetaDeck fills in their own details.
//
//   {
//     "operator": "MetaDeck Games LLC",        who runs the game, as the legal pages name them
//     "country": "the United States",          where the operator is
//     "governingLaw": "the State of Delaware", optional; the terms' governing law (defaults to country)
//     "contactEmail": "support@metadeck.gg",   shown on the legal pages and in the footer
//     "updated": "15 November 2026"            the legal pages' "Last updated" date
//   }
//
// The legal pages carry placeholders like <span class="todo">[CONTACT EMAIL]</span>; the server swaps in
// these values as it serves them. A value that isn't set stays as its highlighted placeholder.

import fs from 'node:fs';
import crypto from 'node:crypto';

const escape = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i;

export function loadSiteConfig(file) {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) {
    if (err.code !== 'ENOENT') console.error(`site.json: ${err.message}`);
  }
  const text = k => (typeof raw[k] === 'string' && raw[k].trim()) || null;
  const contactEmail = text('contactEmail');
  if (contactEmail && !EMAIL.test(contactEmail)) console.error(`site.json: "${contactEmail}" isn't an email address.`);
  return {
    operator: text('operator'),
    country: text('country'),
    governingLaw: text('governingLaw') ?? text('country'),
    contactEmail: contactEmail && EMAIL.test(contactEmail) ? contactEmail : null,
    updated: text('updated'),
  };
}

export function createSite(config) {
  const mail = config.contactEmail && `<a href="mailto:${escape(config.contactEmail)}">${escape(config.contactEmail)}</a>`;
  const values = {
    'CONTACT EMAIL': mail,
    'YOUR NAME OR COMPANY': config.operator && escape(config.operator),
    'COUNTRY': config.country && escape(config.country),
    'COUNTRY / STATE': config.governingLaw && escape(config.governingLaw),
    'DATE': config.updated && escape(config.updated),
  };
  const missing = Object.entries(values).filter(([, v]) => !v).map(([k]) => k);
  return {
    contactEmail: config.contactEmail,
    // Placeholders still unfilled, for a warning at startup.
    missing,
    // Changes whenever the config does, so a page filled from it gets a fresh ETag.
    tag: crypto.createHash('sha1').update(JSON.stringify(config)).digest('base64url').slice(0, 8),
    fill: html => html.replace(/<span class="todo">\[([^\]<]+)\]<\/span>/g, (all, key) => values[key] ?? all),
  };
}
