// Meta Founders (the first players: FOUNDER in data/economy.js): the title badge shown next to their
// name, and the welcome they see when their account is made.

import { h } from './dom.js';
import { confetti, motionOK, currency, uiIcon } from './fx.js';
import { sfx } from './audio.js';
import { FOUNDER, founderTitle, cosmetic, FOUNDER_COSMETICS } from '../data/economy.js';

// The "✦ Meta Founder #12" badge, or null for anyone else. `title` is the text, or a founder number.
export function founderBadge(title) {
  const text = typeof title === 'number' ? founderTitle(title) : title;
  return text ? h('span', { class: 'founder-title', title: 'One of the first players of MetaDeck' }, text) : null;
}

// The pitch to guests while founder places are left: a full card on the menu, and a one-line `strip` on
// the title screen (under the logo, above "Press to start"). `spots` is the server's { slots, taken, left };
// onClaim opens account creation.
export function founderPitch(spots, { onClaim, strip = false }) {
  const left = spots.left;
  const urgent = left <= Math.max(10, Math.round(spots.slots / 5));
  if (strip) {
    return h('div', { class: `founder-strip${urgent ? ' urgent' : ''}`, onclick: e => { e.stopPropagation(); onClaim(); }, role: 'button', tabindex: '0',
      onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onClaim(); } } },
      h('span', { class: 'founder-title' }, FOUNDER.title),
      h('span', { class: 'founder-strip-text' },
        h('b', null, `${urgent ? 'Only ' : ''}${left} of ${spots.slots} spots left`), ` · ${FOUNDER.gems.toLocaleString()} Gems, a gold card frame, an exclusive back & arena and the title, forever`),
      h('span', { class: 'founder-strip-cta' }, 'Claim yours →'));
  }
  const perks = [
    [currency('gems'), `${FOUNDER.gems.toLocaleString()} Gems`],
    ['✦', 'The Meta Founder title'],
    [uiIcon('premium-card', 'Gold frame'), 'A gold card frame'],
    [uiIcon('cosmetic', 'Cosmetic'), 'An exclusive card back & arena'],
  ];
  const claim = h('button', {
    class: 'btn primary founder-claim',
    onclick: e => { e.stopPropagation(); onClaim(); },
  }, 'Claim my founder spot');
  return h('section', { class: `founder-pitch${urgent ? ' urgent' : ''}`, 'aria-label': 'Meta Founder offer', onclick: e => e.stopPropagation() },
    h('div', { class: 'founder-pitch-head' },
      h('span', { class: 'founder-title' }, FOUNDER.title),
      h('span', { class: 'founder-spots' }, h('b', null, left), ` of ${spots.slots} spots left`)),
    h('h2', null, urgent ? `Only ${left} founder spot${left === 1 ? '' : 's'} left` : `Be one of the first ${spots.slots} players`),
    h('p', null, `The first ${spots.slots} players to create an account become Meta Founders, numbered forever. Free, no email needed.`),
    h('ul', { class: 'founder-perks' }, perks.map(([icon, text]) => h('li', null, h('i', { 'aria-hidden': 'true' }, icon), text))),
    h('div', { class: 'founder-meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(spots.slots), 'aria-valuenow': String(spots.taken), 'aria-label': 'Founder spots claimed' },
      h('i', { style: { '--pct': `${(spots.taken / spots.slots) * 100}%` } })),
    claim,
    h('p', { class: 'founder-fine muted' }, `Gems unlock after your first ${FOUNDER.gemsAfterGames} matches. Founder items can never be bought.`));
}

// Shown once, right after a founder's account is made (after they've saved their recovery code).
export function founderWelcome(n) {
  const close = () => overlay.remove();
  sfx('unlock');
  if (motionOK()) confetti(['#ffc53d', '#fff6d0', '#e0a526', '#ffffff']);
  const overlay = h('div', { class: 'overlay' },
    h('div', { class: 'dialog won founder-welcome', role: 'dialog', 'aria-modal': 'true' },
      h('h2', null, 'You’re a founder!'),
      founderBadge(n),
      h('p', null, `You’re one of the first ${FOUNDER.slots} players of MetaDeck. Thank you for being here at the start. As a founder you get:`),
      h('ul', null,
        h('li', null, h('b', null, 'The Meta Founder title'), ', shown with your name in matches, on the leaderboard and to your friends'),
        FOUNDER_COSMETICS.map(id => h('li', null, h('b', null, cosmetic(id).name), ` — ${cosmetic(id).blurb}`)),
        h('li', null, h('b', null, `${FOUNDER.gems.toLocaleString()} Gems`), `, unlocked after your first ${FOUNDER.gemsAfterGames} matches`)),
      h('p', { class: 'muted' }, 'Equip the founder back, arena and frame in Collection → Cosmetics. None of them can ever be bought.'),
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', onclick: close }, 'Let’s play'))));
  document.body.append(overlay);
}
