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
//
// Anyone can connect, so the lobby treats clients as hostile: every message is validated, each
// connection is rate limited, each address has a connection cap, decks are shuffled with crypto
// randomness and the engine's RNG is reseeded before every move (so no outcome can be predicted), and
// a player who stops taking turns forfeits.
//
// With `accounts` (server/accounts.mjs), a signed-in player plays under their account name, may only
// bring cards their account owns, and is paid their match rewards by the server when the match ends.
// Every finished match is written to the database's match history.
//
// With `social` (server/social.mjs) as well:
//   - Quick find pairs players by hidden rating: each waits for an opponent within RATING_WINDOW of
//     their rating, and the window widens the longer they wait, so a small player base still gets
//     games. A quick-find match between two signed-in players is ranked.
//   - Players who blocked each other are never paired and can't join each other's rooms.
//   - challenge { to, deck } invites a friend who is in the online lobby to a private room; they get
//     an 'invite' and join it with its code, or decline.
//   - emote { id } sends one of the preset EMOTES to both seats of a match (no free chat).
//
// maintenance(minutes) gets the server ready to restart: everyone is told, no new match can start,
// and the callback runs once no match is still being played (or after twice the warning, at the latest).

import crypto from 'node:crypto';
import { createGame, applyAction, decisionPlayer } from '../src/engine/game.js';
import { getDeck, deckErrors } from '../src/data/index.js';
import { START_HP } from '../src/engine/constants.js';
import { missingCards, founderTitle, loadoutFor } from '../src/data/economy.js';
import { logMatch } from './db.mjs';
import { offensiveName } from './names.mjs';

export const EMOTES = ['hello', 'wellplayed', 'thanks', 'oops', 'wow', 'gg'];
const EMOTE_GAP_MS = 2500;
const EMOTES_PER_GAME = 12;
const RATING_WINDOW = 150;  // rating gap allowed at once
const RATING_WIDEN = 75;    // more allowed per 10 seconds of waiting

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 5;
const NAME_MAX = 20;
const ACTIONS = new Set(['play', 'respond', 'attack', 'pass', 'end']);

export function createLobby({
  turnMs = 90_000, responseMs = 25_000, graceMs = 30_000,
  idleTurns = 3,       // turns in a row that run out the clock before the player forfeits
  helloMs = 10_000,    // a connection has this long to say hello
  maxPerIp = 16,       // open connections per address
  rate = { burst: 30, perSec: 12 }, // messages per connection, as a token bucket
  accounts = null,
  social = null,
} = {}) {
  const players = new Map(); // token -> player
  const rooms = new Map();   // code -> room
  const queue = [];          // players waiting for a quick match
  const perIp = new Map();   // address -> open connections
  let closing = null;        // maintenance: { until, done, timer, deadline }
  let shutDown = false;      // close() ran: sockets closing after it start no timers
  const matcher = setInterval(() => guarded(matchQueue)(), 2000);
  matcher.unref?.();
  // Where a signed-in player is, for their friends list: 'match', 'lobby', or null when not connected.
  social?.setPresence(k => {
    for (const p of players.values()) if (p.ws && p.account?.key === k) return p.status === 'playing' ? 'match' : 'lobby';
    return null;
  });
  const blockedPair = (a, b) => !!(social && a.account && b.account && social.blocked(a.account.key, b.account.key));

  // ------------------------------------------------------------ connections

  function connect(ws) {
    const ip = ws.ip ?? '';
    const open = (perIp.get(ip) ?? 0) + 1;
    if (open > maxPerIp) {
      ws.send({ t: 'error', message: 'Too many connections from your network. Close some MetaDeck tabs and try again.' });
      ws.close();
      return;
    }
    perIp.set(ip, open);

    let player = null;
    let tokens = rate.burst;
    let refilled = Date.now();
    let warned = 0;
    let dropped = 0;
    const helloTimer = setTimeout(() => { if (!player) ws.close(); }, helloMs);

    ws.on('message', msg => {
      const now = Date.now();
      tokens = Math.min(rate.burst, tokens + ((now - refilled) / 1000) * rate.perSec);
      refilled = now;
      if (tokens < 1) {
        // Flooding: drop the message, say so at most once a second, and hang up on a client that keeps going.
        if (++dropped > rate.burst * 4) return ws.close();
        if (now - warned > 1000) { warned = now; ws.send({ t: 'error', message: 'Slow down: too many messages.' }); }
        return;
      }
      tokens--;
      dropped = Math.max(0, dropped - 1);
      try {
        if (!player) {
          if (msg.t === 'hello') { player = hello(ws, msg); clearTimeout(helloTimer); }
          return;
        }
        if (player.ws !== ws) return; // superseded by a newer connection
        handle(player, msg);
      } catch (err) {
        console.error('lobby:', err);
        if (player) send(player, { t: 'error', message: 'Something went wrong on the server.' });
      }
    });
    ws.on('close', () => {
      clearTimeout(helloTimer);
      const left = (perIp.get(ip) ?? 1) - 1;
      if (left > 0) perIp.set(ip, left); else perIp.delete(ip);
      if (player && player.ws === ws && !shutDown) disconnected(player);
    });
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
    player.account = ws.account ?? player.account ?? null;
    player.name = player.account?.name || guestName(msg.name) || player.name || `Player ${crypto.randomInt(1000, 10000)}`;
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
    if (closing) send(player, noticeMsg());
    return player;
  }

  function disconnected(player) {
    player.ws = null;
    const room = player.room;
    if (player.status === 'playing' && room && room.game && !room.game.over) {
      send(opponentOf(room, player), { t: 'opponentAway', grace: graceMs });
      player.graceTimer = setTimeout(guarded(() => {
        if (player.ws) return;
        forfeit(room, room.seats.indexOf(player), 'disconnected');
        leave(player);
        players.delete(player.token);
      }), graceMs);
      return;
    }
    leave(player);
    player.graceTimer = setTimeout(() => { if (!player.ws) players.delete(player.token); }, graceMs);
  }

  // ------------------------------------------------------------ messages

  function handle(player, msg) {
    // Starting something new mid-match would walk out of it without forfeiting.
    if (['queue', 'host', 'join'].includes(msg.t) && inRunningMatch(player)) {
      send(player, { t: 'error', message: 'Finish or leave your current match first.' });
      return;
    }
    if (closing && ['queue', 'host', 'join', 'rematch'].includes(msg.t)) {
      send(player, { t: 'error', message: 'The server is about to restart for an update. Try again in a few minutes.' });
      return;
    }
    switch (msg.t) {
      case 'name': {
        const name = guestName(msg.name);
        if (name && player.status !== 'playing' && !player.account) {
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
        if (inRunningMatch(player)) forfeit(player.room, player.room.seats.indexOf(player), 'left');
        leave(player);
        send(player, { t: 'idle' });
        return;
      case 'lobby': return sendLobby(player);
      case 'challenge': return challenge(player, msg.to, msg.deck);
      case 'decline': return decline(player, msg.code);
      case 'emote': return emote(player, msg.id);
    }
  }

  const inRunningMatch = player => player.status === 'playing' && !!player.room?.game && !player.room.game.over;

  function checkDeck(player, deck) {
    const ok = deck && typeof deck === 'object' && getDeck(deck.archetype) && Array.isArray(deck.cards)
      && deck.cards.every(c => typeof c === 'string') && deckErrors(deck.archetype, deck.cards).length === 0;
    if (!ok) {
      send(player, { t: 'error', message: "That deck isn't legal. Pick a complete 40-card deck." });
      return null;
    }
    const profile = accounts && player.account ? accounts.profileFor(player.account) : null;
    if (profile && missingCards(profile, deck.cards).length) {
      send(player, { t: 'error', message: "Your account doesn't own every card in that deck." });
      return null;
    }
    return { archetype: deck.archetype, cards: [...deck.cards], name: String(deck.name ?? '').slice(0, 40) };
  }

  function enqueue(player, rawDeck) {
    const deck = checkDeck(player, rawDeck);
    if (!deck) return;
    leave(player);
    player.deck = deck;
    player.status = 'queued';
    player.queuedAt = Date.now();
    player.rating = social && player.account ? social.ratingOf(player.account) : 1500;
    queue.push(player);
    send(player, { t: 'queued', since: player.queuedAt, ranked: !!(social && player.account) });
    matchQueue();
    if (player.status === 'queued') broadcastLobby();
  }

  // Pair waiting players: the longest-waiting first, each with the closest-rated player inside the
  // wider of the two players' windows. Runs on every new arrival and every two seconds.
  function matchQueue() {
    const now = Date.now();
    const reach = p => RATING_WINDOW + RATING_WIDEN * Math.floor((now - p.queuedAt) / 10_000);
    for (let i = 0; i < queue.length; i++) {
      const a = queue[i];
      if (!a.ws) continue;
      let best = null;
      for (const b of queue) {
        if (b === a || !b.ws || blockedPair(a, b)) continue;
        const gap = Math.abs(a.rating - b.rating);
        if (gap <= Math.max(reach(a), reach(b)) && (!best || gap < best.gap)) best = { b, gap };
      }
      if (!best) continue;
      queue.splice(queue.indexOf(a), 1);
      queue.splice(queue.indexOf(best.b), 1);
      a.status = 'idle';
      best.b.status = 'idle';
      const room = newRoom('quick', a);
      seat(room, best.b);
      startGame(room);
      i = -1;
    }
  }

  // Invite a friend who is in the online lobby: a private room, with an 'invite' sent to them.
  function challenge(player, to, rawDeck) {
    if (!social || !player.account) return send(player, { t: 'error', message: 'Sign in to challenge your friends.' });
    const k = typeof to === 'string' ? to.trim().toLowerCase() : '';
    const friend = [...players.values()].find(p => p.ws && p.account?.key === k);
    if (!friend || !social.areFriends(player.account.key, k) || blockedPair(player, friend)) {
      return send(player, { t: 'error', message: `${String(to ?? '').slice(0, 20)} isn’t in the online lobby right now.` });
    }
    if (friend.status !== 'idle') return send(player, { t: 'error', message: `${friend.name} is busy right now. Try again in a bit.` });
    const room = host(player, rawDeck, 'private', { challenge: friend.name });
    if (!room) return;
    room.challenged = friend.token;
    send(friend, { t: 'invite', from: player.name, code: room.code, deckId: player.deck.archetype });
  }

  function decline(player, rawCode) {
    const room = rooms.get(String(rawCode ?? '').toUpperCase());
    if (!room || room.game || room.challenged !== player.token) return;
    const challenger = room.seats[0];
    leave(challenger);
    send(challenger, { t: 'idle' });
    send(challenger, { t: 'error', message: `${player.name} can’t play right now.` });
  }

  function emote(player, id) {
    const room = player.room;
    if (!room?.game || !EMOTES.includes(id) || player.status !== 'playing') return;
    const now = Date.now();
    if (now - (player.lastEmote ?? 0) < EMOTE_GAP_MS) return;
    if (room.game !== player.emoteGame) { player.emoteGame = room.game; player.emotes = 0; }
    if (++player.emotes > EMOTES_PER_GAME) return;
    player.lastEmote = now;
    const seatNo = room.seats.indexOf(player);
    for (const p of room.seats) send(p, { t: 'emote', seat: seatNo, id });
  }

  function host(player, rawDeck, visibility, extra = {}) {
    const deck = checkDeck(player, rawDeck);
    if (!deck) return;
    leave(player);
    player.deck = deck;
    const room = newRoom(visibility, player);
    player.status = 'hosting';
    send(player, { t: 'hosting', code: room.code, visibility, ...extra });
    broadcastLobby();
    return room;
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
    if (blockedPair(room.seats[0], player)) {
      send(player, { t: 'error', message: 'You can’t join that room.' });
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
    const room = { code, visibility, seats: [], game: null, rematch: new Set(), createdAt: Date.now(), timer: null, clock: null, idle: [0, 0] };
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
      seed: randomSeed(),
      shuffle: cryptoShuffle,
    });
    room.game.events = [];
    room.startedAt = Date.now();
    room.ranked = !!(social && room.visibility === 'quick' && a.account && b.account);
    room.rematch.clear();
    room.clock = null;
    room.idle = [0, 0];
    for (const p of room.seats) p.status = 'playing';
    schedule(room);
    room.seats.forEach((p, i) => send(p, startMessage(room, i)));
    broadcastLobby();
  }

  function startMessage(room, seatNo) {
    return {
      t: 'start', seat: seatNo, code: room.code, visibility: room.visibility, ranked: !!room.ranked,
      state: view(room.game, seatNo), clock: clockFor(room),
      opponent: room.seats[1 - seatNo] ? { name: room.seats[1 - seatNo].name, deckId: room.seats[1 - seatNo].deck.archetype, ...showOff(room.seats[1 - seatNo]) } : null,
    };
  }

  // Resolve an action and send both seats their view of the result.
  function apply(room, actor, action, extra = {}) {
    const game = room.game;
    const card = action.type === 'play' || action.type === 'respond'
      ? game.players[actor].hand.find(c => c.uid === action.uid)?.id ?? null
      : null;
    game.rng = randomSeed(); // nothing a client has seen can predict this move's random outcomes
    const res = applyAction(game, action);
    if (!res.ok) {
      game.events = [];
      send(room.seats[actor], { t: 'reject', reason: res.reason });
      return;
    }
    const events = game.events.splice(0);
    // Several turns in a row with no move at all: treat the match as abandoned rather than stall the opponent.
    room.idle[actor] = extra.timeout && action.type === 'end' ? room.idle[actor] + 1 : extra.timeout ? room.idle[actor] : 0;
    const abandoned = room.idle[actor] >= idleTurns && !game.over;
    if (!abandoned) schedule(room);
    const clock = abandoned ? null : clockFor(room);
    room.seats.forEach((p, i) => send(p, {
      t: 'update', actor, action, card, ...extra, clock,
      ...(extra.timeout ? { idle: { missed: room.idle[actor], limit: idleTurns } } : {}),
      state: view(game, i), events: eventsFor(events, i),
    }));
    if (abandoned) forfeit(room, actor, 'inactive');
    if (game.over) { payOut(room); broadcastLobby(); checkIdle(); }
  }

  // Match rewards for signed-in players, once per game, from the server's own result.
  function payOut(room) {
    const game = room.game;
    if (!accounts || !game?.over || game.paid) return;
    game.paid = true;
    const winner = game.winner === 0 || game.winner === 1 ? game.winner : null;
    const ranked = room.ranked ? social.recordRanked(room.seats[0].account, room.seats[1].account, winner) : null;
    logMatch(accounts.db, {
      kind: 'online', players: room.seats.map(p => p.account?.key ?? null), decks: game.players.map(p => p.deckId),
      styles: game.players.map(p => p.style), winner, turns: game.turn, seconds: Math.round((Date.now() - room.startedAt) / 1000), ending: game.ending ?? 'hero',
      rated: !!ranked, stars: ranked ? ranked.map(r => r.change) : [null, null],
    });
    room.seats.forEach((p, i) => {
      if (!p.account) return;
      const out = accounts.recordOnline(p.account, {
        deckId: game.players[i].deckId, won: game.winner === i,
        damage: START_HP - Math.max(0, game.players[1 - i].hp),
      });
      if (out) send(p, { t: 'rewards', out, deckId: game.players[i].deckId, ranked: ranked?.[i] ?? null, rankedSkipped: !!room.ranked && !ranked });
    });
  }

  function forfeit(room, seatNo, why) {
    const game = room.game;
    if (!game || game.over || seatNo < 0) return;
    game.over = true;
    game.winner = 1 - seatNo;
    game.ending = why;
    const how = { disconnected: 'disconnected', inactive: 'stopped taking turns' }[why] ?? 'left';
    game.log.push({ turn: game.turn, text: `${game.players[seatNo].name} ${how} and forfeits.` });
    clearTimeout(room.timer);
    room.seats.forEach((p, i) => send(p, {
      t: 'update', actor: seatNo, action: null, forfeit: seatNo, clock: null, state: view(game, i), events: [],
    }));
    payOut(room);
    checkIdle();
  }

  // ------------------------------------------------------------ maintenance

  const running = () => [...rooms.values()].filter(r => r.game && !r.game.over).length;
  const noticeMsg = () => ({
    t: 'notice', kind: 'restart', until: closing.until,
    text: 'MetaDeck is restarting for an update. Matches in progress can finish; new ones start again in a few minutes.',
  });

  // Stop new matches, tell everyone, and call onIdle once no match is running (at the latest after
  // twice the warning time, so a stalled match can't hold the restart forever).
  function maintenance(minutes, onIdle) {
    if (closing) return false;
    const ms = Math.max(0, minutes) * 60_000;
    closing = { until: Date.now() + ms, onIdle, done: false };
    for (const p of [...queue]) { leave(p); send(p, { t: 'idle' }); }
    for (const room of [...rooms.values()]) if (!room.game) for (const p of [...room.seats]) { leave(p); send(p, { t: 'idle' }); }
    for (const p of players.values()) send(p, noticeMsg());
    closing.timer = setTimeout(guarded(() => finishClosing()), Math.max(ms * 2, 1000));
    checkIdle();
    return true;
  }
  function checkIdle() {
    if (closing && !closing.done && running() === 0) finishClosing();
  }
  function finishClosing() {
    if (!closing || closing.done) return;
    closing.done = true;
    clearTimeout(closing.timer);
    closing.onIdle?.();
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
    room.timer = setTimeout(guarded(() => {
      if (room.game !== game || game.over) return;
      apply(room, decisionPlayer(game), { type: game.pending ? 'pass' : 'end' }, { timeout: true });
    }), Math.max(0, ends - now));
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

  // What an opponent sees of a signed-in player: their title (Meta Founder #n) and the card frame they
  // use for the deck they brought.
  function showOff(p) {
    const profile = accounts && p.account ? accounts.profileFor(p.account) : null;
    return profile ? { title: founderTitle(profile.founder), frame: loadoutFor(profile, p.deck?.archetype).frame } : {};
  }

  const send = (player, msg) => { if (player?.ws?.open) player.ws.send(msg); };
  // Timers run outside any message handler; an exception there must not take the whole server down.
  const guarded = fn => () => { try { fn(); } catch (err) { console.error('lobby:', err); } };
  const opponentOf = (room, player) => room.seats.find(p => p !== player);

  function close() {
    shutDown = true;
    clearTimeout(closing?.timer);
    clearInterval(matcher);
    for (const room of rooms.values()) clearTimeout(room.timer);
    for (const p of players.values()) { clearTimeout(p.graceTimer); p.ws?.close(); }
    players.clear();
    perIp.clear();
    rooms.clear();
    queue.length = 0;
  }

  return { connect, close, maintenance, stats: () => ({ players: players.size, rooms: rooms.size, queue: queue.length, matches: running(), closing: !!closing }) };
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

export function cleanAction(raw) {
  if (!raw || typeof raw !== 'object' || !ACTIONS.has(raw.type)) return null;
  const action = { type: raw.type };
  if (Number.isInteger(raw.uid)) action.uid = raw.uid;
  if (Number.isInteger(raw.target) || (typeof raw.target === 'string' && /^P[01]$/.test(raw.target))) action.target = raw.target;
  if (raw.boost === true) action.boost = true;
  return action;
}

// A guest's chosen name, cleaned, or '' when it's empty or not allowed (server/names.mjs).
function guestName(raw) {
  const name = cleanName(raw);
  return name && !offensiveName(name) ? name : '';
}

// Names are shown to other players: no control, zero-width or text-direction characters (which can
// disguise one name as another or flip the text around it), and runs of spaces collapse to one.
function cleanName(raw) {
  if (typeof raw !== 'string') return '';
  return raw.slice(0, 200)
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f<>\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\uffa0]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX)
    .trim();
}

const randomSeed = () => crypto.randomBytes(4).readInt32LE(0);

function cryptoShuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
}
