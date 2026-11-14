# MetaDeck — web edition

A browser version of MetaDeck, the card battler where every deck is a video game genre. It needs no build step and no dependencies: plain ES modules and CSS.

## Play

```bash
cd web
npm start
```

Then open http://localhost:5173. You need Node 20 or newer, and only for the tiny static server: browsers won't load ES modules from `file://`. Any static host works the same way, since the `web/` folder is the whole site.

- **Play vs AI**: pick your archetype, then one of its deck lists, and an opponent (or Random). The AI plays a random starter of its archetype.
- **Deck lists**: every archetype has three starter decks. Use **New deck** (or **Copy & edit** on a starter) to open the deck builder: a deck is 40 cards from one archetype, at most 2 copies of each. You can save an unfinished deck as a draft; only complete decks can be played. Your decks are saved in the browser's local storage.
- **Play online**: play another person with the deck list you picked. **Quick find** pairs you with the next player who searches. **Private match** creates a room with a 5-letter code for a friend to join (or joins theirs). **Open room** hosts a room that shows up in everyone's lobby list, where anyone can join it. The server runs the match, so neither player can see the other's hand or deck. Turns have a 90-second clock (25 seconds to answer an attack with a Quick card). If you drop or refresh, you have 30 seconds to rejoin before you forfeit, and running out the clock on three turns in a row also forfeits. Online play needs `npm start` (or `node serve.mjs` on any host): a static host has no matchmaking. The server treats every client as hostile: it validates every move and deck, shuffles with crypto randomness (so the deck order can't be predicted), serves only the game's own files with a strict Content-Security-Policy, accepts the game socket only from its own page, and rate-limits messages and connections per address. Behind a reverse proxy, set `TRUST_PROXY=1` so those limits see each player's address, and serve it over HTTPS (the socket then uses `wss://` on its own).
- **Collection, Shop, Season & quests**: the free-to-play economy. You start owning every archetype's first starter deck. Win games to earn Gold, season XP and archetype levels (which unlock the other starters), open packs, and craft any card with Dust. Gems buy packs and cosmetics: premium animated cards, card backs and arenas. See `MONETIZATION.md`.
- **Accounts**: **Sign in** (top right) creates an account with a name and password, so your cards, currencies and purchases are kept on the server and follow you to any device. Without one you play as a guest, with progress kept in this browser. There's no email: a new account gets a one-time **recovery code** to save, and **Forgot password?** uses it to set a new password (which hands out a fresh code). Signed in, the Account screen can change the password, make a new recovery code, sign out other devices, or delete the account. A player who lost their code too can have a password set by whoever runs the server with `npm run set-password -- <name>`. Accounts, match history and analytics are stored in the SQLite database `data/metadeck.db` (gitignored, never served; set `DATA_DIR` to keep it elsewhere). An old `data/accounts.json` is imported into it on first start. A signed-in player's vs-AI match is dealt by the server and replayed there at the end, so its rewards can't be faked. To give an account currency, run `npm run grant -- <name> --gold 999999 --gems 999999` on the machine running the server.
- **Tutorial**: a four-minute scripted match that teaches the basics step by step, offered on the menu until it's played or dismissed (and from Settings any time). Finishing it gives a Mixed pack, once. A player's first three matches against the AI are on easy, and each screen shows a one-time tip on the first visit.
- **Sound and Settings**: every sound is a named slot in `assets/audio/` (its README lists them and where to find sounds); a missing file just plays nothing. Settings has master, music and effects volume, mute, the tutorial and "show tips again".
- **Privacy and terms**: `legal/privacy.html` and `legal/terms.html`, linked from the menu and the sign-up form. Sign-up asks for a birth year and refuses players under 13 (guests can play at any age); older accounts are asked once. Account → Your data downloads everything stored about the account.
- **Ranked**: Quick find between two signed-in players is ranked. A hidden Glicko-2 rating decides who you're matched with (the allowed rating gap widens the longer you wait, and after a minute the lobby offers a match against the AI meanwhile); a visible rank (Bronze 5 → Diamond 1, then Meta) is climbed a star per win, with a bonus star for a third win in a row, and tiers you reach are kept for the season. Seasons are calendar months: the new one drops everyone four divisions and pays rewards for the highest rank reached. The same two players only count for ranked three times a day.
- **Profile & friends**: your rank, match history, win rate per deck, the season leaderboard, and friends: send and accept requests, see who's in the online lobby, challenge them to a friendly match, unfriend or block. Blocked players are never matched with you and can't add or challenge you.
- **Emotes and reports**: online matches have six preset emotes (no free chat) and a mute button; after a match you can report the opponent (and block them). Account names are checked against a word list at sign-up. `npm run reports` lists reports; `npm run moderate -- resolve <id> | rename <name> <new> | ban <name> | unban <name>` deals with them.
- **Deck codes**: **Copy code** in the deck builder gives a short code for the list (like `MD1-RPG-ClkGVRhJhkRWZQE`); **Import code** in the menu's deck lists opens one in the builder.
- **Watch AI vs AI**: watch two AIs play each other.
- **Card gallery**: browse all 400 cards. It shows each deck's mana curve and has a "new cards only" filter.
- **How to play**: the rules and the keyword glossary.

To play, drag a glowing card from your hand onto the mat (or click it). If it needs a target, a targeting arrow follows your pointer and the valid targets light up red: click one. To attack, drag one of your green-outlined monsters onto the enemy monster or hero you want to hit, or click the monster and then the target. Esc cancels. Hover anything to inspect it, and use the Log button for the text log.

Every keyword and rules term is colour-coded by what it does (combat, defense, trigger, bonus, economy, tag) and has a tooltip: hover a chip on a card, an icon badge on a board monster, or a highlighted word in rules text. When a keyword fires during play (First Strike hitting first, Guard blocking an attack, Momentum adding Attack, a Checkpoint saving a monster, ...) it announces itself above the monster. Conditional bonuses (Momentum, Clutch, Combo, Slipstream, Inspire) show a glowing +N next to the Attack stat while they apply, and the **? Keywords** button opens a reference drawer listing the keywords in play first.

When the enemy attacks and you have a playable **Quick** card plus unspent Bandwidth, the game pauses so you can respond, or you can let the attack through.

## Layout

| Path | What it is |
|---|---|
| `src/engine/game.js` | The rules engine, ported from the Unity C# engine (`GameFlowStateMachine`, `CombatResolver`, `CleanupResolver`, the effect classes and keyword handlers). Plain functions over plain-data state, so it runs in the browser and in Node. Besides the log it emits `state.events` for the UI, including a `keyword` event whenever a keyword does something visible. |
| `src/engine/constants.js` | Game constants and the keyword glossary. |
| `src/engine/text.js` | Generates rules text from effect data (port of `EffectText.cs`). |
| `src/engine/ai.js` | Greedy one-ply AI that drives both the opponent and the balance simulator. |
| `src/data/decks/*.js` | The 10 decks, 40 cards each. They follow the original JSON card schema plus `trigger`, `token`, `attack`/`health`, `nitroCost` and `isNew`. |
| `src/data/tokens.js` | Tokens that effects can summon. |
| `src/data/starters.js` | The three starter decks per archetype. Each doubles 10 cards from the archetype's pool and cuts 10. `src/data/index.js` has the deck rules (`deckErrors`) and builds the lists (`starterDecks`). |
| `src/data/economy.js` | The economy rules: rarity, the collection, Gold/Gems/Dust, packs and odds, crafting, quests, archetype levels, the season track and cosmetics. Pure functions over the player's profile; `src/ui/profile.js` saves it to local storage. `src/ui/shop.js`, `collection.js`, `season.js` and `packs.js` are the screens. |
| `src/ui/` | Menu, gallery, rules page, deck builder (`deck-builder.js`, with saved decks in `deck-store.js`) and the match screen. `keywords.js` gives every keyword and rules term its icon, colour and tooltip, and wraps rules text so terms are hoverable. `fx.js` holds the visual effects: pointer tilt and holographic glare, art slots with image fallback, attack lunges, impact bursts, death dissolves, spell flights, keyword callouts, tooltips, turn banners and confetti. |
| `assets/img/` | Artwork slots. Every art area is an image placeholder until a WebP or PNG is dropped in; `assets/img/README.md` lists the paths and sizes. No SVG is used anywhere in the UI. |
| `tools/art-studio.mjs`, `tools/art-studio/` | The Art Studio (`npm run art`): a local page that copies a ready-made prompt for each art slot, takes the image you paste back from ChatGPT or another generator, crops it and saves it into `assets/img/`. |
| `serve.mjs`, `server/` | The local server: static files, plus online play over a WebSocket at `/ws`. `server/ws.mjs` is a minimal WebSocket implementation (no dependencies), and `server/lobby.mjs` handles matchmaking (quick queue, open and private rooms), runs each match on the rules engine, redacts each player's view, and keeps the turn clock and reconnect grace period. `src/ui/net.js` and `src/ui/lobby.js` are the client side. |
| `tools/simulate.mjs` | AI-vs-AI balance simulator, multi-threaded. |
| `test/engine.test.mjs` | Engine tests (`node:test`). |
| `server/accounts.mjs`, `server/account-api.mjs`, `tools/grant.mjs` | Accounts: scrypt-hashed passwords, HttpOnly session cookies, the server-side profile and the `/api/account/*` endpoints. `npm run grant` adds currency to an account. |
| `test/accounts.test.mjs` | Accounts over real HTTP: sign up and sign in, throttling, recovery-code resets, password changes, signing out other devices, account deletion, server-side purchases, cross-site refusal, the admin grant, and online rewards. |
| `test/economy.test.mjs` | Economy tests: rarities, the core set, crafting, pack odds and duplicate protection, rewards, the season track. |
| `test/lobby.test.mjs` | Online play tests: a real server and WebSocket clients for quick find, private and open rooms, hidden information, the turn clock and reconnecting. |
| `server/db.mjs`, `server/ai-match.mjs` | The database (schema, migrations, backups, the match log) and the server-checked vs-AI matches: the server deals the seed, the browser plays, and the server replays the player's moves against the same AI before paying out. |
| `server/telemetry.mjs`, `server/log.mjs`, `src/ui/telemetry.js` | Cookieless analytics events, browser error reports, the server log files, and the update check (`/api/version`) that offers players a reload after a deploy. |
| `tools/maintenance.mjs`, `backup.mjs`, `report.mjs`, `tools/windows/` | Running it in public: restart for an update without cutting off matches, back up and restore the database, the analytics funnel, and the Windows scripts that keep the server running. See `HOSTING.md`. |
| `src/ui/tutorial.js`, `tutorial-script.js`, `test/tutorial.test.mjs` | The tutorial: the coaching drawn over the match screen, the one-time tips, and the script (stacked decks, the enemy's moves and each step), which the test plays through the real engine. |
| `src/ui/audio.js`, `settings.js`, `assets/audio/` | Sound effects and music by named slot, wired to the engine's events and the UI, and the Settings dialog. |
| `legal/` | The privacy policy and terms of service. |
| `server/social.mjs`, `rating.mjs`, `names.mjs`, `src/data/ranked.js` | Friends, blocks, reports, ranked results, the leaderboard and match history; the Glicko-2 rating; the name filter; and the visible rank ladder and seasons. |
| `src/ui/players.js`, `rank-badge.js`, `report.js`, `src/data/deck-code.js` | The Profile screen (rank, history, leaderboard, friends), the report dialog, and deck codes. |
| `tools/moderate.mjs`, `test/social.test.mjs` | Reports, renames and bans; and the tests for ranked play, friends, blocks, reports, challenges, emotes, moderation and deck codes. |
| `test/operations.test.mjs` | The health check, caching and ETags, the admin routes behind a tunnel, analytics, backups and maintenance mode. |
| `test/security.test.mjs` | Attacks on the real server: path traversal, the report endpoint, cross-site sockets, malformed frames, floods, connection caps, leaving a match without forfeiting, stalling, and the shuffle. |
| `BALANCE.md` | What changed for every card, why, and the simulation results. |

## Develop

```bash
npm test
```

```bash
npm run simulate
```

For the simulator, `node tools/simulate.mjs --games 300 --deck Horror --cards` runs a bigger sample focused on a single deck. Add `--variants` to play all 30 starter variants instead of the ten archetype pools: each variant meets every other theme's variants and its own theme's other variants. The Balance lab has the same choice under **Decks**.

Both also run a **snowball check**: how often the side that is ahead at turns 6, 8 and 12 goes on to win, and how often each deck comes back from behind. A lead is scored as board stats (ATK + health) plus half the HP difference plus 2 per extra card in hand, and counts once it is 6+ points (see `src/engine/snowball.js`). The target is for the side ahead at turn 8 to win 65–72%. Above that, an early lead decides too many games. Below it, the early turns barely matter.

To add a card, add an `M(...)` (monster) or `S(...)` (spell) entry to a deck file. Its rules text is generated from its effects. The tests check that every deck has exactly 40 unique cards, that every effect has readable text, and that each card uses at most one kind of chosen target.

The Unity project in the rest of this repository is untouched; this folder is self-contained.
