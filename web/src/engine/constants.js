// Core rule constants and the keyword glossary. Pure data, shared by engine, UI and tools.

export const START_HP = 35;
export const BOARD_SLOTS = 5;
export const MAX_HAND = 10;
export const MAX_BANDWIDTH = 10;
export const OPENING_HAND = [3, 4]; // [going first, going second]
export const TURN_LIMIT = 90; // safety valve: a match this long is declared a draw

export const LEVEL_UP_XP = 3;
export const LEVEL_UP_BONUS = 2;

// House Rules (RULES below): one at a time, shared by both players, for RULE_TURNS turns after the one
// it's played on, so the opponent plays under it twice and its caster once more.
export const RULE_TURNS = 3;
export const LIMITED_BOARD = 4;
export const PAUPER_MAX_COST = 4;
export const RULE_HAND = 12;

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
  XP: { name: 'Battle Training', text: 'Each time this monster attacks and survives, it gains 1 XP.' },
  Momentum: { name: 'Momentum', text: "Has +1 ATK if you've already attacked this turn." },
  Clutch: { name: 'Clutch', text: "Has +2 ATK while your HP is lower than your opponent's." },
  Combo: { name: 'Combo', text: "Has +1 ATK for each other card you've played this turn (max +2)." },
  Structure: { name: 'Structure', text: "Can't attack." },
  Fortify: { name: 'Fortify', text: 'Takes 1 less damage from each source.' },
  Generate: { name: 'Generate', text: 'At the start of your turn, gain 1 temporary Bandwidth.' },
  District: { name: 'District', text: 'A city district. Some cards get stronger if you control one.' },
  Tax: { name: 'Tax', text: 'Enemy spells cost 1 more.' },
  Populate: { name: 'Populate', text: 'When played, summon a 1/1 Citizen.' },
  Topdeck: { name: 'Topdeck', text: "Whenever you draw an extra card (not your turn's normal draw), this gains +1/+1." },
  JudgeCall: { name: 'Judge Call', text: 'When played, Silence a random enemy monster.' },
  Copy: { name: 'Copy', text: 'When played, shuffle a copy of this into the top 3 cards of your deck.' },
  Overtake: { name: 'Overtake', text: 'After this attacks and survives, gain 1 Nitro.' },
  Slipstream: { name: 'Slipstream', text: 'Has +1 ATK while you have any Nitro.' },
  Inspire: { name: 'Inspire', text: 'Your other monsters have +1 ATK.' },
};

// Terms that appear in rules text and deserve a tooltip.
export const TERMS = {
  'Level Up': `Any monster can gain XP from card effects. For every ${LEVEL_UP_XP} XP it earns, it gains +${LEVEL_UP_BONUS}/+${LEVEL_UP_BONUS}.`,
  Silence: 'Removes all keywords, buffs and card text from a monster.',
  Suppress: "The monster can't attack on its controller's next turn.",
  Boost: 'Optional: when you play this, you may spend that much Nitro to get the extra effect. Needs enough Nitro.',
  Nitro: 'A Racing resource. Stays until spent.',
  Bandwidth: 'Spent to play cards. Max goes up by 1 each turn (up to 10) and refills at the start of your turn. Unspent Bandwidth can pay for Quick cards on the enemy turn.',
  Quick: 'Can also be played from your hand in response to an enemy attack.',
  Revive: 'Return your most recently destroyed monster to the board (it is summoned fresh, without its When-played effects).',
  Errata: "Rewrites a monster's printed stats: its current Attack becomes its Health and its current Health becomes its Attack. Buffs and damage are folded in, so a 0-Attack monster dies.",
  'Alt Art': "Rewrites the cards in your hand: each monster's cost and Attack trade places until it's played.",
  'House Rule': `Changes the rules for both players for the next ${RULE_TURNS} turns. Only one House Rule is in play at a time: a new one replaces it.`,
  Objection: 'The next spell that player casts is paid for, then does nothing.',
  Typo: "A misprinted price: the card costs 1 more until it's played.",
  Exile: "Gone for good: not in the graveyard, so it can't be revived or returned.",
};

// The House Rules a card can put in play, by id. The engine applies each one (game.js).
export const RULES = {
  LimitedFormat: { name: 'Limited Format', icon: '📏', text: `Boards hold only ${LIMITED_BOARD} monsters.` },
  PauperFormat: { name: 'Pauper Format', icon: '🪙', text: `Cards costing ${PAUPER_MAX_COST + 1} or more can't be played.` },
  ErrataWeek: { name: 'Errata Week', icon: '📝', text: 'The most common keyword on the enemy board stops working for every monster.' },
  DraftNight: { name: 'Draft Night', icon: '🎲', text: 'Both players draw an extra card at the start of their turns.' },
  BalancePatch: { name: 'Balance Patch', icon: '🩹', text: 'At the start of each turn, the strongest monster gets -1 Attack and the weakest gets +1 Attack.' },
  HandSize: { name: 'Hand Size Errata', icon: '🗂️', text: `Hands hold up to ${RULE_HAND} cards. Monsters have +1 Attack while their owner holds more cards than the opponent.` },
};
// Keywords that only do something as the monster is played; Errata Week never picks these.
export const ON_PLAY_KEYWORDS = new Set(['Populate', 'JudgeCall', 'Copy']);

export const TRIGGERS = ['play', 'death', 'turnStart', 'turnEnd', 'draw', 'allyDeath'];

// Targetings the player chooses (one shared choice per card).
export const CHOSEN_TARGETINGS = new Set([
  'EnemyMonster', 'FriendlyMonster', 'OtherFriendlyMonster', 'AnyMonster', 'EnemyCharacter',
]);
