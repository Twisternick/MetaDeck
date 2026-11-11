# Artwork slots

Every art slot in the UI is an image placeholder. Drop a PNG at the path below and the UI picks it up on the next load, no code change needed. Until an image exists, the slot shows an animated gradient mesh with the deck's emblem, so nothing looks broken while art is being generated.

Images are loaded in order; the first one that exists wins. Missing files are only requested once per page load.

| Slot | Path | Suggested size | Falls back to |
|---|---|---|---|
| Card art (one per card) | `cards/<cardId>.png`, e.g. `cards/FPS_M10_SniperOperative.png` | 512 × 320 (16:10) | the deck's art, then the placeholder |
| Deck art (menu tiles, gallery, cards without art) | `decks/<deckId>.png`: `FPS`, `Horror`, `Platformer`, `RPG`, `Racing`, `Fighting`, `Sports`, `Strategy`, `CityBuilder`, `CardGame` | 768 × 480 | placeholder |
| Hero portrait (match screen avatar) | `heroes/<deckId>.png` | 256 × 256, centered subject | deck art, then placeholder |
| Token art | `cards/<tokenId>.png` (ids in `src/data/tokens.js`), otherwise `decks/token.png` | 512 × 320 | the summoner's deck art |
| Card back | `ui/card-back.png` | 400 × 560 (5:7) | placeholder with the "M" monogram |
| Favicon | `ui/favicon.png` (already present, generated) | 64 × 64 | — |

Card ids are the first argument of every `M(...)` / `S(...)` entry in `src/data/decks/*.js`. Deck ids are the `id` field at the top of each deck file.

## Prompting AI image generators

A consistent style across the whole set matters more than any single image. A base prompt that works well with the dark, neon UI:

> digital painting, dramatic rim lighting, deep shadows, vivid neon accent color **<deck color>**, cinematic composition, centered subject, no text, no borders, no watermark, 16:10

Append a per-deck flavor:

| Deck | Color | Flavor |
|---|---|---|
| FPS | `#7f9a3c` | tactical operators, night-vision green, smoke, muzzle flash |
| Horror | `#7b3a8c` | haunted, fog, violet moonlight, silhouettes with glowing eyes |
| Platformer | `#3d9bd6` | bright sky-blue, floating platforms, stars and springs, playful |
| RPG | `#c08a2e` | heroic fantasy, gold filigree, enchanted gear, glowing runes |
| Racing | `#d4473a` | motion blur, neon streaks, asphalt at night, nitro flames |
| Fighting | `#e0782a` | martial arts arena, orange stage lights, impact sparks |
| Sports | `#2f9e5b` | stadium floodlights, green turf, confetti, crowd bokeh |
| Strategy | `#4364a8` | war-room blues, hex grids, fortress walls, banners |
| City Builder | `#3f8f8c` | teal skyline at dusk, cranes, districts, warm windows |
| Card Game | `#8c56c4` | floating cards, purple arcane glow, shuffling motion |

For hero portraits, use the same prompt with "portrait, head and shoulders, looking at camera, square".
