// vs-AI matches for signed-in players, checked by the server so a browser can't claim rewards for a
// match it didn't win.
//
// The match still runs in the browser (instant moves, no turn clock), but the server deals it:
//   POST /api/account/aistart { myDeck, myCards, oppDeck, oppCards } -> { ticket, seed, firstPlayer, difficulty }
// The browser creates its game with that seed and first player and keeps a list of the player's moves.
//   POST /api/account/aifinish { ticket, moves }                      -> { won, out } (the rewards)
// The server then plays the same match again: same decks, seed and first player, the player's moves in
// order, and the AI (src/engine/ai.js, deterministic for a given state) choosing every one of its own,
// at the difficulty the server picked (easy for an account's first few matches).
// The engine is deterministic too, so an honest list of moves reproduces the browser's game exactly;
// rewards are paid from the server's result, not the browser's. A list that makes an illegal move or
// stops before the game ends earns nothing.
//
// Each account has at most one ticket (starting a match replaces it) and it's used up by finishing.
// The seed tells the browser its own deck order, which a cheater could read, but they still have to
// actually beat the AI move by move, and vs-AI wins are capped by the daily Gold limit.

import crypto from 'node:crypto';
import { createGame, applyAction, decisionPlayer } from '../src/engine/game.js';
import { chooseAction, difficultyFor } from '../src/engine/ai.js';
import { getDeck, deckErrors } from '../src/data/index.js';
import { START_HP } from '../src/engine/constants.js';
import { missingCards } from '../src/data/economy.js';
import { logMatch } from './db.mjs';
import { cleanAction } from './lobby.mjs';

const TICKET_MS = 6 * 3_600_000;
const START_GAP_MS = 2_000;   // a new match per account at most this often
const MAX_MOVES = 3_000;      // the player's moves in one match
const MAX_STEPS = 20_000;     // all moves in one replay, the AI's included

const legal = (id, cards) => !!getDeck(id) && Array.isArray(cards) && cards.length <= 60
  && cards.every(c => typeof c === 'string') && deckErrors(id, cards).length === 0;

export function createAiMatches({ accounts, now = () => new Date() }) {
  const db = accounts.db;
  const q = {
    get: db.prepare('SELECT id, data, expires FROM tickets WHERE user = ?'),
    put: db.prepare(`INSERT INTO tickets (user, id, data, expires) VALUES (?, ?, ?, ?)
      ON CONFLICT(user) DO UPDATE SET id = excluded.id, data = excluded.data, expires = excluded.expires`),
    drop: db.prepare('DELETE FROM tickets WHERE user = ?'),
  };
  const lastStart = new Map(); // account key -> ms

  return {
    // Deal a match. Both decks must be legal, and the player's own deck owned by the account.
    start(account, body) {
      const { myDeck, myCards, oppDeck, oppCards } = body ?? {};
      if (!legal(myDeck, myCards) || !legal(oppDeck, oppCards)) return { ok: false, status: 400, reason: "That deck isn't legal." };
      const profile = accounts.profileFor(account);
      if (!profile) return { ok: false, status: 401, reason: 'Please sign in again.' };
      if (missingCards(profile, myCards).length) return { ok: false, status: 400, reason: "Your account doesn't own every card in that deck." };
      const t = now().getTime();
      if (t - (lastStart.get(account.key) ?? 0) < START_GAP_MS) return { ok: false, status: 429, reason: 'Slow down: starting matches too quickly.' };
      lastStart.set(account.key, t);
      const ticket = crypto.randomBytes(16).toString('base64url');
      const deal = { myDeck, myCards: [...myCards], oppDeck, oppCards: [...oppCards], seed: crypto.randomBytes(4).readInt32LE(0), firstPlayer: crypto.randomInt(2), started: t, difficulty: difficultyFor(profile.stats.games) };
      q.put.run(account.key, ticket, JSON.stringify(deal), t + TICKET_MS);
      return { ok: true, ticket, seed: deal.seed, firstPlayer: deal.firstPlayer, difficulty: deal.difficulty };
    },

    // Replay the finished match and pay out what the server's own replay says.
    finish(account, body) {
      const { ticket, moves } = body ?? {};
      const row = q.get.get(account.key);
      if (!row || typeof ticket !== 'string' || row.id !== ticket) return { ok: false, status: 400, reason: 'That match has expired.' };
      q.drop.run(account.key); // one try per ticket
      if (row.expires < now().getTime()) return { ok: false, status: 400, reason: 'That match has expired.' };
      if (!Array.isArray(moves) || moves.length > MAX_MOVES) return { ok: false, status: 400, reason: "That match doesn't add up." };
      const deal = JSON.parse(row.data);
      const result = replay(deal, moves);
      if (!result.ok) {
        console.error(`ai-match: replay rejected for ${account.name} (${deal.myDeck} vs ${deal.oppDeck}): ${result.reason}`);
        return { ok: false, status: 400, reason: "That match doesn't add up, so it wasn't recorded." };
      }
      const { game } = result;
      const won = game.winner === 0;
      const damage = START_HP - Math.max(0, game.players[1].hp);
      logMatch(db, {
        kind: 'ai', players: [account.key, null], decks: [deal.myDeck, deal.oppDeck], winner: game.winner,
        turns: game.turn, seconds: Math.round((now().getTime() - deal.started) / 1000), at: now(),
      });
      const out = accounts.recordResult(account, { deckId: deal.myDeck, won, damage, online: false });
      return out ? { ok: true, won, out } : { ok: false, status: 400, reason: 'Too many results too quickly.' };
    },
  };
}

// Play a dealt match again from the player's moves (seat 0) and the AI's own choices (seat 1).
// Returns { ok: true, game } once the game is over, or { ok: false, reason }.
export function replay({ myDeck, myCards, oppDeck, oppCards, seed, firstPlayer, difficulty = 'normal' }, moves) {
  const game = createGame({
    decks: [myCards, oppCards], deckIds: [myDeck, oppDeck],
    names: ['You', `${getDeck(oppDeck).name} AI`], firstPlayer, seed,
  });
  let next = 0;
  for (let step = 0; !game.over; step++) {
    if (step >= MAX_STEPS) return { ok: false, reason: 'too long' };
    let action;
    if (decisionPlayer(game) === 0) {
      if (next >= moves.length) return { ok: false, reason: `ended early after ${moves.length} moves` };
      action = cleanAction(moves[next++]);
      if (!action) return { ok: false, reason: `move ${next} is malformed` };
    } else {
      action = chooseAction(game, { difficulty });
      if (!action) return { ok: false, reason: 'the AI had no move' };
    }
    const res = applyAction(game, action);
    game.events.length = 0;
    if (!res.ok) return { ok: false, reason: `move ${next} was illegal: ${res.reason}` };
  }
  return { ok: true, game };
}
