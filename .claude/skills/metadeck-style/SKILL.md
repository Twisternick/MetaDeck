---
name: metadeck-style
description: MetaDeck's own visual and motion language for the web client: dark glass, neon deck accents, holographic cards, card-game juice in the Hearthstone/MTGA spirit. Use whenever building, restyling or reviewing any MetaDeck web UI (web/styles.css, web/pages.css, web/src/ui/*), and before applying any generic design skill to it. Overrides the generic skills (emil-design-eng, animate, choreograph, make-interfaces-feel-better, web-design-guidelines) wherever they conflict.
---

# MetaDeck style

MetaDeck is a card game, not a SaaS app. The generic design skills installed next to this one were written for product UI and lean toward restraint. Use them for **craft** (curves, interruptibility, performance, accessibility, small details) and use this skill for **taste**. When they disagree, this skill wins.

## Hard rules

1. **No SVG imagery.** Every visual is CSS, a raster image (`.webp` in `web/assets/img`), or an image placeholder. SVG is acceptable only for text. Don't add icon libraries or inline `<svg>` illustrations; `web/src/ui/fx.js` states this too.
2. **Vanilla JS + plain CSS.** No React, Tailwind, Framer Motion or Motion One. Translate recipes from the generic skills into CSS transitions/keyframes or the Web Animations API (`el.animate`), which is what `fx.js` uses.
3. **Extend the tokens in `web/styles.css` `:root`; never fork them.** Use them, and add new ones only next to the existing ones:
   - Surfaces: `--bg-0/1/2`, `--glass`, `--glass-2`, `--glass-3`, `--stroke`, `--stroke-2`, `--plate`, `--plate-rim`
   - Text: `--text`, `--muted`, `--dim`, `--gold-ink`
   - Accents: `--accent` (gold) and `--accent-2`, `--cyan`, `--violet`, `--pink`, `--good`, `--bad`, `--info`
   - Game stats: `--mana`, `--mana-temp`, `--atk`, `--hp`, `--nitro`
   - Shape: `--radius` (14px), `--radius-lg` (22px)
   - Type: `--display` (Brunson, for titles), `--tech` (Rajdhani, for numbers, labels, buttons), `--body` (Space Grotesk), `--condensed`
   - Motion: `--ease-out` `(.16,1,.3,1)`, `--ease-spring` `(.34,1.56,.64,1)`, `--ease-snap` `(.2,.8,.2,1)`
   - Per-element hooks: `--deck` (deck colour), `--glow`, `--gem`, `--mx/--my/--rx/--ry` (tilt + glare), `--zoom` (big-screen scale)

   The generic skills quote their own `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` and friends. **Don't paste those in.** Map them to the tokens above: their ease-out becomes ours, their drawer curve becomes `--ease-snap`, and overshoot becomes `--ease-spring`.
4. **Reuse `web/src/ui/fx.js` before writing new effects.** It already has tilt + glare (`data-tilt`), ripples, `countUp`, `impact`, `damageSplat`, `screenShake`, `sparkle`, `dissolve`, `castFly`, `flyTo`, `dealFrom`, `confetti`, `showBanner`, `keywordCallout`, `flashRing` and `artSlot`. Gate every JS effect on `motionOK()`.
5. **Scale is `zoom`-based.** Viewport units are written as `calc(Nvh / var(--zoom))`. Measure positions with `rectOf`/`pt`/`viewW`/`viewH` from `dom.js`, never raw `getBoundingClientRect` maths.

## Taste: where the generic skills are too quiet

The generic skills say "most UI shouldn't animate" and "keep it under 300ms". That's right for menus and forms and **wrong for game moments**. Split the UI in two:

| Surface | Motion budget | Examples |
|---|---|---|
| **Chrome**: nav, settings, forms, tables, rules/guide/tier pages, feedback | Follow the generic skills strictly: 120–250ms, `--ease-out`, opacity + small translate, no bounce, no loops | header, deck list rows, `pages.css` content |
| **Game**: cards, board, hand, packs, rewards, match found, rank ups, turn banners | Juice is the point: overshoot (`--ease-spring`), anticipation, impact frames, screen shake, glow pulses, particles, and 400–900ms sequences for big moments | `.card`, `.minion`, `.pull`, `.pack-overlay`, `.match-found`, banners |

What makes the game side feel good:
- **Weight.** Cards lift on hover (`--lift`, tilt toward the pointer, glare follows `--mx/--my`), compress slightly on press, and land with a settle rather than stopping dead.
- **Rarity escalates.** common → rare → epic → legendary should feel different: gem colour (`--gem`), frame image (`frame-<rarity>.webp`), halo/glow strength, reveal duration. Legendary gets the longest build-up and the biggest payoff. Never give a common a legendary-sized effect.
- **Anticipation before payoff.** Pack rips, card flips and reward reveals build up (charge, shake, glow) and then release (burst, confetti, sound). Hitting the payoff instantly wastes the moment.
- **Every hit reads.** Damage uses `damageSplat` + `impact` + a short `hitFlash`. Healing is green and floats upward. Death uses `dissolve`. The player should never have to read a log to know what happened.
- **Sound with motion.** Pair big moments with `audio.js` SFX; the timing of motion and sound should match.
- **Ambient life is cheap and quiet.** The background aurora, grid and stars, plus subtle foil and holo drift on premium cards, run on `transform`/`opacity` only, and pause when hidden (see `body:has(...) .bg { display: none }`).

## Where the generic skills are right (apply them)

- Animate `transform` / `opacity` / `filter` only. Never `transition: all`; list the properties, as `.btn` does.
- Interruptible: hover-out mid-lift must reverse smoothly. Use transitions, not keyframes, for state that can flip back.
- Correct `transform-origin`: cards fan from the bottom of the hand, popovers grow from their trigger.
- Visible `:focus-visible` on everything interactive (the existing rule is at `.btn:focus-visible, .chip:focus-visible, ...`).
- `font-variant-numeric: tabular-nums` on changing numbers (mana, HP, gold, timers, win rates).
- Gate hover-only effects behind `@media (hover: hover) and (pointer: fine)` so touch devices don't get stuck hover states.
- Real `<button>` and `<a>` elements, `aria-label` on icon-only controls, `aria-live` for toasts and turn changes.

## Reduced motion

The current rule (`styles.css`, near `.card, .minion, .deck-tile` under `prefers-reduced-motion`) kills all animation and transitions globally, and `motionOK()` gates JS effects. Keep new work compatible with that. If you do refine it, the direction from the generic skills is "gentler, not zero": keep opacity fades and state changes, and drop movement, shake, particles and loops.

## Anti-slop checklist for MetaDeck

Flag these in review:
- Generic SaaS look: flat white cards, grey borders, a lone blue primary button, or `Inter` with nothing else. MetaDeck is dark glass, gold, and neon per deck.
- Purple-to-blue gradient hero sections with no relation to the game.
- Emoji used as icons. Use raster art, the deck emblem (`deckEmblem`), or CSS-built shapes.
- New one-off colours or easing curves instead of tokens.
- Same-size, same-speed animation on everything, with no hierarchy between a button hover and a legendary reveal.
- Effects with no gameplay meaning, such as a glow on something that isn't playable, selected or rare.
- Static game moments: a card that teleports instead of flying, damage with no splat, a reward with no reveal.
- Any `<svg>` used as an image.
