# Monetization and progression

The whole game can be played and collected without paying. Money only buys speed (packs sooner) and looks (cosmetics); nothing for sale changes how a card plays. The rules live in `src/data/economy.js` (pure, tested in `test/economy.test.mjs`); the screens are `src/ui/shop.js`, `collection.js`, `season.js` and `packs.js`.

## Currencies

| Currency | Earned by | Spent on |
|---|---|---|
| Gold | Wins (10 each, up to 100 a day), the first win of the day (+50), daily quests (50–80), the season track | Packs (100) |
| Gems | Bought; also 75 at a time on the premium season track | Packs (100, or 10 for 900), cosmetics, the premium season track (1000) |
| Dust | Disenchanting spare copies, duplicate protection, the season track | Crafting any card |

A new player starts with 300 Gold (three packs of their choice) and 100 Dust.

## Collection and new players

- Every archetype's first starter deck is its **core set**. Every player owns it from the start, so all ten archetypes are playable on day one, and core copies can't be disenchanted.
- Rarity is about collecting, not power. The 30 core cards are Common. Of the 10 cards outside the core set, the two most expensive are Legendary, the next three Epic and the other five Rare.
- **Archetype levels.** A win gives that archetype 3 XP and a loss 1 (10 XP a level, max level 10). Every level gives one of its packs, level 4 gives the cards for its second starter deck, and level 7 the third. A locked starter can also be crafted right away from the menu.
- The deck builder only adds copies you own. A list with cards you don't own shows what's missing and what crafting them costs.
- **New player check** (Balance lab → *Check starter decks*): plays each free starter against every other archetype's full deck. The target is 45% or better, and under 40% means the starter needs a buff (to the starter list, not the meta).

## Packs

5 cards each, one archetype or Mixed. The odds are published in the shop:

| Rarity | Chance per card | Craft | Disenchant |
|---|---|---|---|
| Common | 72% | 40 | 5 |
| Rare | 21% | 100 | 20 |
| Epic | 5.5% | 400 | 100 |
| Legendary | 1.5% | 1600 | 400 |

Every pack has a Rare or better, and a Legendary comes at least once every 30 packs. Each card has a 5% chance to be premium (4× craft and disenchant value). Duplicate protection: you never get a copy you can't use while others of that rarity are missing, and once you own all of them, extras turn into Dust.

## Cosmetics

- **Premium cards**: an animated version (spinning prismatic frame, shimmering art, rising motes, foil name). It comes from packs, crafting or upgrading a copy, or the season track. Your premium copies show in your hand and on your board; you can turn them off in Collection → Cosmetics.
- **Card backs** and **arenas**: sold for Gems or given on the season track, and equipped in Collection → Cosmetics.
- The default look is fully finished. Paid cosmetics are alternatives, not upgrades that fix a plain default.

## Season and quests

- A season is a calendar month: 40 tiers of 500 XP. A win is worth 100 XP, a loss 50, online games ×1.5, and every quest +300.
- The free track gives Gold, Dust, a Mixed pack every 5 tiers, an arena at tier 20 and a card back at tier 30. The premium track (1000 Gems) adds exclusive cosmetics, premium cards, extra packs and Gems back.
- One new daily quest arrives each day, up to 3 at a time, and you can swap one per day.

## Before charging real money

This build is ready to try, not to sell:

1. **Accounts (done).** Signed-in players' profiles live on the server (`server/accounts.mjs`, saved in the SQLite database `data/metadeck.db`). Every change is a named operation (`OPS` in `economy.js`) the server applies, online matches are paid by the server, and online decks must be owned by the account. What's left:
   - vs-AI results are checked: the server deals the match and replays the player's moves against the same AI before paying out (`server/ai-match.mjs`). Guests' results stay in their browser.
   - Guests still play with a local profile that they can edit. Fine for trying the game, but anything paid needs an account.
   - Add password reset (needs an email address) and email verification.
2. **Payments (built, off until configured).** Gem bundles are sold through Paddle, the merchant of record (`server/payments.mjs`). Gems are credited only from Paddle's signed `transaction.completed` webhook, once per transaction; refunds and chargebacks take them back, and Gems already spent become a debt that pauses Gem spending until it's repaid. Purchases are for accounts 18 and older, with a consent to immediate delivery recorded with each one. Without `DATA_DIR/paddle.json` the bundles say "coming soon" (test purchases still work on localhost). Setup: HOSTING.md → Payments.
3. **Legal.** Odds are published. Accounts store a birth year and refuse players under 13; Gem purchases need 18+. The right-of-withdrawal consent is asked at checkout and recorded. Packs can't be bought with Gems where paid random items are restricted (`NO_PAID_PACKS` in `economy.js`: Belgium; the country comes from Cloudflare). The terms, privacy policy and refund policy cover purchases. Before selling: fill in the `[bracketed]` details and have a lawyer review the documents and the country list.
4. Hero skins need art: add hero portraits through the Art Studio, then add a `hero` cosmetic kind next to `back` and `arena`.
