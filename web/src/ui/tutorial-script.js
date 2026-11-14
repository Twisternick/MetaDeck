// The tutorial's script, kept apart from the screen so the tests can play it through the real engine
// (test/tutorial.test.mjs). Both decks are stacked and the enemy's moves are fixed, so each step happens
// on cue. A step is { text, button?, allow(action, state), refuse?, done(state), glow(state), when?(state) }:
// until done, only moves it allows are taken; `when` holds it back (the coach says the enemy is moving)
// until the game reaches it; `glow` lists what to light up (cards, 'hero:<pid>', or a CSS selector).

import { CARDS } from '../data/index.js';

export const ME = 0, AI = 1;
export const ENEMY_HP = 8;
// Decks are drawn from the end. You go first and draw 3: Rogue, Bolt, Potion Kit; then Squire, Knight, Map.
export const MY_DECK = [...Array(6).fill('RPG_S02_DungeonMap'), 'RPG_M09_QuestingKnight', 'RPG_M07_Squire', 'RPG_S03_PotionKit', 'RPG_S14_LightningBolt', 'RPG_M02_DungeonRogue'];
// The enemy draws 4: Bench Defender, Star Striker and two it never plays.
export const AI_DECK = [...Array(8).fill('SPO_M24_Linebacker'), 'SPO_M12_DefenseCoordinator', 'SPO_M05_StarStriker', 'SPO_M02_BenchDefender'];

const ROGUE = 'RPG_M02_DungeonRogue', BOLT = 'RPG_S14_LightningBolt', SQUIRE = 'RPG_M07_Squire', POTION = 'RPG_S03_PotionKit';
const BENCH = 'SPO_M02_BenchDefender', STRIKER = 'SPO_M05_StarStriker';

const inHand = (s, pid, id) => s.players[pid].hand.find(c => c.id === id);
const onBoard = (s, pid, id) => s.players[pid].board.find(m => m && m.id === id);
const name = id => CARDS[id].displayName;
const isPlay = (a, s, id) => (a.type === 'play' || a.type === 'respond') && s.players[ME].hand.find(c => c.uid === a.uid)?.id === id;
const attacksHero = (a, s, id) => a.type === 'attack' && a.target === 'P1' && s.players[ME].board.find(m => m && m.uid === a.uid)?.id === id;

// Each step: what to say, which of the player's moves it allows, when it's done, and what to light up.
export const STEPS = [
  {
    text: 'Welcome to MetaDeck! Each deck is a video game genre. You’re playing <b>RPG</b> against <b>Sports</b>. Bring the enemy hero’s HP to 0 to win — we’ve started them on 8 to keep this short.',
    button: 'Let’s go',
  },
  {
    text: `Drag <b>${name(ROGUE)}</b> from your hand onto the mat (or just click it). It costs 1 <b>Bandwidth</b> — the crystals on the right. You get one more every turn.`,
    allow: (a, s) => isPlay(a, s, ROGUE),
    done: s => !!onBoard(s, ME, ROGUE),
    glow: s => [inHand(s, ME, ROGUE)],
  },
  {
    text: 'A monster can’t attack on the turn it arrives. That’s all for this turn: press <b>End turn</b>.',
    allow: a => a.type === 'end',
    done: s => s.turn >= 2,
    glow: () => ['.end-turn'],
  },
  {
    text: `The enemy played <b>${name(BENCH)}</b>. It has <b>Guard</b>: your monsters must attack Guard monsters first. Blast it out of the way — drag <b>${name(BOLT)}</b> onto it.`,
    allow: (a, s) => isPlay(a, s, BOLT) && a.target === onBoard(s, AI, BENCH)?.uid,
    done: s => s.turn >= 3 && !onBoard(s, AI, BENCH),
    glow: s => [inHand(s, ME, BOLT), onBoard(s, AI, BENCH)],
    when: s => s.turn >= 3,
  },
  {
    text: `The way is clear. Drag <b>${name(ROGUE)}</b> onto the enemy hero to attack.`,
    allow: (a, s) => attacksHero(a, s, ROGUE),
    done: s => s.players[AI].hp <= ENEMY_HP - 2,
    glow: s => [onBoard(s, ME, ROGUE), 'hero:1'],
  },
  {
    text: `${name(ROGUE)} has <b>XP</b>: after each attack it survives it gets closer to leveling up. Hover any keyword to read it, or open <b>? Keywords</b>. Now end your turn.`,
    allow: a => a.type === 'end',
    done: s => s.turn >= 4,
    glow: () => ['.end-turn'],
  },
  {
    text: `Play <b>${name(SQUIRE)}</b>. It has Guard too, so enemies have to go through it. Keep 1 Bandwidth spare — you’ll see why.`,
    allow: (a, s) => isPlay(a, s, SQUIRE),
    done: s => !!onBoard(s, ME, SQUIRE),
    glow: s => [inHand(s, ME, SQUIRE)],
    when: s => s.turn >= 5,
  },
  {
    text: `Attack the enemy hero with <b>${name(ROGUE)}</b> again.`,
    allow: (a, s) => attacksHero(a, s, ROGUE),
    done: s => s.players[AI].hp <= ENEMY_HP - 4,
    glow: s => [onBoard(s, ME, ROGUE), 'hero:1'],
  },
  {
    text: 'Unspent Bandwidth isn’t wasted: it can pay for <b>Quick</b> cards during the enemy’s turn. End your turn.',
    allow: a => a.type === 'end',
    done: s => s.turn >= 6,
    glow: () => ['.end-turn'],
  },
  {
    text: `<b>${name(STRIKER)}</b> is attacking your Squire — 3 damage against 2 health! Answer with <b>${name(POTION)}</b>, a Quick card: drag it onto Squire.`,
    allow: (a, s) => a.type === 'respond' && isPlay(a, s, POTION) && a.target === onBoard(s, ME, SQUIRE)?.uid,
    refuse: 'Save your Squire: drag Potion Kit onto it.',
    done: s => !s.pending && !onBoard(s, AI, STRIKER),
    glow: s => [inHand(s, ME, POTION), onBoard(s, ME, SQUIRE)],
    when: s => !!s.pending && s.pending.responder === ME,
  },
  {
    text: 'Your Squire survived and took the attacker down with it. The enemy is nearly out of HP: attack the hero with <b>both</b> monsters to win!',
    allow: a => a.type === 'attack' ? a.target === 'P1' : a.type === 'play',
    refuse: 'Go for the enemy hero!',
    done: s => s.over,
    glow: s => [onBoard(s, ME, ROGUE), onBoard(s, ME, SQUIRE), 'hero:1'],
    when: s => s.turn >= 7,
  },
];

// The enemy's script: Bench Defender on its first turn, Star Striker on its second, then attack the Squire.
export function enemyMove(s) {
  const p = s.players[AI];
  if (s.pending) return { type: 'pass' };
  const play = id => { const c = inHand(s, AI, id); return c ? { type: 'play', uid: c.uid } : null; };
  if (s.turn === 2) return (!onBoard(s, AI, BENCH) && play(BENCH)) || { type: 'end' };
  if (s.turn === 4) return (!onBoard(s, AI, STRIKER) && play(STRIKER)) || { type: 'end' };
  if (s.turn === 6) {
    const striker = onBoard(s, AI, STRIKER), squire = onBoard(s, ME, SQUIRE);
    if (striker && squire && !striker.attacks && p.attacksThisTurn === 0) return { type: 'attack', uid: striker.uid, target: squire.uid };
  }
  return { type: 'end' };
}
