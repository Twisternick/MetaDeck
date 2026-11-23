# Artwork slots

Every art slot in the UI is an image placeholder. Drop a `.webp` or `.png` at the path below and the UI picks it up on the next load, no code change needed. Until an image exists, the slot shows an animated gradient mesh with the deck's emblem, so nothing looks broken while art is being generated.

Each slot is tried as `.webp`, then `.png`, then its fallback; the first one that exists wins. Missing files are only requested once per page load.

| Slot | Path | Size | Falls back to |
|---|---|---|---|
| Card art (one per card) | `cards/<cardId>.webp`, e.g. `cards/FPS_M10_SniperOperative.webp` | 768 × 480 (16:10) | the deck's art, then the placeholder |
| Deck art (menu tiles, gallery, cards without art) | `decks/<deckId>.webp`: `FPS`, `Horror`, `Platformer`, `RPG`, `Racing`, `Fighting`, `Sports`, `Strategy`, `CityBuilder`, `CardGame` | 1024 × 640 | placeholder |
| Hero portrait (match screen avatar) | `heroes/<deckId>.webp` | 512 × 512, centered subject | deck art, then placeholder |
| Deck emblem (chips, headings, Balance lab tables, art placeholders) | `ui/emblem-<deckId>.webp`, e.g. `ui/emblem-RPG.webp` | 512 × 512, transparent, fitted whole | the deck's emoji (`icon` in its deck file) |
| Token art | `cards/<tokenId>.webp` (ids in `src/data/tokens.js`), otherwise `decks/token.webp` | 768 × 480 | the summoner's deck art |
| Card back | `ui/card-back.webp` | 560 × 784 (5:7) | placeholder with the "M" monogram |
| Card back cosmetics | `ui/back-<name>.webp`, e.g. `ui/back-aurora.webp` (names from `COSMETICS` in `src/data/economy.js`) | 560 × 784 | the back's CSS skin |
| Arena cosmetics | `ui/arena-<name>.webp`, e.g. `ui/arena-molten-core.webp` | 1536 × 864 (16:9), calm in the middle | the arena's CSS gradient |
| Favicon | `ui/favicon.png`: the key art crest (`ui/crest.webp`) cropped to 64 × 64 | 64 × 64 | — |
| Title screen key art (logo is part of the image) | `ui/key-art.webp` (present) | 1672 × 941 (16:9) | — |
| Menu logo (the wordmark alone, transparent background) | `ui/logo.webp` or `ui/logo.png` | 1600 × 640 (5:2), fitted whole, not cropped | the gradient "MetaDeck" text |

Card ids are the first argument of every `M(...)` / `S(...)` entry in `src/data/decks/*.js`. Deck ids are the `id` field at the top of each deck file.

## Making art

Art is made through the Codex CLI with `tools/art.mjs` (`npm run art` prints its help). Codex draws each image with its built-in image generator on your signed-in ChatGPT plan, so there is no API key. The script collects the file, crops it to the slot (or fits it whole, for transparent cut-outs) and saves `assets/img/<slot>.webp`. In this repo Claude drives it through the `metadeck-art` skill (`.claude/skills/metadeck-art/`), but you can run it yourself:

```bash
node tools/art.mjs list                                  # slots that are missing or flagged for redoing
node tools/art.mjs make cards/RPG_M15_FinalBoss          # draw one slot and place it
node tools/art.mjs make --flagged --group RPG --jobs 2   # every flagged RPG slot, two at a time
node tools/art.mjs make cards/RPG_M15_FinalBoss --note "show the whole boss"   # retry with a correction
```

A slot is its path in the table above without the extension. Other options:

- `--fix` edits the current image instead of drawing a new one.
- `--ref <file>` attaches a style reference. UI slots attach `ui/key-art.webp` by themselves.
- `--batch` draws four cards of one style in a 2×2 image and splits it.
- `--focus` picks where the crop comes from.
- `--out <dir>` saves somewhere else so you can look first.

Each run keeps the raw image, Codex's last message and a log in `tools/art/_incoming/` (not committed).

The script looks for Codex on `PATH` first, then inside the Codex desktop app (`%LOCALAPPDATA%\OpenAI\Codex\bin\<version>\codex.exe`). It only accepts a copy with `codex-code-mode-host.exe` beside it. `CODEX_BIN` overrides both. Cropping uses `sharp`: a local install if there is one, otherwise the copy bundled with the Codex desktop app, so the game itself keeps no dependencies. The script only writes `.webp` files inside `assets/img/cards|decks|heroes|ui`.

Without Codex, make the image anywhere: copy the prompt from `node tools/art.mjs prompt <slot>` into ChatGPT or Gemini, save the result, and place it with `node tools/art.mjs place <slot> <file>`.

Images flagged for redoing (by an art audit) are listed in `tools/art/redo.js` with the reason, and `list flagged` shows them. Their prompts also say what was wrong with the last image. A flag clears by itself once a new image replaces the flagged one.

When a deck's whole art style doesn't work, `REDO_THEMES` in the same file flags every image drawn in that style, tokens included. Change the deck's `DECK_STYLE` first, or the new images will repeat the old problem.

## Prompts

Prompts are generated from the card data in `tools/art/slots.js`. Every deck has its own art style (`DECK_STYLE`): night-time cinematic realism for FPS, found-footage stills for Horror, pixel art for Platformer, an illuminated storybook for RPG, sunlit daytime motorsport for Racing, anime for Fighting, sports photography for Sports, a vintage war poster for Strategy, a tilt-shift diorama for City Builder and glossy fantasy art with foil accents for Card Game. Tokens use the style of the deck that summons them. Each prompt adds shared family rules (one readable focal subject, original designs, no text or frames), a subject built from the card's name, cost and keywords, and the card's rules text as context.

Keep the styles stable while a set is being made: consistency within a deck matters more than any single image. Generating a deck's cards in one long ChatGPT conversation helps, and so does attaching the style-test panel you picked as a reference ("match this art style").
