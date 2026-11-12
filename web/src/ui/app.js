// App shell: main menu (deck picker), card gallery, rules, and the match screen.

import { h, storage } from './dom.js';
import { renderCard, renderPreview, glossaryFor } from './card-view.js';
import { startMatch } from './match.js';
import { deckBuilder } from './deck-builder.js';
import { lobby } from './lobby.js';
import { net } from './net.js';
import { decksFor, resolveDeck, randomStarter, isPlayable } from './deck-store.js';
import { installTilt, installRipples, installTooltips, artSlot, deckArtUrls, removeFx } from './fx.js';
import { DECKS, CARDS, DECK_SIZE } from '../data/index.js';
import { KEYWORDS, TERMS, START_HP, BOARD_SLOTS, MAX_HAND, OPENING_HAND } from '../engine/constants.js';
import { describeTip, glossaryList, kwName, KW_META, KIND_COLORS } from './keywords.js';

const root = document.getElementById('app');
const prefs = storage.get('metadeck.prefs', { myDeck: 'FPS', oppDeck: 'random' });
prefs.lists ??= {}; // archetype id -> key of the deck list last picked for it
const savePrefs = () => storage.set('metadeck.prefs', prefs);

installTilt();
installRipples();
installTooltips(describeTip);

const emblem = deck => h('span', { class: 'chip-emblem', 'aria-hidden': 'true' }, deck.icon);

function menu() {
  removeFx();
  const pickOpponent = () => {
    if (prefs.oppDeck !== 'random') return prefs.oppDeck;
    const others = DECKS.filter(d => d.id !== prefs.myDeck);
    return others[Math.floor(Math.random() * others.length)].id;
  };
  const play = (spectate = false) => {
    const opp = pickOpponent();
    const mine = resolveDeck(prefs.myDeck, prefs.lists[prefs.myDeck]);
    const theirs = randomStarter(opp);
    const launch = () => startMatch(root, {
      myDeck: prefs.myDeck, oppDeck: opp, spectate,
      myCards: mine.cards, oppCards: theirs.cards,
      onExit: menu,
      onRematch: launch,
    });
    launch();
  };

  const deckTile = (deck, i, selected, onclick) => h('button', {
    class: `deck-tile rise${selected ? ' selected' : ''}`, style: { '--deck': deck.color, '--i': i }, onclick,
    'data-tilt': '8', 'aria-pressed': selected ? 'true' : 'false',
  },
    artSlot('deck-art', deckArtUrls(deck.id), deck.icon),
    h('span', { class: 'pick', 'aria-hidden': 'true' }, '✓'),
    h('span', { class: 'deck-tile-body' },
      h('span', { class: 'deck-name' }, deck.name),
      h('span', { class: 'deck-tag' }, deck.tagline)));

  const build = (deck = null) => deckBuilder(root, {
    archetype: prefs.myDeck, deck,
    onBack: menu,
    onPlay: saved => { prefs.lists[prefs.myDeck] = saved.key; savePrefs(); menu(); play(false); },
  });

  // One deck list: a starter or a custom deck. Unfinished custom decks open in the builder instead.
  const listTile = (deck, i, selected) => {
    const playable = isPlayable(deck);
    const select = () => {
      if (!playable) return build(deck);
      prefs.lists[prefs.myDeck] = deck.key;
      savePrefs();
      render(false);
    };
    return h('div', {
      class: `list-tile${selected ? ' selected' : ''}${playable ? '' : ' draft'}${i ? ' rise' : ''}`, style: { '--i': i },
      role: 'button', tabindex: '0', 'aria-pressed': selected ? 'true' : 'false', onclick: select,
      onkeydown: e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(); } },
    },
      h('span', { class: 'list-kind' }, deck.starter ? 'Starter' : playable ? 'Custom' : `Draft · ${deck.cards.length}/${DECK_SIZE}`),
      h('span', { class: 'list-name' }, deck.name),
      h('span', { class: 'list-blurb' }, deck.starter ? deck.blurb : `${deck.cards.length} cards`),
      h('button', {
        class: 'btn ghost small list-edit', onclick: e => { e.stopPropagation(); build(deck); },
      }, deck.starter ? 'Copy & edit' : 'Edit'));
  };

  const vsSide = (deck, label, right, listName) => h('div', { class: `vs-side${right ? ' right' : ''}`, style: { '--deck': deck ? deck.color : '#888' } },
    right ? null : artSlot('', deck ? deckArtUrls(deck.id) : [], deck ? deck.icon : '🎲'),
    h('div', null,
      h('div', { class: 'vs-sub' }, label),
      h('div', { class: 'vs-name' }, deck ? deck.name : 'Random deck'),
      listName ? h('div', { class: 'vs-list' }, listName) : null),
    right ? artSlot('', deck ? deckArtUrls(deck.id) : [], deck ? deck.icon : '🎲') : null);

  let listsShownFor = null; // deal the list tiles in again only when the archetype changes
  const render = (animate = true) => {
    const mine = DECKS.find(d => d.id === prefs.myDeck);
    const opp = prefs.oppDeck === 'random' ? null : DECKS.find(d => d.id === prefs.oppDeck);
    const myList = resolveDeck(mine.id, prefs.lists[mine.id]);
    const dealLists = !animate && listsShownFor !== mine.id;
    listsShownFor = mine.id;
    root.replaceChildren(h('main', { class: 'menu' },
      h('header', { class: `menu-head${animate ? ' rise' : ''}` },
        h('div', { class: 'logo-kicker' }, 'Every deck is a genre'),
        h('div', { class: 'logo-wrap' }, h('h1', { class: 'logo' }, 'MetaDeck')),
        h('p', { class: 'tagline' }, 'A card battler where every deck is a video game genre.')),
      h('section', null,
        h('h2', null, 'Your deck'),
        h('div', { class: 'deck-grid' }, DECKS.map((d, i) => deckTile(d, animate ? i + 1 : 0, prefs.myDeck === d.id, () => {
          prefs.myDeck = d.id;
          if (prefs.oppDeck === d.id) prefs.oppDeck = 'random';
          savePrefs();
          render(false);
        })))),
      h('section', { class: animate ? 'rise' : '', style: { '--i': 11 } },
        h('h2', null, `${mine.name} deck list`),
        h('div', { class: 'list-grid', style: { '--deck': mine.color } },
          decksFor(mine.id).map((d, i) => listTile(d, dealLists ? i + 1 : 0, d.key === myList.key)),
          h('button', { class: 'list-tile new', onclick: () => build() },
            h('span', { class: 'list-plus', 'aria-hidden': 'true' }, '+'),
            h('span', { class: 'list-name' }, 'New deck'),
            h('span', { class: 'list-blurb' }, `Build your own from the ${mine.name} cards`)))),
      h('section', { class: animate ? 'rise' : '', style: { '--i': 12 } },
        h('h2', null, 'Opponent'),
        h('div', { class: 'chips' },
          h('button', { class: `chip random${prefs.oppDeck === 'random' ? ' selected' : ''}`, onclick: () => { prefs.oppDeck = 'random'; savePrefs(); render(false); } },
            h('span', { class: 'chip-emblem', 'aria-hidden': 'true' }, '🎲'), 'Random'),
          DECKS.filter(d => d.id !== prefs.myDeck).map(d => h('button', {
            class: `chip${prefs.oppDeck === d.id ? ' selected' : ''}`, style: { '--deck': d.color },
            onclick: () => { prefs.oppDeck = d.id; savePrefs(); render(false); },
          }, emblem(d), d.name)))),
      h('div', { class: `vs-strip${animate ? ' rise' : ''}`, style: { '--i': 13 } },
        vsSide(mine, 'You', false, myList.name),
        h('div', { class: 'vs-badge' }, 'VS'),
        vsSide(opp, 'Opponent', true)),
      h('div', { class: `menu-actions${animate ? ' rise' : ''}`, style: { '--i': 14 } },
        h('button', { class: 'btn primary big', onclick: () => play(false) }, 'Play vs AI'),
        h('button', { class: 'btn primary big online', onclick: online }, 'Play online'),
        h('button', { class: 'btn ghost', onclick: () => play(true) }, 'Watch AI vs AI'),
        h('button', { class: 'btn ghost', onclick: () => gallery(prefs.myDeck) }, 'Card gallery'),
        h('button', { class: 'btn ghost', onclick: rules }, 'How to play')),
    ));
  };
  render(true);
}

// Online play with the deck list picked in the menu.
function online() {
  const deck = resolveDeck(prefs.myDeck, prefs.lists[prefs.myDeck]);
  lobby(root, { deck: { archetype: prefs.myDeck, cards: deck.cards, name: deck.name }, onBack: menu });
}

function gallery(deckId, newOnly = false) {
  removeFx();
  const deck = DECKS.find(d => d.id === deckId);
  const cards = deck.cards.map(c => CARDS[c.cardId]).filter(c => !newOnly || c.isNew)
    .sort((a, b) => a.cost - b.cost || (a.type === b.type ? 0 : a.type === 'Monster' ? -1 : 1));
  const curve = Array.from({ length: 8 }, (_, cost) => deck.cards.filter(c => Math.min(7, c.cost) === cost).length);
  const maxCurve = Math.max(...curve);
  const monsters = deck.cards.filter(c => c.type === 'Monster').length;
  const newCount = deck.cards.filter(c => c.isNew).length;
  const deckKeywords = [...new Map(deck.cards.flatMap(c => glossaryFor(CARDS[c.cardId])).map(e => [e[0], e])).values()]
    .sort((a, b) => kwName(a[0]).localeCompare(kwName(b[0])));

  root.replaceChildren(h('main', { class: 'gallery', style: { '--deck': deck.color } },
    h('header', { class: 'page-head' },
      h('button', { class: 'btn ghost small', onclick: menu }, '← Menu'),
      h('h1', null, 'Card gallery')),
    h('nav', { class: 'chips', 'aria-label': 'Decks' }, DECKS.map(d => h('button', {
      class: `chip${d.id === deckId ? ' selected' : ''}`, style: { '--deck': d.color },
      onclick: () => gallery(d.id, newOnly),
    }, emblem(d), d.name))),
    h('section', { class: 'deck-summary rise' },
      h('div', null,
        h('h2', null, `${deck.icon} ${deck.name}`),
        h('p', null, deck.tagline),
        h('p', { class: 'muted' }, `${deck.cards.length} cards · ${monsters} monsters · ${deck.cards.length - monsters} spells · ${newCount} new`),
        h('label', { class: 'toggle' },
          h('input', { type: 'checkbox', checked: newOnly || null, onchange: e => gallery(deckId, e.target.checked) }),
          ' Show only new cards')),
      h('div', { class: 'curve', 'aria-label': 'Mana curve' }, curve.map((n, cost) => h('div', { class: 'curve-col' },
        h('span', { class: 'curve-n' }, n || ''),
        h('div', { class: 'curve-bar', style: { height: `${maxCurve ? (n / maxCurve) * 100 : 0}%`, '--i': cost } }),
        h('span', { class: 'curve-cost' }, cost === 7 ? '7+' : cost))))),
    deckKeywords.length ? h('details', { class: 'deck-keywords rise', open: storage.get('metadeck.kwOpen', true) || null,
      ontoggle: e => storage.set('metadeck.kwOpen', e.target.open) },
      h('summary', null, `Keywords in this deck (${deckKeywords.length})`),
      glossaryList(deckKeywords)) : null,
    h('p', { class: 'muted gallery-hint' }, 'Hover any keyword or highlighted term for its meaning. Click a card to see everything it does.'),
    h('div', { class: 'card-grid' }, cards.map((c, i) => renderCard(c, {
      classes: 'rise', onclick: () => zoomCard(c),
      attrs: { style: `--i:${Math.min(i, 24)}; --deck:${deck.color}`, role: 'button', tabindex: '0',
        onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zoomCard(c); } } },
    }))),
  ));
}

// Gallery zoom: the card, large, with a glossary of everything it mentions. Click or Esc closes.
function zoomCard(def) {
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const overlay = h('div', { class: 'zoom gallery-zoom', role: 'dialog', 'aria-label': def.displayName, onclick: close },
    h('div', { class: 'zoom-inner' }, renderPreview(null, def)));
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
}

function rules() {
  removeFx();
  const kw = Object.keys(KEYWORDS).sort((a, b) => kwName(a).localeCompare(kwName(b)));
  const kinds = [
    ['combat', 'Combat', 'Changes how a fight resolves'],
    ['defense', 'Defense', 'Protects or absorbs'],
    ['trigger', 'Trigger', 'Fires when something happens'],
    ['bonus', 'Bonus', 'Extra Attack while a condition holds'],
    ['economy', 'Economy', 'Cards, Bandwidth and Nitro'],
    ['passive', 'Tag', 'A restriction or a plain label'],
  ];
  root.replaceChildren(h('main', { class: 'rules' },
    h('header', { class: 'page-head' },
      h('button', { class: 'btn ghost small', onclick: menu }, '← Menu'),
      h('h1', null, 'How to play')),
    h('section', { class: 'prose rise' },
      h('h2', null, 'Goal'),
      h('p', null, `Reduce the enemy from ${START_HP} HP to 0.`),
      h('h2', null, 'Turns'),
      h('ul', null,
        h('li', null, `The first player starts with ${OPENING_HAND[0]} cards, the second with ${OPENING_HAND[1]}. Draw a card at the start of each of your turns (except the very first turn of the game).`),
        h('li', null, 'Your maximum Bandwidth goes up by 1 each turn (to 10) and refills at the start of your turn. Spend it to play cards.'),
        h('li', null, `Monsters go onto your board (${BOARD_SLOTS} slots). They can attack starting next turn, once per turn. Attack an enemy monster (both deal damage) or the enemy player directly.`),
        h('li', null, `Your hand holds ${MAX_HAND} cards; extra draws are burned. Drawing from an empty deck deals increasing fatigue damage.`)),
      h('h2', null, 'Quick cards'),
      h('p', null, 'Quick spells can be played on your turn like normal, or from your hand when an enemy monster attacks — paid for with Bandwidth you left unspent on your own turn. If the response removes, hides or suppresses the attacker or its target, the attack fizzles.'),
      h('h2', null, 'Keywords'),
      h('p', null, 'Keyword chips are colour-coded by what they do. In a match, a keyword announces itself above the monster whenever it fires.'),
      h('div', { class: 'kind-legend' }, kinds.map(([id, name, blurb]) => h('span', { class: `kind-pill kind-${id}`, style: { '--kw': KIND_COLORS[id] } }, h('b', null, name), blurb))),
      glossaryList(kw.map(k => [k, KEYWORDS[k].text])),
      h('h2', null, 'Other terms'),
      glossaryList(Object.entries(TERMS)),
    )));
}

// A reload during an online match goes straight back to it (the server keeps it for a while).
if (net.inMatch) online(); else menu();
