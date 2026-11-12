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
| `src/ui/` | Menu, gallery, rules page, deck builder (`deck-builder.js`, with saved decks in `deck-store.js`) and the match screen. `keywords.js` gives every keyword and rules term its icon, colour and tooltip, and wraps rules text so terms are hoverable. `fx.js` holds the visual effects: pointer tilt and holographic glare, art slots with image fallback, attack lunges, impact bursts, death dissolves, spell flights, keyword callouts, tooltips, turn banners and confetti. |
| `assets/img/` | Artwork slots. Every art area is an image placeholder until a PNG is dropped in; `assets/img/README.md` lists the paths and sizes and suggests prompts for AI image generation. No SVG is used anywhere in the UI. |
| `tools/simulate.mjs` | AI-vs-AI balance simulator, multi-threaded. |
| `test/engine.test.mjs` | Engine tests (`node:test`). |
| `BALANCE.md` | What changed for every card, why, and the simulation results. |

## Develop

```bash
npm test
```

```bash
npm run simulate
```

For the simulator, `node tools/simulate.mjs --games 300 --deck Horror --cards` runs a bigger sample focused on a single deck.

To add a card, add an `M(...)` (monster) or `S(...)` (spell) entry to a deck file. Its rules text is generated from its effects. The tests check that every deck has exactly 40 unique cards, that every effect has readable text, and that each card uses at most one kind of chosen target.

The Unity project in the rest of this repository is untouched; this folder is self-contained.
