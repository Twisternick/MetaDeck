// Online lobby: quick find, private rooms (join by code) and open rooms (listed for anyone to join).
// The server (server/lobby.mjs) pairs players and runs the match; this screen picks how to find an
// opponent, shows the wait, plays a "match found" splash and then hands over to the match screen.

import { h, delay, storage } from './dom.js';
import { net } from './net.js';
import { startMatch } from './match.js';
import { artSlot, deckArtUrls, removeFx, motionOK } from './fx.js';
import { getDeck } from '../data/index.js';

const NAME_KEY = 'metadeck.netName';

// deck = { archetype, name, cards } – the list picked in the main menu.
export function lobby(root, { deck, onBack }) {
  removeFx();
  const s = {
    phase: 'connecting',   // connecting | offline | idle | queued | hosting | match
    name: storage.get(NAME_KEY, ''),
    info: null,            // latest lobby message: rooms and player counts
    skew: 0,               // local clock minus server clock
    since: 0,              // when we started waiting (local time)
    hosting: null,         // { code, visibility }
    joinCode: '',
    error: null,
    copied: false,
  };
  let match = null;        // the running match screen
  let buffer = null;       // server messages that arrive between 'start' and the match subscribing
  let exited = false;

  let unsubscribe = null;
  let ticker = null;

  function onMessage(msg) {
    if (exited) return;
    if (buffer && msg.t !== 'start' && msg.t !== 'lobby') buffer.push(msg);
    switch (msg.t) {
      case 'status':
        if (msg.status === 'offline' && s.phase !== 'match') s.phase = 'offline';
        else if (msg.status !== 'online' && s.phase === 'offline') s.phase = 'connecting';
        if (!match) render();
        return;
      case 'welcome':
        if (match && msg.inMatch === false) {
          // Back online, but the server no longer has our match (we were gone past its grace period).
          match.close();
          match = null;
          net.inMatch = false;
          s.phase = 'idle';
          s.error = 'The connection to your match was lost.';
        }
        s.name = msg.name;
        storage.set(NAME_KEY, msg.name);
        if (s.phase === 'connecting' || s.phase === 'offline') s.phase = 'idle';
        if (!match) render();
        return;
      case 'lobby':
        s.info = msg;
        s.skew = Date.now() - msg.now;
        if (!match) render();
        return;
      case 'queued':
        s.phase = 'queued';
        s.since = msg.since + s.skew;
        render();
        return;
      case 'hosting':
        s.phase = 'hosting';
        s.hosting = { code: msg.code, visibility: msg.visibility };
        s.since = Date.now();
        s.copied = false;
        render();
        return;
      case 'idle':
        if (s.phase === 'queued' || s.phase === 'hosting') s.phase = 'idle';
        if (!match) render();
        return;
      case 'error':
        s.error = msg.message;
        if (!match) render();
        return;
      case 'start':
        launch(msg);
        return;
    }
  }

  // A match starts (or restarts: a rematch, or a resync after reconnecting, which skips the splash).
  function launch(msg) {
    s.phase = 'match';
    s.error = null;
    net.inMatch = true;
    buffer = [];
    const online = {
      seat: msg.seat, state: msg.state, clock: msg.clock, send: net.send,
      subscribe: fn => {
        const queued = buffer ?? [];
        buffer = null;
        queued.forEach(fn);
        return net.subscribe(fn);
      },
    };
    const go = () => {
      if (exited) return;
      match?.close();
      match = startMatch(root, { online, onExit: backToLobby });
    };
    if (match || msg.resumed) go(); else splash(msg).then(go);
  }

  function backToLobby() {
    match = null;
    buffer = null;
    net.inMatch = false;
    net.send({ t: 'leave' });
    s.phase = net.status === 'online' ? 'idle' : 'connecting';
    removeFx();
    render();
  }

  function leave() {
    exited = true;
    clearInterval(ticker);
    unsubscribe?.();
    net.send({ t: 'cancel' });
    net.inMatch = false;
    net.disconnect();
    onBack();
  }

  // ------------------------------------------------------------ actions

  const deckMsg = () => ({ archetype: deck.archetype, cards: deck.cards, name: deck.name });
  const quickFind = () => { s.error = null; net.send({ t: 'queue', deck: deckMsg() }); };
  const host = visibility => { s.error = null; net.send({ t: 'host', visibility, deck: deckMsg() }); };
  const join = code => {
    s.error = null;
    if (!code.trim()) { s.error = 'Type the 5-letter room code.'; render(); return; }
    net.send({ t: 'join', code, deck: deckMsg() });
  };
  const cancel = () => net.send({ t: 'cancel' });

  function setName(value) {
    const name = value.trim().slice(0, 20);
    if (!name || name === s.name) return;
    s.name = name;
    storage.set(NAME_KEY, name);
    net.send({ t: 'name', name });
  }

  function copyCode() {
    navigator.clipboard?.writeText(s.hosting.code).then(() => { s.copied = true; render(); }, () => {});
  }

  // ------------------------------------------------------------ render

  const clock = ms => {
    const secs = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  };

  // Waiting times tick in place, without re-rendering the screen.
  function tick() {
    if (match) return;
    for (const el of root.querySelectorAll('[data-since]')) el.textContent = clock(Date.now() - Number(el.dataset.since));
  }

  function render() {
    if (exited || match) return;
    const mine = getDeck(deck.archetype);
    const info = s.info;
    const ready = s.phase === 'idle';
    root.replaceChildren(h('main', { class: 'lobby', style: { '--deck': mine.color } },
      h('header', { class: 'page-head' },
        h('button', { class: 'btn ghost small', onclick: leave }, '← Menu'),
        h('h1', null, 'Play online'),
        h('div', { class: `net-status ${s.phase === 'offline' ? 'bad' : s.phase === 'connecting' ? 'wait' : 'good'}` },
          h('i', { 'aria-hidden': 'true' }),
          s.phase === 'offline' ? 'Server unreachable'
            : s.phase === 'connecting' ? 'Connecting…'
              : info ? `${info.online} online · ${info.searching} searching · ${info.playing} in matches` : 'Online')),

      h('section', { class: 'lobby-bar rise' },
        h('label', { class: 'name-field' },
          h('span', null, 'Your name'),
          h('input', {
            type: 'text', maxlength: '20', value: s.name, placeholder: 'Player', spellcheck: 'false', autocomplete: 'nickname',
            onchange: e => setName(e.target.value),
            onkeydown: e => { if (e.key === 'Enter') e.target.blur(); },
          })),
        h('div', { class: 'lobby-deck' },
          artSlot('', deckArtUrls(mine.id), mine.icon),
          h('div', null,
            h('div', { class: 'vs-sub' }, 'Your deck'),
            h('div', { class: 'vs-name' }, mine.name),
            h('div', { class: 'vs-list' }, deck.name)),
          h('button', { class: 'btn ghost small', onclick: leave }, 'Change'))),

      s.error ? h('div', { class: 'lobby-error', role: 'alert' }, s.error) : null,
      s.phase === 'offline' ? h('div', { class: 'lobby-error', role: 'alert' },
        "Can't reach the MetaDeck server. Online play needs the game served by ", h('code', null, 'npm start'), ' (a static host has no matchmaking). Still trying…') : null,

      s.phase === 'queued' || s.phase === 'hosting' ? renderWaiting() : h('section', { class: 'modes' },
        modeTile({
          i: 1, cls: 'quick', icon: '⚡', title: 'Quick find', blurb: 'Get paired with the next player who is searching.',
          body: h('button', { class: 'btn primary big', disabled: !ready || null, onclick: quickFind }, 'Find match'),
        }),
        modeTile({
          i: 2, cls: 'private', icon: '🔒', title: 'Private match', blurb: 'Create a room with a code, or join a friend with theirs.',
          body: h('div', { class: 'mode-stack' },
            h('button', { class: 'btn', disabled: !ready || null, onclick: () => host('private') }, 'Create private room'),
            h('form', { class: 'code-join', onsubmit: e => { e.preventDefault(); join(s.joinCode); } },
              h('input', {
                type: 'text', maxlength: '5', placeholder: 'CODE', value: s.joinCode, 'aria-label': 'Room code', spellcheck: 'false', autocomplete: 'off',
                oninput: e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); s.joinCode = e.target.value; },
              }),
              h('button', { class: 'btn', type: 'submit', disabled: !ready || null }, 'Join'))),
        }),
        modeTile({
          i: 3, cls: 'open', icon: '📡', title: 'Open room', blurb: 'Host a room everyone in the lobby can see, and wait for a challenger.',
          body: h('button', { class: 'btn', disabled: !ready || null, onclick: () => host('open') }, 'Host open room'),
        })),

      h('section', { class: 'rise', style: { '--i': 4 } },
        h('h2', null, `Open rooms${info && info.rooms.length ? ` · ${info.rooms.length}` : ''}`),
        renderRooms(ready)),
    ));
    tick();
  }

  function modeTile({ i, cls, icon, title, blurb, body }) {
    return h('div', { class: `mode-tile ${cls} rise`, style: { '--i': i }, 'data-tilt': '5' },
      h('div', { class: 'mode-icon', 'aria-hidden': 'true' }, icon),
      h('h3', null, title),
      h('p', null, blurb),
      h('div', { class: 'mode-body' }, body));
  }

  function renderWaiting() {
    const quick = s.phase === 'queued';
    const priv = !quick && s.hosting.visibility === 'private';
    return h('section', { class: `waiting rise ${quick ? 'quick' : priv ? 'private' : 'open'}` },
      h('div', { class: 'radar', 'aria-hidden': 'true' },
        h('i', { class: 'radar-ring' }), h('i', { class: 'radar-ring' }), h('i', { class: 'radar-ring' }),
        h('i', { class: 'radar-sweep' }),
        h('span', { class: 'radar-core' }, getDeck(deck.archetype).icon)),
      h('div', { class: 'waiting-body' },
        h('div', { class: 'vs-sub' }, quick ? 'Quick find' : priv ? 'Private room' : 'Open room'),
        h('h2', { class: 'waiting-title' }, quick ? 'Searching for an opponent' : 'Waiting for a challenger', h('span', { class: 'dots' })),
        quick ? null : h('div', { class: 'room-code' },
          h('span', { class: 'room-code-label' }, 'Room code'),
          h('span', { class: 'room-code-chars' }, [...s.hosting.code].map((c, i) => h('b', { style: { '--i': i } }, c))),
          h('button', { class: 'btn ghost small', onclick: copyCode }, s.copied ? 'Copied ✓' : 'Copy')),
        h('p', { class: 'muted' }, quick
          ? 'You’ll be paired with the next player who searches.'
          : priv ? 'Send this code to a friend. They join from Private match.' : 'Your room is listed in everyone’s lobby. Friends can also join with the code.'),
        h('div', { class: 'waiting-foot' },
          h('span', { class: 'turn-pill' }, 'Waiting', h('b', { 'data-since': s.since }, '0:00')),
          h('button', { class: 'btn danger', onclick: cancel }, quick ? 'Stop searching' : 'Close room'))));
  }

  function renderRooms(ready) {
    const rooms = s.info?.rooms ?? [];
    if (!rooms.length) {
      return h('div', { class: 'rooms-empty' },
        h('span', { class: 'rooms-empty-icon', 'aria-hidden': 'true' }, '📡'),
        s.phase === 'connecting' || s.phase === 'offline' ? 'Rooms appear here once connected.' : 'No open rooms right now. Host one and wait for a challenger.');
    }
    const ownCode = s.phase === 'hosting' ? s.hosting.code : null;
    return h('div', { class: 'room-grid' }, rooms.map((r, i) => {
      const d = getDeck(r.deckId);
      const own = r.code === ownCode;
      return h('div', { class: `room-tile rise${own ? ' own' : ''}`, style: { '--deck': d.color, '--i': Math.min(i, 12) } },
        artSlot('', deckArtUrls(d.id), d.icon),
        h('div', { class: 'room-info' },
          h('div', { class: 'room-host' }, r.host),
          h('div', { class: 'room-deck' }, d.name),
          h('div', { class: 'room-wait' }, 'Waiting ', h('span', { 'data-since': r.since + s.skew }, '0:00'))),
        own ? h('span', { class: 'room-yours' }, 'Your room')
          : h('button', { class: 'btn primary small', disabled: !ready || null, onclick: () => join(r.code) }, 'Join'));
    }));
  }

  // "Match found": both players slide in and the VS badge slams down, then the match deals in.
  async function splash(msg) {
    const mineDeck = getDeck(msg.state.players[msg.seat].deckId);
    const theirDeck = getDeck(msg.state.players[1 - msg.seat].deckId);
    const side = (d, name, cls) => h('div', { class: `found-side ${cls}`, style: { '--deck': d.color } },
      artSlot('', deckArtUrls(d.id), d.icon),
      h('div', { class: 'found-name' }, name),
      h('div', { class: 'found-deck' }, d.name));
    const el = h('div', { class: 'match-found', role: 'status' },
      h('div', { class: 'found-title' }, 'Match found'),
      h('div', { class: 'found-row' },
        side(mineDeck, msg.state.players[msg.seat].name, 'mine'),
        h('div', { class: 'found-vs' }, 'VS'),
        side(theirDeck, msg.opponent?.name ?? msg.state.players[1 - msg.seat].name, 'theirs')),
      h('div', { class: 'found-sub' }, msg.visibility === 'quick' ? 'Quick find' : `Room ${msg.code}`));
    document.body.append(el);
    await delay(motionOK() ? 2100 : 900);
    el.classList.add('out');
    setTimeout(() => el.remove(), 450);
  }

  // Start last: connecting can render straight away, which needs everything above defined.
  unsubscribe = net.subscribe(onMessage);
  ticker = setInterval(tick, 1000);
  render();
  window.scrollTo(0, 0);
  net.connect(s.name);
}
