# Balance notes

This is the balance pass that came with the move to the web. It covers every card in all ten decks.

## How it was balanced

1. **Every card now does something.** In the Unity build, many cards relied on keywords or effects that were never implemented (`Silence`, `Combo`, `Counter`, `Slipstream`, `Population`, `Errata`, `Copy`, `District`, `Momentum`, `Clutch`, `XP`, `SwapBoardPositions`, `RevealOpponentHand`, …), so those cards were plain stat sticks or did nothing at all. Every keyword and effect now has a defined rule (see *How to play* in the game, or `src/engine/constants.js`).
2. **The starting point was a stat budget.** A vanilla monster gets roughly `2 × cost + 1` total stats, and 1-drops get +1. Keywords and effects cost stats from that budget.
3. **Then the AI played it out.** `tools/simulate.mjs` plays an AI-vs-AI round robin between all ten decks. Its `--cards` flag reports each card's win rate when played. I also ran ablations: swap a single card for a vanilla 2/3 and measure how far the deck's win rate drops. That finds the cards that are actually carrying a deck. The process took five passes. The biggest problems were Platformer (77% at first, mostly from cheap Powered Up bodies), Fighting's uncapped Combo, and Horror and Strategy (both 36%).

## Result

13,500 AI-vs-AI games (300 per pairing, each deck going first half the time):

```
13500 games in 39.5s · avg length 18.7 turns · draws 0 · first player wins 51%

Deck            Win rate
RPG              54%  ██████████████████████
Sports           51%  ████████████████████
Platformer       51%  ████████████████████
Horror           51%  ████████████████████
Fighting         51%  ████████████████████
CardGame         49%  ████████████████████
Strategy         49%  ████████████████████
CityBuilder      49%  ████████████████████
Racing           49%  ███████████████████
FPS              47%  ███████████████████

Matchups (row deck's win rate vs column deck)
                FPS Horror Platfo    RPG Racing Fighti Sports Strate CityBu CardGa
FPS               ·    45%    54%    36%    51%    57%    46%    43%    45%    47%
Horror          55%      ·    46%    39%    54%    59%    54%    50%    55%    46%
Platformer      46%    54%      ·    54%    54%    46%    55%    46%    58%    47%
RPG             64%    61%    46%      ·    51%    44%    51%    59%    64%    43%
Racing          49%    46%    46%    49%      ·    43%    50%    50%    43%    61%
Fighting        43%    41%    54%    56%    57%      ·    52%    43%    53%    58%
Sports          54%    46%    45%    49%    50%    48%      ·    58%    52%    57%
Strategy        57%    50%    54%    41%    50%    57%    42%      ·    40%    50%
CityBuilder     55%    45%    42%    36%    57%    47%    48%    60%      ·    50%
CardGame        53%    54%    53%    57%    39%    42%    43%    50%    50%      ·
```

All ten decks finish between 47% and 54%, and the player going first wins 51% of games. Re-run it with `npm run simulate`. The AI is a greedy one-ply searcher, so these numbers measure balance *for that AI*. A human who plans combo turns or holds Quick cards on purpose will get more out of some decks (Fighting, Racing) than it does.

## Rule changes

- **Starting hands**: 3 cards going first, 4 going second (the C# default was 3 for both).
- **Quick cards** (hand traps) can respond to an enemy **attack**, paid with Bandwidth you left unspent on your own turn. Each attack gets one response, and the Unity engine's chain-depth/priority loop is simplified away. If the response removes, Stealths, bounces or Suppresses either combatant, the attack fizzles. The old "Quick responses must cost 0–1" cap is gone, since Bandwidth already limits them.
- **First Strike** always strikes first; it is no longer once per round. **Counter** is new: First Strike that only works when defending.
- **Haunt** now deals 2 damage to a random enemy monster when it dies. The old curse ticked for 1 at end of turn.
- **XP / Level Up** merged into one rule: a monster with XP gains 1 XP each time it attacks and survives, and any monster with 3 XP Levels Up for +2/+2. The separate `LevelUp` keyword is gone.
- **Combo** gives +1 ATK per other card played this turn, capped at +2.
- **Populate**, **Errata**, **Copy**, **Momentum**, **Clutch**, **Slipstream**, **Inspire** and **Tax** all have defined rules now.
- **Boost N** (Racing): spend N Nitro for a bonus effect. It replaces `SpendNitroForBuff` and the one-off "if Nitro ≥ 2" conditions.
- **Revive** returns your most recently destroyed monster at full stats. The old version picked the first card in the graveyard with −1/−1.
- **Triggers** are new: `Death`, `Turn start`, `Turn end`, `Whenever you draw` and `Whenever another friendly monster dies` (on-play was the only timing before). Most of the new cards use them.

## Card changes

Each archetype is now exactly 30 unique cards, and a deck is the whole archetype. That meant 10 new cards each for Fighting and Racing (which had 20), 5 for the 25-card decks, and 5 new FPS cards replacing 5 redundant ones (FPS already had 30). That's 60 new cards in total, marked 🆕 here and **NEW** in the game's gallery.

### 🎯 FPS

Stealthy openers, Suppression, and Headshot finishers on damaged targets.

| Card | Before | After |
|---|---|---|
| Sidearm Specialist | unchanged |  |
| Recon Rookie | unchanged |  |
| **Recon Drone** 🆕 | — | 1 · 1/1 · Drone, Stealth · Death: Draw a card. |
| Smoke Screen | 1 · Quick · GrantKeywordThisTurn → FriendlyMonster [Stealth] | 1 · Quick · Give a friendly monster Stealth this turn. |
| Suppressing Fire | 3 · Quick · RemoveKeywordThisTurn → EnemyMonster [FirstStrike]; DebuffAttackThisCombat 2 → EnemyMonster | 1 · Quick · Give an enemy monster -2 ATK this turn. |
| Smoke Runner | 1 · 1/3 · Stealth | 2 · 2/3 · Stealth |
| Shotgun Enforcer | unchanged |  |
| Combat Medic | 2 · 2/3 · Buff 1 → FriendlyMonster | 2 · 2/2 · Play: Give another friendly monster +1/+1. |
| Cover Engineer | unchanged |  |
| Drone Spotter | 2 · 2/2 · Drone · RevealOpponentHand 1 | 2 · 1/2 · Drone · Play: Draw a card. |
| Tactical Breacher | 2 · 2/3 · Rush | 2 · 2/2 · Rush |
| Flashbang | 2 · Silence → EnemyMonster | 2 · Deal 1 damage to an enemy monster. Suppress it. |
| Frag Grenade | 2 · DealDamageAllEnemyMonsters 1 | 2 · Deal 1 damage to all enemy monsters. |
| Armor Plates | 2 · Buff 1 → FriendlyMonster | 2 · Give a friendly monster +1/+2. |
| Headshot | 3 · DestroyDamaged → EnemyMonster (if TargetMustBeDamaged) | 2 · Destroy a damaged enemy monster. |
| UAV Scan | 5 · RevealOpponentHand 3 | 2 · All enemy monsters lose Stealth. Draw a card. |
| **Lock On** 🆕 | — | 2 · Deal 1 damage to an enemy monster. Draw a card. |
| Sniper Operative | 3 · 3/3 · First Strike | 3 · 2/2 · First Strike, Headshot |
| Suppression Gunner | 3 · 3/4 · Suppression | 3 · 2/4 · Suppression |
| Respawn Specialist | 3 · 2/4 · Draw 1 | 3 · 2/3 · Play: Draw a card. |
| Demolition Expert | 3 · 4/2 | 3 · 2/2 · Play: Deal 1 damage to all enemy monsters. |
| **Overwatch Sentry** 🆕 | — | 3 · 1/4 · Guard · Turn end: Deal 1 damage to a random enemy monster. |
| Shield-Bearer Unit | unchanged |  |
| **Breach Charger** 🆕 | — | 4 · 3/4 · Play: Deal 2 damage to an enemy monster. |
| Respawn Timer | 6 · ReviveFromGraveyard → CardInYourGraveyard | 4 · Revive your most recently destroyed monster. |
| Killstreak Ace | 5 · 5/4 · Rush | 5 · 4/4 · Rush |
| Drone Commander | 5 · 4/6 · Drone · Draw 1 | 5 · 3/5 · Drone · Play: Summon two 1/1 Drones. |
| Juggernaut Exo-Suit | 6 · 6/7 · Guard | 6 · 5/7 · Guard |
| **Airstrike** 🆕 | — | 6 · Deal 3 damage to all enemy monsters. |
| Titan Operator | 7 · 7/7 | 7 · 7/7 · Suppression |

Retired to make room: Training Bot (1 · 1/1), Elite Operator (4 · 4/4), Heavy Gunner (4 · 4/5), Tactical Reload (1), Killstreak (4).

### 👻 Horror

Fear weakens attackers, Haunt punishes removal, and the dead keep coming back.

| Card | Before | After |
|---|---|---|
| Panicked Civilian | unchanged |  |
| Possessed Vermin | unchanged |  |
| Grave Whisperer | 1 · 1/1 · Haunt | 1 · 1/2 · Haunt |
| **Blood Pact** 🆕 | — | 1 · Destroy a friendly monster. Draw 2 cards. |
| Jump Scare | 1 · Quick · DebuffAttackThisCombat 2 → EnemyMonster | 1 · Quick · Give an enemy monster -2 ATK this turn. |
| Flashlight Beam | 1 · DealDamage 1 → EnemyMonster | 1 · Deal 2 damage to an enemy monster. |
| Blood Trail | 2 · ReturnFromGraveyardToHand → CardInYourGraveyard | 1 · Return the last card in your graveyard to your hand. |
| Infected Host | 2 · 2/2 · Fear | 2 · 2/3 · Fear |
| Lone Survivor | 2 · 2/3 | 2 · 2/2 · Checkpoint |
| Shadow Stalker | 2 · 3/1 | 2 · 3/2 · Stealth |
| Safe Room Keeper | unchanged |  |
| Limited Supplies | 2 · DiscardRandom 1 → EnemyPlayer | 2 · Your opponent discards a random card. |
| Barricade | 2 · Buff 1 → FriendlyMonster | 2 · Give a friendly monster +0/+3 and Guard. |
| Panic | 3 · Quick · Silence → EnemyMonster | 2 · Quick · Silence an enemy monster. |
| Cursed Relic | 3 · GrantKeywordThisTurn → FriendlyMonster [Haunt] | 2 · Give a friendly monster +1/+1 and Haunt. |
| Possessed Doll | 3 · 2/3 · Haunt | 3 · 3/4 · Haunt |
| Relentless Pursuer | 3 · 3/4 | 3 · 3/3 · Fear, Checkpoint |
| Cult Devourer | 3 · 4/2 · Devour | 3 · 3/3 · Devour |
| **Bone Collector** 🆕 | — | 3 · 2/3 · Whenever another friendly monster dies, gain +1/+1. |
| Emergency Heal | 4 · Heal 4 → FriendlyPlayer | 3 · Restore 6 HP to you. |
| Grave Call | 5 · ReviveFromGraveyard → CardInYourGraveyard | 3 · Revive your most recently destroyed monster. |
| Last Bullet Guard | 4 · 2/6 · Guard | 4 · 3/6 · Guard |
| Nightmare Manifest | 4 · 4/4 · Fear | 4 · 5/5 · Fear |
| **Crypt Horde** 🆕 | — | 4 · 3/3 · Play: Summon two 1/1 Ghouls with Fear. |
| **Lights Out** 🆕 | — | 4 · Deal 1 damage to all enemy monsters. Give your monsters Fear. |
| Eldritch Abomination | 5 · 6/6 · Devour | 5 · 5/5 · Devour |
| Haunted Titan | 5 · 5/7 · Haunt | 5 · 4/6 · Haunt · Death: Summon a 1/1 Ghoul with Fear. |
| Night Falls | 6 · DealDamage 3 → EnemyPlayer; DealDamage 3 → EnemyMonster | 5 · Deal 2 damage to all enemy monsters. Deal 3 damage to the enemy player. |
| **Fog Lurker** 🆕 | — | 6 · 5/6 · Stealth, Haunt |
| Apex Nightmare | 7 · 8/8 · Fear | 7 · 7/8 · Fear, Devour |

### ⭐ Platformer

Hop over Guards with Double Jump and shrug off hits with Power-Ups and Checkpoints.

| Card | Before | After |
|---|---|---|
| Pixel Jumper | unchanged |  |
| Coin Collector | 1 · 2/1 | 1 · 2/1 · Death: Draw a card. |
| Bounce Pad | 1 · Quick · ReturnFromGraveyardToHand → CardInYourGraveyard | 1 · Quick · Return a friendly monster to its owner's hand. |
| Springboard | 3 · BuffAttackThisTurn 3 → FriendlyMonster | 1 · Give a friendly monster +2 ATK this turn. Give it Double Jump this turn. |
| Wall-Kick Specialist | unchanged |  |
| Speedrunner | unchanged |  |
| Hidden Path Scout | 2 · 2/2 · Draw 1 | 2 · 2/1 · Play: Draw a card. |
| Power-Up Carrier | 2 · 2/3 · Powered Up | 2 · 2/1 · Powered Up |
| Checkpoint Guardian | 2 · 1/4 · Guard | 2 · 1/3 · Guard, Checkpoint |
| **Treasure Chest** 🆕 | — | 2 · 0/3 · Guard · Death: Draw a card. |
| Double Jump | 1 · Quick · GrantKeywordThisTurn → FriendlyMonster [DoubleJump] | 2 · Give a friendly monster +1/+1 and Double Jump. |
| Checkpoint | 2 · GrantKeywordThisTurn → FriendlyMonster [Checkpoint] | 2 · Give a friendly monster Checkpoint. |
| Invincibility Star | 4 · Quick · PreventCombatDamageThisCombat → FriendlyMonster | 2 · Quick · Give a friendly monster Powered Up. |
| Airborne Ace | unchanged |  |
| Boss Door Sentinel | 3 · 3/4 · Guard | 3 · 2/5 · Guard |
| Springboard Trickster | 3 · 4/2 | 3 · 4/2 · Rush |
| **Extra Life Sprite** 🆕 | — | 3 · 2/1 · Checkpoint, Powered Up |
| Power-Up Mushroom | 2 · GrantKeywordThisTurn → FriendlyMonster [PoweredUp]; BuffAttackThisTurn 2 → FriendlyMonster | 3 · Give a friendly monster +1/+1 and Powered Up. |
| Warp Pipe | 3 · SwapBoardPositions → AnyMonster | 3 · Return a monster to its owner's hand. |
| Secret Area | 2 · Draw 2 | 3 · Draw 2 cards. |
| **Ground Pound** 🆕 | — | 3 · Deal 3 damage to an enemy monster. |
| Invincible Runner | 4 · 4/4 · Powered Up | 4 · 3/3 · Powered Up, Double Jump |
| Warp Pipe Hopper | 4 · 4/5 | 4 · 2/3 · Play: Return an enemy monster to its owner's hand. |
| Secret Stage Beast | 4 · 5/3 | 4 · 5/4 |
| One-Up | 5 · ReviveFromGraveyard → CardInYourGraveyard | 4 · Revive your most recently destroyed monster. |
| Final Level Hero | 5 · 6/6 · Checkpoint | 5 · 5/5 · Checkpoint |
| **Star Power** 🆕 | — | 5 · Give your monsters Powered Up. |
| **Speedrun Legend** 🆕 | — | 6 · 5/5 · Rush, Double Jump |
| Boss Key | 6 · Silence → EnemyMonster; DealDamage 4 → EnemyMonster | 6 · Destroy an enemy monster. |
| Final Boss | 7 · 8/8 · Guard | 7 · 6/7 · Guard, Checkpoint |

### ⚔️ RPG

Heroes earn XP in combat and Level Up; gear and spells make them legends.

| Card | Before | After |
|---|---|---|
| Level 1 Adventurer | unchanged |  |
| Dungeon Rogue | unchanged |  |
| Gain XP | 1 · GrantKeywordThisTurn → FriendlyMonster [XP] | 1 · Give a friendly monster 2 XP. |
| Dungeon Map | 1 · Draw 1 | 1 · Draw a card. |
| Potion Kit | 2 · Quick · Heal 3 → FriendlyMonster | 1 · Quick · Give a friendly monster +0/+2. |
| Party Healer | 2 · 1/3 · Heal 2 → FriendlyPlayer | 2 · 1/3 · Play: Restore 3 HP to you. |
| Shieldbearer | unchanged |  |
| Ranger Tracker | 2 · 2/2 · XP | 2 · 2/3 · XP |
| Arcane Scholar | 2 · 2/2 · Draw 1 | 2 · 2/2 · Play: Give another friendly monster 1 XP. |
| Squire | 2 · 2/3 | 2 · 2/2 · Guard, XP |
| **Mimic Chest** 🆕 | — | 2 · 2/3 · Devour |
| Equip Sword | 2 · Equip · Buff 1 → FriendlyMonster | 2 · Equip a friendly monster with +2/+1. |
| Mana Burst | 3 · GainMaxBandwidthNextTurn 1 → FriendlyPlayer | 2 · Gain an empty Bandwidth crystal. |
| Battle Mage | 3 · 3/3 | 3 · 3/3 · Play: Deal 1 damage to an enemy monster. |
| Questing Knight | unchanged |  |
| Loot Goblin | 3 · 3/2 · Draw 1 | 3 · 2/2 · Death: Draw 2 cards. |
| **Wandering Bard** 🆕 | — | 3 · 2/3 · Inspire |
| Side Quest | 2 · Draw 2 | 3 · Draw 2 cards. |
| Talent Point | 3 · Buff 2 → FriendlyMonster | 3 · Give a friendly monster +2/+2. Give it 1 XP. |
| **Enchant Armor** 🆕 | — | 3 · Equip a friendly monster with +0/+3 and Fortify. |
| Dragon Slayer | 4 · 5/4 · LevelUp | 4 · 4/3 · XP · Play: Gain 1 XP. |
| Guardian Golem | unchanged |  |
| Elite Ranger | 4 · 4/4 · XP | 4 · 4/4 · XP, First Strike |
| Revive Ally | 4 · ReviveFromGraveyard → CardInYourGraveyard | 4 · Revive your most recently destroyed monster. |
| Loot Drop | 5 · Draw 3 | 4 · Draw 3 cards. |
| **Fireball** 🆕 | — | 4 · Deal 5 damage to an enemy. |
| Legendary Hero | 5 · 6/6 · LevelUp | 5 · 5/4 · XP · Play: Gain 2 XP. |
| Final Boss Raid | 6 · DealDamage 6 → EnemyMonster | 5 · Deal 6 damage to an enemy monster. Give your monsters 1 XP. |
| Raid Boss (was Final Boss) | 7 · 8/8 · Guard | 7 · 7/8 · Guard |
| **Ancient Dragon** 🆕 | — | 8 · 7/7 · Play: Deal 2 damage to all enemy monsters. |

### 🏁 Racing

Bank Nitro, then spend it on Boost effects and Slipstream-powered rushers.

| Card | Before | After |
|---|---|---|
| Street Racer | unchanged |  |
| Pit Crew Intern | 1 · 1/3 · Buff 1 → FriendlyMonster | 1 · 1/2 · Play: Give another friendly monster +1/+1. |
| Nitro Boost | 1 · BuffAttackThisTurn 2 → FriendlyMonster | 1 · Give a friendly monster +2 ATK this turn. Gain 1 Nitro. |
| Hard Brake | 1 · Quick · DebuffAttackThisCombat 3 → AnyMonster | 1 · Quick · Give an enemy monster -2 ATK this turn. Gain 1 Nitro. |
| Drift Technician | unchanged |  |
| Nitro Scout | 2 · 2/2 · GainNitro 1 | 2 · 2/2 · Play: Gain 1 Nitro. |
| Drafting Specialist | 2 · 3/2 · Slipstream | 2 · 2/2 · Slipstream, Rush |
| **Rally Navigator** 🆕 | — | 2 · 1/3 · Turn start: Gain 1 Nitro. |
| **Pace Car** 🆕 | — | 2 · 1/3 · Guard · Death: Gain 2 Nitro. |
| Drafting Line | 2 · Draw 1; GainNitroIfAttackedThisTurn 1 | 2 · Draw a card. Gain 1 Nitro. |
| Engine Tune-Up | 2 · Buff 1 → FriendlyMonster | 2 · Give a friendly monster +1/+1. Boost 1: give it another +1/+1. |
| Pit Stop | 3 · HealToFull → FriendlyMonster | 2 · Quick · Fully heal a friendly monster. Give it +0/+2. |
| Sharp Turn | 3 · SwapBoardPositions → AnyMonster; Draw 1 | 2 · Suppress an enemy monster. Draw a card. |
| Turbo Charger | 4 · GrantRushThisTurn → FriendlyMonster; BuffAttackThisTurn 2 → FriendlyMonster | 2 · Give a friendly monster Rush this turn. Give it +2 ATK this turn. |
| **Nitro Injection** 🆕 | — | 2 · Gain 2 Nitro. Draw a card. |
| **Photo Finish** 🆕 | — | 2 · Quick · Deal 2 damage to an enemy monster. Boost 1: deal 2 more damage to it. |
| Slipstream Driver | 3 · 3/3 · Slipstream | 3 · 3/3 · Slipstream · Play: Gain 1 Nitro. |
| Shortcut Saboteur | 3 · 3/4 · Silence → EnemyMonster | 3 · 2/3 · Play: Silence an enemy monster. |
| **Burnout Specialist** 🆕 | — | 3 · 3/2 · Rush, Slipstream |
| **Stunt Driver** 🆕 | — | 3 · 3/3 · Overtake, Slipstream |
| Clean Lap | 4 · DestroyDamaged → EnemyMonster (if TargetMustBeDamaged) | 3 · Destroy a damaged enemy monster. |
| Overtake Champion | 4 · 4/4 · Overtake | 4 · 4/5 · Overtake |
| **Turbo Interceptor** 🆕 | — | 4 · 4/3 · Rush, Overtake |
| **Rival Racer** 🆕 | — | 4 · 4/4 · Play: Suppress an enemy monster. |
| Full Throttle | 5 · BuffAllRacingAttackThisTurn 2 | 4 · Give your monsters +2 ATK this turn. |
| Nitro Veteran | 5 · 5/5 · Nitro · GainNitro 1 | 5 · 4/5 · Slipstream · Play: Gain 2 Nitro. |
| **Rocket Dragster** 🆕 | — | 5 · 6/3 · Rush · Play: Boost 2: gain +2/+2. |
| Podium Finish | 6 · DealDamage 5 → EnemyPlayer (if AttackedThreeTimesThisTurn) | 5 · Deal 4 damage to the enemy player. Boost 2: deal 4 more damage. |
| **Hover Champion** 🆕 | — | 6 · 5/6 · Slipstream, Overtake · Turn end: Gain 1 Nitro. |
| Grand Prix Legend | 7 · 7/7 · Overtake · GainKeywordFirstStrikeIfNitro2 2 | 7 · 6/6 · Rush, Overtake · Play: Boost 2: gain +2/+2. |

### 🥊 Fighting

Chain cheap cards into big Combo turns; Counter fighters punish attackers.

| Card | Before | After |
|---|---|---|
| Arcade Brawler | unchanged |  |
| Hit-Confirm Rookie | 1 · 1/2 · Draw 1 (if CardsPlayedAtLeast1ThisTurn) | 1 · 1/2 · Play: If you've played another card this turn, draw a card. |
| **Dojo Student** 🆕 | — | 1 · 1/2 · Combo |
| Perfect Block | 1 · Quick · PreventCombatDamageThisCombat → FriendlyMonster | 1 · Quick · Give a friendly monster Powered Up. |
| Wake-Up Reversal | 1 · Quick · GrantKeywordThisCombat → FriendlyMonster [Counter] | 1 · Quick · Give a friendly monster +2 ATK this turn. Give it Counter this turn. |
| Chain Combo | 2 · BuffAttackThisTurn 2 → FriendlyMonster | 1 · Give a friendly monster +2 ATK this turn. If you've played another card this turn, draw a card. |
| Training Mode | 2 · Draw 1 | 1 · Draw a card. |
| Frame-Perfect Striker | unchanged |  |
| Counter Specialist | 2 · 1/4 · Counter | 2 · 2/3 · Counter |
| **Footsies Expert** 🆕 | — | 2 · 3/2 · Counter |
| Whiff Punish | 2 · DestroyDamaged → EnemyMonster (if TargetMustBeDamaged) | 2 · Quick · Destroy a damaged enemy monster. |
| Corner Pressure | 3 · BuffAllFightingAttackThisTurn 1 | 2 · Give your monsters +1 ATK this turn. Draw a card. |
| Guard Break | 3 · Silence → EnemyMonster | 2 · Silence an enemy monster. |
| **Burst** 🆕 | — | 2 · Quick · Deal 2 damage to an enemy monster. |
| **Frame Trap** 🆕 | — | 2 · Quick · Give an enemy monster -2 ATK this turn. Suppress it. |
| Combo Extender | 3 · 3/3 · Combo | 3 · 2/4 · Combo |
| Stance Switcher | 3 · 2/4 · GrantKeywordThisTurn → Self [FirstStrike] | 3 · 3/3 · First Strike · Play: If you've played another card this turn, gain +1/+1. |
| **Rushdown Specialist** 🆕 | — | 3 · 3/2 · Rush, Combo |
| **Projectile Zoner** 🆕 | — | 3 · 2/3 · Turn end: Deal 1 damage to a random enemy monster. |
| **Tag Partner** 🆕 | — | 3 · 2/2 · Play: Summon a 2/1 Assist Fighter with Rush. |
| Super Meter Burst | 4 · DealDamage 4 → EnemyMonster (if CardsPlayedAtLeast3ThisTurn) | 3 · Deal 3 damage to an enemy monster. If you've played 2+ other cards this turn, deal 2 more damage to it. |
| Rage Activation | 5 · GrantKeywordAllFightingThisTurn [Combo] | 3 · Give your monsters Combo. Give your monsters +1 ATK this turn. |
| Grapple Technician | 4 · 3/5 · Silence → EnemyMonster | 4 · 3/4 · Counter · Play: Suppress an enemy monster. |
| Air-Juggle Ace | 4 · 4/3 · Combo | 4 · 4/3 · Combo, Rush |
| **Shoto Master** 🆕 | — | 4 · 3/3 · Play: Deal 2 damage to an enemy monster. |
| Sudden Death | 6 · DealDamage 5 → FriendlyPlayer; DealDamage 5 → EnemyPlayer | 4 · Deal 5 damage to you. Deal 5 damage to the enemy player. |
| **Super Art** 🆕 | — | 4 · Deal 5 damage to an enemy monster. If you've played 2+ other cards this turn, draw a card. |
| Super Meter Veteran | 5 · 5/5 · BuffAttackThisTurn 2 → Self (if CardsPlayedAtLeast3ThisTurn) | 5 · 5/5 · Combo · Play: If you've played 2+ other cards this turn, gain Rush this turn. |
| **Grand Master** 🆕 | — | 6 · 5/5 · First Strike, Inspire |
| Final Round Champion | 7 · 7/7 · First Strike · DealDamage 3 → EnemyPlayer (if CardsPlayedAtLeast3ThisTurn) | 7 · 7/7 · First Strike · Play: If you've played 2+ other cards this turn, deal 3 damage to the enemy player. |

### 🏆 Sports

Go wide, keep Momentum rolling, and turn it around in the Clutch.

| Card | Before | After |
|---|---|---|
| Rookie Prospect | unchanged |  |
| Bench Defender | 1 · 1/2 | 1 · 1/3 · Guard |
| Fast Break | 1 · GrantKeywordThisTurn → FriendlyMonster [Rush] | 1 · Give a friendly monster Rush this turn. Give it +1 ATK this turn. |
| Pep Talk | 2 · Draw 1 | 1 · Draw a card. |
| Power Play | 2 · BuffAttackThisTurn 3 → FriendlyMonster | 1 · Give a friendly monster +3 ATK this turn. |
| Timeout | 1 · Quick · DebuffAttackThisCombat 2 → EnemyMonster | 1 · Quick · Suppress an enemy monster. |
| Clutch Moment | 6 · BuffAttackThisTurn 4 → FriendlyMonster | 1 · Draw a card. If your HP is lower than your opponent's, draw a card. |
| Playmaker | 2 · 2/2 · Momentum | 2 · 2/2 · Play: Give another friendly monster +1/+1. |
| Defensive Wall | unchanged |  |
| Star Striker | unchanged |  |
| **Team Mascot** 🆕 | — | 2 · 2/2 · Play: Summon a 1/1 Benchwarmer with Momentum. |
| Defensive Formation | 3 · Buff 1 → FriendlyMonster | 2 · Give your monsters +0/+2. |
| Injury Reserve | 3 · Silence → EnemyMonster | 2 · Silence an enemy monster. |
| Team Synergy | 2 · BuffAllFriendlyMonsters 1 | 2 · Give your monsters +1/+1. |
| Team Captain | 2 · 2/3 | 3 · 2/3 · Inspire |
| Goalkeeper Anchor | 2 · 1/5 · Guard | 3 · 1/6 · Guard |
| Clutch Specialist | 3 · 3/3 · Clutch | 3 · 3/4 · Clutch |
| Power Forward | 3 · 4/3 | 3 · 4/3 · Momentum |
| Veteran Coach | 3 · 2/5 | 3 · 1/4 · Turn end: Give another random friendly monster +1/+1. |
| Comeback Season | 4 · Heal 5 → FriendlyPlayer | 3 · Restore 5 HP to you. If your HP is lower than your opponent's, draw a card. |
| **Halftime Speech** 🆕 | — | 3 · Give your monsters +1 ATK this turn. Draw a card. |
| MVP Contender | 4 · 4/4 · Momentum | 4 · 4/4 · Momentum, Rush |
| Defense Coordinator | unchanged |  |
| Overtime Runner | unchanged |  |
| **Star Quarterback** 🆕 | — | 4 · 3/4 · Play: Give your other monsters +1/+1. |
| Overtime Push | 5 · BuffAllFriendlyMonsters 2 | 4 · Give your monsters +2/+2. |
| MVP Legend | 5 · 6/6 · Clutch | 5 · 5/6 · Clutch, Momentum |
| **Hat-Trick Hero** 🆕 | — | 5 · 5/5 · Momentum · Turn end: If you've attacked 3+ times this turn, draw a card. |
| **Red Card** 🆕 | — | 5 · Destroy an enemy monster. |
| Hall of Famer | 7 · 8/8 · Momentum | 7 · 7/7 · Inspire |

### ♟️ Strategy

Ramp your Bandwidth behind Fortified walls, then let Structures grind the enemy down.

| Card | Before | After |
|---|---|---|
| Scout Unit | 1 · 2/1 | 1 · 2/1 · Stealth |
| Economy Aide | unchanged |  |
| Fog of War | 1 · Quick · RemoveKeywordThisTurn → EnemyMonster [Stealth] | 1 · Quick · Give a friendly monster Stealth this turn. |
| Trade Agreement | 1 · Draw 1 | 1 · Draw a card. |
| Defensive Engineer | 2 · 1/4 · Fortify | 2 · 1/3 · Guard, Fortify |
| Tech Researcher | 2 · 2/2 · Draw 1 | 2 · 1/2 · Play: Draw a card. |
| Expansion Settler | 2 · 2/3 · Generate | 2 · 2/2 · Generate |
| Structure Wall | 3 · 0/7 · Guard, Structure | 2 · 0/6 · Guard, Structure |
| Build Structure | 2 · SummonToken | 2 · Summon a 0/4 Barricade with Guard and Structure. |
| Fortify Position | 2 · Buff 2 → FriendlyMonster | 2 · Give a friendly monster +0/+2 and Fortify. |
| Counter-Intel | 3 · Quick · Silence → EnemyMonster | 2 · Quick · Silence an enemy monster. |
| **Supply Lines** 🆕 | — | 2 · Gain an empty Bandwidth crystal. If you control a Structure, draw a card. |
| Supply Officer | 2 · 2/3 | 3 · 2/3 · Play: Gain an empty Bandwidth crystal. |
| Diplomacy Envoy | 3 · 2/4 | 3 · 2/3 · Play: Suppress an enemy monster. |
| Siege Commander | 3 · 4/3 | 3 · 3/3 · Play: Deal 1 damage to an enemy monster. |
| War Planner | 3 · 3/3 | 3 · 2/3 · Inspire |
| **Command Tent** 🆕 | — | 3 · 0/5 · Structure · Turn end: Give another random friendly monster +1/+1. |
| Forward Base | 4 · 2/8 · Guard, Structure | 3 · 0/6 · Guard, Structure · Turn start: Summon a 2/1 Soldier. |
| **Artillery Battery** 🆕 | — | 3 · 0/5 · Structure · Turn end: Deal 2 damage to a random enemy monster. |
| Research Breakthrough | 2 · Draw 2 | 3 · Draw 2 cards. |
| Mobilize Army | 3 · SummonToken | 3 · Summon two 2/1 Soldiers. |
| Economic Boom | 5 · GainMaxBandwidthNextTurn 2 → FriendlyPlayer | 3 · Gain 2 empty Bandwidth crystals. |
| Grand Tactician | 4 · 4/5 | 4 · 4/4 · Play: Give another friendly monster Fortify. |
| Counter-Intel Chief | 4 · 3/5 | 4 · 3/4 · Play: Silence an enemy monster. |
| Upgrade Tree | 4 · BuffAllFriendlyMonsters 1 | 4 · Give your monsters +1/+1. Draw a card. |
| **Scorched Earth** 🆕 | — | 4 · Deal 2 damage to all enemy monsters. |
| War Council Chair | 5 · 5/7 · Fortify | 5 · 5/6 · Fortify |
| **Siege Tower** 🆕 | — | 5 · 3/5 · Fortify · Play: Deal 2 damage to an enemy monster. |
| Total War Doctrine | 6 · BuffAllFriendlyMonsters 2 | 6 · Summon two 2/1 Soldiers. Give your monsters +2/+2. |
| Total War Engine | 7 · 8/9 · Structure | 7 · 0/9 · Guard, Structure · Turn end: Deal 2 damage to a random enemy monster. Deal 2 damage to the enemy player. |

### 🏙️ City Builder

Populate the board with Citizens, Tax enemy spells, and reward Districts.

| Card | Before | After |
|---|---|---|
| Town Architect | 1 · 1/2 · District | 1 · 1/3 · District |
| Tax Clerk | 1 · 1/1 · Tax | 1 · 1/2 · Tax |
| **Street Vendor** 🆕 | — | 1 · 1/1 · Play: Summon a 1/1 Citizen. |
| Zoning Law | 1 · Quick · Silence → EnemyMonster | 1 · Quick · Suppress an enemy monster. |
| Trade Route | 1 · Draw 1 | 1 · Draw a card. If you control a District, draw a card. |
| Construct District | 2 · SummonToken | 1 · Summon a 0/3 District Block with Guard and District. |
| Utility Engineer | 2 · 2/3 | 2 · 2/2 · Play: If you control a District, draw a card. |
| Housing Planner | 2 · 1/4 · Population | 2 · 2/2 · Populate |
| Trade Merchant | 2 · 2/2 · Draw 1 | 2 · 1/2 · Play: Draw a card. |
| District Inspector | unchanged |  |
| **Commuter** 🆕 | — | 2 · 2/1 · Rush · Death: Summon a 1/1 Citizen. |
| Tax Hike | 2 · DiscardRandom 1 → EnemyPlayer | 2 · Your opponent discards a random card. |
| **Census** 🆕 | — | 2 · Draw a card. Summon a 1/1 Citizen. |
| Public Works | 2 · BuffAllFriendlyMonsters 1 | 2 · Give your monsters +1/+1. |
| Infrastructure Overseer | 3 · 3/4 | 3 · 3/3 · Turn end: If you control a District, give another random friendly monster +1/+1. |
| Public Safety Chief | unchanged |  |
| Festival Organizer | 3 · 3/3 · Population | 3 · 2/2 · Play: Summon two 1/1 Citizens. |
| Zoning Officer | unchanged |  |
| Emergency Services | 3 · Heal 4 → FriendlyPlayer | 3 · Restore 4 HP to you. Summon a 1/1 Citizen. |
| Urban Expansion | 3 · GainMaxBandwidthNextTurn 1 → FriendlyPlayer | 3 · Gain an empty Bandwidth crystal. Summon a 1/1 Citizen. |
| Industrial Boom | 4 · Draw 2 | 3 · Draw 2 cards. |
| **Eminent Domain** 🆕 | — | 3 · Destroy a damaged enemy monster. Summon a 1/1 Citizen. |
| City Wall District | 4 · 0/9 · Guard, District | 4 · 0/8 · Guard, District |
| City Hall Administrator | 4 · 4/5 | 4 · 3/4 · Turn start: Summon a 1/1 Citizen. |
| Metropolis Guardian | 4 · 5/5 · Guard | 4 · 4/5 · Guard |
| Landmark Titan | 5 · 6/8 · District | 5 · 5/6 · District |
| **Mayor** 🆕 | — | 5 · 4/5 · Inspire |
| Golden Age | 5 · BuffAllFriendlyMonsters 2 | 5 · Give your monsters +2/+2. |
| Landmark Construction | 6 · SummonToken | 6 · Summon a 6/8 Landmark with Guard and District. |
| Urban Colossus | 7 · 9/9 · Population | 7 · 6/6 · Play: Summon four 1/1 Citizens. |

### 🃏 Card Game

A card game about card games: draw piles of cards, grow Topdeckers, Errata the rules.

| Card | Before | After |
|---|---|---|
| Draw Card | unchanged |  |
| Token Summon | 1 · 1/1 | 1 · 1/1 · Play: Summon a 1/1 Proxy. |
| Mulligan | 1 · Draw 2 | 1 · Discard a random card. Draw 2 cards. |
| Hand Reveal | 1 · RevealOpponentHand 99 | 1 · Reveal your opponent's hand this turn. Draw a card. |
| Search Card | 2 · Draw 1 | 1 · Draw a card. |
| Monster Card | unchanged |  |
| Wild Card | 2 · 3/2 · Errata | 2 · 2/1 · Errata |
| Reverse Card | unchanged |  |
| Sleeve Guardian | 2 · 1/5 · Guard | 2 · 0/4 · Guard, Powered Up |
| Discard Card | 2 · Quick · DiscardRandom 1 → EnemyPlayer | 2 · Quick · Your opponent discards a random card. |
| Copy Card | 3 · Quick · GrantKeywordThisTurn → FriendlyPlayer [Copy] | 2 · Copy a random card in your hand. |
| Deckbox Mimic | 3 · 3/3 · Copy | 3 · 3/4 · Copy |
| Foil Showcase | unchanged |  |
| Rule Reminder | 3 · 3/4 | 3 · 2/3 · Errata |
| Rare Card | 3 · 4/3 | 3 · 4/2 · Death: Draw a card. |
| **Card Shark** 🆕 | — | 3 · 2/3 · Whenever you draw a card, deal 1 damage to a random enemy monster. |
| **Booster Pack** 🆕 | — | 3 · 1/3 · Guard · Death: Draw 2 cards. |
| Shuffle Deck | 2 · ShuffleGraveyardIntoDeck → FriendlyPlayer | 3 · Shuffle your graveyard into your deck. Draw 2 cards. |
| Errata | 3 · GrantKeywordThisTurn → FriendlyMonster [Errata]; Buff 1 → FriendlyMonster | 3 · Silence a monster. Draw a card. |
| Sideboard Swap | 5 · ReturnFromGraveyardToHand → CardInYourGraveyard; Draw 1 | 3 · Return the last card in your graveyard to your hand. Draw a card. |
| **Proxy Swarm** 🆕 | — | 3 · Summon three 1/1 Proxies. |
| Topdeck | 4 · Draw 2 | 3 · Draw 3 cards. |
| Reprint Beast | 4 · 4/5 | 4 · 4/4 · Copy |
| Combo Piece | 4 · 5/4 · Copy | 4 · 4/4 · Play: Draw a card. |
| Banned Card | 4 · 3/6 · Errata | 4 · 6/6 · Turn start: Discard a random card. |
| **Judge** 🆕 | — | 4 · 3/5 · Guard, Errata |
| Reprint | 6 · ReviveFromGraveyard → CardInYourGraveyard | 4 · Revive your most recently destroyed monster. |
| Sideboard Specialist | 5 · 5/7 | 5 · 4/5 · Play: Draw 2 cards. |
| **Ban Hammer** 🆕 | — | 5 · Destroy an enemy monster. |
| Tournament Winner | 7 · 8/9 · Topdeck | 6 · 6/6 · Topdeck · Play: Draw 2 cards. |
