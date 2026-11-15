// The Profile screen: your ranked season (rank, stars, peak), match history and win rate per deck, the
// season leaderboard, and friends (requests, who's online, challenges, unfriend, block). Everything
// comes from the server (server/social.mjs), so it needs an account; guests are asked to sign in.

import { h } from './dom.js';
import { removeFx, deckEmblem } from './fx.js';
import { getDeck, DECKS } from '../data/index.js';
import { seasonName, seasonKey } from '../data/economy.js';
import { rankBadge } from './rank-badge.js';
import {
  signedIn, profile, walletBar, matchHistory, leaderboard, friendsList, addFriend, removeFriend, blockPlayer, unblockPlayer,
} from './profile.js';
import { toast } from './packs.js';
import { tip } from './tutorial.js';
import { founderBadge } from './founder.js';

const TABS = [['rank', 'Rank & history'], ['leaderboard', 'Leaderboard'], ['friends', 'Friends']];
const MODE = { ai: 'vs AI', online: 'Online' };

export { rankBadge };

const ago = iso => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
};
const daysLeft = () => {
  const n = new Date();
  return Math.ceil((new Date(n.getFullYear(), n.getMonth() + 1, 1) - n) / 86_400_000);
};

export function playerHub(root, { onBack, nav, tab = 'rank', onChallenge }) {
  removeFx();
  tip('players', 'Quick find against another signed-in player is ranked: win stars to climb from Bronze to Meta. Add friends here to challenge them.');
  let current = tab;
  const body = h('div', { class: 'hub-body' });
  const tabs = h('nav', { class: 'col-tabs', role: 'tablist' });

  function render() {
    tabs.replaceChildren(...TABS.map(([id, label]) => h('button', {
      class: `col-tab${current === id ? ' selected' : ''}`, role: 'tab', 'aria-selected': String(current === id),
      onclick: () => { current = id; render(); },
    }, label)));
    if (!signedIn()) {
      body.replaceChildren(h('section', { class: 'acct-card rise hub-guest' },
        h('div', { class: 'acct-badge', 'aria-hidden': 'true' }, '🏆'),
        h('h2', null, 'Ranked, history and friends need an account'),
        h('p', { class: 'muted' }, 'Sign in to play ranked, keep a history of your matches, climb the leaderboard and add friends. Guests can still play online, unranked.'),
        h('button', { class: 'btn primary', onclick: nav.account }, 'Sign in or create an account')));
      return;
    }
    body.replaceChildren(h('p', { class: 'muted hub-loading' }, 'Loading…'));
    const view = current;
    const load = view === 'rank' ? matchHistory() : view === 'leaderboard' ? leaderboard() : friendsList();
    load.then(data => {
      if (view !== current) return;
      if (!data?.ok) { body.replaceChildren(h('p', { class: 'lobby-error' }, data?.reason ?? 'Couldn’t load that.')); return; }
      body.replaceChildren(view === 'rank' ? rankView(data) : view === 'leaderboard' ? boardView(data) : friendsView(data));
    });
  }

  // ---------------------------------------------------------------- rank & history
  function rankView({ rank, matches, decks }) {
    const card = h('section', { class: 'hub-rank rise', style: { '--tier': rank.color } },
      rankBadge(rank, { big: true }),
      signedIn() && profile().founder ? founderBadge(profile().founder) : null,
      h('div', { class: 'hub-rank-info' },
        h('div', { class: 'vs-sub' }, `${seasonName(rank.season)} · ${daysLeft()} days left`),
        h('p', null, rank.games ? `${rank.wins} wins in ${rank.games} ranked games` : 'No ranked games yet this season. Quick find against another signed-in player is ranked.'),
        rank.streak >= 2 ? h('p', { class: 'hub-streak' }, `🔥 ${rank.streak} wins in a row`) : null,
        h('p', { class: 'muted small' }, `Peak this season: ${rank.peakLabel}. A win is a star (a third win in a row is two); a loss takes one. You keep any tier you reach until the season ends.`)));

    const byDeck = new Map(decks.map(d => [d.deck, d]));
    const deckStats = h('section', { class: 'rise', style: { '--i': 1 } },
      h('h2', null, 'Your decks'),
      h('div', { class: 'deck-rates' }, DECKS.map(d => {
        const s = byDeck.get(d.id);
        const pct = s?.games ? Math.round((100 * s.wins) / s.games) : null;
        return h('div', { class: 'deck-rate', style: { '--deck': d.color, '--pct': `${pct ?? 0}%` } },
          deckEmblem(d, 'chip-emblem'),
          h('div', { class: 'deck-rate-name' }, d.name),
          h('div', { class: 'deck-rate-bar' }, h('i')),
          h('div', { class: 'deck-rate-num' }, pct === null ? '—' : `${pct}%`, s?.games ? h('small', null, ` ${s.wins}/${s.games}`) : null));
      })));

    const history = h('section', { class: 'rise', style: { '--i': 2 } },
      h('h2', null, 'Recent matches'),
      matches.length ? h('ol', { class: 'match-history-list' }, matches.map(m => {
        const mine = getDeck(m.deck), theirs = getDeck(m.oppDeck);
        return h('li', { class: `history-row ${m.result}` },
          h('span', { class: 'history-result' }, m.result === 'win' ? 'Win' : m.result === 'loss' ? 'Loss' : 'Draw'),
          h('span', { class: 'history-decks' }, deckEmblem(mine, 'chip-emblem'), h('span', { class: 'muted' }, 'vs'), deckEmblem(theirs, 'chip-emblem')),
          h('span', { class: 'history-who' }, m.opponent ?? `${theirs?.name ?? ''} AI`, h('small', null, m.rated ? 'Ranked' : MODE[m.kind] ?? m.kind)),
          h('span', { class: 'history-stars' }, m.rated && m.stars ? `${m.stars > 0 ? '+' : ''}${m.stars}★` : ''),
          h('span', { class: 'history-when muted' }, `${m.turns} turns · ${ago(m.at)}`));
      })) : h('p', { class: 'muted' }, 'Matches you play while signed in show up here.'));
    return h('div', { class: 'hub-rank-view' }, card, deckStats, history);
  }

  // ---------------------------------------------------------------- leaderboard
  function boardView({ players }) {
    const me = signedIn()?.name;
    if (!players.length) return h('p', { class: 'muted' }, 'Nobody has played ranked this season yet. Be the first!');
    return h('section', { class: 'rise' },
      h('h2', null, `${seasonName(seasonKey())} leaderboard`),
      h('ol', { class: 'leaderboard-list' }, players.map(p => h('li', { class: `board-row${p.name === me ? ' me' : ''}` },
        h('span', { class: 'board-place' }, `#${p.place}`),
        h('span', { class: 'board-name' }, p.name, ' ', founderBadge(p.title)),
        rankBadge(p),
        h('span', { class: 'board-record muted' }, `${p.wins}–${p.games - p.wins}`)))));
  }

  // ---------------------------------------------------------------- friends
  function friendsView({ friends, incoming, outgoing, blocked }) {
    const act = async (fn, name, done) => {
      const r = await fn(name);
      if (!r.ok) toast(r.reason, 'bad'); else if (done) toast(done);
      render();
    };
    const input = h('input', { class: 'acct-input', type: 'text', maxlength: '20', placeholder: 'Player name', spellcheck: 'false', autocomplete: 'off', 'aria-label': 'Player name' });
    const add = h('form', { class: 'friend-add', onsubmit: async e => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      const r = await addFriend(name);
      if (!r.ok) toast(r.reason, 'bad');
      else toast(r.accepted ? `You and ${r.name} are now friends.` : `Friend request sent to ${r.name}.`);
      render();
    } }, input, h('button', { class: 'btn primary', type: 'submit' }, 'Add friend'));

    const presence = p => (p === 'match' ? ['In a match', 'busy'] : p === 'lobby' ? ['In the online lobby', 'on'] : ['Offline', 'off']);
    const friendRow = f => {
      const [label, cls] = presence(f.presence);
      return h('li', { class: 'friend-row' },
        h('span', { class: `presence ${cls}`, 'aria-hidden': 'true' }),
        h('span', { class: 'friend-name' }, h('span', null, f.name, ' ', founderBadge(f.title)), h('small', null, label)),
        h('button', {
          class: 'btn primary small', disabled: f.presence !== 'lobby' || null,
          title: f.presence === 'lobby' ? `Challenge ${f.name} to a friendly match` : 'They need to be in the online lobby',
          onclick: () => onChallenge(f.name),
        }, 'Challenge'),
        h('details', { class: 'friend-more' },
          h('summary', { 'aria-label': `More for ${f.name}` }, '⋯'),
          h('div', { class: 'friend-menu' },
            h('button', { class: 'btn ghost small', onclick: () => act(removeFriend, f.name, `Removed ${f.name}.`) }, 'Unfriend'),
            h('button', { class: 'btn danger small', onclick: () => { if (confirm(`Block ${f.name}? You won’t be matched with them, and they can’t add or challenge you.`)) act(blockPlayer, f.name, `Blocked ${f.name}.`); } }, 'Block'))));
    };

    return h('div', { class: 'friends rise' },
      h('section', null, h('h2', null, 'Add a friend'), add,
        h('p', { class: 'muted small' }, 'Friends who are in the online lobby can be challenged to a friendly (unranked) match.')),
      incoming.length ? h('section', null, h('h2', null, `Requests · ${incoming.length}`),
        h('ul', { class: 'friend-list' }, incoming.map(name => h('li', { class: 'friend-row' },
          h('span', { class: 'friend-name' }, name, h('small', null, 'wants to be friends')),
          h('button', { class: 'btn primary small', onclick: () => act(addFriend, name, `You and ${name} are now friends.`) }, 'Accept'),
          h('button', { class: 'btn ghost small', onclick: () => act(removeFriend, name) }, 'Decline'))))) : null,
      h('section', null, h('h2', null, `Friends · ${friends.length}`),
        friends.length ? h('ul', { class: 'friend-list' }, friends.map(friendRow)) : h('p', { class: 'muted' }, 'No friends yet. Add someone by their name above.')),
      outgoing.length ? h('section', null, h('h2', null, 'Sent requests'),
        h('ul', { class: 'friend-list' }, outgoing.map(name => h('li', { class: 'friend-row' },
          h('span', { class: 'friend-name' }, name, h('small', null, 'waiting for them to accept')),
          h('button', { class: 'btn ghost small', onclick: () => act(removeFriend, name) }, 'Cancel'))))) : null,
      blocked.length ? h('section', null, h('h2', null, 'Blocked'),
        h('ul', { class: 'friend-list' }, blocked.map(name => h('li', { class: 'friend-row' },
          h('span', { class: 'friend-name' }, name),
          h('button', { class: 'btn ghost small', onclick: () => act(unblockPlayer, name, `Unblocked ${name}.`) }, 'Unblock'))))) : null);
  }

  root.replaceChildren(h('main', { class: 'hub' },
    h('header', { class: 'page-head' },
      h('button', { class: 'btn ghost small', onclick: onBack }, '← Menu'),
      h('h1', null, 'Profile'),
      walletBar({ nav })),
    tabs, body));
  render();
  window.scrollTo(0, 0);
}
