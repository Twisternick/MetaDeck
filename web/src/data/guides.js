// How to play each genre and each of its starter lists: the written guides on the public deck pages
// (server/pages.mjs). Per genre: how it plays, general tips and what beats it. Per starter list (keyed by
// the list's name in starters.js): its plan, early/middle/late turns, key cards and tips.
// [M14] names a card of that genre by its code (the middle part of its cardId) and is shown as the card's
// name, so a renamed card never leaves a guide pointing at an old name. test/pages.test.mjs checks that
// every code exists, and that a list's guide only names cards in that list. Keep rules claims exact (they
// were checked against engine/game.js), and stay off matchup numbers: the pages show those from the meta.

export const GUIDES = {
  FPS: {
    plan: 'FPS trades up. Chip enemy monsters for 1 damage, then remove them with Headshot effects that ignore how big they are. Stealth gets your attackers to the right target, and Suppression keeps the enemy’s best monster out of the fight for a turn. You rarely need the biggest monster on the board: you need a damaged target and a Headshot ready.',
    tips: [
      'Damage from any source counts as “damaged”. [S04] sets up a Headshot on every enemy monster at once.',
      'Ping the biggest target, not the smallest. Headshot ignores size, so put the damage on the 6-health Guard.',
      'Stealth ends when the monster attacks, so make its first hit count.',
      '[S07] is Quick: leave 1 Bandwidth open and use it on the turn the enemy swings with its biggest monster.',
    ],
    against: 'Fortify (1 less damage from each source) and Powered Up shields stop pings from leaving damage, which turns off Headshot. Silence removes Headshot from your attackers. Walls of high-health Guards make you spend two cards per kill.',
    lists: {
      'Blitz Squad': {
        plan: 'Play a monster every turn from turn 1, attack every turn, and remove blockers with pings and Headshots instead of trading into them. The game should be decided before the enemy’s expensive cards come online.',
        early: '[M01] and [M09] have Rush, so they attack the turn they land. [M03] and [M05] follow on turn 2, and [M06] buffs whichever attacker survived.',
        mid: '[M25], [M10] and [M26] destroy any damaged monster they attack. [S11] and [M22] provide the damage, and [M28] gives +2/+1 to keep the pressure up.',
        late: '[M17] is a 4/4 with Rush, and [M29] damages one blocker as it lands and can Headshot it next turn. Spend removal on Guards and send everything else at the enemy player.',
        keyCards: [
          ['M26', 'Stealth lets it pick its moment, and Headshot makes that moment a kill.'],
          ['S11', '1 damage and a card for 2. The cheapest way to set up a Headshot.'],
          ['M17', 'Rush on a 4/4: 4 damage the turn it lands, even late.'],
        ],
        tips: [
          'Count the enemy’s HP every turn. An aggro deck wins by knowing when one more push is enough.',
          'Don’t trade your attackers into Guards if a ping and a Headshot can remove the Guard instead.',
        ],
      },
      Overwatch: {
        plan: 'Sit behind Guards, let the enemy attack into Suppression, and clear their board with pings, sweepers and Headshots. You win late, once your bigger monsters outlast their hand.',
        early: '[M24] and [M07] hold the board on turns 1 and 2, and [M08] draws. Save [S04] for when the enemy has two or more small monsters.',
        mid: '[M27] and [M11] Suppress whatever they damage, and [M23] damages a random enemy monster every turn end, setting up [S06]. [M13] sweeps 1 damage across their board.',
        late: '[M16], [M19] and [M20] take over once the enemy runs low on cards. [S12] resets a board that got away from you.',
        keyCards: [
          ['M27', 'A Guard with Suppression: anything that attacks it and survives can’t attack next turn.'],
          ['M23', 'A free ping every turn end, which means a Headshot target every turn.'],
          ['S06', 'Destroys any damaged monster for 2. With this many pings, there’s always a target.'],
        ],
        tips: [
          'Don’t race. Let the enemy attack into your Guards, then clean up with removal.',
          '[S07] is Quick: keep 1 Bandwidth open on the enemy’s turn to blunt their biggest attack.',
        ],
      },
      'Drone Network': {
        plan: 'Draw cards with drones and cheap bodies, buff the monsters that survive, and win the middle of the game with a bigger board. This list is slower than the other two and has fewer pings, so most of its removal is combat.',
        early: '[M21] draws a card when it dies, so trade it freely. [M03] and [M06] give you a board to build on.',
        mid: '[M12] draws, [S15] adds two Drones and a ping, and [M28] gives a monster +2/+1. [M22] removes a small threat, and [M27] and [M16] hold the front.',
        late: '[M18] brings three bodies at once, [M30] sweeps 1 damage across the enemy board, and [M19] and [M17] close the game.',
        keyCards: [
          ['M18', 'Three bodies for 5: a 3/5 and two Drones.'],
          ['M28', '+2/+1 on a monster that has already survived a fight.'],
          ['M30', 'A 4/5 that clears enemy 1-health monsters as it lands.'],
        ],
        tips: [
          'Buff monsters that have already survived a fight. A buff on a fresh monster loses two cards to one removal spell.',
          'This list runs only one [S06], so don’t count on Headshots. Trade on the board instead.',
        ],
      },
    },
  },

  Horror: {
    plan: 'Horror makes every trade unfair. Fear shrinks the monster you attack before combat, Haunt deals damage when your monsters die, and Ghouls, Checkpoints and Revives mean removal rarely sets you back.',
    tips: [
      'Fear works when your monster attacks, not when it blocks. Be the one attacking.',
      'Revive effects return your most recently destroyed monster from the graveyard. Ghouls vanish when they die, so they never get in the way.',
      '[S01] and [S13] are Quick: leave Bandwidth open to blunt a big attack on the enemy’s turn.',
    ],
    against: 'Silence strips Haunt, Fear and Checkpoint. Fortify makes Haunt’s 2 damage count for 1, and big Guards absorb Fear attacks without dying. Exiling the graveyard stops Revives.',
    lists: {
      'Fright Night': {
        plan: 'Attack every turn with Fear monsters so every blocker shrinks first. Flood the board with Ghouls, turn your whole team into Fear attackers with Lights Out, and finish with Night Falls.',
        early: '[M02], [M19], [M04] and [M06] come down on turns 1 and 2 and attack into anything they beat with Fear.',
        mid: '[S14] and [M17] add Fear Ghouls, [M09] and [M23] survive their first death with Checkpoint, and [M10] grows with every kill.',
        late: '[M12] is a 5/5 with Fear. [S12] pings every enemy monster and gives your monsters Fear, and [S10] clears small monsters and deals 3 to the enemy player.',
        keyCards: [
          ['S14', 'Three 1/1 Fear Ghouls for 2: a whole attack squad.'],
          ['M23', 'Fear and Checkpoint on a 4/3: it has to be killed twice.'],
          ['S10', 'A sweeper and 3 face damage. Often the last card you need.'],
        ],
        tips: [
          'Fear takes 1 Attack off the monster you attack before damage, so a 2-Attack blocker only hits back for 1.',
          'Hold [S10] until it either clears their board or finishes the game.',
        ],
      },
      'Restless Dead': {
        plan: 'Trade constantly. Each of your deaths draws a card, grows Bone Collector, triggers Haunt or leaves a Ghoul behind, and Revives bring back your best monster at the end.',
        early: '[M03] has Haunt and [M19] leaves a Ghoul, so both trade happily. [M05] survives its first death.',
        mid: 'Get [M21] and [M16] down, then feed them with [S14] and [M17]. [S11] destroys one of your own Haunt monsters for its trigger plus two cards.',
        late: '[M14] and [M18] are the big threats. When they die, [M24] and [S09] bring them straight back.',
        keyCards: [
          ['M21', 'Draws a card every time another friendly monster dies. The engine of the deck.'],
          ['M16', 'Grows with every friendly death, so your trades make it bigger.'],
          ['M24', 'A 3/4 that revives your most recently destroyed monster.'],
        ],
        tips: [
          'Play [M21] when you already have Ghouls or cheap monsters on the board, so it pays off right away.',
          'Let your biggest monster be the last one to die before you cast a Revive.',
        ],
      },
      'Last Survivor': {
        plan: 'Survive. Guards, Barricades and healing hold the early game, sweepers and removal clear the enemy board, and big monsters win once the enemy runs out of cards.',
        early: '[M07] and [M05] hold the front, and [S02] kills small attackers. [S04] turns any monster into a sturdy Guard.',
        mid: '[M11] and [M22] are big Guards. [S06] Silences the most dangerous enemy monster, and [S12] pings their whole board.',
        late: '[S15] destroys every damaged monster and restores 4 HP, and [S10] sweeps 2. [M14] and [M12] close the game.',
        keyCards: [
          ['S15', 'Destroys every damaged monster on the board, then heals you for 4.'],
          ['M22', 'A 2/6 Guard that holds the front, and shrinks whatever it attacks with Fear.'],
          ['S08', '6 HP back for 2. Buys the turns you need.'],
        ],
        tips: [
          '[S15] destroys your damaged monsters too. Damage their board first, with [S12] or a fight, and keep yours healthy.',
          'Use [S08] when you’re under real pressure, not to top yourself off.',
        ],
      },
    },
  },

  Platformer: {
    plan: 'Platformer goes over the top. Double Jump attackers ignore Guards and hit whatever they like, including the enemy player, while Powered Up and Checkpoint mean your monsters take two hits to remove.',
    tips: [
      'Double Jump only matters against Guards. Against an open board, just make good trades.',
      'Powered Up blocks one hit of any size. Put it on your best attacker before it trades into something big.',
      'Checkpoint saves a monster from any lethal hit once, even a Destroy effect.',
    ],
    against: 'Silence strips Powered Up, Checkpoint and Double Jump all at once. Cheap board-wide damage pops Powered Up shields for free, and bounce effects skip Checkpoint’s second life entirely.',
    lists: {
      Speedrun: {
        plan: 'Get past Guards with Double Jump and Rush, hit the enemy player every turn, and use removal only on monsters that could race you back.',
        early: '[M04] has Rush, and [M03] jumps past early Guards. [S14] clears a small blocker.',
        mid: '[M21] has Rush and Double Jump, [M10] is a 4/2 with Rush, and [M08] and [M23] keep jumping. [S01] gives any monster +1/+1 and Double Jump.',
        late: '[M24] (Rush and Checkpoint), [M17] (Rush and Double Jump) and [M14] finish. [M11] shrugs off one hit.',
        keyCards: [
          ['M21', 'Rush and Double Jump for 3: guaranteed face damage the turn it lands.'],
          ['S01', 'Turns any monster into a Guard-skipping attacker, permanently.'],
          ['M17', '5 damage to the face the turn it’s played.'],
        ],
        tips: [
          'Save removal for monsters that threaten to race you. Double Jump already handles Guards.',
          'Count your Rush damage from hand before each turn. You often have lethal earlier than it looks.',
        ],
      },
      'Extra Lives': {
        plan: 'Every monster takes two hits to kill. Trade your shielded monsters into theirs, re-shield, and win the long game with a board that doesn’t shrink.',
        early: '[M19] has Powered Up and Double Jump, [M06] has Powered Up, and [M07] is a Guard with Checkpoint.',
        mid: '[M18] has both Checkpoint and Powered Up. [S03] and [S04] add more shields, [M22] is a shielded Guard, and [M11] attacks past Guards.',
        late: '[M14] and [M15] are the top end, and [S11] gives your whole board Powered Up before a big attack.',
        keyCards: [
          ['M18', 'Checkpoint and Powered Up: three hits to kill a 3-cost.'],
          ['S08', 'Quick: shield a monster in the middle of an enemy attack.'],
          ['S11', 'Powered Up for every monster you control. Then trade everything.'],
        ],
        tips: [
          'Attack aggressively with shielded monsters: the first hit back does nothing.',
          'Re-shield a monster that lost its Powered Up rather than playing a new one into a sweeper.',
        ],
      },
      'Warp Zone': {
        plan: 'Bounce expensive threats so the enemy wastes turns replaying them, stomp the cheap ones, draw plenty of cards, and land Mini-Boss and Final Boss.',
        early: '[M16] is a Guard that draws when it dies, [M05] draws, and [M07] holds the front.',
        mid: '[M12] bounces their best monster, and [S06] bounces every enemy monster with 2 or less Attack. [S12] and [S14] remove what’s left, and [S05] refills your hand.',
        late: '[M25], [M15] and [S10] close the game once the enemy has spent its turns.',
        keyCards: [
          ['M12', 'Bounces an enemy monster: they pay its full cost again.'],
          ['S06', 'A one-card reset against wide boards of small monsters.'],
          ['S15', 'Returns the last card in your graveyard, such as the Warp Pipe you just cast, and draws.'],
        ],
        tips: [
          'Bounce the expensive monsters. Bouncing a 2-cost costs you more than it costs them.',
          'Bounced tokens vanish entirely, so [S06] is removal against token decks.',
        ],
      },
    },
  },

  RPG: {
    plan: 'RPG invests in a few heroes and makes them huge. Monsters with Battle Training gain 1 XP each time they attack and survive, and every 3 XP is a Level Up: +2/+2. Gear, healing and Guards keep your heroes alive, and burn spells clear the way.',
    tips: [
      'Focus XP. One hero at 3 XP is worth more than three heroes at 1.',
      '[S03] and [S13] are Quick: save a hero in the middle of a fight. [S13] fully heals it and adds 1 XP.',
      '[S12] can hit the enemy player too: 5 damage to finish a game.',
    ],
    against: 'Silence wipes XP, buffs and gear in one card, and hard removal undoes several turns of investment. Spreading your threats is the counter.',
    lists: {
      'Adventuring Party': {
        plan: 'Cheap heroes attack into fights they survive, bank XP and Level Up into monsters bigger than anything else at their cost. Gear and burn spells make sure the fights go your way.',
        early: '[M01], [M05] and [M07] attack into smaller monsters. [S01] gives 2 XP at once.',
        mid: '[M09] and [M22] (Rush, so it gains XP right away) push. [S05], [S06] and [M21] make your heroes win their fights.',
        late: '[M14] arrives with 2 XP and [M11] with 1. [M23] is a Guard that levels, and [S12] clears the last blocker.',
        keyCards: [
          ['S01', '2 XP for 1 Bandwidth: one surviving attack later, that’s a Level Up.'],
          ['M21', '+1/+1 and First Strike, so your hero hits first and survives.'],
          ['M14', 'Arrives with 2 XP, one attack away from 7/6.'],
        ],
        tips: [
          'Pick fights your hero survives. A dead hero keeps none of its XP.',
          'Put gear on heroes close to a Level Up. They get both bonuses.',
        ],
      },
      'Holy Order': {
        plan: 'Guard, heal and grind. Guards and healers hold off attacks, burn spells kill threats, and High Priestess and the late game win once the enemy runs out of steam.',
        early: '[M19] and [M03] heal as they land. [M04] and [M07] are cheap Guards.',
        mid: '[M23] and [M12] are big Guards. [S11] gives +0/+3 and Fortify. [S14], [S12] and [M08] remove threats.',
        late: '[M25] restores 2 HP every turn end, and [S10] sweeps 3 and levels your board. [M15] and [M18] are single copies at the top.',
        keyCards: [
          ['S11', '+0/+3 and Fortify: a Guard that shrugs off small attackers for good.'],
          ['M25', 'Heals you every turn it survives.'],
          ['S10', 'Sweeps 3 damage and gives your monsters XP.'],
        ],
        tips: [
          'Heal when you’re under pressure, not to top yourself off.',
          'Keep [S03] or [S13] open on the enemy turn to save a Guard in combat.',
        ],
      },
      'Arcane Academy': {
        plan: 'Ramp with Mana Burst, hold the front with Guards and healers, kill threats with burn spells, and draw into Ancient Dragon and Raid Boss.',
        early: '[S07] on turn 2 is ideal: the extra crystal pays off for the rest of the game. [M04] and [M19] buy time.',
        mid: '[S04] and [S09] refill your hand, and [M10] draws 2 when it dies. [S14] and [S12] handle threats while [M12] holds the front.',
        late: '[M25] heals every turn. [M18] sweeps 2 as it lands, and [M15] and [S10] finish.',
        keyCards: [
          ['S07', 'An extra Bandwidth crystal for the rest of the game.'],
          ['S09', 'Three cards for 4: finds your single copies of the big monsters.'],
          ['M18', 'A 7/7 that deals 2 damage to every enemy monster as it lands.'],
        ],
        tips: [
          'A new crystal arrives empty, so [S07] pays off from your next turn on.',
          'The big monsters are single copies. Keep drawing so you see them.',
        ],
      },
    },
  },

  Racing: {
    plan: 'Racing banks Nitro, a resource that stays until you spend it, then cashes it in with Boost effects. Slipstream monsters have +1 Attack while you hold any Nitro, so keeping at least one in the bank matters as much as spending it.',
    tips: [
      'Keep at least 1 Nitro banked when you have Slipstream monsters on the board, or they lose their +1 Attack.',
      'Boost is optional. If spending Nitro would turn off your Slipstream attackers, play the card without it.',
      '[S12] is Quick: removal on the enemy’s turn, with or without a Boost.',
    ],
    against: 'Removal on your Nitro engines starves the Boosts. Big Guards slow the Rush monsters, and Tax makes Racing’s many cheap spells cost 1 more each.',
    lists: {
      'Drag Strip': {
        plan: 'Race. Rush monsters attack the turn they land, speed boosts push extra damage, and Podium Finish ends it from hand.',
        early: '[M01] and [M05] have Rush. [M02] buffs another monster, and [M04] banks Nitro.',
        mid: '[M12], [M22] and [M14] all have Rush. [S07] gives any monster Rush and +2 Attack for one big hit.',
        late: '[M16] is a 6/3 with Rush, or 8/5 with Boost 2. [S10] deals 4 to the enemy player, or 8 with Boost 2.',
        keyCards: [
          ['S07', 'Rush and +2 Attack: surprise damage from a monster you just played.'],
          ['M16', 'Up to 8 damage the turn it lands.'],
          ['S10', '4 or 8 face damage from hand. Your finisher.'],
        ],
        tips: [
          'Save 2 Nitro for [S10] when the enemy is at 8 HP or less.',
          '[S09] gives your whole board +2 Attack: cast it when you have three or more attackers.',
        ],
      },
      'Nitro Fuel': {
        plan: 'Bank Nitro early from every source, then make every Boost card fire at full power: removal, sweeps and big bodies all at once.',
        early: '[M19], [M04] and [M11] start banking. [M13] is a Guard that gives 2 Nitro when it dies. [S11] adds 2 more and draws.',
        mid: '[M21] adds 2 Nitro, [M06] adds 1, and [S15] with Boost 2 deals 3 to one monster and 2 to all of them. [S12] removes threats.',
        late: '[M09], [M24] and [M18] dominate the board, [M16] hits hard with Boost, and [S10] finishes.',
        keyCards: [
          ['M11', 'A Nitro every turn it survives. Protect it.'],
          ['S15', 'With Boost 2, single-target removal and a sweep in one card.'],
          ['M24', 'A 4/6 that deals 2 to every enemy monster with Boost 2.'],
        ],
        tips: [
          'Plan your Nitro a turn ahead. Several of your best cards want 2 at once.',
          '[M13] is a good blocker that pays you when it dies.',
        ],
      },
      'Pit Crew': {
        plan: 'Build sturdy cars, buff and heal them, keep them on the road, and win the long race with Overtake monsters that earn Nitro every time they attack and survive.',
        early: '[M02] and [M20] buff your first cars. [M03], [M11] and [M13] are tough early bodies.',
        mid: '[S04] and [S05] keep cars healthy and growing. [M08] and [M23] are big bodies, and [M17] and [S06] Suppress the enemy’s best attacker.',
        late: '[M24], [M09] and [M18] are the top end, all sturdy enough to survive trades.',
        keyCards: [
          ['S05', 'Quick: fully heal a car and give it +0/+2 in the middle of a fight.'],
          ['M08', 'A 4/5 that earns Nitro every attack it survives.'],
          ['M18', 'Gains Nitro every turn end and hits hard with Slipstream.'],
        ],
        tips: [
          'Overtake only pays when the attacker survives. Attack into monsters it beats.',
          'Keep 2 Bandwidth open on the enemy turn for [S05].',
        ],
      },
    },
  },

  Fighting: {
    plan: 'Fighting rewards playing several cards in one turn. Combo monsters have +1 Attack for each other card you’ve played this turn (up to +2), and many cards do more “if you’ve played another card this turn”. Counter fighters deal their damage first when attacked.',
    tips: [
      'Order matters: play the cheap cards first and the “if you’ve played…” card last.',
      'Combo counts cards played this turn, so cast your spells before you attack with Combo monsters.',
      'Counter monsters deal damage first when attacked. Keep them back and let the enemy run into them.',
    ],
    against: 'Fighting has little healing and few big bodies. Decks that build a wide board of sturdy Guards outlast the combo turns, and Tax makes the cheap spell chains cost more.',
    lists: {
      'Combo Rush': {
        plan: 'Chain cheap cards in one turn to power up every Combo monster and every “if you’ve played…” bonus, then finish with Ultimate Combo and Final Round Champion.',
        early: '[M03] and [M19] come down early. Play [M19] after another card and it attacks right away.',
        mid: '[M13], [M21] and [M05] grow with Combo. [S09] gives all your monsters Combo and +1 Attack. [M06] and [M15] fight for the board.',
        late: '[M09] gains Rush after two other cards, [M10] deals 3 to the enemy player, and [S16] deals 6.',
        keyCards: [
          ['S09', 'Every monster gets Combo and +1 Attack: one card turns the board into a combo.'],
          ['S16', '6 damage to the enemy player after two other cards.'],
          ['M10', 'A 7/7 First Striker that deals 3 to the face in a combo turn.'],
        ],
        tips: [
          'A typical finish: [S12], then [S03], then [S16]. 7 Bandwidth for 2 damage to a monster, a card and 6 face damage.',
          'Before a big turn, count which cards are “first” and which need two others before them.',
        ],
      },
      'Turtle Defense': {
        plan: 'Let the enemy attack into you. Counter fighters strike first when attacked, Guards make sure they’re the ones getting hit, and Projectile Zoner and Whiff Punish finish off the damaged attackers.',
        early: '[M04] and [M12] have Counter. [M20] is a Guard with Counter, so attackers have to hit it.',
        mid: '[M22] is another Counter Guard. [M14] pings an enemy every turn end, and [S05] destroys a damaged monster. [M07] and [M23] Suppress and Silence threats.',
        late: '[M17] makes your other monsters hit harder, and [M24] is a 6/6 Counter that deals 2 damage as it lands.',
        keyCards: [
          ['M20', 'A 1/4 Guard with Counter: attackers must hit it, and it hits first.'],
          ['M14', 'Damages a random enemy monster every turn end, setting up Whiff Punish.'],
          ['S05', 'Quick: destroy any damaged enemy monster.'],
        ],
        tips: [
          'Don’t attack into the enemy unless you have to. This list wins on defense.',
          '[S13] is Quick: shrink an attacker by 2 and stop it attacking next turn.',
        ],
      },
      'Final Round': {
        plan: 'Survive the early rounds with Counters and removal, take the board in the middle, then finish with face damage from hand.',
        early: '[M03], [M04] and [M20] hold the front. [S04] draws.',
        mid: '[M15] deals 2 as it lands, [M23] Silences a threat, [M14] pings every turn, and [S11] deals 5 to a monster.',
        late: '[M17], [M24] and [M10] take over. [S16] and [S10] finish from hand.',
        keyCards: [
          ['S16', '3 face damage, or 6 in a combo turn.'],
          ['S10', '5 face damage for 4. It costs you 2 HP.'],
          ['M10', 'A 7/7 that adds 3 face damage in a combo turn.'],
        ],
        tips: [
          'Track the enemy’s HP from the middle turns on: [S10] and [S16] together deal 8 or more from hand.',
          'Check your own HP before [S10]. It deals 2 to you too.',
        ],
      },
    },
  },

  Sports: {
    plan: 'Sports goes wide. Fill the board with cheap teammates and 1/1 Benchwarmers, buff them all at once, and attack with many monsters each turn: Momentum monsters have +1 Attack once you’ve already attacked this turn. When you fall behind on HP, Clutch players turn it around.',
    tips: [
      'Attack with a token or a non-Momentum monster first, so every Momentum attacker after it gets +1.',
      'Clutch is +2 Attack while your HP is lower than the enemy’s.',
      'Hold team-wide buffs until you have three or more monsters.',
    ],
    against: 'Board-wide damage is the big danger: one sweeper can erase a board of 1/1s and the buffs on them. Spread your buffs across turns, and keep a Guard or two back.',
    lists: {
      'Fast Break': {
        plan: 'Momentum strikers score quickly once the first attack lands. Go wide early, keep attacking every turn, and finish with Rush monsters.',
        early: '[M01] and [M05] have Momentum. [M16] adds a Benchwarmer, and [M20] gives your other monsters +1 Attack.',
        mid: '[M09] is a 4/3 with Momentum, [M22] draws if you’ve attacked, and [M06] adds more Inspire. [S11] buffs everyone for one swing.',
        late: '[M11] and [M25] have Rush and Momentum, and [M18] draws when you attack three or more times in a turn.',
        keyCards: [
          ['M20', 'Inspire for 2: every other monster you control has +1 Attack.'],
          ['M22', 'Play it after attacking and it draws a card.'],
          ['M25', 'A 6/5 with Rush and Momentum: 7 damage the turn it lands if you’ve already attacked.'],
        ],
        tips: [
          'Attack first, then play [M22] to draw.',
          '[S05] gives +3 Attack for 1: use it to win a trade or push the last points of damage.',
        ],
      },
      'Defensive Line': {
        plan: 'Big Guards and Silence shut the opponent out. Falling behind on HP turns on your Clutch players, and Overtime Push and Hall of Famer win from there.',
        early: '[M04] and [M07] are sturdy Guards that hold the early game.',
        mid: '[M12] and [M24] are big Guards. [M08] has Clutch, [M10] grows a random monster every turn end, [S07] Silences a threat and [S08] heals.',
        late: '[M13] is a 7-Attack threat while you’re behind. [M14], [S09] and [M15] win, and [S12] destroys anything.',
        keyCards: [
          ['M13', 'A 5/3 with Clutch: 7 Attack whenever your HP is lower.'],
          ['M10', 'Gives another random monster +1/+1 every turn end.'],
          ['S12', 'Destroys any enemy monster.'],
        ],
        tips: [
          'Clutch wants your HP below theirs. Don’t heal with [S08] right before a Clutch attack.',
          'Keep [M10] behind your Guards: it grows your team every turn it lives.',
        ],
      },
      'Team Spirit': {
        plan: 'Go wide with teammates and buff the whole roster. Every team-wide buff is worth more with every monster on the board.',
        early: '[M01], [M02], [M16] and [M20] fill the board. [S13] adds a Benchwarmer and draws.',
        mid: '[M06] and [M10] grow the team, and [M22] draws. [M12] holds the front, and [S06] gives everyone +0/+2.',
        late: '[M17] gives your other monsters +1/+1, and [M18] draws when you attack three times. [S09] and [M15] are single copies to close.',
        keyCards: [
          ['M17', '+1/+1 to every other monster you control.'],
          ['S06', '+0/+2 to everyone: your board survives small sweepers.'],
          ['M18', 'Draws a card when you attack three or more times in a turn, which this list does easily.'],
        ],
        tips: [
          'Cast [S06] when you expect a sweeper. It keeps your 1/1s alive.',
          'Don’t overfill the board with tokens. It holds 5 monsters, and your best cards need space.',
        ],
      },
    },
  },

  Strategy: {
    plan: 'Strategy plays the long game. Structures can’t attack, but walls, Watchtowers and Artillery deal damage every turn on their own. Fortify makes your monsters take 1 less damage from each source, and extra Bandwidth gets your expensive cards out ahead of schedule.',
    tips: [
      '“Gain an empty Bandwidth crystal” raises your maximum but doesn’t refill it this turn. It pays off from next turn on.',
      'Fortify turns 1-damage pings into nothing, so ping-heavy decks struggle against you.',
      'Your board holds 5 monsters. Structures fill it fast, so leave room for the one you need.',
    ],
    against: 'Silence turns a Trebuchet or Artillery into a plain wall, and Errata kills 0-Attack Structures outright. Fast decks that go wide before the walls are up, and Double Jump attackers that skip past Guards, pressure you before the Structures take over.',
    lists: {
      Fortress: {
        plan: 'Walls and artillery that never attack but grind everything down. Survive behind Structures, let their turn-end damage clear the board, and win with Trebuchet and Total War Engine.',
        early: '[M07], [M03] and [S03] wall up. [M21] starts dealing damage every turn end.',
        mid: '[M17] deals 2 every turn end, [M11] makes a Soldier every turn, and [M16] buffs a random monster. [S14] adds two walls, and [S12] sweeps.',
        late: '[M24] deals 2 to the enemy player every turn. [M15], [M25] and [M14] are the top end.',
        keyCards: [
          ['M24', 'A Fortified Guard that deals 2 face damage every turn: the main win condition.'],
          ['M17', '2 damage to a random enemy monster every turn end.'],
          ['S13', 'Quick: 3 damage, plus 1 to every enemy monster while you control a Structure.'],
        ],
        tips: [
          'Leave a board slot for [M24]. A full board of walls can’t take the card that wins.',
          'Cast [S13] on the enemy’s turn: you almost always control a Structure.',
        ],
      },
      Economy: {
        plan: 'Build Bandwidth early behind walls, then land your biggest cards ahead of the enemy and keep drawing into more.',
        early: '[M02] gives 1 extra Bandwidth at the start of every turn, and [M05] does the same. [S11] adds a crystal and [M07] holds the front.',
        mid: '[M06], [S09], [M23] and [S15] ramp and draw. [S12] and [S13] keep the board clear, and [M18] is your first big threat.',
        late: 'Single copies of [M25], [M15], [M14] and [S10] arrive turns early.',
        keyCards: [
          ['S09', 'Two crystals at once: your 6-cost cards come down two turns early.'],
          ['M23', 'A 3/4 that ramps and draws.'],
          ['S10', 'Two Soldiers and +2/+2 to your whole board.'],
        ],
        tips: [
          'Generate Bandwidth is temporary. Spend it the turn you get it.',
          'Your maximum stops at 10. Once you’re close, ramp cards are only worth their body or their draw.',
        ],
      },
      Blitzkrieg: {
        plan: 'Scouts and cavalry strike before the enemy can dig in. This list attacks, buffs the whole army and uses Strategy’s removal to clear the way.',
        early: '[M01] is a 2/1 with Stealth, [M19] has Fortify, and [M20] reveals the enemy’s hand and draws.',
        mid: '[M22] has Rush, [M10] gives your other monsters +1 Attack, and [S06] adds two 2/1 Soldiers. [M08] Suppresses their best attacker, and [M09] pings.',
        late: '[S08] gives everyone +1/+1 and draws. [M12] and [M18] are the top end.',
        keyCards: [
          ['M10', 'Inspire: every other monster you control has +1 Attack.'],
          ['S06', 'Two bodies for 3: more attackers for every buff.'],
          ['S08', '+1/+1 to your whole army, plus a card.'],
        ],
        tips: [
          'Use [M20] early: knowing their hand tells you when it’s safe to go all in.',
          '[M08] stops the enemy’s best attacker from racing you back.',
        ],
      },
    },
  },

  CityBuilder: {
    plan: 'City Builder floods the board with 1/1 Citizens and builds Districts, which are Guards that many of your cards reward. Tax makes enemy spells cost 1 more, and discard and Suppress slow the opponent down.',
    tips: [
      'Get a District down early. Many cards draw more or do more “if you control a District”.',
      '[S12] destroys every monster costing 2 or less that isn’t a District, including your own Citizens.',
      'Your board holds 5 monsters, and Citizens fill it fast.',
    ],
    against: 'Board-wide damage clears Citizens in one card, and Errata kills 0-Attack District Blocks outright. Decks with bigger single monsters can attack through a board of 1/1s.',
    lists: {
      Boomtown: {
        plan: 'Citizens everywhere. Flood the board with tokens, then buff them all at once.',
        early: '[M16] and [M19] bring Citizens, [M04] makes one as it lands, and [S03] or [M20] puts a District down.',
        mid: '[M09], [M21] and [M12] add more Citizens. [S04] gives everyone +1/+1, and [M13] holds the front.',
        late: '[M17] gives your other monsters +1 Attack, [S09] gives them +2/+2, and [M15] brings four Citizens.',
        keyCards: [
          ['M12', 'A new Citizen every turn it survives.'],
          ['M17', 'Inspire: every Citizen hits for 2.'],
          ['S09', '+2/+2 to everything: a board of Citizens becomes a board of 3/3s.'],
        ],
        tips: [
          'Leave board space for [M15]. Its Citizens need empty slots.',
          'Buff right before you attack, so the enemy has no turn to sweep the buffed board.',
        ],
      },
      'Red Tape': {
        plan: 'Tax, discard and curfews tie the opponent up behind District walls. Make every enemy turn worse than yours, then win with big Districts.',
        early: '[M02] taxes enemy spells from turn 1. [M01] is a cheap District, and [S13] adds a District Block and draws.',
        mid: '[M10] taxes, [S05] and [M23] make the enemy discard, and [M22] heals and holds. [S15] Suppresses their whole board, and [S12] clears small monsters.',
        late: '[M24] draws, [M25] walls up, and [S09] turns your board into a threat.',
        keyCards: [
          ['M23', 'Makes the enemy discard a random card while you control a District.'],
          ['S15', 'Nothing on their side can attack next turn.'],
          ['S12', 'Clears their cheap monsters and spares your Districts.'],
        ],
        tips: [
          '[S12] also destroys your [M02], [M03] and [M20]. Cast it when the trade is worth it.',
          'Tax only works while the Tax monster lives. Keep it behind your Districts.',
        ],
      },
      Skyline: {
        plan: 'Districts and skyscrapers. Expand early, draw with District bonuses, ramp with Urban Expansion and build huge Guards.',
        early: '[M01], [S03] and [M06] are early Districts. [S02] and [M03] draw extra with one down.',
        mid: '[M07] buffs your monsters every turn, [S07] ramps, and [M11] and [M22] are big District Guards. [S12] clears small monsters.',
        late: '[M14], [M24] and [M25] are the payoff. [S10] is a single copy that ends the game.',
        keyCards: [
          ['S02', 'Two cards for 1 with a District down.'],
          ['M25', 'A 4/8 District Guard.'],
          ['S12', 'Spares your Districts and ramps you.'],
        ],
        tips: [
          '[S12] also destroys your [M03], [M20] and [M05], but spares every District, including the District Blocks they made.',
          'Keep a District on the board at all times. The list’s draw depends on it.',
        ],
      },
    },
  },

  CardGame: {
    plan: 'Card Game draws more cards than anyone and turns them into board. Topdeck monsters grow whenever you draw an extra card, House Rules change the game for both players for three turns, and Errata swaps a monster’s Attack and Health.',
    tips: [
      'Extra draws are any draw besides your normal turn draw, and most of the deck’s spells give one.',
      'Errata kills 0-Attack monsters outright: walls, Structures and District Blocks.',
      'House Rules affect both players. Only one is in play at a time, and a new one replaces it.',
    ],
    against: 'Fast decks punish the turns you spend drawing instead of building a board. Silence wipes the growth off a Topdeck monster, and discard effects take away the cards you drew.',
    lists: {
      'Topdeck Tempo': {
        plan: 'Draw, draw, draw: every extra card grows your Topdeck monsters and fires Card Shark, so your draw spells double as buffs and removal.',
        early: '[M01] grows with every extra draw. [M02] makes two bodies, and [M04] Silences a random enemy monster.',
        mid: '[M16] pings on every extra draw, and [M08] and [M21] grow. [S01] gives both players an extra draw each turn, which feeds your Topdeck monsters.',
        late: '[M12] and [M22] keep the cards flowing. [M15] and [M25] are single copies at the top.',
        keyCards: [
          ['M16', '1 damage to a random enemy monster for every extra card you draw.'],
          ['S01', 'Three turns of extra draws, and every one of yours is a Topdeck trigger.'],
          ['M08', 'A Topdeck monster that grows +1/+1 with every extra draw.'],
        ],
        tips: [
          'Get Topdeck monsters on the board before you cast your draw spells.',
          '[S01] gives the enemy cards too. Cast it when your board turns those draws into more.',
        ],
      },
      'Copy Combo': {
        plan: 'Copy and reprint your best cards until they run the game. Copy monsters shuffle copies of themselves near the top of your deck, and Netdecker and Alternate Printing copy what you already have.',
        early: '[M05] has Copy. [M06] holds the front, and [M02] makes two bodies.',
        mid: '[M07] and [M11] have Copy. [M22] copies the most expensive card in your hand, and [M19] copies a friendly monster with its stats swapped.',
        late: '[S08] draws three, often into copies. [M25] and [M24] are single copies at the top.',
        keyCards: [
          ['M11', 'A 4/5 that shuffles a copy of itself into the top 3 cards of your deck.'],
          ['M22', 'Copies the most expensive card in your hand.'],
          ['S03', 'Swaps each monster’s cost and Attack in your hand. [M06] becomes a 0-cost 2/4.'],
        ],
        tips: [
          'Don’t copy a 0-Attack monster with [M19]: the copy has 0 Health and dies.',
          'Hold an expensive card in hand when you play [M22].',
        ],
      },
      'Banlist Control': {
        plan: 'Rules Lawyers, House Rules and board wipes keep the table clean. Stop their spells, shut off their best cards with House Rules, and win late with Mythic Rare.',
        early: '[M06] holds the front, [M04] Silences a random enemy monster, and [S04] makes their monsters cost 1 more.',
        mid: '[M09] cancels their next spell, and [M18] is a Guard that Silences. [S05], [S09] and [S06] choose which House Rule hurts them most.',
        late: '[S12] destroys every monster with 4 or more Attack, [S15] deals 3 to every monster, and [M24] wins.',
        keyCards: [
          ['S09', 'For three turns, nothing costing 5 or more can be played.'],
          ['S15', '3 damage to every monster, both sides.'],
          ['M24', 'A 5/6 that Silences a random enemy monster as it lands.'],
        ],
        tips: [
          '[S09] stops your own [S12], [S15] and [M24] too. Cast it when their hand is expensive and yours isn’t.',
          '[M06] is Powered Up, so it survives your own [S15].',
        ],
      },
    },
  },
};
