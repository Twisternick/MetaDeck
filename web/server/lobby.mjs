// Online play: matchmaking, rooms and server-authoritative matches.
//
// Three ways into a match:
//   quick   – join the queue; the next two players in it are paired.
//   open    – host a room that is listed in everyone's lobby; anyone can join it.
//   private – host a room that is not listed; friends join with its 5-letter code.
//
// The server runs the real rules engine. Clients send actions ({ type, uid, target }) and get back
// the resulting state, redacted per seat: the opponent's hand and both decks are face-down
// placeholders, and the RNG seed is withheld, so a client can't learn hidden cards.
//
// Players are identified by a token the client keeps in sessionStorage, so a page refresh or a
// dropped connection can rejoin a running match within the grace period.

import crypto from 'node:crypto';
import { createGame, applyAction, decisionPlayer } from '../src/engine/game.js';
import { getDeck, deckErrors } from '../src/data/index.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 5;
const NAME_MAX = 20;
const ACTIONS = new Set(['play', 'respond', 'attack', 'pass', 'end']);

export function createLobby({ turnMs = 90_000, responseMs = 25_000, graceMs = 30_000 } = {}) {
  const players = new Map(); // token -> player
  const rooms = new Map();   // code -> room
  const queue = [];          // players waiting for a quick match

  // ------------------------------------------------------------ connections

  function connect(ws) {
    let player = null;
    ws.on('message', msg => {
      if (!player) {
        if (msg.t === 'hello') player = hello(ws, msg);
        return;
      }
      if (player.ws !== ws) return; // superseded by a newer connection
      try { handle(player, msg); } catch (err) {
        console.error('lobby:', err);
        send(player, { t: 'error', message: 'Something went wrong on the server.' });
      }
    });
    ws.on('close', () => { if (player && player.ws === ws) disconnected(player); });
  }

  function hello(ws, msg) {
    let player = typeof msg.token === 'string' ? players.get(msg.token) : null;
    if (player) {
      clearTimeout(player.graceTimer);
      if (player.ws && player.ws !== ws) player.ws.close();
      player.ws = ws;
    } else {
      player = { token: crypto.randomUUID(), name: '', ws, status: 'idle', room: null, deck: null, graceTimer: null };
      players.set(player.token, player);
    }
    player.name = cleanName(msg.name) || player.name || `Player ${Math.floor(1000 + Math.random() * 9000)}`;
    const room = player.room;
    send(player, { t: 'welcome', token: player.token, name: player.name, inMatch: !!room?.game });

    if (room && room.game) {
      // Back in a match after a refresh or a dropped connection: resync it.
      const seat = room.seats.indexOf(player);
      send(player, { ...startMessage(room, seat), resumed: true });
      if (room.rematch.size) send(player, { t: 'rematch', seats: [...room.rematch] });
      send(opponentOf(room, player), { t: 'opponentBack' });
    } else if (player.status === 'hosting' && room) {
      send(player, { t: 'hosting', code: room.code, visibility: room.visibility });
    } else if (player.status === 'queued') {
      send(player, { t: 'queued', since: player.queuedAt });
    }
    sendLobby(player);
    return player;
  }

  function disconnected(player) {
    player.ws = null;
    const room = player.room;
    if (player.status === 'playing' && room && room.game && !room.game.over) {
      send(opponentOf(room, player), { t: 'opponentAway', grace: graceMs });
      player.graceTimer = setTimeout(() => {
        if (player.ws) return;
        forfeit(room, room.seats.indexOf(player), 'disconnected');
        leave(player);
        players.delete(player.token);
      }, graceMs);
      return;
    }
    leave(player);
    player.graceTimer = setTimeout(() => { if (!player.ws) players.delete(player.token); }, graceMs);
  }

  // ------------------------------------------------------------ messages

  function handle(player, msg) {
    switch (msg.t) {
      case 'name': {
        const name = cleanName(msg.name);
        if (name && player.status !== 'playing') {
          player.name = name;
          send(player, { t: 'welcome', token: player.token, name });
          if (player.status === 'hosting') broadcastLobby();
        }
        return;
      }
      case 'queue': return enqueue(player, msg.deck);
      case 'host': return host(player, msg.deck, msg.visibility === 'private' ? 'private' : 'open');
      case 'join': return join(player, msg.code, msg.deck);
      case 'cancel':
        if (player.status === 'queued' || player.status === 'hosting') leave(player);
        send(player, { t: 'idle' });
        return;
      case 'action': return act(player, msg.action);
      case 'rematch': return rematch(player);
      case 'leave':
        if (player.status === 'playing' && player.room?.game && !player.room.game.over) {
          forfeit(player.room, player.room.seats.indexOf(player), 'left');
        }
        leave(player);
        send(player, { t: 'idle' });
        return;
      case 'lobby': return sendLobby(player);
    }
  }

  function checkDeck(player, deck) {
    const ok = deck && typeof deck === 'object' && getDeck(deck.archetype) && Array.isArray(deck.cards)
      && deck.cards.every(c => typeof c === 'string') && deckErrors(deck.archetype, deck.cards).length === 0;
    if (!ok) {
      send(player, { t: 'error', message: "That deck isn't legal. Pick a complete 40-card deck." });
      return null;
    }
    return { archetype: deck.archetype, cards: [...deck.cards], name: String(deck.name ?? '').slice(0, 40) };
  }

  function enqueue(player, rawDeck) {
    const deck = checkDeck(player, rawDeck);
    if (!deck) return;
    leave(player);
    player.deck = deck;
    const other = queue.find(p => p !== player && p.ws);
    if (other) {
      queue.splice(queue.indexOf(other), 1);
      other.status = 'idle';
      const room = newRoom('quick', other);
      seat(room, player);
      startGame(room);
      return;
    }
    player.status = 'queued';
    player.queuedAt = Date.now();
    queue.push(player);
    send(player, { t: 'queued', since: player.queuedAt });
    broadcastLobby();
  }

  function host(player, rawDeck, visibility) {
    const deck = checkDeck(player, rawDeck);
    if (!deck) return;
    leave(player);
    player.deck = deck;
    const room = newRoom(visibility, player);
    player.status = 'hosting';
    send(player, { t: 'hosting', code: room.code, visibility });
    broadcastLobby();
  }

  function join(player, rawCode, rawDeck) {
    const code = String(rawCode ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const room = rooms.get(code);
    if (!room || room.game || room.visibility === 'quick') {
      send(player, { t: 'error', message: room ? 'That room has already started.' : `No room with code ${code || '—'}.` });
      return;
    }
    if (room.seats[0] === player) {
      send(player, { t: 'error', message: "That's your own room. Share the code with a friend." });
      return;
    }
    const deck = checkDeck(player, rawDeck);
    if (!deck) return;
    leave(player);
    player.deck = deck;
    seat(room, player);
    startGame(room);
  }

  function act(player, raw) {
    const room = player.room;
    const game = room?.game;
    if (player.status !== 'playing' || !game) return;
    const action = cleanAction(raw);
    const seatNo = room.seats.indexOf(player);
    if (!action) return send(player, { t: 'reject', reason: 'Unknown action.' });
    if (game.over) return send(player, { t: 'reject', reason: 'The game is over.' });
    if (decisionPlayer(game) !== seatNo) return send(player, { t: 'reject', reason: "It's not your move." });
    apply(room, seatNo, action);
  }

  function rematch(player) {
    const room = player.room;
    if (!room || !room.game || !room.game.over || room.seats.length < 2) return;
    room.rematch.add(room.seats.indexOf(player));
    if (room.rematch.size === 2) return startGame(room);
    for (const p of room.seats) send(p, { t: 'rematch', seats: [...room.rematch] });
  }

  // ------------------------------------------------------------ rooms

  function newRoom(visibility, hostPlayer) {
    let code;
    do code = Array.from({ length: CODE_LEN }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
    while (rooms.has(code));
    const room = { code, visibility, seats: [], game: null, rematch: new Set(), createdAt: Date.now(), timer: null, clock: null };
    rooms.set(code, room);
    seat(room, hostPlayer);
    return room;
  }

  function seat(room, player) {
    room.seats.push(player);
    player.room = room;
  }

  // Take a player out of whatever they are in: the queue, a room they host, or a match.
  function leave(player) {
    const qi = queue.indexOf(player);
    if (qi >= 0) queue.splice(qi, 1);
    const room = player.room;
    const wasListed = player.status === 'queued' || (player.status === 'hosting' && room?.visibility === 'open');
    player.status = 'idle';
    player.room = null;
    if (room) {
      room.seats = room.seats.filter(p => p !== player);
      room.rematch.clear();
      if (room.seats.length === 0) {
        clearTimeout(room.timer);
        rooms.delete(room.code);
      } else if (room.game) {
        // The match ended (or was forfeited); the opponent stays on the results screen.
        for (const p of room.seats) send(p, { t: 'opponentLeft' });
      }
    }
    if (wasListed || room) broadcastLobby();
  }

  function startGame(room) {
    const [a, b] = room.seats;
    const names = [a.name, b.name === a.name ? `${b.name} (2)` : b.name];
    room.game = createGame({
      decks: [a.deck.cards, b.deck.cards],
      deckIds: [a.deck.archetype, b.deck.archetype],
      names,
      firstPlayer: crypto.randomInt(2),
    });
    room.game.events = [];
    room.rematch.clear();
    room.clock = null;
    for (const p of room.seats) p.status = 'playing';
    schedule(room);
    room.seats.forEach((p, i) => send(p, startMessage(room, i)));
    broadcastLobby();
  }

  function startMessage(room, seatNo) {
    return {
      t: 'start', seat: seatNo, code: room.code, visibility: room.visibility,
      state: view(room.game, seatNo), clock: clockFor(room),
      opponent: room.seats[1 - seatNo] ? { name: room.seats[1 - seatNo].name, deckId: room.seats[1 - seatNo].deck.archetype } : null,
    };
  }

  // Resolve an action and send both seats their view of the result.
  function apply(room, actor, action, extra = {}) {
    const game = room.game;
    const card = action.type === 'play' || action.type === 'respond'
      ? game.players[actor].hand.find(c => c.uid === action.uid)?.id ?? null
      : null;
    const res = applyAction(game, action);
    if (!res.ok) {
      game.events = [];
      send(room.seats[actor], { t: 'reject', reason: res.reason });
      return;
    }
    const events = game.events.splice(0);
    schedule(room);
    const clock = clockFor(room);
    room.seats.forEach((p, i) => send(p, {
      t: 'update', actor, action, card, ...extra, clock,
      state: view(game, i), events: eventsFor(events, i),
    }));
    if (game.over) broadcastLobby();
  }

  function forfeit(room, seatNo, why) {
    const game = room.game;
    if (!game || game.over || seatNo < 0) return;
    game.over = true;
    game.winner = 1 - seatNo;
    game.log.push({ turn: game.turn, text: `${game.players[seatNo].name} ${why === 'disconnected' ? 'disconnected' : 'left'} and forfeits.` });
    clearTimeout(room.timer);
    room.seats.forEach((p, i) => send(p, {
      t: 'update', actor: seatNo, action: null, forfeit: seatNo, clock: null, state: view(game, i), events: [],
    }));
  }

  // ------------------------------------------------------------ turn clock

  // Each turn has a time limit; an attack's response window has its own, shorter one, and the time
  // spent in it doesn't count against the attacker's turn. When a clock runs out the server passes
  // the response or ends the turn.
  function schedule(room) {
    clearTimeout(room.timer);
    const game = room.game;
    if (!game || game.over) return;
    const now = Date.now();
    if (!room.clock || room.clock.turn !== game.turn) room.clock = { turn: game.turn, turnEnds: now + turnMs, pendingSince: null, responseEnds: null };
    const c = room.clock;
    if (game.pending && c.pendingSince === null) { c.pendingSince = now; c.responseEnds = now + responseMs; }
    if (!game.pending && c.pendingSince !== null) { c.turnEnds += now - c.pendingSince; c.pendingSince = null; c.responseEnds = null; }
    const ends = game.pending ? c.responseEnds : c.turnEnds;
    room.timer = setTimeout(() => {
      if (room.game !== game || game.over) return;
      apply(room, decisionPlayer(game), { type: game.pending ? 'pass' : 'end' }, { timeout: true });
    }, Math.max(0, ends - now));
  }

  function clockFor(room) {
    const game = room.game;
    if (!game || game.over || !room.clock) return null;
    const ends = game.pending ? room.clock.responseEnds : room.clock.turnEnds;
    return { left: Math.max(0, ends - Date.now()), total: game.pending ? responseMs : turnMs, response: !!game.pending };
  }

  // ------------------------------------------------------------ lobby list

  function lobbyInfo() {
    const open = [...rooms.values()]
      .filter(r => r.visibility === 'open' && !r.game && r.seats.length === 1)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(r => ({ code: r.code, host: r.seats[0].name, deckId: r.seats[0].deck.archetype, since: r.createdAt }));
    const online = [...players.values()].filter(p => p.ws);
    return {
      t: 'lobby', rooms: open, now: Date.now(),
      online: online.length,
      searching: queue.length,
      playing: online.filter(p => p.status === 'playing').length,
    };
  }

  function sendLobby(player) {
    send(player, lobbyInfo());
  }

  function broadcastLobby() {
    const info = lobbyInfo();
    for (const p of players.values()) if (p.ws && p.status !== 'playing') send(p, info);
  }

  // ------------------------------------------------------------ helpers

  const send = (player, msg) => { if (player?.ws?.open) player.ws.send(msg); };
  const opponentOf = (room, player) => room.seats.find(p => p !== player);

  function close() {
    for (const room of rooms.values()) clearTimeout(room.timer);
    for (const p of players.values()) { clearTimeout(p.graceTimer); p.ws?.close(); }
    players.clear();
    rooms.clear();
    queue.length = 0;
  }

  return { connect, close, stats: () => ({ players: players.size, rooms: rooms.size, queue: queue.length }) };
}

// What one seat may see: its own hand, the opponent's hand only while it is revealed, and no deck
// order or RNG seed.
export function view(state, seat) {
  const { events, rng, ...rest } = state;
  return {
    ...rest,
    rng: 0,
    events: [],
    log: state.log.slice(-100),
    players: state.players.map(p => ({
      ...p,
      deck: p.deck.map(() => ({ hidden: true, owner: p.id })),
      hand: p.id === seat || p.revealedTurn === state.turn ? p.hand : p.hand.map(() => ({ hidden: true, owner: p.id })),
    })),
  };
}

// Events are public except which card uid the opponent drew.
function eventsFor(events, seat) {
  return events.map(e => (e.type === 'draw' && e.pid !== seat ? { type: 'draw', pid: e.pid } : e));
}

function cleanAction(raw) {
  if (!raw || typeof raw !== 'object' || !ACTIONS.has(raw.type)) return null;
  const action = { type: raw.type };
  if (Number.isInteger(raw.uid)) action.uid = raw.uid;
  if (Number.isInteger(raw.target) || (typeof raw.target === 'string' && /^P[01]$/.test(raw.target))) action.target = raw.target;
  return action;
}

function cleanName(raw) {
  return typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, NAME_MAX) : '';
}
