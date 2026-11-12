// Every artwork slot in the game and the image-generator prompt for it. Shared by the Art Studio page
// (tools/art-studio/) and the tests, so it only imports plain data modules.

import { DECKS } from '../../src/data/index.js';
import { TOKENS } from '../../src/data/tokens.js';
import { rulesText } from '../../src/engine/text.js';

// Output size per slot kind. `ask` is the shape requested from the generator; the studio crops it to `w`×`h`.
export const KINDS = {
  card: { w: 768, h: 480, ask: 'a wide landscape image (3:2)' },
  deck: { w: 1024, h: 640, ask: 'a wide landscape image (3:2)' },
  hero: { w: 512, h: 512, ask: 'a square image (1:1)' },
  back: { w: 560, h: 784, ask: 'a tall portrait image (2:3)' },
};

// Every deck has its own art style, picked from style tests so no two decks share a medium. Keep these
// stable while a set is being made: changing them mid-set breaks consistency.
export const DECK_STYLE = {
  FPS: 'Gritty cinematic concept art, near-photoreal, like a frame from a shooter\'s key art. Night, rain, smoke and muzzle haze, '
    + 'desaturated cold palette, hard rim light, olive-green #7f9a3c accents on gear and lights.',
  Horror: 'A grainy found-footage still: harsh on-camera flash, VHS noise, scan lines and slight color bleed, crushed blacks. '
    + 'The flash catches the subject so it stays clearly visible. Violet #7b3a8c glow in eyes, haze and light leaks.',
  Platformer: 'Crisp 16-bit pixel art on a clean, even pixel grid (every pixel the same size, no blur or smoothing), '
    + 'bright limited palette, bold readable silhouette, sky-blue #3d9bd6 accents, floating platforms, stars and springs. '
    + 'Nothing that resembles a famous platformer mascot or its items.',
  RPG: 'Illuminated medieval storybook illustration: flat rich colors, fine ink outlines, gold-leaf details, ornamental vines '
    + 'and stars in the background, deep blue and gold #c08a2e palette. The ornament fills the scene edge to edge: '
    + 'no border, frame or panel around the picture.',
  Racing: 'Neon synthwave night scene: near-black background, glowing neon outlines, long motion streaks, wet reflective asphalt, '
    + 'nitro flames. Neon colors are red #d4473a, hot orange and white only: no purple, pink or blue.',
  Fighting: 'Anime cel-shading: clean confident line art, flat cel shadows, vivid colors, dynamic foreshortened pose, '
    + 'energy swirls and impact sparks in orange #e0782a.',
  Sports: 'Photo-real sports action shot, like a trading-card photo: frozen motion, bright stadium floodlights, '
    + 'shallow depth of field with crowd bokeh, bright saturated colors, green #2f9e5b team accents. Celebratory, not gritty.',
  Strategy: 'Bold vintage war-poster illustration: flat geometric shapes, a palette of navy, blue #4364a8, cream and a touch of red, '
    + 'printed paper grain and halftone, heroic low angle, banners and silhouetted armies. Plain sky blocks behind the subject: '
    + 'no sunburst rays and no real-world flags, insignia or political symbols.',
  CityBuilder: 'Isometric tilt-shift miniature diorama: a tiny, detailed model world photographed up close, strong blur at the top '
    + 'and bottom, warm glowing windows at dusk, teal #3f8f8c accents. People look like small painted figurines.',
  CardGame: 'Holographic foil trading-card art: prismatic rainbow sheen on surfaces, sparkles and light flares, glossy and '
    + 'high-contrast on a purple #8c56c4 base, playing cards in motion. The foil effect is on the subject and scene, not a frame.',
};

// For slots that belong to no deck: the card back and the generic token art.
const NEUTRAL_STYLE = 'Digital painting with dramatic rim lighting, deep shadows and a vivid neon accent, painterly detail.';

const FAMILY = [
  'Illustration for a collectible card game.',
  'One clear focal subject, readable even as a small thumbnail: strong silhouette, clear contrast from the background.',
  'Original design, not based on any existing game, film, franchise or artist.',
  'No text, letters, numbers or logos. No card frame, border or watermark.',
].join(' ');

const KEYWORD_POSE = {
  Rush: 'charging forward mid-motion',
  Guard: 'in a sturdy defensive stance, shield or barrier raised',
  FirstStrike: 'striking first with blinding speed',
  Counter: 'poised to counterattack',
  Stealth: 'half-hidden in shadow',
  Fear: 'with a terrifying, menacing presence',
  Haunt: 'trailing a ghostly aura',
  Devour: 'hungry, jaws or claws bared',
  DoubleJump: 'leaping high through the air',
  Fortify: 'armored and immovable',
  Structure: 'a building or structure, not a creature',
  Inspire: 'rallying allies behind it',
  Headshot: 'aiming with deadly precision',
};

const scale = cost =>
  cost <= 1 ? 'a small, scrappy' : cost <= 3 ? 'a capable' : cost <= 5 ? 'a powerful' : 'a colossal, legendary';

const words = s => s.replace(/([a-z])([A-Z])/g, '$1 $2');

function cardSubject(card, deck) {
  const world = deck ? `a world inspired by ${words(deck.name)} video games` : 'the same world as its summoner';
  if (card.type === 'Spell') {
    return `Subject: the action or item "${card.displayName}", shown as one dramatic moment in ${world}.`;
  }
  const poses = card.keywords.map(k => KEYWORD_POSE[k]).filter(Boolean);
  const who = card.isToken ? `a summoned minion, "${card.displayName}"` : `"${card.displayName}", ${scale(card.cost)} character`;
  return `Subject: ${who} from ${world}${poses.length ? `, ${poses.join(', ')}` : ''}. One clear focal character.`;
}

// The prompt for one image, plus its parts so card prompts can be merged into a batch.
function prompt(kind, subject, style, extra = '') {
  const text = [
    FAMILY,
    `Art style: ${style}`,
    subject,
    extra,
    'Keep the subject centered with breathing room; the edges may be cropped slightly.',
    `Make it ${KINDS[kind].ask}.`,
  ].filter(Boolean).join('\n');
  return { prompt: text, style, subject, extra };
}

// Card slots go four to an image: a 2×2 grid of 3:2 panels, which the studio splits back into cards.
// Each panel of a 1536×1024 image is 768×512, enough for a 768×480 card.
export const BATCH = { cols: 2, rows: 2, positions: ['Top-left', 'Top-right', 'Bottom-left', 'Bottom-right'] };

// Card slots that can share a batch image with `slot`: same kind and same art style.
export const batchable = (a, b) => a.kind === 'card' && b.kind === 'card' && a.style === b.style;

export function batchPrompt(list) {
  const panels = BATCH.positions.map((pos, i) => {
    const s = list[i];
    if (!s) return `${pos}: leave this panel plain black.`;
    return `${pos}: ${s.subject.replace(/^Subject: /, '')}${s.extra ? ` ${s.extra}` : ''}`;
  });
  return [
    FAMILY,
    `Art style: ${list[0].style}`,
    `Make ONE image split into a ${BATCH.cols}×${BATCH.rows} grid of ${BATCH.positions.length} equal panels, edge to edge, `
      + 'separated only by thin black lines. Each panel is its own complete card illustration in this same art style, '
      + 'with its subject centered and breathing room around it. No labels, numbers or captions on the panels.',
    ...panels,
    `Make it ${KINDS.card.ask}.`,
  ].join('\n');
}

// The deck whose cards summon this token most often, or null if none does.
function tokenDeck(tokenId) {
  let best = null, bestCount = 0;
  for (const deck of DECKS) {
    const n = deck.cards.flatMap(c => c.effects).filter(e => e.token === tokenId).length;
    if (n > bestCount) { best = deck; bestCount = n; }
  }
  return best;
}

// { key, kind, group, name, sub, w, h, prompt, style, subject, extra } for every slot. `key` is the path
// under assets/img without extension; the studio saves `<key>.webp`.
export function allSlots() {
  const slots = [];
  const add = (kind, key, group, name, parts, sub = '') =>
    slots.push({ key, kind, group, name, sub, w: KINDS[kind].w, h: KINDS[kind].h, ...parts });

  for (const deck of DECKS) {
    const style = DECK_STYLE[deck.id];
    add('deck', `decks/${deck.id}`, deck.id, `${deck.name} — deck art`,
      prompt('deck', `Subject: key art for the ${words(deck.name)} faction. ${deck.tagline} A wide scene with several characters.`, style),
      'Menu tiles and fallback for cards without art');
    add('hero', `heroes/${deck.id}`, deck.id, `${deck.name} — hero portrait`,
      prompt('hero', `Subject: the champion of the ${words(deck.name)} faction. Portrait, head and shoulders, looking at the camera.`, style),
      'Match screen avatar');
    for (const card of deck.cards) {
      const rules = rulesText(card).replace(/\n/g, ' ');
      add('card', `cards/${card.cardId}`, deck.id, card.displayName,
        prompt('card', cardSubject(card, deck), style,
          rules ? `What the card does, for mood only (do not draw any text): ${rules}` : ''),
        card.type === 'Spell' ? `Spell · ${card.cost}` : `Monster · ${card.cost} · ${card.baseAttack}/${card.baseHealth}`);
    }
  }
  // A token is drawn in the style of the deck that summons it most, so it matches its summoner on the board.
  for (const t of TOKENS) {
    const deck = tokenDeck(t.cardId);
    add('card', `cards/${t.cardId}`, 'Extras', t.displayName,
      prompt('card', cardSubject(t, deck), deck ? DECK_STYLE[deck.id] : NEUTRAL_STYLE),
      `Token · ${t.baseAttack}/${t.baseHealth}${deck ? ` · ${deck.name} style` : ''}`);
  }
  add('deck', 'decks/token', 'Extras', 'Generic token art',
    prompt('deck', 'Subject: a swirl of small summoned minions materialising from light.', NEUTRAL_STYLE),
    'Fallback for tokens without art');
  add('back', 'ui/card-back', 'Extras', 'Card back',
    prompt('back', 'Subject: the back of a playing card. A symmetrical ornamental emblem on dark navy, gold filigree and neon glow, abstract, no characters.', NEUTRAL_STYLE),
    'Shown for face-down cards');
  return slots;
}

// Paths the studio server may write: assets/img/<cards|decks|heroes|ui>/<name>.webp
export const SAVE_PATH = /^assets\/img\/(cards|decks|heroes|ui)\/[A-Za-z0-9_-]+\.webp$/;
