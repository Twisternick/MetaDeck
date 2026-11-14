# Artwork slots

Every art slot in the UI is an image placeholder. Drop a `.webp` or `.png` at the path below and the UI picks it up on the next load, no code change needed. Until an image exists, the slot shows an animated gradient mesh with the deck's emblem, so nothing looks broken while art is being generated.

Each slot is tried as `.webp`, then `.png`, then its fallback; the first one that exists wins. Missing files are only requested once per page load.

| Slot | Path | Size (Art Studio) | Falls back to |
|---|---|---|---|
| Card art (one per card) | `cards/<cardId>.webp`, e.g. `cards/FPS_M10_SniperOperative.webp` | 768 × 480 (16:10) | the deck's art, then the placeholder |
| Deck art (menu tiles, gallery, cards without art) | `decks/<deckId>.webp`: `FPS`, `Horror`, `Platformer`, `RPG`, `Racing`, `Fighting`, `Sports`, `Strategy`, `CityBuilder`, `CardGame` | 1024 × 640 | placeholder |
| Hero portrait (match screen avatar) | `heroes/<deckId>.webp` | 512 × 512, centered subject | deck art, then placeholder |
| Deck emblem (chips, headings, Balance lab tables, art placeholders) | `ui/emblem-<deckId>.webp`, e.g. `ui/emblem-RPG.webp` | 512 × 512, transparent, fitted whole | the deck's emoji (`icon` in its deck file) |
| Token art | `cards/<tokenId>.webp` (ids in `src/data/tokens.js`), otherwise `decks/token.webp` | 768 × 480 | the summoner's deck art |
| Card back | `ui/card-back.webp` | 560 × 784 (5:7) | placeholder with the "M" monogram |
| Card back cosmetics | `ui/back-<name>.webp`, e.g. `ui/back-aurora.webp` (names from `COSMETICS` in `src/data/economy.js`) | 560 × 784 | the back's CSS skin |
| Arena cosmetics | `ui/arena-<name>.webp`, e.g. `ui/arena-molten-core.webp` | 1536 × 864 (16:9), calm in the middle | the arena's CSS gradient |
| Favicon | `ui/favicon.png`: the key art crest (`ui/crest.webp`) cropped to 64 × 64. The Art Studio's tab uses the same crest on a gold-rimmed tile (`tools/art-studio/icon.png`) | 64 × 64 | — |
| Title screen key art (logo is part of the image) | `ui/key-art.webp` (present) | 1672 × 941 (16:9) | — |
| Menu logo (the wordmark alone, transparent background) | `ui/logo.webp` or `ui/logo.png` | 1600 × 640 (5:2), fitted whole, not cropped | the gradient "MetaDeck" text |

Card ids are the first argument of every `M(...)` / `S(...)` entry in `src/data/decks/*.js`. Deck ids are the `id` field at the top of each deck file.

## Making art with the Art Studio

```bash
npm run art
```

Then open http://localhost:5174. The studio lists every slot above, grouped by deck, with a ready-made prompt for each. Use it with any image generator you can copy images out of, such as ChatGPT or Gemini:

1. Click **Copy prompt** on a card.
2. Paste the prompt into the generator.
3. Right-click the result and choose **Copy image**. You can also download it and drop the file on the card, or use **File…**.
4. Back in the studio, press **Ctrl+V**. Drag to frame the image (scroll to zoom), then press **Enter**.

The studio saves the image as a WebP of the right size, then moves on to the next card that still needs art and copies its prompt. The progress bar and tab counts show what is left. The **All** tab lists every slot from every tab in one grid. The **Show** picker lists **Missing only** (no file yet), **Missing or flagged** (the default, which adds images flagged for redoing) or **Everything**. Saving moves on to the next image the picker lists. To redo a finished image, pick **Everything**.

Images flagged for redoing (by an art audit) are listed in `tools/art-studio/redo.js` with the reason. The studio marks them **REDO**, shows the reason under the card, counts them on each tab (⚑) and gathers them all under the **Flagged for redo** tab. Their prompts also say what was wrong with the last image. A flag clears by itself once you save a new image over the flagged one.

When a deck's whole art style doesn't work, `REDO_THEMES` in the same file flags every image drawn in that style, tokens included. The deck's tab then shows a **Theme rework** banner until every one of them is replaced. Change the deck's `DECK_STYLE` first, or the new images will repeat the old problem.

Two options make the loop faster, and both are on by default:

- **4 cards per image:** a card prompt asks for a 2×2 grid of four cards from the same deck. The studio splits the pasted image into four cards, each of which can be reframed. Untick any panel that came out badly; it stays on the to-do list. Deck art, hero portraits and the card back are always one per image.
- **Grab copied image on return:** when you switch back to the studio with a new image on the clipboard, it opens straight away, so you don't need Ctrl+V. The browser asks once for permission to read the clipboard.

The studio only listens on `127.0.0.1` and can only write `.webp` files inside `assets/img/cards|decks|heroes|ui`.

## Prompts

Prompts are generated from the card data in `tools/art-studio/slots.js`. Every deck has its own art style (`DECK_STYLE`): night-time cinematic realism for FPS, found-footage stills for Horror, pixel art for Platformer, an illuminated storybook for RPG, sunlit daytime motorsport for Racing, anime for Fighting, sports photography for Sports, a vintage war poster for Strategy, a tilt-shift diorama for City Builder and glossy fantasy art with foil accents for Card Game. Tokens use the style of the deck that summons them. Each prompt adds shared family rules (one readable focal subject, original designs, no text or frames), a subject built from the card's name, cost and keywords, and the card's rules text as context.

Keep the styles stable while a set is being made: consistency within a deck matters more than any single image. Generating a deck's cards in one long ChatGPT conversation helps, and so does attaching the style-test panel you picked as a reference ("match this art style").
