// Core rule constants and the keyword glossary. Pure data, shared by engine, UI and tools.

export const START_HP = 30;
export const BOARD_SLOTS = 5;
export const MAX_HAND = 10;
export const MAX_BANDWIDTH = 10;
export const OPENING_HAND = [3, 4]; // [going first, going second]
export const TURN_LIMIT = 90; // safety valve: a match this long is declared a draw

export const LEVEL_UP_XP = 3;
export const LEVEL_UP_BONUS = 2;

// Keywords: rules live in game.js; `text` is the player-facing reminder.
export const KEYWORDS = {
  Rush: { name: 'Rush', text: 'Can attack the turn it is summoned.' },
  Guard: { name: 'Guard', text: 'Enemies must attack Guard monsters first.' },
  FirstStrike: { name: 'First Strike', text: 'Deals its combat damage first.' },
  Counter: { name: 'Counter', text: 'Deals its combat damage first when it is attacked.' },
  Stealth: { name: 'Stealth', text: "Can't be attacked or targeted by enemy effects until it attacks." },
  Suppression: { name: 'Suppression', text: "Monsters damaged by this can't attack on their next turn." },
  Headshot: { name: 'Headshot', text: 'Attacking a damaged monster destroys it outright, with no retaliation.' },
  Drone: { name: 'Drone', text: 'A drone unit. (No rules of its own.)' },
  Fear: { name: 'Fear', text: 'When this attacks a monster, that monster gets -1 ATK this turn first.' },
  Haunt: { name: 'Haunt', text: 'When this dies, deal 2 damage to a random enemy monster.' },
  Devour: { name: 'Devour', text: 'After this kills a monster by attacking, it gains +1/+1.' },
  DoubleJump: { name: 'Double Jump', text: 'Can attack past Guard monsters.' },
  PoweredUp: { name: 'Powered Up', text: 'Prevents the next damage this would take, then is lost.' },
  Checkpoint: { name: 'Checkpoint', text: 'The first time this would die, it survives with 1 health instead.' },
  XP: { name: 'XP', text: `After this attacks and survives, it gains 1 XP. At ${LEVEL_UP_XP} XP a monster Levels Up: +${LEVEL_UP_BONUS}/+${LEVEL_UP_BONUS}.` },
  Momentum: { name: 'Momentum', text: "Has +1 ATK if you've already attacked this turn." },
  Clutch: { name: 'Clutch', text: "Has +2 ATK while your HP is lower than your opponent's." },
  Combo: { name: 'Combo', text: "Has +1 ATK for each other card you've played this turn (max +2)." },
  Structure: { name: 'Structure', text: "Can't attack." },
  Fortify: { name: 'Fortify', text: 'Takes 1 less damage from each source.' },
  Generate: { name: 'Generate', text: 'At the start of your turn, gain 1 temporary Bandwidth.' },
  District: { name: 'District', text: 'A city district. Some cards get stronger if you control one.' },
  Tax: { name: 'Tax', text: 'Enemy spells cost 1 more.' },
  Populate: { name: 'Populate', text: 'When summoned, summon a 1/1 Citizen.' },
  Topdeck: { name: 'Topdeck', text: 'Whenever you draw a card, this gains +1/+1.' },
  Errata: { name: 'Errata', text: 'When summoned, Silence a random enemy monster.' },
  Copy: { name: 'Copy', text: 'When summoned, shuffle a copy of this into your deck.' },
  Overtake: { name: 'Overtake', text: 'After this attacks and survives, gain 1 Nitro.' },
  Slipstream: { name: 'Slipstream', text: 'Has +1 ATK while you have any Nitro.' },
  Inspire: { name: 'Inspire', text: 'Your other monsters have +1 ATK.' },
};

// Terms that appear in rules text and deserve a tooltip.
export const TERMS = {
  Silence: 'Removes all keywords, buffs and card text from a monster.',
  Suppress: "The monster can't attack on its controller's next turn.",
  Boost: 'Spend that much Nitro to get the extra effect. Skipped if you don\'t have enough.',
  Nitro: 'A Racing resource. Stays until spent.',
  Bandwidth: 'Spent to play cards. Max goes up by 1 each turn (up to 10) and refills at the start of your turn. Unspent Bandwidth can pay for Quick cards on the enemy turn.',
  Quick: 'Can also be played from your hand in response to an enemy attack.',
  Revive: 'Return your most recently destroyed monster to the board (it is summoned fresh).',
};

export const TRIGGERS = ['play', 'death', 'turnStart', 'turnEnd', 'draw', 'allyDeath'];

// Targetings the player chooses (one shared choice per card).
export const CHOSEN_TARGETINGS = new Set([
  'EnemyMonster', 'FriendlyMonster', 'OtherFriendlyMonster', 'AnyMonster', 'EnemyCharacter',
]);
