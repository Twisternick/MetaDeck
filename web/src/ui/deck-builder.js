// Deck builder: pick up to MAX_COPIES of each card from one archetype's pool until the deck has
// DECK_SIZE cards. Click a pool card to add it, right-click it (or click its row in the list) to take one out.
// Decks can be saved unfinished; only complete, legal decks can be played.

import { h } from './dom.js';
import { renderCard, renderPreview } from './card-view.js';
import { motionOK, flyTo, sparkle, removeFx } from './fx.js';
import { getDeck, CARDS, DECK_SIZE, MAX_COPIES, countCards, deckErrors, starterDecks } from '../data/index.js';
import { saveCustomDeck, deleteCustomDeck } from './deck-store.js';
import { profile } from './profile.js';
import { ownedTotal, missingCards, missingDust, hasPremium } from '../data/economy.js';

const COST_FILTERS = ['All', 1, 2, 3, 4, 5, 6, '7+'];
const TYPE_FILTERS = ['All', 'Monster', 'Spell'];

const byCost = (a, b) => a.cost - b.cost || (a.type === b.type ? 0 : a.type === 'Monster' ? -1 : 1) || a.displayName.localeCompare(b.displayName);

// `deck` is an existing list to edit (a custom deck) or copy (a starter); without it the deck starts empty.
export function deckBuilder(root, { archetype, deck = null, onBack, onPlay }) {
  removeFx();
  const arch = getDeck(archetype);
  const st = {
    id: deck && !deck.starter ? deck.id : null,
    name: deck ? (deck.starter ? `${deck.name} (copy)` : deck.name) : `My ${arch.name} deck`,
    cards: deck ? [...deck.cards] : [],
    dirty: !!deck?.starter,
    filters: { q: '', type: 'All', cost: 'All' },
  };
  const pool = arch.cards.map(c => CARDS[c.cardId]).sort(byCost);
  const tiles = new Map(); // cardId -> pool tile element
  let toastTimer = null;

  const counts = () => countCards(st.cards);

  const add = (id, fromEl) => {
    if (st.cards.length >= DECK_SIZE) return flash(`The deck is full (${DECK_SIZE} cards).`);
    if ((counts().get(id) ?? 0) >= MAX_COPIES) return flash(`At most ${MAX_COPIES} copies of a card.`);
    const have = ownedTotal(profile(), id);
    if ((counts().get(id) ?? 0) >= have) return flash(have ? `You own ${have} ${have === 1 ? 'copy' : 'copies'}. Craft more in the Collection.` : 'You don’t own this card yet. Craft it in the Collection.');
    st.cards.push(id);
    st.dirty = true;
    update();
    const row = panelRows.querySelector(`[data-card="${CSS.escape(id)}"]`);
    if (row) {
      row.classList.remove('bump'); void row.offsetWidth; row.classList.add('bump');
      row.scrollIntoView({ block: 'nearest', behavior: motionOK() ? 'smooth' : 'auto' });
      const card = fromEl?.querySelector('.card');
      if (card && motionOK()) flyTo(card.cloneNode(true), card.getBoundingClientRect(), row.getBoundingClientRect(), { duration: 380 });
    }
    if (st.cards.length === DECK_SIZE) sparkle(countEl.getBoundingClientRect(), arch.color, 18);
  };

  const remove = id => {
    const i = st.cards.lastIndexOf(id);
    if (i < 0) return;
    st.cards.splice(i, 1);
    st.dirty = true;
    update();
    const tile = tiles.get(id);
    if (tile) { tile.classList.remove('pulse-out'); void tile.offsetWidth; tile.classList.add('pulse-out'); }
  };

  const flash = msg => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  };

  const save = () => {
    const name = st.name.trim() || `My ${arch.name} deck`;
    const saved = saveCustomDeck({ id: st.id, archetype, name, cards: [...st.cards] });
    st.id = saved.id;
    st.name = name;
    st.dirty = false;
    update();
    flash(st.cards.length === DECK_SIZE ? 'Deck saved.' : `Draft saved (${st.cards.length}/${DECK_SIZE}).`);
    return saved;
  };

  const leave = () => {
    if (st.dirty && !confirm('Leave without saving this deck?')) return;
    onBack();
  };

  // ---- pool
  const tile = def => {
    const el = h('div', {
      class: 'pool-tile', 'data-card': def.cardId, role: 'button', tabindex: '0',
      'aria-label': `Add ${def.displayName}`,
      onclick: () => add(def.cardId, el),
      oncontextmenu: e => { e.preventDefault(); remove(def.cardId); },
      onkeydown: e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); add(def.cardId, el); }
        if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); remove(def.cardId); }
      },
    },
      renderCard(def, { attrs: { style: `--deck:${arch.color}` }, premium: hasPremium(profile(), def.cardId) && profile().cosmetics.premiumArt }),
      h('div', { class: 'pool-copies', 'aria-hidden': 'true' }, Array.from({ length: MAX_COPIES }, (_, k) =>
        h('span', { class: `pip${k >= ownedTotal(profile(), def.cardId) ? ' unowned' : ''}` }))),
      ownedTotal(profile(), def.cardId) ? null : h('div', { class: 'pool-lock' }, '🔒 Not owned'),
      h('button', {
        class: 'pool-minus', title: 'Remove one', 'aria-label': `Remove ${def.displayName}`,
        onclick: e => { e.stopPropagation(); remove(def.cardId); },
      }, '−'),
      h('button', {
        class: 'pool-zoom', title: 'Inspect', 'aria-label': `Inspect ${def.displayName}`,
        onclick: e => { e.stopPropagation(); zoom(def); },
      }, '⤢'));
    tiles.set(def.cardId, el);
    return el;
  };

  const matches = def => {
    const { q, type, cost } = st.filters;
    if (type !== 'All' && def.type !== type) return false;
    if (cost !== 'All' && (cost === '7+' ? def.cost < 7 : Math.max(1, def.cost) !== cost)) return false;
    return !q || `${def.displayName} ${def.keywords.join(' ')}`.toLowerCase().includes(q.toLowerCase());
  };

  const poolGrid = h('div', { class: 'card-grid pool-grid' });
  const renderPool = () => {
    tiles.clear();
    const shown = pool.filter(matches);
    poolGrid.replaceChildren(...(shown.length ? shown.map((d, i) => {
      const t = tile(d);
      t.classList.add('rise');
      t.style.setProperty('--i', Math.min(i, 16));
      return t;
    }) : [h('p', { class: 'muted pool-empty' }, 'No cards match these filters.')]));
    refreshPool();
  };
  const refreshPool = () => {
    const c = counts();
    const full = st.cards.length >= DECK_SIZE;
    for (const [id, el] of tiles) {
      const n = c.get(id) ?? 0;
      el.classList.toggle('in-deck', n > 0);
      el.classList.toggle('maxed', n >= Math.min(MAX_COPIES, ownedTotal(profile(), id)) || full);
      el.classList.toggle('unowned', !ownedTotal(profile(), id));
      el.querySelectorAll('.pip').forEach((p, i) => p.classList.toggle('on', i < n));
    }
  };

  const filterChips = (key, values, label) => h('div', { class: 'chips filter-chips', role: 'group', 'aria-label': label },
    values.map(v => h('button', {
      class: `chip${st.filters[key] === v ? ' selected' : ''}`, style: { '--deck': arch.color },
      onclick: e => {
        st.filters[key] = v;
        e.currentTarget.parentElement.querySelectorAll('.chip').forEach(b => b.classList.toggle('selected', b === e.currentTarget));
        renderPool();
      },
    }, v === 'All' ? 'All' : key === 'type' ? `${v}s` : v)));

  // ---- deck panel
  const countEl = h('div', { class: 'deck-count' });
  const barEl = h('div', { class: 'deck-bar' }, h('span'));
  const curveEl = h('div', { class: 'curve mini', 'aria-label': 'Mana curve' });
  const splitEl = h('div', { class: 'muted deck-split' });
  const panelRows = h('div', { class: 'deck-rows' });
  const errorsEl = h('div', { class: 'deck-errors' });
  const toastEl = h('div', { class: 'builder-toast', role: 'status' });
  const saveBtn = h('button', { class: 'btn ghost', onclick: save }, 'Save');
  const playBtn = h('button', { class: 'btn primary', onclick: () => onPlay(save()) }, 'Save & play');
  const deleteBtn = h('button', {
    class: 'btn danger small', onclick: () => {
      if (!confirm(`Delete "${st.name}"? This can't be undone.`)) return;
      deleteCustomDeck(st.id);
      onBack();
    },
  }, 'Delete deck');
  const nameInput = h('input', {
    class: 'deck-name-input', type: 'text', maxlength: '40', value: st.name, 'aria-label': 'Deck name',
    oninput: e => { st.name = e.target.value; st.dirty = true; },
  });
  const starterSelect = h('select', {
    class: 'starter-select', 'aria-label': 'Start from',
    onchange: e => {
      const v = e.target.value;
      e.target.value = '';
      if (!v) return;
      if (st.cards.length && !confirm('Replace the current list?')) return;
      st.cards = v === 'clear' ? [] : [...starterDecks(archetype)[Number(v)].cards];
      st.dirty = true;
      update();
    },
  },
    h('option', { value: '' }, 'Start from…'),
    starterDecks(archetype).map((s, i) => h('option', { value: String(i) }, `Starter: ${s.name}`)),
    h('option', { value: 'clear' }, 'Empty deck'));

  const update = () => {
    const n = st.cards.length;
    const c = counts();
    countEl.replaceChildren(h('b', null, n), h('span', null, ` / ${DECK_SIZE}`));
    countEl.classList.toggle('complete', n === DECK_SIZE);
    barEl.firstChild.style.width = `${(n / DECK_SIZE) * 100}%`;
    barEl.classList.toggle('complete', n === DECK_SIZE);

    const defs = st.cards.map(id => CARDS[id]);
    const curve = Array.from({ length: 8 }, (_, cost) => defs.filter(d => Math.min(7, d.cost) === cost).length);
    const max = Math.max(1, ...curve);
    curveEl.replaceChildren(...curve.map((k, cost) => h('div', { class: 'curve-col' },
      h('span', { class: 'curve-n' }, k || ''),
      h('div', { class: 'curve-bar', style: { height: `${(k / max) * 100}%` } }),
      h('span', { class: 'curve-cost' }, cost === 7 ? '7+' : cost))));
    const monsters = defs.filter(d => d.type === 'Monster').length;
    splitEl.textContent = `${monsters} monsters · ${n - monsters} spells`;

    const unique = [...c.keys()].map(id => CARDS[id]).sort(byCost);
    panelRows.replaceChildren(...(unique.length ? unique.map(def => h('button', {
      class: `deck-row ${def.type === 'Spell' ? 'spell' : 'monster'}`, 'data-card': def.cardId,
      title: 'Click to remove one', onclick: () => remove(def.cardId),
    },
      h('span', { class: 'row-cost' }, def.cost),
      h('span', { class: 'row-name' }, def.displayName),
      c.get(def.cardId) > 1 ? h('span', { class: 'row-qty' }, `×${c.get(def.cardId)}`) : null)) :
      [h('p', { class: 'muted deck-rows-empty' }, 'Click cards on the left to add them.')]));

    const missing = missingCards(profile(), st.cards);
    const errors = n === DECK_SIZE ? deckErrors(archetype, st.cards) : [];
    if (missing.length) errors.push(`You're missing ${missing.reduce((s, m) => s + m.need, 0)} of these cards (✨ ${missingDust(profile(), st.cards)} to craft). Craft them in the Collection.`);
    errorsEl.replaceChildren(...errors.map(e => h('div', null, e)));
    playBtn.disabled = n !== DECK_SIZE || errors.length > 0;
    playBtn.title = n !== DECK_SIZE ? `Add ${DECK_SIZE - n} more card${DECK_SIZE - n === 1 ? "" : "s"} to play` : errors[0] ?? "";
    deleteBtn.hidden = !st.id;
    nameInput.value !== st.name && (nameInput.value = st.name);
    refreshPool();
  };

  const zoom = def => {
    const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    const overlay = h('div', { class: 'zoom gallery-zoom', role: 'dialog', 'aria-label': def.displayName, onclick: close },
      h('div', { class: 'zoom-inner' }, renderPreview(null, def)));
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
  };

  root.replaceChildren(h('main', { class: 'builder', style: { '--deck': arch.color } },
    h('header', { class: 'page-head' },
      h('button', { class: 'btn ghost small', onclick: leave }, '← Menu'),
      h('h1', null, 'Deck builder'),
      h('span', { class: 'chip selected builder-arch', style: { '--deck': arch.color } },
        h('span', { class: 'chip-emblem', 'aria-hidden': 'true' }, arch.icon), arch.name)),
    h('div', { class: 'builder-layout' },
      h('section', { class: 'pool' },
        h('div', { class: 'pool-filters rise' },
          h('input', {
            class: 'pool-search', type: 'search', placeholder: 'Search cards or keywords', 'aria-label': 'Search cards',
            oninput: e => { st.filters.q = e.target.value.trim(); renderPool(); },
          }),
          filterChips('type', TYPE_FILTERS, 'Card type'),
          filterChips('cost', COST_FILTERS, 'Cost')),
        h('p', { class: 'muted gallery-hint' }, `Click a card to add it (up to ${MAX_COPIES} copies, as many as you own). Right-click or use − to take one out.`),
        poolGrid),
      h('aside', { class: 'deck-panel rise', style: { '--i': 2 } },
        nameInput,
        h('div', { class: 'deck-meter' }, countEl, barEl),
        h('div', { class: 'deck-stats' }, curveEl, splitEl),
        panelRows,
        errorsEl,
        h('div', { class: 'deck-actions' }, starterSelect, saveBtn, playBtn),
        deleteBtn)),
    toastEl));
  renderPool();
  update();
  window.scrollTo(0, 0);
}
