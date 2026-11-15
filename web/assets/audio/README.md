# Sound slots

Drop an `.mp3` named after its slot into this folder, and the game plays it on the next load. No code change is needed. A missing file just plays nothing, so the game works with any subset of these.

MP3 plays in every browser. Keep effects short (under a second where possible), trimmed tight at the start, and normalised so they sit at similar loudness. The per-slot volumes in `src/ui/audio.js` (`SLOTS`) handle the rest.

**Every file needs a license that allows use in a commercial game.** Record each one in `CREDITS.md` next to this file: the file name, where it came from, its license, and the attribution if the license asks for one.

## Where to get sounds

| Source | License | Good for |
|---|---|---|
| [Kenney](https://kenney.nl/assets?q=audio): *Interface Sounds*, *UI Audio*, *Impact Sounds*, *RPG Audio*, *Casino Audio* (card sounds), *Digital Audio* | CC0, no attribution needed | Almost every interface, card and hit slot |
| [Sonniss GDC Game Audio Bundles](https://gdc.sonniss.com) | Royalty-free, commercial use allowed, no attribution needed | Bigger hits, magic, stingers, per-deck flavour sounds |
| [Freesound](https://freesound.org), with the license filter set to **Creative Commons 0** | CC0 | Anything specific (an engine rev, a coin, a crowd cheer) |
| Music: game-music packs on itch.io or Humble bundles, or [Kevin MacLeod](https://incompetech.com) | Per pack / CC-BY (credit required) | `music-menu`, `music-match` |

## Slots

### Interface

| Slot | When it plays | Suggestion |
|---|---|---|
| `click` | Any button | Short soft click |
| `hover` | Mouse over a button or deck tile (quiet) | Very short tick |
| `back` | Back / Main menu / Cancel buttons | Lower-pitched click |
| `error` | A move that isn't allowed, error toasts | Soft "nope" buzz |
| `coin` | Gold added | Coin clink |
| `reward` | Match rewards appear | Short bright chime |
| `unlock` | Archetype level-up, a tutorial step done | Rising chime |

### Match

| Slot | When it plays | Suggestion |
|---|---|---|
| `draw` | You draw a card | Card slide |
| `pickup` | You pick up a card from your hand | Card lift / paper |
| `drop` | You return a dragged card to your hand | Soft paper settle |
| `play` | A monster card leaves the hand | Card slap on a table |
| `summon` | Fallback when a monster lands on the board | Short tabletop landing |
| `spell` | A spell is cast | Magic whoosh |
| `attack` | A monster attacks | Whoosh / swing |
| `hit` | A monster takes damage (louder for big hits) | Punchy impact |
| `crit` | Headshot | Heavy impact with a crack |
| `hero-hit` | A hero takes damage | Deep impact |
| `death` | A monster is destroyed | Shatter / crumble |
| `heal` | Healing | Soft shimmer |
| `buff` / `debuff` | Stats go up / down, Silence, Suppress | Rising / falling blip |
| `shield` | Powered Up blocks damage, Checkpoint saves a monster | Shield clang |
| `keyword` | A keyword triggers | Small sparkle |
| `fizzle` | An attack fizzles before it resolves | Falling puff |
| `your-turn` / `enemy-turn` | Turn banner | Bright gong / softer low tone |
| `alert` | You can answer an attack, or receive a lobby invite | Double attention ping |
| `tick` | The last 10 seconds of your online turn | Clock tick |
| `victory` / `defeat` | Game over | Fanfare (2–4 s) / sad sting |
| `tie` | Match ends in a draw | Neutral open fifth |

### Monster summon sounds by deck

Every monster entering the board uses its summoning player’s deck cue, including tokens and monsters brought back by an effect. Missing cues fall back to `summon`.

| Slot | Idea |
|---|---|
| `summon-FPS` | Gun cock / slide rack |
| `summon-Horror` | Creepy sting or creak |
| `summon-Platformer` | 8-bit jump or coin blip |
| `summon-RPG` | Sword unsheathe or menu chime |
| `summon-Racing` | Engine rev |
| `summon-Fighting` | Punch with a crowd "ooh" |
| `summon-Sports` | Whistle or crowd cheer |
| `summon-Strategy` | Marching drums |
| `summon-CityBuilder` | Construction clank or cash register |
| `summon-CardGame` | Card riffle shuffle |

### Packs

| Slot | When it plays | Suggestion |
|---|---|---|
| `pack-open` | A pack is torn open | Foil rip |
| `flip` | A card is flipped | Card flip |
| `reveal-rare` / `reveal-epic` / `reveal-legendary` | A card of that rarity is revealed | Rising stingers; Legendary the biggest |
| `shine` | A premium or hologram card | Sparkle shimmer |

### Music (looping)

| Slot | When it plays |
|---|---|
| `music-menu` | Menus, collection, shop |
| `music-match` | During a match |

Music should loop cleanly and be a few minutes long. Encode it at 128–160 kbps to keep the download small.
