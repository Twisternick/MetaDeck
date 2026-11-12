// Pack opening and reward panels. Opening is a full-screen moment: the pack shakes and bursts, five
// face-down cards deal out glowing in their rarity colour, and each flips when clicked (Legendaries
// with confetti). Also the game-over rewards summary and a small reward toast.

import { h, delay } from './dom.js';
import { renderCard, renderCardBack } from './card-view.js';
import { motionOK, confetti, sparkle, screenShake, removeFx } from './fx.js';
import { profile, act } from './profile.js';
import { rewardLabel, RARITY, RARITY_ORDER, dustValue, archLevel, ARCH_LEVEL_XP, TIER_XP, seasonTier } from '../data/economy.js';
import { CARDS, DECKS } from '../data/index.js';

const RARITY_COLORS = { common: '#c9d1e8', rare: '#38bdf8', epic: '#c084fc', legendary: '#ffb020' };
export const rarityColor = r => RARITY_COLORS[r];

const packDeck = kind => DECKS.find(d => d.id === kind);
export const packName = kind => (kind === 'any' ? 'Mixed pack' : `${packDeck(kind).name} pack`);

// A pack, drawn in CSS: foil wrapper in the archetype's colour with its emblem.
export function packArt(kind, classes = '') {
  const deck = packDeck(kind);
  return h('div', { class: `pack ${classes}`, style: { '--deck': deck?.color ?? '#a78bfa' } },
    h('div', { class: 'pack-shine', 'aria-hidden': 'true' }),
    h('div', { class: 'pack-emblem', 'aria-hidden': 'true' }, deck?.icon ?? '🎴'),
    h('div', { class: 'pack-name' }, deck ? deck.name : 'Mixed'),
    h('div', { class: 'pack-brand' }, 'MetaDeck'));
}

// Open every unopened pack of `kind`, one after another. Calls onClose when the player leaves.
export function openPacks(kind, onClose = () => {}) {
  if (!profile().packs[kind]) return;
  let leaving = false;
  const close = () => {
    if (leaving) return;
    leaving = true;
    document.removeEventListener('keydown', onKey);
    overlay.classList.add('closing');
    setTimeout(() => { overlay.remove(); removeFx(); onClose(); }, motionOK() ? 260 : 0);
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const stage = h('div', { class: 'pack-stage' });
  const overlay = h('div', { class: 'pack-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': `Open ${packName(kind)}` },
    h('button', { class: 'btn ghost small pack-close', onclick: close }, 'Close'), stage);
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  showPack();

  // Open 10 / Open all, offered whenever more than one pack is left.
  function bulkButtons(cls = 'ghost') {
    const left = profile().packs[kind] ?? 0;
    if (left < 2) return [];
    return [
      left > BULK ? h('button', { class: `btn ${cls}`, onclick: () => ripMany(BULK) }, `Open ${BULK}`) : null,
      h('button', { class: `btn ${cls}`, onclick: () => ripMany(left) }, `Open all (${left})`),
    ].filter(Boolean);
  }

  function showPack() {
    const left = profile().packs[kind] ?? 0;
    const pack = packArt(kind, 'big idle');
    stage.replaceChildren(
      h('div', { class: 'pack-left' }, `${left} ${left === 1 ? 'pack' : 'packs'} to open`),
      h('button', { class: 'pack-button', onclick: () => rip(pack), 'aria-label': `Open ${packName(kind)}` }, pack),
      h('p', { class: 'pack-hint' }, 'Click the pack to open it'),
      h('div', { class: 'pack-actions' }, bulkButtons()));
  }

  let busy = false;
  async function burst(pack) {
    if (!motionOK()) return;
    await delay(650);
    screenShake(stage, 1.2);
    sparkle(pack.getBoundingClientRect(), packDeck(kind)?.color ?? '#a78bfa', 30);
  }

  async function rip(pack) {
    if (busy) return;
    busy = true;
    pack.classList.remove('idle');
    pack.classList.add('ripping');
    const res = await act('openPack', { kind });
    if (!res.ok) { busy = false; toast(res.reason, 'bad'); return close(); }
    await burst(pack);
    busy = false;
    reveal(res.pulls);
  }

  // Several packs at once: a stack of packs bursts together, then the highlights summary.
  async function ripMany(count) {
    if (busy) return;
    busy = true;
    const shown = Math.min(count, 5);
    const stack = h('div', { class: 'pack-stack', style: { '--n': shown } },
      Array.from({ length: shown }, (_, i) => h('div', { class: 'pack-stack-slot', style: { '--i': i } }, packArt(kind, 'big ripping'))));
    stage.replaceChildren(h('div', { class: 'pack-left' }, `Opening ${count} packs…`), stack);
    const res = await act('openPacks', { kind, count });
    if (!res.ok) { busy = false; toast(res.reason, 'bad'); return close(); }
    await burst(stack);
    if (motionOK()) await delay(150);
    busy = false;
    summary(res.packs);
  }

  function pullSlot(c, i, back, onFlip) {
    const def = CARDS[c.id];
    const el = h('div', {
      class: `pull rarity-${c.rarity}${c.premium ? ' is-premium' : ''}`, role: 'button', tabindex: '0',
      style: { '--i': i, '--glow': rarityColor(c.rarity) }, 'aria-label': `Face-down ${RARITY[c.rarity].name} card`,
    },
      h('div', { class: 'pull-inner' },
        h('div', { class: 'pull-back' }, renderCardBack('', back)),
        h('div', { class: 'pull-front' }, renderCard(def, { premium: c.premium }))),
      h('div', { class: 'pull-tag' },
        c.count > 1 ? `×${c.count}${c.fresh ? ' · New!' : ''}`
          : c.dust ? (c.count ? `+${c.dust} Dust` : `Extra copy → ${c.dust} Dust`) : c.fresh ? 'New!' : c.premium ? 'Premium!' : RARITY[c.rarity].name));
    const flip = () => {
      if (el.classList.contains('flipped')) return;
      el.classList.add('flipped');
      el.setAttribute('aria-label', `${def.displayName}, ${RARITY[c.rarity].name}${c.premium ? ', premium' : ''}`);
      const r = el.getBoundingClientRect();
      if (motionOK()) {
        if (c.rarity === 'legendary' || c.premium) { confetti([rarityColor(c.rarity), '#ffffff', '#ffe08a', '#f472b6'], 90); screenShake(stage, 1); }
        else if (c.rarity !== 'common') sparkle(r, rarityColor(c.rarity), c.rarity === 'epic' ? 26 : 16);
      }
      onFlip();
    };
    el.addEventListener('click', flip);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
    el.flip = flip;
    return el;
  }

  function reveal(pulls) {
    const back = profile().cosmetics.back;
    let flipped = 0;
    const doneBtn = h('button', { class: 'btn primary', hidden: true }, 'Done');
    const allBtn = h('button', { class: 'btn ghost', onclick: () => slots.forEach(s => s.flip()) }, 'Reveal all');
    const actions = h('div', { class: 'pack-actions' }, allBtn, doneBtn);
    const slots = pulls.map((c, i) => pullSlot(c, i, back, () => { if (++flipped === pulls.length) finish(); }));
    const finish = () => {
      allBtn.hidden = true;
      const left = profile().packs[kind] ?? 0;
      doneBtn.hidden = false;
      doneBtn.textContent = left ? `Open next (${left} left)` : 'Done';
      doneBtn.onclick = left ? showPack : close;
      actions.append(...bulkButtons());
    };
    stage.replaceChildren(h('div', { class: 'pulls' }, slots), actions);
  }

  // The highlights of a bulk open: rarity tally, new cards, Dust, and the best pulls flipped one by one.
  function summary(packs) {
    const all = packs.flat();
    const byCard = new Map();
    for (const c of all) {
      const k = `${c.id}|${c.premium ? 1 : 0}`;
      const g = byCard.get(k) ?? byCard.set(k, { id: c.id, rarity: c.rarity, premium: c.premium, count: 0, fresh: false, dust: 0 }).get(k);
      g.count++;
      g.fresh ||= c.fresh;
      g.dust += c.dust;
    }
    const groups = [...byCard.values()].sort((a, b) => pullScore(b) - pullScore(a) || b.count - a.count);
    const tally = Object.fromEntries(RARITY_ORDER.map(r => [r, all.filter(c => c.rarity === r).length]));
    const fresh = groups.filter(g => g.fresh);
    const premiums = all.filter(c => c.premium).length;
    const dust = all.reduce((s, c) => s + c.dust, 0);
    // Copies that turned straight into Dust only count as highlights when they are Legendary.
    let highlights = groups.filter(g => g.rarity === 'legendary'
      || (g.dust < g.count * dustValue(g.id, g.premium) && (g.rarity === 'epic' || g.premium || (g.fresh && g.rarity === 'rare'))));
    if (!highlights.length) highlights = groups;
    highlights = highlights.slice(0, HIGHLIGHTS);

    const back = profile().cosmetics.back;
    const slots = highlights.map((g, i) => pullSlot(g, i, back, () => {}));
    // Flip the highlights in order, best last, once they have dealt out.
    const order = [...slots].reverse();
    let cancelled = false;
    (async () => {
      await delay(motionOK() ? 600 + slots.length * 110 : 0);
      for (const s of order) {
        if (cancelled || leaving || !s.isConnected) return;
        s.flip();
        if (motionOK()) await delay(s.classList.contains('rarity-legendary') ? 650 : 260);
      }
    })();

    const stat = (label, value, color) => h('div', { class: 'sum-stat', style: { '--glow': color } }, h('b', null, value.toLocaleString()), h('span', null, label));
    const left = profile().packs[kind] ?? 0;
    stage.replaceChildren(
      h('div', { class: 'pack-summary' },
        h('h2', { class: 'sum-title' }, `${packs.length} packs opened`),
        h('p', { class: 'sum-sub' }, `${all.length} cards from ${packName(kind)}${packs.length === 1 ? '' : 's'}`),
        h('div', { class: 'sum-stats' },
          RARITY_ORDER.slice().reverse().map(r => stat(RARITY[r].name, tally[r], rarityColor(r))),
          stat('New cards', fresh.length, '#4ade80'),
          premiums ? stat('Premium', premiums, '#f472b6') : null,
          dust ? stat('Dust', dust, '#a78bfa') : null),
        h('div', { class: 'sum-bar', 'aria-hidden': 'true' },
          RARITY_ORDER.map(r => (tally[r] ? h('i', { style: { flex: tally[r], background: rarityColor(r) } }) : null))),
        h('h3', { class: 'sum-head' }, 'Highlights'),
        h('div', { class: 'pulls sum-pulls' }, slots),
        fresh.length ? [
          h('h3', { class: 'sum-head' }, `New to your collection (${fresh.length})`),
          h('div', { class: 'sum-chips' }, fresh.map(g => cardChip(g)))] : null,
        h('details', { class: 'sum-all' },
          h('summary', null, `Every card pulled (${groups.length} different)`),
          h('div', { class: 'sum-chips' }, groups.map(g => cardChip(g))))),
      h('div', { class: 'pack-actions' },
        h('button', { class: 'btn ghost', onclick: () => { cancelled = true; slots.forEach(s => s.flip()); } }, 'Reveal all'),
        bulkButtons(),
        h('button', { class: 'btn primary', onclick: () => { cancelled = true; left ? showPack() : close(); } }, left ? `Back to packs (${left} left)` : 'Done')));
  }
}

const BULK = 10;
const HIGHLIGHTS = 10;
const pullScore = g => RARITY_ORDER.indexOf(g.rarity) * 2 + (g.premium ? 3 : 0) + (g.fresh ? 1 : 0);
const cardChip = g => h('span', { class: `sum-chip${g.fresh ? ' fresh' : ''}`, style: { '--glow': rarityColor(g.rarity) } },
  g.premium ? '🌟 ' : '', CARDS[g.id].displayName, g.count > 1 ? h('b', null, ` ×${g.count}`) : null);

// Game-over rewards: Gold, season XP, quests finished and archetype level-ups.
export function rewardsPanel(out, deckId) {
  const p = profile();
  const deck = DECKS.find(d => d.id === deckId);
  const a = p.arch[deckId] ?? { xp: 0 };
  const lv = archLevel(a.xp);
  const into = lv >= 10 ? ARCH_LEVEL_XP : a.xp % ARCH_LEVEL_XP;
  const tierInto = p.season.xp % TIER_XP;
  return h('div', { class: 'rewards' },
    h('div', { class: 'reward-row' },
      out.gold ? h('span', { class: 'reward-pill gold' }, `🪙 +${out.gold}`) : null,
      h('span', { class: 'reward-pill xp' }, `⭐ +${out.xp} season XP`),
      out.firstWin ? h('span', { class: 'reward-pill hot' }, 'First win of the day!') : null),
    out.quests.map(q => h('div', { class: 'reward-quest' }, h('b', null, '✔ Quest complete: '), q.text, ` · +${q.gold} Gold`)),
    h('div', { class: 'reward-bars' },
      h('div', { class: 'reward-bar', style: { '--deck': deck.color } },
        h('span', null, `${deck.icon} ${deck.name} · Level ${lv}`),
        h('div', { class: 'meter' }, h('i', { style: { '--pct': `${(into / ARCH_LEVEL_XP) * 100}%` } }))),
      h('div', { class: 'reward-bar', style: { '--deck': '#ffc53d' } },
        h('span', null, `Season tier ${seasonTier(p)}`),
        h('div', { class: 'meter' }, h('i', { style: { '--pct': `${(tierInto / TIER_XP) * 100}%` } })))),
    out.levelUps.map(l => h('div', { class: 'reward-level' },
      h('b', null, `Level ${l.level}!`), ' ', l.rewards.map(rewardLabel).join(' · '))));
}

// A brief toast in the corner, for claims and purchases.
export function toast(text, cls = '') {
  const el = h('div', { class: `eco-toast ${cls}`, role: 'status' }, text);
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 2200);
  setTimeout(() => el.remove(), 2700);
}
