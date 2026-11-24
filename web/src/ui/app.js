// App shell: main menu (deck picker), card gallery, rules, and the match screen.

import { h, storage } from './dom.js';
import { renderCard, renderPreview, glossaryFor } from './card-view.js';
import { startMatch } from './match.js';
import { deckBuilder } from './deck-builder.js';
import { lobby } from './lobby.js';
import { balanceLab } from './balance.js';
import { net } from './net.js';
import { decksFor, resolveDeck, randomStarter, isPlayable } from './deck-store.js';
import { profile, act, walletBar, signedIn, initAccount, reload, startAiMatch, finishAiMatch } from './profile.js';
import { track, installTelemetry, showBanner } from './telemetry.js';
import { difficultyFor } from '../engine/ai.js';
import { decodeDeck } from '../data/deck-code.js';
import { playerHub } from './players.js';
import { rankOf } from '../data/ranked.js';
import { seasonName, rewardLabel, founderTitle, loadoutFor } from '../data/economy.js';
import { seasonSeen } from './profile.js';
import { returnedFromCheckout, shopConfig } from './payments.js';
import { installAudio, music } from './audio.js';
import { settingsButton } from './settings.js';
import { tutorial as startTutorial, tutorialSeen, dismissTutorial, tip } from './tutorial.js';
import { founderPitch } from './founder.js';
import { feedbackDialog, installFeedbackLink } from './feedback.js';
import { accountScreen } from './account.js';
import { collection } from './collection.js';
import { shop } from './shop.js';
import { season } from './season.js';
import { rewardsPanel, toast } from './packs.js';
import { missingCards, missingDust, archInfo, archLevel, starterUnlockLevel, bestFinish } from '../data/economy.js';
import { installTilt, installRipples, installTooltips, installCardFit, installSettle, installGrain, artSlot, deckArtUrls, logoUrls, deckEmblem, removeFx, currency, countUp, motionOK, uiIcon } from './fx.js';
import { DECKS, CARDS, DECK_SIZE, getDeck } from '../data/index.js';
import { KEYWORDS, TERMS, START_HP, BOARD_SLOTS, MAX_HAND, OPENING_HAND } from '../engine/constants.js';
import { describeTip, glossaryList, kwName, KW_META, KIND_COLORS } from './keywords.js';

const root = document.getElementById('app');
const prefs = storage.get('metadeck.prefs', { myDeck: 'FPS', oppDeck: 'random' });
prefs.lists ??= {}; // archetype id -> key of the deck list last picked for it
const savePrefs = () => storage.set('metadeck.prefs', prefs);

installTilt();
installRipples();
installCardFit();
installSettle(root);
installTooltips(describeTip);
installGrain();
installTelemetry();
installAudio();

const emblem = deck => deckEmblem(deck, 'chip-emblem');

const nav = {
  shop: () => shop(root, { onBack: menu, nav }),
  collection: () => collection(root, { onBack: menu, nav }),
  season: () => season(root, { onBack: menu, nav }),
  account: () => accountScreen(root, { onBack: menu, nav }),
};

// Signed in, the server pays online match rewards itself and tells us with a 'rewards' message.
let rewardWaiter = null;
net.subscribe(msg => {
  if (msg.t !== 'rewards') return;
  reload();
  if (rewardWaiter) rewardWaiter(msg); else pendingRewards = msg;
});
let pendingRewards = null;
// The server is about to restart (tools/maintenance.mjs): say so to everyone connected.
net.subscribe(msg => { if (msg.t === 'notice') showBanner(msg.text, { kind: 'notice' }); });

// A deck list can be played when it's legal and the player owns every card in it.
const usable = deck => isPlayable(deck) && missingCards(profile(), deck.cards).length === 0;

// The human's cosmetics in a match, and paying out its rewards when it ends. A signed-in vs-AI match
// passes the server's `ticket` (or false when the server couldn't deal it), and its moves go back for checking.
function matchExtras(deckId, online = false, ticket = null) {
  const p = profile();
  if (online) track('match_start', { mode: 'online', deck: deckId });
  return {
    cosmetics: {
      ...loadoutFor(p, deckId), title: founderTitle(p.founder), // this deck's back, arena and frame
      finishes: new Map(p.cosmetics.premiumArt ? Object.keys(p.cards).map(id => [id, bestFinish(p, id)]).filter(([, f]) => f) : []),
    },
    // The game-over screen shows `holder`, filled in once the rewards are known.
    onResult: ({ won, damage, moves }) => {
      track('match_end', { mode: online ? 'online' : 'ai', deck: deckId, won });
      const holder = h('div', { class: 'rewards-holder' }, h('p', { class: 'muted rewards-wait' }, 'Adding up your rewards…'));
      const resultSoundsUntil = performance.now() + 2400;
      const show = (out, ranked = null) => holder.replaceChildren(
        rewardsPanel(out, deckId, ranked, Math.max(0, resultSoundsUntil - performance.now())));
      const note = text => holder.replaceChildren(h('p', { class: 'muted' }, text));
      if (online && signedIn()) {
        const got = msg => { rewardWaiter = null; pendingRewards = null; reload().then(() => show(msg.out, msg.ranked)); };
        if (pendingRewards) got(pendingRewards); else rewardWaiter = got;
      } else if (online) {
        note('Sign in to earn rewards from online matches.');
      } else if (ticket) {
        finishAiMatch(ticket, moves).then(r => (r.ok ? show(r.out) : note(r.reason)));
      } else if (ticket === false) {
        note('The server couldn’t set up this match, so it earns no rewards. Check your connection.');
      } else {
        act('recordMatch', { deckId, won, damage }).then(r => (r.ok ? show(r.out) : note(r.reason)));
      }
      return { render: () => holder };
    },
  };
}

// The menu logo: the transparent logo art (ui/logo) when it exists, else the gradient text. The URL that
// loaded (or false once none did) is remembered so the menu's re-renders don't flash or re-request it.
let logoArt;
function logo() {
  const title = h('h1', { class: 'logo' }, h('span', { class: 'logo-text' }, 'MetaDeck'));
  if (logoArt === false) return title;
  const show = url => {
    title.classList.add('has-art');
    title.style.setProperty('--logo', `url("${url}")`);
  };
  const urls = logoArt ? [logoArt] : logoUrls();
  let i = 0;
  const img = h('img', { class: 'logo-art', alt: '', draggable: 'false', decoding: logoArt ? 'sync' : 'async' });
  img.addEventListener('load', () => { logoArt = img.src; show(img.src); });
  img.addEventListener('error', () => {
    if (++i < urls.length) img.src = urls[i];
    else { logoArt = false; img.remove(); }
  });
  img.src = urls[0];
  if (logoArt) show(img.src);
  title.prepend(img);
  return title;
}

// The menu's vs-AI launcher, for screens that offer a match against the AI (the online queue).
let playVsAI = null;

function menu() {
  removeFx();
  music('music-menu');
  const pickOpponent = () => {
    if (prefs.oppDeck !== 'random') return prefs.oppDeck;
    const others = DECKS.filter(d => d.id !== prefs.myDeck);
    return others[Math.floor(Math.random() * others.length)].id;
  };
  const play = (spectate = false) => {
    const opp = pickOpponent();
    const mine = resolveDeck(prefs.myDeck, prefs.lists[prefs.myDeck], usable);
    const theirs = randomStarter(opp);
    const launch = async () => {
      // Signed in, the server deals the match so it can check the result (server/ai-match.mjs).
      let deal = null, ticket = null;
      let difficulty = spectate ? 'normal' : difficultyFor(profile().stats.games);
      if (!spectate && signedIn()) {
        const r = await startAiMatch({ myDeck: prefs.myDeck, myCards: mine.cards, oppDeck: opp, oppCards: theirs.cards });
        if (r.ok) { deal = { seed: r.seed, firstPlayer: r.firstPlayer }; ticket = r.ticket; difficulty = r.difficulty ?? 'normal'; } else ticket = false;
      }
      track('match_start', { mode: spectate ? 'watch' : 'ai', deck: prefs.myDeck });
      if (!spectate) setTimeout(() => tip('match', 'Hover any card, keyword or monster to read what it does (long-press on a phone). Esc cancels a move.'), 1500);
      startMatch(root, {
        myDeck: prefs.myDeck, oppDeck: opp, spectate,
        myCards: mine.cards, oppCards: theirs.cards,
        onExit: menu,
        onRematch: launch,
        deal, difficulty,
        ...(spectate ? {} : matchExtras(prefs.myDeck, false, ticket)),
      });
    };
    launch();
  };
  playVsAI = play;

  const deckTile = (deck, i, selected, onclick) => h('button', {
    class: `deck-tile rise${selected ? ' selected' : ''}`, style: { '--deck': deck.color, '--i': i }, onclick,
    'data-tilt': '8', 'data-deck': deck.id, 'aria-pressed': selected ? 'true' : 'false',
  },
    artSlot('deck-art', deckArtUrls(deck.id), deckEmblem(deck)),
    h('span', { class: 'pick', 'aria-hidden': 'true' }, '✓'),
    h('span', { class: 'deck-level', title: 'Archetype level' }, `Lv ${archLevel(archInfo(profile(), deck.id).xp)}`),
    h('span', { class: 'deck-tile-body' },
      h('span', { class: 'deck-name' }, deck.name),
      h('span', { class: 'deck-tag' }, deck.tagline)));

  const build = (deck = null) => deckBuilder(root, {
    archetype: deck?.archetype ?? prefs.myDeck, deck,
    onBack: menu,
    onPlay: saved => { prefs.lists[prefs.myDeck] = saved.key; savePrefs(); menu(); play(false); },
  });

  // Paste a deck code: switch to its archetype and open it in the builder, unsaved.
  const importCode = () => {
    const input = h('input', { class: 'acct-input mono', type: 'text', placeholder: 'MD1-…', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Deck code' });
    const err = h('p', { class: 'acct-error', role: 'alert' });
    const close = () => overlay.remove();
    const go = () => {
      let deck;
      try { deck = decodeDeck(input.value); } catch (e) { err.textContent = e.message; input.focus(); return; }
      close();
      prefs.myDeck = deck.archetype;
      savePrefs();
      build({ ...deck, name: `Imported ${getDeck(deck.archetype).name} deck`, starter: false, imported: true });
    };
    const overlay = h('div', { class: 'overlay', onclick: e => { if (e.target === overlay) close(); } },
      h('form', { class: 'dialog import-dialog', onsubmit: e => { e.preventDefault(); go(); } },
        h('h2', null, 'Import a deck'),
        h('p', { class: 'muted' }, 'Paste a deck code someone shared. It opens in the deck builder, so you can see what you own before saving it.'),
        input, err,
        h('div', { class: 'dialog-actions' },
          h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Cancel'),
          h('button', { class: 'btn primary', type: 'submit' }, 'Open'))));
    document.body.append(overlay);
    input.focus();
  };

  // Craft every card a deck list is missing, if there's Dust for all of them.
  const craftMissing = deck => {
    const cost = missingDust(profile(), deck.cards);
    const count = missingCards(profile(), deck.cards).reduce((s, m) => s + m.need, 0);
    if (!confirm(`Craft the ${count} missing card${count === 1 ? '' : 's'} for ${cost} Dust?`)) return;
    act('craftDeck', { cards: deck.cards }).then(r => {
      if (!r.ok) return toast(r.reason, 'bad');
      toast(`${deck.name} is ready to play`);
      prefs.lists[prefs.myDeck] = deck.key;
      savePrefs();
      render(false);
    });
  };

  // One deck list: a starter or a custom deck. Unfinished custom decks open in the builder instead, and
  // lists with cards the player doesn't own yet say how to get them.
  const listTile = (deck, i, selected) => {
    const playable = isPlayable(deck);
    const missing = playable ? missingCards(profile(), deck.cards) : [];
    const locked = missing.length > 0;
    const starterIndex = deck.starter ? Number(deck.key.split(':')[2]) : -1;
    const dust = locked ? missingDust(profile(), deck.cards) : 0;
    const select = () => {
      if (!playable || (locked && !deck.starter)) return build(deck);
      if (locked) return;
      prefs.lists[prefs.myDeck] = deck.key;
      savePrefs();
      render(false);
    };
    const kind = locked
      ? (deck.starter ? [uiIcon('lock', 'Locked'), ` Level ${starterUnlockLevel(starterIndex)}`] : `Missing ${missing.reduce((s, m) => s + m.need, 0)} cards`)
      : deck.starter ? (starterIndex === 0 ? 'Starter · Free' : 'Starter') : playable ? 'Custom' : `Draft · ${deck.cards.length}/${DECK_SIZE}`;
    return h('div', {
      class: `list-tile${selected ? ' selected' : ''}${playable ? '' : ' draft'}${locked ? ' locked' : ''}${i ? ' rise' : ''}`, style: { '--i': i },
      role: 'button', tabindex: '0', 'aria-pressed': selected ? 'true' : 'false', onclick: select,
      onkeydown: e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(); } },
    },
      h('span', { class: 'list-kind' }, kind),
      h('span', { class: 'list-name' }, deck.name),
      h('span', { class: 'list-blurb' }, deck.starter ? deck.blurb : `${deck.cards.length} cards`),
      locked ? h('span', { class: 'list-unlock' }, deck.starter
        ? `Reach level ${starterUnlockLevel(starterIndex)} with ${getDeck(deck.archetype).name}, or craft the missing cards.`
        : 'Craft the missing cards to play it.') : null,
      h('span', { class: 'list-buttons' },
        locked ? h('button', {
          class: 'btn primary small', disabled: profile().dust < dust || null, title: profile().dust < dust ? `You have ${profile().dust} Dust` : null,
          onclick: e => { e.stopPropagation(); craftMissing(deck); },
        }, 'Craft ', currency('dust'), ` ${dust}`) : null,
        h('button', {
          class: 'btn ghost small list-edit', onclick: e => { e.stopPropagation(); build(deck); },
        }, deck.starter ? 'Copy & edit' : 'Edit')));
  };

  let browsing = false;
  const picker = (label, value, options, change) => h('label', { class: 'match-picker' },
    h('span', null, label),
    h('select', { onchange: e => { change(e.target.value); savePrefs(); render(false); } },
      options.map(([id, name]) => h('option', { value: id, selected: id === value }, name))));

  let listsShownFor = null; // deal the list tiles in again only when the archetype changes
  const render = (animate = true) => {
    const mine = DECKS.find(d => d.id === prefs.myDeck);
    const myList = resolveDeck(mine.id, prefs.lists[mine.id], usable);
    const dealLists = !animate && listsShownFor !== mine.id;
    listsShownFor = mine.id;
    root.replaceChildren(h('main', { class: 'menu' },
      h('div', { class: 'menu-tools' }, settingsButton({ onTutorial: tutorial }), walletBar({ nav, quiet: !animate })),
      h('header', { class: 'menu-head' }, logo()),
      h('div', { class: 'match-launch' },
        picker('Your deck', mine.id, DECKS.map(d => [d.id, d.name]), id => {
          prefs.myDeck = id;
          if (prefs.oppDeck === id) prefs.oppDeck = 'random';
        }),
        picker('Deck list', myList.key, decksFor(mine.id).filter(usable).map(d => [d.key, d.name]), key => { prefs.lists[mine.id] = key; }),
        picker('AI opponent', prefs.oppDeck, [['random', 'Random deck'], ...DECKS.filter(d => d.id !== mine.id).map(d => [d.id, d.name])],
          id => { prefs.oppDeck = id; }),
        h('div', { class: 'launch-actions' },
          h('button', { class: 'btn primary big', onclick: () => play(false) }, 'Play vs AI'),
          h('button', { class: 'btn primary big online', onclick: online }, 'Play online'),
          h('button', { class: 'btn ghost', onclick: () => play(true) }, 'Watch AI vs AI'))),
      h('details', { class: 'deck-browser', open: browsing, ontoggle: e => {
        if (e.currentTarget.isConnected) browsing = e.currentTarget.open;
      } },
        h('summary', null, 'Browse and build decks'),
        h('section', null,
          h('h2', null, 'Your deck'),
          h('div', { class: 'deck-grid' }, DECKS.map((d, i) => deckTile(d, animate ? i + 1 : 0, prefs.myDeck === d.id, () => {
            prefs.myDeck = d.id;
            if (prefs.oppDeck === d.id) prefs.oppDeck = 'random';
            savePrefs();
            render(false);
          })))),
        h('section', null,
          h('h2', null, mine.name + ' deck list'),
          h('div', { class: 'list-grid', 'data-deck': mine.id, style: { '--deck': mine.color } },
            decksFor(mine.id).map((d, i) => listTile(d, dealLists ? i + 1 : 0, d.key === myList.key)),
            h('button', { class: 'list-tile new', onclick: () => build() },
              h('span', { class: 'list-plus', 'aria-hidden': 'true' }, '+'),
              h('span', { class: 'list-name' }, 'New deck'),
              h('span', { class: 'list-blurb' }, `Build your own from the ${mine.name} cards`)),
            h('button', { class: 'list-tile new', onclick: importCode },
              h('span', { class: 'list-plus', 'aria-hidden': 'true' }, '⇩'),
              h('span', { class: 'list-name' }, 'Import code'),
              h('span', { class: 'list-blurb' }, 'Paste a deck code someone shared'))))),
      !profile().tutorial && !tutorialSeen() ? h('div', { class: `tutorial-offer${animate ? ' rise' : ''}`, style: { '--i': 12 } },
        h('div', null, h('b', null, 'New to MetaDeck?'), h('span', null, ' Learn the basics in about four minutes, and get a free pack.')),
        h('button', { class: 'btn primary', onclick: tutorial }, 'Play the tutorial'),
        h('button', { class: 'btn ghost small', 'aria-label': 'No thanks', onclick: () => { dismissTutorial(); render(false); } }, '✕')) : null,
      h('nav', { class: `menu-actions${animate ? ' rise' : ''}`, 'aria-label': 'Explore' },
        h('button', { class: 'btn ghost', onclick: () => collection(root, { onBack: menu, nav, tab: 'cards', deckId: prefs.myDeck }) }, 'Collection'),
        h('button', { class: 'btn ghost', onclick: nav.shop }, 'Shop'),
        h('button', { class: 'btn ghost', onclick: () => gallery(prefs.myDeck) }, 'Card gallery'),
        h('button', { class: 'btn ghost', onclick: () => players() }, signedIn()?.rank ? `Profile · ${signedIn().rank.label}` : 'Profile & friends'),
        h('button', { class: 'btn ghost', onclick: rules }, 'How to play'),
        h('button', { class: 'btn ghost', onclick: () => balanceLab(root, { onBack: menu }) }, 'Balance lab'),
        // The tier list from real players' games (server/live-meta.mjs), in a new tab like the guides.
        h('a', { class: 'btn ghost', href: 'meta/live', target: '_blank', rel: 'noopener' }, 'Live meta')),
      !signedIn() && spotsNow?.left > 0 ? h('div', { class: animate ? 'rise' : '', style: { '--i': 1 } },
        founderPitch(spotsNow, { onClaim: signUpScreen })) : null,
      siteFoot(),
    ));
  };
  render(true);
  window.scrollTo(0, 0);
}

// The menu's footer: link columns over the oversized wordmark, which lights up under the pointer.
function siteFoot() {
  const link = (text, onclick) => h('li', null, h('button', { class: 'foot-link', onclick }, text));
  // The server adds the operator's address from DATA_DIR/site.json; without one there's no Contact link.
  const contactEmail = document.querySelector('meta[name="contact"]')?.content;
  const legal = (text, page) => h('li', null, h('a', { class: 'foot-link', href: `legal/${page}.html`, target: '_blank', rel: 'noopener' }, text));
  // The public guide pages (server/pages.mjs), in a new tab so a match or deck in progress stays put.
  const guide = (text, page) => h('li', null, h('a', { class: 'foot-link', href: page, target: '_blank', rel: 'noopener' }, text));
  const mark = h('div', { class: 'foot-mark', 'aria-hidden': 'true' }, 'MetaDeck');
  mark.addEventListener('pointermove', e => {
    const r = mark.getBoundingClientRect();
    mark.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
  });
  return h('footer', { class: 'site-foot' },
    h('div', { class: 'foot-cols' },
      h('div', { class: 'foot-about' },
        h('b', null, 'MetaDeck'),
        h('p', null, `A card battler where every deck is a video game genre. ${DECKS.length} decks, one arena.`),
        h('button', { class: 'btn ghost small foot-feedback', onclick: () => feedbackDialog({ screen: 'menu' }) }, 'Send feedback')),
      h('nav', { 'aria-label': 'Play' }, h('h3', null, 'Play'), h('ul', null,
        link('Play the tutorial', tutorial),
        link('How to play', rules),
        link('Card gallery', () => gallery(prefs.myDeck)),
        link('Balance lab', () => balanceLab(root, { onBack: menu })))),
      h('nav', { 'aria-label': 'Guides' }, h('h3', null, 'Guides'), h('ul', null,
        guide('Deck guides', 'decks'),
        guide('Card list', 'cards'),
        guide('Live tier list', 'meta/live'),
        guide('Balance lab tier list', 'meta'),
        guide('Rules and keywords', 'how-to-play'))),
      h('nav', { 'aria-label': 'Your stuff' }, h('h3', null, 'Your stuff'), h('ul', null,
        link('Collection', nav.collection),
        link('Season pass', nav.season),
        link('Shop', nav.shop),
        link(signedIn() ? 'Account' : 'Sign in', nav.account))),
      h('nav', { 'aria-label': 'Legal' }, h('h3', null, 'Legal'), h('ul', null,
        legal('Privacy', 'privacy'),
        legal('Terms', 'terms'),
        legal('Refunds', 'refunds'),
        ...(contactEmail ? [h('li', null, h('a', { class: 'foot-link', href: `mailto:${contactEmail}` }, 'Contact'))] : [])))),
    mark,
    h('p', { class: 'foot-fine' }, `© ${new Date().getFullYear()} MetaDeck`));
}

// The tutorial match, then back to the menu.
function tutorial() {
  startTutorial(root, { onExit: menu });
}

// Online play with the deck list picked in the menu. `challenge` names a friend to challenge on arrival.
function online({ challenge = null } = {}) {
  const deck = resolveDeck(prefs.myDeck, prefs.lists[prefs.myDeck], usable);
  lobby(root, {
    deck: { archetype: prefs.myDeck, cards: deck.cards, name: deck.name }, onBack: menu, challenge,
    matchExtras: () => matchExtras(prefs.myDeck, true),
    onPlayAI: () => { menu(); playVsAI?.(false); },
  });
}

// Rank, match history, the leaderboard and friends.
function players(tab = 'rank') {
  playerHub(root, { onBack: menu, nav, tab, onChallenge: name => online({ challenge: name }) });
}

// The first visit after a ranked season ends: what you reached, and the rewards (already granted).
function seasonEnded(notice) {
  const close = () => { overlay.remove(); seasonSeen(); };
  const overlay = h('div', { class: 'overlay' },
    h('div', { class: 'dialog won season-end', role: 'dialog', 'aria-modal': 'true' },
      h('h2', null, 'Season over!'),
      h('p', null, `In the ${seasonName(notice.season)} you reached `, h('b', null, rankOf(notice.peak).label), '.'),
      h('div', { class: 'reward-row' }, notice.rewards.map(r => h('span', { class: 'reward-pill gold' }, rewardLabel(r)))),
      h('p', { class: 'muted' }, 'Your rewards are in your collection. The new season starts you four divisions lower: climb back up!'),
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', onclick: close }, 'Collect'))));
  document.body.append(overlay);
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
        h('h2', null, deckEmblem(deck), ' ', deck.name),
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

// Title screen: the key art full-bleed (its logo is the title), embers rising, and "press to start".
// Resolves once the player clicks or presses a key, after the art has flared out.
// Resolves to 'signup' when the player claimed a founder spot from it, else to nothing (go to the menu).
function titleScreen() {
  return new Promise(resolve => {
    let done = false;
    const start = (intent = null) => {
      if (done) return;
      done = true;
      removeEventListener('keydown', onKey);
      screen.classList.add('leaving');
      setTimeout(() => resolve(intent), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650);
    };
    const onKey = e => { if (!e.repeat && !['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) start(); };
    addEventListener('keydown', onKey);
    const embers = Array.from({ length: 26 }, (_, i) => h('i', { style: {
      '--x': `${(i * 37) % 100}%`, '--s': `${2 + (i % 4)}px`, '--d': `${7 + (i * 13) % 9}s`, '--t': `${-(i * 0.7)}s`, '--dx': `${(i % 2 ? 1 : -1) * (12 + i % 30)}px`,
    } }));
    // The tagline's last word flips through the genres, each in its deck's colour.
    const genre = h('span', { class: 'title-genre', style: { '--deck': DECKS[0].color } }, h('b', null, DECKS[0].name));
    let shown = 0;
    const flip = motionOK() ? setInterval(() => {
      if (done || !genre.isConnected) { clearInterval(flip); return; }
      const deck = DECKS[shown = (shown + 1) % DECKS.length];
      const word = h('b', null, deck.name);
      genre.style.setProperty('--deck', deck.color);
      genre.firstChild.classList.add('out');
      genre.append(word);
      setTimeout(() => genre.firstChild?.classList.contains('out') && genre.firstChild.remove(), 450);
    }, 1800) : null;
    const stats = [[DECKS.length, 'genre decks'], [Object.keys(CARDS).length, 'cards'], ['Ranked', 'online play'], ['Free', 'to play']];
    const screen = h('main', { class: 'title-screen', onclick: start },
      h('div', { class: 'title-art', 'aria-hidden': 'true' }, h('img', { src: 'assets/img/ui/key-art.webp', alt: '', decoding: 'async' })),
      h('div', { class: 'title-embers', 'aria-hidden': 'true' }, embers),
      h('h1', { class: 'sr-only' }, 'MetaDeck'),
      h('div', { class: 'title-foot' },
        h('button', { class: 'title-start' }, 'Press to start'),
        h('p', { class: 'title-tag', 'aria-label': 'A card battler where every deck is a video game genre.' },
          h('span', { 'aria-hidden': 'true' }, 'A card battler where every deck is a video game genre: ', genre)),
        h('ul', { class: 'title-stats', 'aria-label': 'MetaDeck at a glance' }, stats.map(([n, label], i) =>
          h('li', { style: { '--i': i } }, h('b', { 'data-count': typeof n === 'number' ? n : null }, String(n)), h('span', null, label))))));
    root.replaceChildren(screen);
    for (const b of screen.querySelectorAll('[data-count]')) countUp(b, +b.dataset.count, { delay: 900 });
    // Guests see the Meta Founder offer here too, once we know they're a guest and spots are left.
    Promise.all([ready, founderSpots]).then(([, spots]) => {
      if (done || signedIn() || !(spots?.left > 0)) return;
      screen.querySelector('.title-foot').prepend(founderPitch(spots, { strip: true, onClaim: () => start('signup') }));
    });
  });
}

// Straight to account creation (from a founder offer), back to the menu afterwards.
function signUpScreen() {
  accountScreen(root, { onBack: menu, nav, mode: 'signup' });
}

// Pick up a signed-in account first, then go to the menu. A reload during an online match goes
// straight back to it (the server keeps it for a while).
const ready = initAccount().catch(() => {});
// Meta Founder places left ({ slots, taken, left }), for the offers to guests; null on a static host.
const founderSpots = fetch('/api/founders', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null);
let spotsNow = null;
founderSpots.then(s => { spotsNow = s; });
ready.then(() => { const notice = signedIn()?.rank?.notice; if (notice) seasonEnded(notice); });
ready.then(() => { shopConfig(); returnedFromCheckout(); });
// A #feedback link opens the Feedback dialog at once, over the title screen if need be.
ready.then(installFeedbackLink);
if (net.inMatch) ready.finally(online);
else Promise.all([ready, titleScreen(), founderSpots]).then(([, intent]) => (intent === 'signup' ? signUpScreen() : menu()));
