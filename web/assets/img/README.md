# Artwork slots

Every art slot in the UI is an image placeholder. Drop a `.webp` or `.png` at the path below and the UI picks it up on the next load, no code change needed. Until an image exists, the slot shows an animated gradient mesh with the deck's emblem, so nothing looks broken while art is being generated.

Each slot is tried as `.webp`, then `.png`, then its fallback; the first one that exists wins. Missing files are only requested once per page load.

| Slot | Path | Size (Art Studio) | Falls back to |
|---|---|---|---|
| Card art (one per card) | `cards/<cardId>.webp`, e.g. `cards/FPS_M10_SniperOperative.webp` | 768 × 480 (16:10) | the deck's art, then the placeholder |
| Deck art (menu tiles, gallery, cards without art) | `decks/<deckId>.webp`: `FPS`, `Horror`, `Platformer`, `RPG`, `Racing`, `Fighting`, `Sports`, `Strategy`, `CityBuilder`, `CardGame` | 1024 × 640 | placeholder |
| Hero portrait (match screen avatar) | `heroes/<deckId>.webp` | 512 × 512, centered subject | deck art, then placeholder |
| Token art | `cards/<tokenId>.webp` (ids in `src/data/tokens.js`), otherwise `decks/token.webp` | 768 × 480 | the summoner's deck art |
| Card back | `ui/card-back.webp` | 560 × 784 (5:7) | placeholder with the "M" monogram |
| Favicon | `ui/favicon.png` (already present, generated) | 64 × 64 | — |

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

The studio saves the image as a WebP of the right size, then moves on to the next card that still needs art and copies its prompt. The progress bar and tab counts show what is left. To redo an image, untick **Missing or flagged only**.

Images flagged for redoing (by an art audit) are listed in `tools/art-studio/redo.js` with the reason. The studio marks them **REDO**, shows the reason under the card, counts them on each tab (⚑) and gathers them all under the **Flagged for redo** tab. Their prompts also say what was wrong with the last image. A flag clears by itself once you save a new image over the flagged one.

When a deck's whole art style doesn't work, `REDO_THEMES` in the same file flags every image drawn in that style, tokens included. The deck's tab then shows a **Theme rework** banner until every one of them is replaced. Change the deck's `DECK_STYLE` first, or the new images will repeat the old problem.

Two options make the loop faster, and both are on by default:

- **4 cards per image:** a card prompt asks for a 2×2 grid of four cards from the same deck. The studio splits the pasted image into four cards, each of which can be reframed. Untick any panel that came out badly; it stays on the to-do list. Deck art, hero portraits and the card back are always one per image.
- **Grab copied image on return:** when you switch back to the studio with a new image on the clipboard, it opens straight away, so you don't need Ctrl+V. The browser asks once for permission to read the clipboard.

The studio only listens on `127.0.0.1` and can only write `.webp` files inside `assets/img/cards|decks|heroes|ui`.

## Prompts

Prompts are generated from the card data in `tools/art-studio/slots.js`. Every deck has its own art style (`DECK_STYLE`): night-time cinematic realism for FPS, found-footage stills for Horror, pixel art for Platformer, an illuminated storybook for RPG, sunlit daytime motorsport for Racing, anime for Fighting, sports photography for Sports, a vintage war poster for Strategy, a tilt-shift diorama for City Builder and glossy fantasy art with foil accents for Card Game. Tokens use the style of the deck that summons them. Each prompt adds shared family rules (one readable focal subject, original designs, no text or frames), a subject built from the card's name, cost and keywords, and the card's rules text as context.

Keep the styles stable while a set is being made: consistency within a deck matters more than any single image. Generating a deck's cards in one long ChatGPT conversation helps, and so does attaching the style-test panel you picked as a reference ("match this art style").
