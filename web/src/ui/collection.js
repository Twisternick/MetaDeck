// Collection: every card with how many copies you own, crafting and disenchanting with Dust, your
// unopened packs and your cosmetics (card backs, arenas, premium art).

import { h, storage } from './dom.js';
import { renderCard, renderCardBack, glossaryFor } from './card-view.js';
import { removeFx, sparkle, motionOK } from './fx.js';
import { glossaryList } from './keywords.js';
import { profile, act, walletBar } from './profile.js';
import { openPacks, packArt, packName, rarityColor, toast } from './packs.js';
import {
  RARITY, RARITY_ORDER, rarityOf, owned, ownedTotal, spareCopies, craftCost, dustValue, upgradeCost,
  COSMETICS, ownsCosmetic, CORE_COPIES,
} from '../data/economy.js';
import { DECKS, CARDS, MAX_COPIES } from '../data/index.js';

const byCost = (a, b) => a.cost - b.cost || (a.type === b.type ? 0 : a.type === 'Monster' ? -1 : 1) || a.displayName.localeCompare(b.displayName);

// tab: 'cards' | 'packs' | 'cosmetics'
export function collection(root, { onBack, nav, tab = null, deckId = null }) {
  removeFx();
  const prefs = storage.get('metadeck.collection', { tab: 'cards', deck: DECKS[0].id, show: 'all', rarity: 'all' });
  if (tab) prefs.tab = tab;
  if (deckId) prefs.deck = deckId;
  const savePrefs = () => storage.set('metadeck.collection', prefs);
  const body = h('div', { class: 'col-body' });
  const tabs = h('nav', { class: 'col-tabs', role: 'tablist' });

  const render = () => {
    savePrefs();
    const p = profile();
    const packs = Object.values(p.packs).reduce((s, n) => s + n, 0);
    tabs.replaceChildren(...[['cards', 'Cards'], ['packs', `Packs${packs ? ` (${packs})` : ''}`], ['cosmetics', 'Cosmetics']].map(([id, label]) =>
      h('button', { class: `col-tab${prefs.tab === id ? ' selected' : ''}`, role: 'tab', 'aria-selected': String(prefs.tab === id), onclick: () => { prefs.tab = id; render(); } }, label)));
    body.replaceChildren(prefs.tab === 'packs' ? packsTab() : prefs.tab === 'cosmetics' ? cosmeticsTab() : cardsTab());
  };

  // ---------- cards
  function cardsTab() {
    const p = profile();
    const deck = DECKS.find(d => d.id === prefs.deck);
    const all = deck.cards.map(c => CARDS[c.cardId]);
    const have = all.filter(d => ownedTotal(p, d.cardId) > 0).length;
    const complete = all.filter(d => ownedTotal(p, d.cardId) >= MAX_COPIES).length;
    const shown = all
      .filter(d => prefs.rarity === 'all' || rarityOf(d.cardId) === prefs.rarity)
      .filter(d => prefs.show === 'all' || (prefs.show === 'owned') === (ownedTotal(p, d.cardId) > 0))
      .sort(byCost);
    const chip = (key, value, label, color) => h('button', {
      class: `chip${prefs[key] === value ? ' selected' : ''}`, style: { '--deck': color ?? deck.color },
      onclick: () => { prefs[key] = value; render(); },
    }, label);
    return h('div', { style: { '--deck': deck.color } },
      h('nav', { class: 'chips', 'aria-label': 'Archetypes' }, DECKS.map(d => h('button', {
        class: `chip${d.id === deck.id ? ' selected' : ''}`, style: { '--deck': d.color }, onclick: () => { prefs.deck = d.id; render(); },
      }, h('span', { class: 'chip-emblem', 'aria-hidden': 'true' }, d.icon), d.name))),
      h('div', { class: 'col-filters' },
        h('div', { class: 'col-progress' },
          h('b', null, `${have} / ${all.length}`), ' cards owned · ', h('b', null, complete), ' complete',
          h('div', { class: 'meter' }, h('i', { style: { '--pct': `${(have / all.length) * 100}%` } }))),
        h('div', { class: 'chips filter-chips' }, chip('show', 'all', 'All'), chip('show', 'owned', 'Owned'), chip('show', 'missing', 'Missing')),
        h('div', { class: 'chips filter-chips' }, chip('rarity', 'all', 'Any rarity'),
          RARITY_ORDER.map(r => chip('rarity', r, RARITY[r].name, rarityColor(r))))),
      h('p', { class: 'muted gallery-hint' }, 'Click a card to craft it, upgrade it to premium or disenchant spare copies. Your core set copies are always kept.'),
      shown.length ? h('div', { class: 'card-grid col-grid' }, shown.map((def, i) => colTile(def, i))) : h('p', { class: 'muted' }, 'No cards match.'));
  }

  function colTile(def, i) {
    const p = profile();
    const c = owned(p, def.cardId);
    const n = c.n + c.p;
    return h('div', {
      class: `col-tile rise${n ? '' : ' unowned'}`, style: { '--i': Math.min(i, 24) }, role: 'button', tabindex: '0',
      onclick: () => craftDialog(def), onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); craftDialog(def); } },
    },
      renderCard(def, { premium: c.p > 0 && p.cosmetics.premiumArt }),
      h('div', { class: 'col-count' },
        Array.from({ length: MAX_COPIES }, (_, k) => h('span', { class: `pip${k < c.p ? ' premium' : k < n ? ' on' : ''}` })),
        n ? null : h('span', { class: 'col-craft' }, `✨ ${craftCost(def.cardId)}`)));
  }

  function craftDialog(def) {
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); render(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    const panel = h('div', { class: 'craft-panel' });
    const overlay = h('div', { class: 'zoom craft-zoom', role: 'dialog', 'aria-label': def.displayName, onclick: e => { if (e.target === overlay) close(); } },
      h('div', { class: 'zoom-inner craft-inner' }, panel));
    const paint = (flash = null) => {
      const p = profile();
      const c = owned(p, def.cardId);
      const rarity = rarityOf(def.cardId);
      const spare = spareCopies(p, def.cardId);
      const full = c.n + c.p >= MAX_COPIES;
      const run = (op, args, msg) => async e => {
        e.currentTarget.disabled = true;
        const res = await act(op, { id: def.cardId, ...args });
        if (!res.ok) { paint(); return toast(res.reason, 'bad'); }
        toast(msg(res));
        paint(true);
      };
      const btn = (label, cost, enabled, onclick, cls = 'primary') =>
        h('button', { class: `btn ${cls}`, disabled: enabled ? null : true, onclick }, label, cost ? h('span', { class: 'btn-cost' }, cost) : null);
      const cardEl = renderCard(def, { classes: 'large', large: true, premium: c.p > 0 && p.cosmetics.premiumArt });
      panel.replaceChildren(
        h('div', { class: 'craft-card' }, cardEl),
        h('div', { class: 'craft-side' },
          h('div', { class: 'craft-rarity', style: { '--glow': rarityColor(rarity) } }, RARITY[rarity].name, CORE_COPIES[def.cardId] ? ' · Core set' : ''),
          h('h2', null, def.displayName),
          h('p', { class: 'muted' }, `You own ${c.n} normal${c.p ? ` and ${c.p} premium` : ''} ${c.n + c.p === 1 ? 'copy' : 'copies'} (max ${MAX_COPIES} in a deck).`),
          h('p', { class: 'craft-dust' }, '✨ ', h('b', null, p.dust.toLocaleString()), ' Dust'),
          h('div', { class: 'craft-actions' },
            btn('Craft', `✨ ${craftCost(def.cardId)}`, !full && p.dust >= craftCost(def.cardId),
              run('craft', {}, r => `Crafted ${def.displayName} (−${r.cost} Dust)`)),
            btn('Craft premium', `✨ ${craftCost(def.cardId, true)}`, !full && p.dust >= craftCost(def.cardId, true),
              run('craft', { premium: true }, () => `Crafted premium ${def.displayName}`), 'primary online'),
            btn('Upgrade to premium', `✨ ${upgradeCost(def.cardId)}`, c.n > 0 && p.dust >= upgradeCost(def.cardId),
              run('upgrade', {}, () => `${def.displayName} is now premium`), 'ghost'),
            btn('Disenchant', `+${dustValue(def.cardId)}`, spare > 0 && c.n > 0,
              run('disenchant', {}, r => `+${r.value} Dust`), 'danger'),
            c.p ? btn('Disenchant premium', `+${dustValue(def.cardId, true)}`, spare > 0,
              run('disenchant', { premium: true }, r => `+${r.value} Dust`), 'danger') : null),
          spare ? null : h('p', { class: 'muted small' }, 'Core set copies can’t be disenchanted, so your free starter deck always works.'),
          glossaryList(glossaryFor(def))),
        h('button', { class: 'btn ghost small craft-close', onclick: close }, 'Close'));
      if (flash && motionOK()) requestAnimationFrame(() => sparkle(cardEl.getBoundingClientRect(), rarityColor(rarity), 22));
    };
    paint();
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
  }

  // ---------- packs
  function packsTab() {
    const p = profile();
    const kinds = Object.keys(p.packs);
    if (!kinds.length) {
      return h('div', { class: 'col-empty rise' },
        h('p', null, 'No unopened packs. You earn them by levelling up an archetype and on the season track, or buy them with Gold in the shop.'),
        nav.shop ? h('button', { class: 'btn primary', onclick: nav.shop }, 'Go to the shop') : null);
    }
    return h('div', { class: 'pack-shelf' }, kinds.map((kind, i) => h('div', { class: 'shelf-pack rise', style: { '--i': i } },
      h('button', { class: 'pack-button', onclick: () => openPacks(kind, render), 'aria-label': `Open ${packName(kind)}` }, packArt(kind, 'idle')),
      h('div', { class: 'shelf-label' }, `${packName(kind)} × ${p.packs[kind]}`),
      h('button', { class: 'btn primary small', onclick: () => openPacks(kind, render) }, 'Open'))));
  }

  // ---------- cosmetics
  function cosmeticsTab() {
    const p = profile();
    const section = (kind, title) => h('section', null,
      h('h2', null, title),
      h('div', { class: 'cos-grid' }, COSMETICS.filter(c => c.kind === kind).map((c, i) => cosmeticTile(c, i))));
    return h('div', null,
      h('label', { class: 'toggle cos-toggle' },
        h('input', { type: 'checkbox', checked: p.cosmetics.premiumArt || null, onchange: e => act('premiumArt', { on: e.target.checked }) }),
        ' Show premium (animated) versions of cards I own'),
      section('back', 'Card backs'),
      section('arena', 'Arenas'));
  }

  function cosmeticTile(c, i) {
    const p = profile();
    const have = ownsCosmetic(p, c.id);
    const on = p.cosmetics[c.kind] === c.id;
    const how = c.default ? 'Default' : c.gems ? `💎 ${c.gems} in the shop` : `Season tier ${c.season.tier} (${c.season.track === 'premium' ? 'premium' : 'free'} track)`;
    return h('div', { class: `cos-tile rise${on ? ' equipped' : ''}${have ? '' : ' locked'}`, style: { '--i': i } },
      cosmeticPreview(c),
      h('div', { class: 'cos-name' }, c.name),
      h('div', { class: 'cos-blurb muted' }, c.blurb),
      have
        ? h('button', { class: `btn small ${on ? 'ghost' : 'primary'}`, disabled: on || null, onclick: async () => { await act('equip', { id: c.id }); render(); } }, on ? 'Equipped' : 'Equip')
        : h('span', { class: 'cos-how' }, '🔒 ', how));
  }

  root.replaceChildren(h('main', { class: 'collection' },
    h('header', { class: 'page-head' },
      h('button', { class: 'btn ghost small', onclick: onBack }, '← Menu'),
      h('h1', null, 'Collection'),
      walletBar({ nav: { shop: nav.shop, season: nav.season, account: nav.account } })),
    tabs, body));
  render();
}

// A small live preview of a cosmetic: a card back, or a slice of the arena.
export function cosmeticPreview(c) {
  return c.kind === 'back'
    ? h('div', { class: 'cos-preview back' }, renderCardBack('', c.id))
    : h('div', { class: 'cos-preview arena-swatch', 'data-arena': c.id.split(':')[1] }, h('div', { class: 'swatch-mat' }));
}
