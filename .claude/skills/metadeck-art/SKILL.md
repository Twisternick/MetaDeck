---
name: metadeck-art
description: Make, redo or fix MetaDeck artwork (card art, deck art, hero portraits, emblems, icons, card backs, arenas, UI art) by driving the Codex CLI through web/tools/art.mjs. Use whenever a task needs a new or changed image in web/assets/img, a flagged image redone, or a new art slot filled. No API key: Codex draws on the user's signed-in ChatGPT plan.
---

# MetaDeck art

All game art goes through `web/tools/art.mjs`. It takes a slot's prompt from `web/tools/art/slots.js`, runs `codex exec` (whose built-in `image_gen` tool draws the image), then crops the result to the slot and saves `web/assets/img/<slot>.webp`. You never write image prompts by hand for an existing slot and never copy, resize or convert images yourself.

A **slot** is the path under `assets/img` without the extension: `cards/RPG_M15_FinalBoss`, `decks/Horror`, `heroes/FPS`, `ui/emblem-RPG`, `ui/kw-rush`, `ui/back-aurora`, `ui/arena-killhouse`. `web/assets/img/README.md` lists every kind with its size.

## Flow

Run everything from `web/`.

1. **Pick the slots.** `node tools/art.mjs list` shows what still needs art (missing or flagged); `list flagged`, `list missing`, `list all` and `--group <deckId|Extras|Cosmetics>` narrow it. Flagged slots show why they were flagged.
2. **Read the prompt** if you need to judge the result: `node tools/art.mjs prompt <slot>`.
3. **Generate in the background.** Each Codex run takes one to three minutes, so always use `run_in_background`:
   ```bash
   node tools/art.mjs make cards/RPG_M15_FinalBoss cards/RPG_M23_Paladin --jobs 2
   ```
   `make --flagged --group RPG` (or `--missing`) picks the slots for you; add `--limit N` to keep a run small. Keep `--jobs` at 3 or less: every image counts against the user's ChatGPT plan.
4. **Look at every result** with Read on the saved `.webp` before calling it done. Check it against the slot's prompt and these rules:
   - the subject matches the card name and reads as a small thumbnail;
   - it is in its deck's art style (`DECK_STYLE` in `slots.js`) and looks like the deck's other cards;
   - nothing resembles an existing game, film or franchise character or item (see the bans in `DECK_STYLE`);
   - no text, letters, numbers, frames or watermarks (unless the slot asks for text, like the logo);
   - it is not a near-twin of another card in the same deck;
   - transparent slots (`ui/` icons, emblems, logo, frames) really have a transparent background.
5. **Retry what's wrong** with one specific correction rather than a rerun: `make <slot> --note "the boss's whole body must be visible, not just a hand"`. Use `--fix --note "..."` to edit the current image when it is mostly right. If cropping cut something off, re-place the raw image instead of drawing again: `node tools/art.mjs place <slot> tools/art/_incoming/<raw file> --focus top`.
6. **Tell the user** which images changed. They are not committed; the user decides that.

## Options worth knowing

- `--ref <file>`: attach a style reference, for example the deck art (`assets/img/decks/RPG.webp`) or a card the user likes, so a deck stays consistent. UI slots attach the key art by themselves.
- `--batch`: four cards of the same style in one 2×2 image, split into four slots. Uses a quarter of the plan's image budget, at some cost in detail. Good for first passes over many cards; draw important cards (high cost, legendary, heroes) one per image.
- `--focus centre|top|bottom|left|right|entropy|attention`: where the cover crop is taken from.
- `--out <dir>`: save somewhere else to look before placing; then `place` the raw file for real.

## Changing prompts or adding slots

Prompts live in `web/tools/art/slots.js`. Fix the prompt (a `SUBJECT_NOTE` for one card, `DECK_STYLE` for a whole deck) when a problem would repeat, rather than leaning on `--note` every time. A new art slot needs an entry there; `npm test` (test/art.test.mjs) checks every card, token, keyword, rule, trigger and cosmetic has one.

`web/tools/art/redo.js` flags images for redoing. A flag clears by itself once a new file replaces the flagged one (it compares byte sizes), so don't edit `REDO` after making art; add entries there when an audit finds problems.

## When Codex fails

The tool says which of these it hit, and the full run log is `tools/art/_incoming/<slot>-<time>-codex.log`:

- **Codex not found or incomplete** (no `codex-code-mode-host.exe`): the user needs to install or update the Codex desktop app, or set `CODEX_BIN`.
- **Not signed in:** the user runs `codex login` or opens the Codex app.
- **Usage limit reached:** stop and tell the user; don't loop.
- **No transparent background** on a transparent slot: retry once; the message shows the `place --force` command if the user wants it anyway.

Manual fallback: the user generates an image anywhere (ChatGPT, Gemini) using `node tools/art.mjs prompt <slot>`, saves the file, and you run `node tools/art.mjs place <slot> <file>`.
