// Every artwork slot in the game and the image-generator prompt for it. Shared by the art tool
// (tools/art.mjs) and the tests, so it only imports plain data modules.

import { DECKS } from '../../src/data/index.js';
import { TOKENS } from '../../src/data/tokens.js';
import { rulesText } from '../../src/engine/text.js';
import { REDO, REDO_REASONS, REDO_THEMES } from './redo.js';
import { COSMETICS } from '../../src/data/economy.js';
import { KEYWORDS, TERMS, RULES } from '../../src/engine/constants.js';
import { keywordIconKey, ruleIconKey, triggerIconKey, uiIconKey, TRIGGERS, UI_ICONS } from '../../src/ui/icon-keys.js';

// Output size per slot kind. `ask` is the shape requested from the generator; the art tool crops it to `w`×`h`.
// `fit` kinds are cut-outs on a transparent background: the art tool fits them whole instead of cropping.
// `trim` kinds (9-slice borders) are cut to their drawn edge first and stretched to fill the slot.
const CLEAR = 'with a fully transparent background, exported as a PNG';
export const KINDS = {
  card: { w: 768, h: 480, ask: 'a wide landscape image (3:2)' },
  deck: { w: 1024, h: 640, ask: 'a wide landscape image (3:2)' },
  hero: { w: 512, h: 512, ask: 'a square image (1:1)' },
  back: { w: 560, h: 784, ask: 'a tall portrait image (2:3)' },
  scene: { w: 1536, h: 864, ask: 'a wide landscape image (16:9 or 3:2)' },
  logo: { w: 1600, h: 640, ask: `a wide image (5:2) ${CLEAR}`, fit: true },
  frame: { w: 560, h: 784, ask: `a tall portrait image (5:7) ${CLEAR}`, fit: true },
  ornament: { w: 1536, h: 384, ask: `a very wide image (4:1) ${CLEAR}`, fit: true },
  icon: { w: 512, h: 512, ask: `a square image (1:1) ${CLEAR}`, fit: true },
  border: { w: 512, h: 512, ask: `a square image (1:1) ${CLEAR}`, fit: true, trim: true },
};

// The house style, set by the title screen key art (ui/key-art.webp): every UI piece (logo, frames,
// backgrounds, effects) is drawn in it so the screens match the title. Attach the key art as a reference.
const KEY_ART_STYLE = 'Epic high-fantasy game UI art matching the reference key art: polished silver-white and bright gold metal '
  + 'with chiselled bevels and cracked glowing gold inlay, electric-blue crystal gems, strong warm rim light, '
  + 'cosmic deep-navy and violet backdrop with blue and orange energy swirls, gold sparks and a painterly, glossy finish.';
const REFERENCE = 'If you can see the reference image (the MetaDeck key art), match its materials, colours and lighting exactly.';

// UI art skips the shared FAMILY rules: those are for card illustrations and forbid frames and borders.
function uiPrompt(kind, subject, extra = '') {
  const text = [
    `Art style: ${KEY_ART_STYLE}`,
    subject,
    extra,
    'Original design, not based on any existing game. No text, letters or numbers unless asked for, no watermark.',
    REFERENCE,
    `Make it ${KINDS[kind].ask}.`,
  ].filter(Boolean).join('\n');
  return { prompt: text, style: KEY_ART_STYLE, subject, extra };
}

// The menu logo: the wordmark from the key art on its own.
const LOGO_PROMPT = uiPrompt('logo',
  'Subject: a game logo wordmark reading exactly "METADECK" (one word, all capitals, spelled M-E-T-A-D-E-C-K). '
    + 'Chunky chiselled serif letters in polished silver-white metal with cracked, glowing gold inlay and thick bevelled gold edges, '
    + 'deep navy shadow side. The "M" and the "K" are tall and flared at the ends; the letters arch very slightly. '
    + 'Behind the middle of the word, a pointed gold crest with a glowing electric-blue crystal star at its centre, its points extending above and below the letters.',
  'Small gold sparkles and a soft golden glow hugging the letters only. Nothing else: no background, sky, cards, clouds or scenery. '
    + 'Match the reference logo exactly, just cut out from the scene. The logo fills the width with a little empty margin all round.');

// Card frames by rarity: an overlay drawn over the card, so the art window and text box must be see-through.
const FRAME_TIER = {
  common: 'Plain polished silver frame with simple bevels and a small round steel gem at the top. Modest, no glow.',
  rare: 'Silver frame with gold trim along the inner edge, small corner filigree and an electric-blue crystal gem at the top with a soft glow.',
  epic: 'Gold frame with violet-purple crystal inlays, flared corner points and a glowing purple gem at the top, faint purple energy along the edges.',
  legendary: 'Ornate gold frame like the key art crest: pointed flared corners, cracked glowing gold inlay, a large blazing electric-blue star gem at the top, '
    + 'small gold wings or spikes on the sides and orange-gold sparks around the outside.',
};
const FRAME_LAYOUT = 'Layout, top to bottom: a wide window for the illustration in the top half, a slim name banner across its bottom edge, '
  + 'then a rectangular text box in the lower part, a round socket at the top-left corner for the cost and two round sockets at the bottom corners for attack and health. '
  + 'The illustration window, the name banner and the text box are completely empty and transparent, as is everything outside the frame.';

// Every deck has its own art style, picked from style tests so no two decks share a medium. Keep these
// stable while a set is being made: changing them mid-set breaks consistency.
export const DECK_STYLE = {
  FPS: 'Gritty cinematic concept art, near-photoreal, like a frame from a shooter\'s key art. Night, rain, smoke and muzzle haze, '
    + 'desaturated cold palette, hard rim light, olive-green #7f9a3c accents on gear and lights.',
  Horror: 'A grainy found-footage still from a cheap camcorder, near-photoreal: harsh on-camera flash, VHS noise, scan lines '
    + 'and slight color bleed at the frame edges, crushed blacks. The flash catches the subject in natural, sickly, desaturated colors '
    + '(grey, brown, rust, pale flesh) so it stays clearly visible, in a real, grimy place: sewers, basements, hospital corridors, '
    + 'wet concrete, rusted barrels, peeling walls. Violet #7b3a8c is an accent only, in glowing eyes and a faint light leak: '
    + 'never a purple wash, purple fog or purple sky over the scene. '
    + 'Nothing that resembles a famous horror character: no pyramid or triangular metal helmet, no hockey mask, '
    + 'no burned face with a striped sweater, no long-haired girl crawling out of a well.',
  Platformer: 'Crisp 16-bit pixel art on a clean, even pixel grid (every pixel the same size, no blur or smoothing), '
    + 'bright limited palette, bold readable silhouette, sky-blue #3d9bd6 accents, floating platforms, stars and springs. '
    + 'Nothing that resembles a famous platformer mascot or its items: no green warp pipes, turtle shells or spiked shells, '
    + 'no horned turtle king, no blue spiky hedgehog-like runner, not even as a silhouette.',
  RPG: 'Illuminated medieval storybook illustration: flat rich colors, fine ink outlines, gold-leaf details, ornamental vines '
    + 'and stars in the background, deep blue and gold #c08a2e palette. The ornament fills the scene edge to edge: '
    + 'no border, frame or panel around the picture.',
  Racing: 'Sleek daytime motorsport concept art: bright hard sunlight, hazy pale sky, heat shimmer off the asphalt, crisp reflections '
    + 'on glossy paint, motion blur on the track behind the subject. Liveries in white, silver and racing red #d4473a. '
    + 'Usually the vehicle or the moment on track is the subject, shown whole; when a person is shown, frame them with their car '
    + 'or gear, not as a face close-up. No night scenes, neon glow, flames swirling around the frame, or orange-dominant color. '
    + 'Vary the vehicle and the camera from card to card (side-on, rear three-quarter, overhead, a close detail): '
    + 'do not default to the white sports car seen head-on.',
  Fighting: 'Anime cel-shading: clean confident line art, flat cel shadows, vivid colors, dynamic foreshortened pose, '
    + 'energy swirls and impact sparks in orange #e0782a. Every scene is set in the same sunlit stone colosseum: '
    + 'tiered stands packed with a cheering crowd, red-and-gold banners, bright blue sky and a sandy stone floor, clearly visible '
    + 'behind the fighter. Never a plain fire vortex, dark void or abstract background. '
    + 'Every fighter is an original character with their own look: '
    + 'varied outfits (track suits, street clothes, armor plates, capes, ring gear, uniforms), hairstyles and builds. '
    + 'Nothing that resembles a famous fighting-game character: no red headband with a torn white gi, no prayer beads, '
    + 'no glowing hand-held fireball, no red braids with a green leotard, no red headband with red gloves, '
    + 'no hair buns with ribbons, spiked bracelets or a qipao, no white gi with torn-off sleeves and a headband. '
    + 'Women fighters wear their hair loose, cropped, braided or in a ponytail, never in buns.',
  Sports: 'Photo-real sports action shot, like a trading-card photo: frozen motion, bright stadium floodlights, '
    + 'shallow depth of field with crowd bokeh, bright saturated colors, green #2f9e5b team accents. Celebratory, not gritty. '
    + 'Show the idea through what happens, not a face: full-body action, wide shots of the play, the ball or gear up close, '
    + 'the bench, the sideline or the scoreboard moment. Mix sports (soccer, American football, basketball, hockey, baseball) '
    + 'and players of different ages and builds. No shouting face close-ups, and never the same pose twice. '
    + 'Plain kits, shoes and gear with no brand logos, swooshes or stripes that read as a real brand.',
  Strategy: 'Bold vintage war-poster illustration: flat geometric shapes, a palette of navy, blue #4364a8, cream and a touch of red, '
    + 'printed paper grain and halftone, heroic low angle, banners and silhouetted armies. Plain sky blocks behind the subject: '
    + 'no sunburst rays and no real-world flags, insignia or political symbols.',
  CityBuilder: 'Isometric tilt-shift miniature diorama: a tiny, detailed model world photographed up close, strong blur at the top '
    + 'and bottom, warm glowing windows at dusk, teal #3f8f8c accents. People look like small painted figurines.',
  CardGame: 'Glossy painted fantasy art set in a world made of trading cards, on a deep charcoal-black background. '
    + 'The subject is painted in natural, solid colors with a crisp white rim light, so it pops from the dark. '
    + 'Holographic foil is an accent only: a prismatic rainbow sheen on the playing cards, sleeves and trim, never over the whole picture. '
    + 'Purple #8c56c4 appears only in small glints, never as the background or main color. '
    + 'Creatures, objects and scenes made from cards, boxes and game pieces, not a figure holding up cards.',
};

// Cosmetics: each card back and arena sold in the shop or given on the season track. The game layers CSS
// motion on top (a foil sheen on backs; particles and a coloured mat rim on arenas), so the image itself
// should be still and leave room for that: backs keep a strong centre, arenas keep a calm middle.
const COSMETIC_FINISH = 'Premium collectible game cosmetic: polished, painterly and glossy, rich lighting, crisp detail.';
const BACK_RULES = 'The back of a collectible card seen perfectly straight on, filling the whole image edge to edge. '
  + 'Symmetrical, with one bold emblem in the centre and an ornamental border running round all four edges just inside the image. '
  + 'Reads clearly as a small thumbnail: strong central silhouette, darker outer edges. No people, no text, letters or numbers.';
const ARENA_RULES = 'A game table surface for a card battle, seen from directly above, filling the whole image. '
  + 'The middle 60% is calm, flat and fairly dark so cards placed on it stay readable; light sources, props and detail sit around the edges and corners. '
  + 'Even top-down view with no perspective horizon. No people, no cards, no text.';
export const COSMETIC_ART = {
  'back:neon-grid': 'Synthwave: a glowing magenta and cyan wireframe grid receding into a hot-pink setting sun in the centre, a chrome diamond emblem over the sun, '
    + 'chrome-and-neon border. Palette: deep purple #12002a, hot pink #f472b6, cyan #22d3ee. Glossy 1980s retro-futurist airbrush finish.',
  'back:aurora': 'Northern lights: ribbons of green #34f5a2 and violet #a78bfa aurora curling round a faceted ice-blue crystal star in the centre, '
    + 'a frosted silver border dotted with tiny stars, deep night-blue #06142a background. Soft, luminous.',
  'back:gold-circuit': 'Gold circuit board: gleaming gold traces on black lacquer, all running symmetrically into a central gold chip shaped like a crest with a glowing amber core, '
    + 'small solder points glowing, thin engraved gold border. Precise, luxurious, metallic.',
  'back:pixel-pop': 'Crisp 16-bit pixel art on an even pixel grid (every pixel the same size, no blur): a candy pattern of pink #f472b6, cyan #22d3ee, '
    + 'butter yellow #ffe08a and lilac #a78bfa, a big chunky pixel-art star gem in the centre with a pixel shine, a chunky pixel border.',
  'back:void-rift': 'A swirling tear in space: a pure black void in the centre ringed by a spiral of violet #a78bfa, cyan and pink energy, '
    + 'stars and debris pulled inward, a cracked obsidian border with glowing violet seams. Cosmic and dramatic.',
  'back:midnight-tape': 'A grainy found-footage still: a black VHS cassette with a blank label, one glowing violet #7b3a8c eye in the centre of the label, '
    + 'scan lines, slight colour bleed and tracking noise at the edges, a cracked black plastic border. Crushed blacks, harsh flash.',
  'back:dragon-hoard': 'A golden dragon coiled in a ring round a glowing ruby, its body framing the centre, on a bed of gold coins and cut gems, '
    + 'a gold filigree border with dragon-scale texture. Rich gold, crimson and deep blue, illuminated fantasy finish.',
  'back:dog-tags': 'Gritty military: a pair of worn steel dog tags on a ball chain hanging in the centre, blank and scratched, over olive and charcoal woodland camo cloth, '
    + 'rain beads on the metal, a riveted gunmetal border with olive-green #7f9a3c tactical lights at the corners. Cold, desaturated, hard rim light.',
  'back:cloud-hop': 'Crisp 16-bit pixel art on an even pixel grid (every pixel the same size, no blur): floating grassy pixel islands and puffy pixel clouds in a sky-blue #3d9bd6 sky, '
    + 'a big chunky golden pixel star in the centre with a pixel shine, a chunky pixel border of grass and stone blocks. Original, not based on any existing game.',
  'back:chequered-flag': 'Daytime motorsport: a black-and-white chequered flag rippling across the whole back, a bold racing-red #d4473a and white livery stripe running diagonally through it, '
    + 'a polished chrome steering-wheel emblem in the centre, a carbon-fibre border with red stitching. Bright hard sunlight, glossy.',
  'back:dojo-seal': 'Anime cel-shading: a bold black ink-brush circle (enso) in the centre on red lacquer, orange #e0782a energy swirls and impact sparks bursting round it, '
    + 'a border of knotted white cloth hand wraps. Clean line art, flat cel shadows, vivid.',
  'back:stadium-lights': 'Photo-real sports: fresh-cut striped green #2f9e5b turf seen from above with a crisp white centre circle, a gleaming trophy-cup emblem in the centre, '
    + 'two floodlight flares in the top corners, a silver-and-green border like a championship banner. Bright, celebratory.',
  'back:war-banner': 'Bold vintage war-poster: a cream and navy heraldic banner filling the back, a blue #4364a8 field with a red diagonal stripe, a chess-knight emblem in the centre, '
    + 'printed paper grain and halftone, a stencilled border of marching spear silhouettes. Flat geometric shapes, no real-world flags or insignia.',
  'back:blueprint': 'An architect\'s blueprint: crisp teal #3f8f8c and white line drawings of a fantasy city skyline with domes and towers, a compass rose in the centre, '
    + 'measurement marks and a drafting-grid border, on deep blueprint blue. Precise, warm glow from the lines.',
  'back:house-deck': 'A classic playing-card back reimagined as a collectible: a symmetrical red #d23b4a and ivory lattice pattern, a black spade inside an ornate ivory medallion in the centre, '
    + 'a thin gold foil border, on charcoal. Crisp print detail, a little foil glint.',
  'arena:killhouse': 'A rain-soaked concrete training yard at night seen from straight above: wet cracked slabs with puddles filling the middle, '
    + 'sandbag walls, ammo crates and a snapped chain-link fence along the edges, olive-green #7f9a3c chem lights glowing in two corners. Gritty, desaturated.',
  'arena:sky-islands': 'Crisp 16-bit pixel art: a calm deep-blue dusk sky filling the middle, small floating grassy pixel islands, springs and golden stars only round the edges, '
    + 'sky-blue #3d9bd6 accents. Even pixel grid, no blur. Original, not based on any existing game.',
  'arena:tavern-table': 'A worn oak tavern table at night seen from straight above: dark smooth planks filling the middle, '
    + 'a lit candle, tankards, dice, a coin purse and a corner of a parchment quest map round the edges. Deep blue and gold #c08a2e storybook palette, warm candlelight.',
  'arena:dojo-floor': 'A dojo floor seen from straight above: calm tatami mats filling the middle, paper lanterns, a wooden practice post and rolled hand wraps along the edges, '
    + 'orange #e0782a sparks drifting in the light. Anime cel-shading, clean line art.',
  'arena:home-turf': 'A floodlit sports pitch seen from straight above: mown green #2f9e5b stripes and crisp white lines filling the middle, '
    + 'a sideline bench, a water cooler, balls and cones along the edges, floodlight flares in the top corners. Photo-real, bright.',
  'arena:war-table': 'A general\'s campaign table seen from straight above: a faded navy-and-cream map of hills and rivers filling the middle, '
    + 'wooden army markers, a brass compass and a dagger pinning the map at the edges, wisps of fog. Vintage war-poster flat shapes, blue #4364a8, cream and a touch of red.',
  'arena:model-city': 'A tilt-shift miniature diorama seen from straight above: a calm cobbled plaza filling the middle, tiny model houses with glowing windows, '
    + 'trees and a fountain packed round the edges, teal #3f8f8c roofs, warm dusk light, strong blur at the top and bottom.',
  'arena:card-table': 'A tournament play table seen from straight above: smooth charcoal felt filling the middle with a thin red #d23b4a trim line round it, '
    + 'deck boxes, dice and a scorepad along the edges, a single gold spotlight glint. No cards. Clean, premium.',
  'back:founder': 'A founding crest: a faceted gold M monogram shield set in the centre, crowned by a small star, framed by a laurel wreath of gold leaves, '
    + 'on deep midnight-blue #0a0d1c lacquer with fine gold engraving radiating outwards, a heavy ornate gold border with tiny inset gems at the corners. '
    + 'Regal, rare and celebratory, like a first-edition seal.',
  'arena:founders-hall': 'A grand hall\'s marble floor seen from straight above: polished dark navy marble filling the middle, a thin inlaid gold ring around it, '
    + 'gold-trimmed pillars\' bases, velvet banners and warm candelabra light only along the edges and corners, a few gold confetti flecks. Prestigious, celebratory, calm in the centre.',
  'arena:synthwave': 'A neon synthwave floor: black glass with a glowing magenta and cyan grid, a sunset gradient glowing along the top edge, chrome trim down the sides, '
    + 'palm-leaf silhouettes only in the far corners.',
  'arena:deep-space': 'A table of dark glass floating in deep space: violet and cyan nebulae seen through it, scattered stars, a ringed planet and asteroids only at the corners.',
  'arena:sunset-court': 'An open-air courtyard at dusk: warm sandstone and terracotta tiles, long golden-orange light from one side, '
    + 'lanterns and potted plants along the edges, a violet sky reflected in the polished stone.',
  'arena:molten-core': 'A slab of cooled black basalt: glowing orange lava cracks and molten channels running round the border, embers at the edges, the centre dark and solid.',
  'arena:crystal-vault': 'A floor of polished ice-blue crystal: prismatic light refracting in cyan, violet and pink, clusters of crystals growing in the corners, a little frost.',
  'arena:haunted-manor': 'An old dark-wood banquet table in a haunted manor at midnight: iron candelabras with flickering candles in two opposite corners, '
    + 'cobwebs, a cracked lace runner, dried roses and low fog at the edges. Violet #7b3a8c and candle-orange light.',
  'arena:night-circuit': 'A racetrack at night seen from straight above: dark asphalt filling the middle, red-and-white kerbs along the top and bottom edges, '
    + 'light trails from passing cars streaking along both straights, floodlight glow. Racing red #d4473a accents.',
};

// For slots that belong to no deck: the card back and the generic token art.
// Each deck's emblem (ui/emblem-<deckId>), shown wherever the deck is named: one object in the key art's
// silver, gold and crystal, glowing in the deck's colour.
const DECK_EMBLEM = {
  CardGame: 'a fanned hand of three playing cards with gold edges, the front card set with a glowing crystal star',
  CityBuilder: 'a cluster of three silver-and-gold skyscraper towers on a small round gold base, their windows lit',
  Fighting: 'a clenched armoured gauntlet fist in silver and gold, thrust forward',
  FPS: 'a targeting crosshair: a gold ring with four silver tick marks pointing inward and a glowing dot at its centre',
  Horror: 'a hooded wisp of a ghost with hollow glowing eyes, its tail fraying into mist, inside a cracked silver ring',
  Platformer: 'a chunky five-pointed gold power star with rounded points and a crystal core',
  Racing: 'a chequered racing flag of silver and dark navy squares on a gold pole, rippling in the wind',
  RPG: 'two crossed swords with silver blades and gold hilts',
  Sports: 'a gold trophy cup with two handles on a short silver stem',
  Strategy: 'a silver knight game piece shaped like a horse head, standing on a round gold base',
};
const EMBLEM_GLOW = {
  CardGame: 'violet', CityBuilder: 'teal', Fighting: 'orange', FPS: 'olive-green', Horror: 'purple',
  Platformer: 'sky-blue', Racing: 'red', RPG: 'amber', Sports: 'emerald-green', Strategy: 'royal-blue',
};

// Each deck's menu tile border (ui/tile-frame-<deck>) is drawn in that deck's own look, not the key art's silver and gold.
// Attach the deck art (decks/<deck>.webp) as the style reference.
const TILE_FRAME = {
  FPS: 'Military tactical gear: matte gunmetal and olive-drab #7f9a3c steel plates with hex bolts, scuffed paint and worn edges. '
    + 'Each corner is a heavy riveted L-bracket with a small glowing olive-green targeting reticle. Gritty, realistic metal under cold, hard light.',
  Horror: 'Grimy found-footage horror: rusted, pitted iron bars bound with tangles of barbed wire, stained with grime and old flaking paint. '
    + 'Each corner is a knot of rusty nails and barbed wire around a dim violet #7b3a8c glow, like a failing bulb. Desaturated grey, brown and rust.',
  Platformer: 'Crisp 16-bit pixel art on a clean pixel grid (hard square pixels, no blur or smoothing): a rim of chunky sky-blue #3d9bd6 and white pixel bricks '
    + 'with a dark one-pixel outline. Each corner is a pixel-art bouncy spring topped with a tiny yellow star. Bright, flat, limited palette with no gradients.',
  RPG: 'Illuminated medieval manuscript: a deep lapis-blue band with fine ink outlines and a vine of gold-leaf #c08a2e leaves running along it. '
    + 'Each corner is a gold-leaf knotwork rosette with a tiny painted red gem. Flat rich colours like a storybook page.',
  Racing: 'Motorsport bodywork: glossy white and silver carbon-fibre panels with a racing-red #d4473a livery stripe along all four edges '
    + 'and a thin black-and-white chequered line inside it. Each corner is a sleek aerodynamic winglet. Bright daylight reflections, clean and sporty.',
  Fighting: 'Anime cel-shading with bold black line art and flat colours: sandy colosseum stone blocks wrapped in red-and-gold banner cloth. '
    + 'Each corner is a cel-shaded burst of orange #e0782a impact sparks and speed lines.',
  Sports: 'Stadium team kit: glossy green #2f9e5b and white jersey-trim stripes with a thin white pitch line inside. '
    + 'Each corner is a small chrome stadium floodlight bracket with a bright white light. Clean, celebratory, photo-real materials.',
  Strategy: 'Vintage war poster: flat navy, blue #4364a8 and cream printed bands with halftone dots, paper grain and a thin red pinstripe. '
    + 'Each corner is a flat geometric star-and-chevron insignia like a rank badge. Flat screen-printed look.',
  CityBuilder: 'Tilt-shift model city: a rim of smooth painted teal #3f8f8c and cream model-kit rails with a thin dashed road line along them. '
    + 'Each corner is a tiny model skyscraper with warm glowing windows and a little round tree at its foot, like a painted miniature.',
  CardGame: 'Collectible trading card: a glossy charcoal-black band with a crisp white edge and a prismatic rainbow holo-foil sheen. '
    + 'Each corner is a small fan of three cards with violet #8c56c4 glints. Glossy painted fantasy finish.',
};
const TILE_FRAME_RULES = 'Only the border is drawn. Its four corners are identical (mirrored) and stay inside the square; the straight edges between them are '
  + 'plain and even, with nothing in the middle of an edge, so the border can be stretched. The rim is thin (about 3% of the width), each corner '
  + 'ornament about a fifth of the width. Inside and outside the rim everything is fully transparent: no glow, fog, smoke or background. '
  + 'Not silver-and-gold fantasy filigree: only the materials and colours described.';

// Each deck's card frames (ui/frame-<deck>-<rarity>) restyle the rarity's key art frame (ui/frame-<rarity>) in the
// materials of the deck's tile border. They are drawn as edits of that frame (place it, then make --fix) so the
// sockets, window, banner and text box stay exactly where the card layout expects them. Each rarity is clearly grander than
// the one below, and the gem colours match the rarity's, so rarity still reads at a glance.
const DECK_FRAME_TIER = {
  common: 'Common: the plainest, thinnest version: bare material, no ornament beyond the corners, small dull grey #c9d1e8 gems, no glow.',
  rare: 'Rare: a step up from common: a polished inlaid trim along the inner edges and bright glowing sky-blue #38bdf8 gems.',
  epic: 'Epic: clearly grander than rare: a thicker rim, flared spiked corners, violet crystal inlays along the sides, '
    + 'glowing violet #c084fc gems and violet energy crackling along the edges.',
  legendary: 'Legendary: the grandest and most ornate by far: a much thicker rim, large corner ornaments and wing-like flourishes on the sides, '
    + 'polished gold accents worked into the material, and a large blazing orange-gold #ffb020 gem at the top with sparks and a warm gold glow.',
};
const DECK_FRAME_RULES = 'Keep the exact outline, proportions and layout of the attached frame: the illustration window, the name banner, the text box '
  + 'and the three round sockets (top left, bottom left, bottom right) stay exactly where they are and the same size. The window, the text box '
  + 'and the inside of the sockets stay empty and transparent, '
  + 'as does everything outside the frame. The name banner stays a plain, smooth band in a mid-light tone: the card name is written on it. '
  + 'Only the materials, colours, surface detail and small ornaments change. Not silver-and-gold fantasy filigree unless described.';
// Each deck's booster pack (ui/pack-<deck>), drawn in the deck's own look. Attach decks/<deck>.webp.
const DECK_PACK = {
  FPS: 'a rugged olive-drab #7f9a3c military supply pouch of cards with stencilled hazard stripes, riveted gunmetal clips at the top and bottom and a glowing green targeting reticle in the middle',
  Horror: 'a grimy, stained paper evidence bag of cards, torn at the corners, wrapped in rusty barbed wire, with a dim violet #7b3a8c glow leaking from inside',
  Platformer: 'a 16-bit pixel-art booster pack on a clean pixel grid: chunky sky-blue #3d9bd6 and white wrapper, a big pixel star in the middle and a pixel spring at the top',
  RPG: 'a booster pack bound like a small illuminated spellbook: deep lapis-blue leather cover with gold-leaf #c08a2e vines, a red wax seal and gold clasps at the top and bottom',
  Racing: 'a glossy white and silver carbon-fibre booster pack with a racing-red #d4473a livery stripe, a chequered band across the top and a sleek aerodynamic fin shape',
  Fighting: 'a cel-shaded anime booster pack with bold black line art: sandy colosseum-stone texture, a red-and-gold banner wrapped around it and an orange #e0782a impact burst in the middle',
  Sports: 'a glossy green #2f9e5b and white booster pack like a team jersey, with white trim stripes, a stitched panel and a bright stadium-light gleam',
  Strategy: 'a vintage war-poster booster pack: flat navy, blue #4364a8 and cream screen-printed wrapper with halftone dots, a red pinstripe and a star-and-chevron insignia',
  CityBuilder: 'a tilt-shift miniature booster pack like a model-kit box: teal #3f8f8c and cream, with tiny model skyscrapers with lit windows rising from its top edge',
  CardGame: 'a glossy charcoal-black booster pack with a prismatic rainbow holo-foil sheen, crisp white edges and a fan of three cards with violet #8c56c4 glints in the middle',
};

const NEUTRAL_STYLE ='Digital painting with dramatic rim lighting, deep shadows and a vivid neon accent, painterly detail.';

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

// Card names that steer image generators toward a famous character. The note replaces the name's literal
// reading with an original concept.
const SUBJECT_NOTE = {
  FIG_M15_ShotoMaster: 'Draw an original martial-arts master defined by a calm, balanced stance and a long flowing sash, not a fireball thrower.',
  FIG_M24_HiddenBoss: 'Draw an original secret final opponent, masked or armored, stepping out of shadow.',
};

// Card Game names describe card-game rules more than things you can picture. Each gets a concrete scene.
Object.assign(SUBJECT_NOTE, {
  CCG_M03_MonsterCard: 'Draw a hulking beast clawing its way out of a giant playing card.',
  CCG_M09_RulesLawyer: 'Draw a stern little owl in a tiny suit and tie, one wing raised high in objection, a thick rulebook under the other.',
  CCG_M10_RareCard: 'Draw a single gleaming card displayed on a velvet pedestal under a spotlight, guarded by a small knight.',
  CCG_M11_ReprintBeast: 'Draw a wolf-like beast whose body is built from identical stacked cards, freshly rolling off a printing press.',
  CCG_M12_ComboPiece: 'Draw a clockwork golem made of interlocking puzzle-piece cards, one missing piece glowing in its chest.',
  CCG_M20_Misprint: 'Draw a card creature whose printed image is smeared and doubled, ink colors misaligned like a bad print.',
  CCG_M23_GameStoreOwner: 'Draw a friendly shopkeeper behind a counter of display cases and booster boxes, young and aproned.',
  CCG_M24_MythicRare: 'Draw a radiant winged sphinx rising from a single card on a dark altar.',
  CCG_S07_Errata: 'Draw a giant card flipping in mid-air while a quill crosses out its two stat numbers in red ink and writes them back the other way round.',
  CCG_M19_AlternatePrinting: 'Draw a printing press stamping out a card whose stat numbers come out mirrored, a slightly wrong twin of the card beside it.',
  CCG_S01_DraftNight: 'Draw a lively game-store table at night, players tearing open packs, cards fanning through the air under warm lamplight.',
  CCG_S02_HandSizeErrata: 'Draw a hand fanned out impossibly wide, twelve glowing cards, a ruler measuring it with the old limit crossed out.',
  CCG_S04_Typo: 'Draw a price tag on a card with the number crossed out and a bigger number scribbled in, a sheepish little gremlin holding the pen.',
  CCG_S10_Rotation: 'Draw a huge rotating vault door swallowing a pile of old cards into darkness, a calendar page flipping above it.',
  CCG_S11_BalancePatch: 'Draw a giant set of scales tipping: a towering monster card shrinking on one side, a tiny card growing on the other, patch notes fluttering. Only cards on the scales: no slime, blob or mascot creature.',
  CCG_S03_AltArt: 'Draw a playing card on an easel with a paintbrush repainting it, the old cost gem and attack number visibly swapping places in the wet paint.',
  CCG_S05_LimitedFormat: 'Draw a game table being squeezed by two giant bookends, one card slot cracking and sealed off with tape.',
  CCG_S06_ErrataWeek: 'Draw a pinned noticeboard covered in errata notices, one big keyword crossed out in red marker with a STRUCK stamp.',
  CCG_S09_PauperFormat: 'Draw a humble wooden table where only small copper-trimmed cards are allowed, a velvet rope blocking a glittering expensive card.',
  CCG_S13_StackResponse: 'Draw a tall tower of stacked cards, the top card flipping to block an incoming blast.',
  CCG_S15_BoardWipe: 'Draw a game table swept clean by a shockwave, cards and pieces blasting off the edges.',
});

// Cards whose earlier images copied a famous character or repeated another card in the deck (art audit of
// 2026-11-23). Each gets a concrete, distinct scene so a redraw doesn't land on the same picture again.
Object.assign(SUBJECT_NOTE, {
  FPS_M12_RespawnSpecialist: 'Draw a soldier sliding down a fast-rope from a hovering helicopter, dropping straight back into the fight.',
  HOR_M09_RelentlessPursuer: 'Draw a towering stitched figure in a rain-soaked trench coat and a cracked porcelain mask, dragging a chain down a long corridor.',
  HOR_M22_AsylumWarden: 'Draw a hulking asylum orderly in a stained white uniform dragging a rattling ring of keys and a straitjacket down a ward corridor. No shield or door.',
  HOR_M11_LastBulletGuard:'Draw a lone guard sitting slumped against a door, holding up a single bullet between two fingers, an empty revolver in the other hand. No shield.',
  HOR_M24_Necromancer:'Draw a gaunt necromancer in a bone-trimmed robe raising both hands over an open grave as skeletons claw up out of the soil.',
  PLA_M08_AirborneAce: 'Draw a girl in a flight cap and goggles gliding on a little propeller backpack high above the floating platforms.',
  PLA_M22_HiddenBlockGuardian: 'Draw a small mischievous sprite peeking out of a cracked floating golden block, hugging the coin hidden inside. Not a golem.',
  RPG_M03_PartyHealer: 'Draw a kindly grey-bearded dwarf herbalist bandaging a wounded companion\'s arm, a satchel of herbs at his side.',
  RPG_M09_QuestingKnight: 'Draw a knight in full plate armor on a barded warhorse, lance raised, riding toward a distant castle.',
  RPG_M19_NoviceCleric: 'Draw a young shaven-headed acolyte in plain grey robes carefully lighting a candle at a small roadside shrine.',
  RPG_M20_ShadowThief: 'Draw a nimble bare-headed thief leaping between moonlit rooftops with a stolen jewel, a coil of rope over one shoulder.',
  RAC_M12_BurnoutSpecialist: 'Draw a muscle car seen side-on, rear tyres spinning on the start line inside a huge cloud of white tyre smoke.',
  RAC_M17_RivalRacer: 'Draw two drivers in rival liveries, helmets under their arms, squaring off beside their cars on the grid, seen at full length.',
  RAC_S06_SharpTurn: 'Draw an overhead view of a car cutting a tight hairpin bend, the curve of the track and red-and-white kerbs filling the frame.',
  RAC_S08_CleanLap: 'Draw a car seen from behind on an empty straight, perfectly on the racing line, heading for the start-finish gantry.',
  FIG_M10_FinalRoundChampion: 'Draw an original heavyweight champion with a cropped haircut and a long ring robe, a title belt over one shoulder, fist raised.',
  FIG_M11_DojoStudent: 'Draw a young student in a blue judo gi with a yellow belt, bowing respectfully, hands at the sides.',
  FIG_M14_ProjectileZoner: 'Draw an original fighter in a long coat keeping distance by flinging spinning energy discs from both hands.',
  FIG_M19_KickBoxer: 'Draw an original Muay Thai kickboxer with a shaved-side haircut, ring shorts and hand wraps, mid roundhouse kick.',
  FIG_S12_Burst: 'Draw a short-haired fighter breaking free inside a spherical orange shockwave that throws the opponent back.',
  FIG_M18_ButtonMasher: 'Draw a gleeful fighter in a tank top flailing a wild blur of a dozen fists at once, eyes squeezed shut, side-on view.',
  FIG_M03_FramePerfectStriker: 'Draw a calm fighter in a sleeveless karate top landing one perfectly timed knee strike, frozen at the instant of impact, a ring of light at the contact point.',
  FIG_S10_SuddenDeath:'Draw one original fighter in a sleeveless hoodie throwing an all-or-nothing haymaker, wincing as red recoil cracks run up their own arm, the crowd on its feet. One fighter only, no silhouettes.',
  FIG_M16_TagPartner:'Draw two partner fighters slapping hands in a tag, one leaping into the fight as the other steps out: a tall woman in a track suit and a stocky man in a wrestling singlet.',
  FIG_S14_Jab: 'Draw a bald boxer in a red tank top and gloves snapping out a lightning-fast straight jab, a ring of impact sparks at the glove.',
  FIG_S15_Taunt: 'Draw a lanky fighter in a long scarf with short spiky hair, leaning back casually and beckoning the opponent with two fingers, a smug grin.',
  SPO_M04_DefensiveWall: 'Draw an ice hockey goalie in full pads sprawled across the goal mouth, blocking a puck.',
  SPO_M16_TeamMascot: 'Draw an original big fluffy green dragon mascot costume dancing on the sideline, waving a team towel. Not an eagle or any real team\'s mascot.',
  SPO_M17_StarQuarterback: 'Draw a quarterback scrambling out of the pocket with the ball tucked, spinning away from a defender, wide shot.',
  SPO_M24_Linebacker: 'Draw a linebacker in mid-air making a diving tackle on a ball carrier, seen from the side.',
  SPO_S15_FullCourtPress: 'Draw a wide overhead shot of five defenders swarming one ball handler across the whole basketball court.',
  STR_M06_SupplyOfficer: 'Draw a quartermaster on a loaded supply wagon handing ration crates down to a line of soldiers.',
  STR_M13_CounterIntelChief: 'Draw a stern officer in a dark room pinning a captured enemy map to a board under a single hanging lamp.',
  STR_M15_TotalWarEngine: 'Draw a colossal armored land ironclad on huge iron wheels, belching steam as it crushes a wooden palisade.',
  STR_M23_LogisticsChief: 'Draw an officer at a busy dockside directing cranes that unload barrels and crates from a ship.',
  CTY_M12_CityHallAdministrator: 'Draw a tall gentleman in a top hat cutting a ribbon on the steps of the city hall while townsfolk cheer.',
  CTY_M20_UrbanPlanner: 'Draw a man on a tall library ladder pinning new roads onto a huge city map that covers a whole wall.',
  CTY_M23_RevenueAgent: 'Draw a thin tax collector with a ledger knocking on a cottage door, a small strongbox under his arm.',
  CTY_S05_TaxHike: 'Draw the rooftops of a tiny town with coins streaming up out of the chimneys into a giant floating coffer.',
  CCG_M05_ReverseCard: 'Draw a giant card flipping end over end while the creature painted on it springs out the other way, curved arrows looping around it. No hooded figure.',
  CCG_M14_SideboardSpecialist: 'Draw a dapper butler built from cards swapping cards in and out of a side-table drawer. No hood.',
  CCG_M22_Netdecker: 'Draw a spindly robot built from cards copying a glowing deck list from a floating screen, cloned cards printing out of its chest. No hood.',
});

const scale = cost =>
  cost <= 1 ? 'a small, scrappy' : cost <= 3 ? 'a capable' : cost <= 5 ? 'a powerful' : 'a colossal, legendary';

const words = s => s.replace(/([a-z])([A-Z])/g, '$1 $2');

function cardSubject(card, deck) {
  const world = deck ? `a world inspired by ${words(deck.name)} video games` : 'the same world as its summoner';
  const note = SUBJECT_NOTE[card.cardId] ? ` ${SUBJECT_NOTE[card.cardId]}` : '';
  if (card.type === 'Spell') {
    return `Subject: the action or item "${card.displayName}", shown as one dramatic moment in ${world}.${note}`;
  }
  const poses = card.keywords.map(k => KEYWORD_POSE[k]).filter(Boolean);
  const who = card.isToken ? `a summoned minion, "${card.displayName}"` : `"${card.displayName}", ${scale(card.cost)} character`;
  return `Subject: ${who} from ${world}${poses.length ? `, ${poses.join(', ')}` : ''}. One clear focal character.${note}`;
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

// Card slots go four to an image: a 2×2 grid of 3:2 panels, which the art tool splits back into cards.
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

// Every redo.js flag on a slot: its own, plus its deck's when the slot is drawn in a style flagged for rework.
function redoFlags(key, style) {
  const flags = REDO[key] ? [REDO[key]] : [];
  for (const [deck, t] of Object.entries(REDO_THEMES)) {
    if (DECK_STYLE[deck] === style && t.bytes[key]) flags.push({ why: 'theme', note: t.note, bytes: t.bytes[key] });
  }
  return flags;
}

// For a flagged slot: what was wrong with the last image and how to avoid it this time.
const redoNote = (key, style) => redoFlags(key, style)
  .map(r => `The previous image was rejected: ${r.note} ${REDO_REASONS[r.why].fix}`).join(' ');
const join = (...parts) => parts.filter(Boolean).join(' ');

// { key, kind, group, name, sub, w, h, prompt, style, subject, extra, redo } for every slot. `key` is the path
// under assets/img without extension; the art tool saves `<key>.webp`. `redo` lists the slot's redo.js flags.
export function allSlots() {
  const slots = [];
  const add = (kind, key, group, name, parts, sub = '') =>
    slots.push({ key, kind, group, name, sub, w: KINDS[kind].w, h: KINDS[kind].h, fit: !!KINDS[kind].fit, trim: !!KINDS[kind].trim, ...parts, redo: redoFlags(key, parts.style) });

  for (const deck of DECKS) {
    const style = DECK_STYLE[deck.id];
    add('deck', `decks/${deck.id}`, deck.id, `${deck.name} — deck art`,
      prompt('deck', `Subject: key art for the ${words(deck.name)} faction. ${deck.tagline} A wide scene with several characters.`, style,
        redoNote(`decks/${deck.id}`, style)),
      'Menu tiles and fallback for cards without art');
    // The emblem is UI, so it is drawn in the key art style with the deck's colour as its glow.
    add('icon', `ui/emblem-${deck.id}`, deck.id, `${deck.name} — emblem`,
      uiPrompt('icon', `Subject: a game faction emblem icon for the ${words(deck.name)} deck: ${DECK_EMBLEM[deck.id]}, `
        + `with a soft ${EMBLEM_GLOW[deck.id]} glow and small gold sparks.`,
      'One object, centered, bold silhouette that still reads at 16 pixels. No badge, plate or circle behind it unless described.'),
      'Transparent PNG · deck chips, headings, tables and placeholders');
    add('hero', `heroes/${deck.id}`, deck.id, `${deck.name} — hero portrait`,
      prompt('hero', `Subject: the champion of the ${words(deck.name)} faction. Portrait, head and shoulders, looking at the camera.`, style,
        redoNote(`heroes/${deck.id}`, style)),
      'Match screen avatar');
    for (const card of deck.cards) {
      const rules = rulesText(card).replace(/\n/g, ' ');
      add('card', `cards/${card.cardId}`, deck.id, card.displayName,
        prompt('card', cardSubject(card, deck), style,
          join(rules && `What the card does, for mood only (do not draw any text): ${rules}`, redoNote(`cards/${card.cardId}`, style))),
        card.type === 'Spell' ? `Spell · ${card.cost}` : `Monster · ${card.cost} · ${card.baseAttack}/${card.baseHealth}`);
    }
  }
  // A token is drawn in the style of the deck that summons it most, so it matches its summoner on the board.
  for (const t of TOKENS) {
    const deck = tokenDeck(t.cardId);
    const style = deck ? DECK_STYLE[deck.id] : NEUTRAL_STYLE;
    add('card', `cards/${t.cardId}`, 'Extras', t.displayName,
      prompt('card', cardSubject(t, deck), style, redoNote(`cards/${t.cardId}`, style)),
      `Token · ${t.baseAttack}/${t.baseHealth}${deck ? ` · ${deck.name} style` : ''}`);
  }
  add('deck', 'decks/token', 'Extras', 'Generic token art',
    prompt('deck', 'Subject: a swirl of small summoned minions materialising from light.', NEUTRAL_STYLE),
    'Fallback for tokens without art');
  add('back', 'ui/card-back', 'Extras', 'Card back',
    prompt('back', 'Subject: the back of a playing card. A symmetrical ornamental emblem on dark navy, gold filigree and neon glow, abstract, no characters.', NEUTRAL_STYLE),
    'Shown for face-down cards');
  // Card frames are drawn in CSS only (styles.css), so they have no image slot.
  for (const c of COSMETICS.filter(c => !c.default && c.kind !== 'frame')) {
    const [kind, name] = c.id.split(':');
    const back = kind === 'back';
    const parts = {
      prompt: [`Art style: ${COSMETIC_FINISH}`, `Subject: ${COSMETIC_ART[c.id]}`, back ? BACK_RULES : ARENA_RULES,
        'Original design, not based on any existing game. No watermark.', `Make it ${KINDS[back ? 'back' : 'scene'].ask}.`].join('\n'),
      style: COSMETIC_FINISH, subject: COSMETIC_ART[c.id], extra: back ? BACK_RULES : ARENA_RULES,
    };
    add(back ? 'back' : 'scene', `ui/${kind}-${name}`, 'Cosmetics', `${c.name} — ${back ? 'card back' : 'arena'}`, parts,
      c.founder ? 'Meta Founders only' : c.gems ? `${c.gems} Gems in the shop` : `Season tier ${c.season.tier} (${c.season.track})`);
  }
  // The key art style for the rest of the UI. None of these is wired into the game yet: each slot says where
  // it is meant to go. Transparent ones are fitted whole; attach ui/key-art.webp to every prompt.
  const ui = (kind, name, subject, extra, sub) =>
    add(kind, `ui/${name}`, 'Extras', sub[0], uiPrompt(kind, subject, join(extra, redoNote(`ui/${name}`, KEY_ART_STYLE))), sub[1]);
  add('logo', 'ui/logo', 'Extras', 'Menu logo', LOGO_PROMPT, 'Transparent PNG · menu header');

  for (const [tier, look] of Object.entries(FRAME_TIER)) {
    ui('frame', `frame-${tier}`, `Subject: an empty trading card frame, seen straight on, perfectly symmetrical. ${look}`, FRAME_LAYOUT,
      [`Card frame — ${tier}`, `Transparent PNG · overlay on ${tier} cards`]);
  }
  ui('icon', 'panel-frame', 'Subject: an empty square ornamental border for a menu panel, seen straight on: a thin bevelled silver-and-gold rim '
    + 'with decorated corners (small gold spikes and a tiny blue gem in each corner) and plain straight edges between them, so it can be stretched.',
  'The whole inside of the square is empty and transparent; only the border is drawn.', ['Panel border (9-slice)', 'Transparent PNG · dialogs, tiles, deck lists']);
  for (const deck of DECKS) {
    const key = `ui/tile-frame-${deck.id}`;
    const subject = `Subject: an empty square border for a ${words(deck.name)} deck tile in a card game menu, seen straight on. ${TILE_FRAME[deck.id]}`;
    const extra = join(TILE_FRAME_RULES, redoNote(key, TILE_FRAME[deck.id]));
    add('border', key, deck.id, `Deck tile border — ${deck.name}`, {
      prompt: [subject, extra, 'Original design, not based on any existing game. No text, letters or numbers, no watermark.', `Make it ${KINDS.border.ask}.`].join('\n'),
      style: TILE_FRAME[deck.id], subject, extra,
    }, 'Transparent PNG · menu deck tiles and deck lists (9-slice) · attach decks/<deck>.webp');
  }
  for (const deck of DECKS) {
    for (const [rarity, tier] of Object.entries(DECK_FRAME_TIER)) {
      const key = `ui/frame-${deck.id}-${rarity}`;
      const subject = `Subject: restyle the attached empty trading card frame for the ${words(deck.name)} deck, seen straight on, perfectly symmetrical, `
        + `in the materials of that deck: ${TILE_FRAME[deck.id]} ${tier}`;
      const extra = join(DECK_FRAME_RULES, redoNote(key, TILE_FRAME[deck.id]));
      add('frame', key, deck.id, `Card frame — ${deck.name} ${rarity}`, {
        prompt: [subject, extra, 'Original design, not based on any existing game. No text, letters or numbers, no watermark.', `Make it ${KINDS.frame.ask}.`].join('\n'),
        style: TILE_FRAME[deck.id], subject, extra,
      }, `Transparent PNG · ${rarity} ${deck.name} cards · place ui/frame-${rarity}.webp first, then make --fix`);
    }
    const key = `ui/pack-${deck.id}`;
    const subject = `Subject: a sealed booster pack of cards for the ${words(deck.name)} deck, seen straight on, standing upright and filling the height: ${DECK_PACK[deck.id]}.`;
    const extra = join('Crimped or sealed at the top and bottom. Nothing written on it. Only the pack is drawn; everything around it is transparent: no glow or background.',
      redoNote(key, DECK_PACK[deck.id]));
    add('frame', key, deck.id, `Booster pack — ${deck.name}`, {
      prompt: [subject, extra, 'Original design, not based on any existing game. No text, letters or numbers, no watermark.', `Make it ${KINDS.frame.ask}.`].join('\n'),
      style: DECK_PACK[deck.id], subject, extra,
    }, 'Transparent PNG · the deck\'s packs in the shop and pack opening · attach decks/<deck>.webp');
  }
  ui('ornament', 'divider', 'Subject: a horizontal ornamental divider: a thin gold line that thickens toward a small pointed gold crest with an electric-blue crystal star in the middle, '
    + 'fading to nothing at both ends.', 'Centered, perfectly symmetrical, thin: the ornament takes up only the middle third of the height.',
  ['Section divider', 'Transparent PNG · menu section headers']);
  ui('icon', 'crest', 'Subject: the pointed gold crest from the key art on its own: a four-pointed gold star frame with a large glowing electric-blue crystal at its centre.',
    'Centered with empty margin around it.', ['Crest emblem', 'Transparent PNG · VS badge, buttons, turn banner']);
  ui('icon', 'button-plate', 'Subject: a wide empty game button plate seen straight on: dark navy glossy enamel centre with a bevelled gold rim and pointed gold end caps.',
    'The plate fills the middle third of the height, centered. Nothing written on it.', ['Button plate', 'Transparent PNG · main menu buttons']);

  for (const [name, subject, where] of [
    ['gold', 'a single thick gold coin, slightly tilted, embossed with a small star, gleaming', 'gold counter'],
    ['gems', 'a cluster of three cut electric-blue crystal gems glowing from within', 'gems counter'],
    ['dust', 'a small swirl of glittering golden-blue magic dust, like a tiny galaxy', 'Dust counter and crafting'],
    ['bandwidth', 'a faceted electric-blue mana crystal with a gold setting, glowing', 'Bandwidth (mana) gems in a match'],
    ['attack', 'a gold-and-silver sword hilt badge with a red-orange glow', 'attack stat badge'],
    ['health', 'a red crystal heart set in a gold shield badge', 'health stat badge'],
  ]) {
    ui('icon', `icon-${name}`, `Subject: a game icon: ${subject}.`, 'One object, centered, bold silhouette that reads at 24 pixels.',
      [`Icon — ${name}`, `Transparent PNG · ${where}`]);
  }

  for (const [name, subject, where] of [
    ['menu', 'a vast cosmic sky over a cliff-top arena at twilight: deep navy and violet clouds, blue and orange energy swirls high up, a few glowing cards drifting', 'main menu'],
    ['board', 'a top-down view of an ornate game table: dark navy stone inlaid with gold lines and faint glowing blue runes, a slightly darker band across the middle, softly lit from above', 'match board'],
    ['vault', 'a grand treasure vault for collected cards: tall shelves of glowing card cases, gold arches, deep blue light', 'collection and deck builder'],
    ['shop', 'a magical merchant hall: gold-trimmed counters, floating booster packs, warm lantern light against deep navy shadows', 'shop'],
    ['pack-opening', 'an empty stage of swirling cosmic energy: a bright ring of gold light on the floor at the centre, blue and orange energy spiralling up around it', 'pack opening'],
  ]) {
    ui('scene', `bg-${name}`, `Subject: a background scene, ${subject}.`,
      'It sits behind the interface, so keep it calm in the middle with the detail toward the edges, no characters and nothing in sharp focus in the centre.',
      [`Background — ${name}`, `Screen background · ${where}`]);
  }

  ui('frame', 'pack', 'Subject: a sealed booster pack of cards seen straight on: crinkled foil wrapper in deep navy with a gold border, '
    + 'a pointed gold crest with a glowing blue crystal star in the middle and a crimped seal at the top and bottom.',
  'Nothing written on it. Only the pack is drawn; everything around it is transparent.', ['Booster pack', 'Transparent PNG · shop and pack opening']);

  for (const [name, subject, where] of [
    ['spark', 'a burst of gold sparks and small glowing embers flying outward from the centre', 'card plays, rewards'],
    ['arc', 'a crackling electric-blue lightning arc curving across the image with a few gold sparks', 'attacks, spells'],
    ['ring', 'a thin shockwave ring of gold light seen from above, glowing brightest at its edge', 'cards landing on the board'],
  ]) {
    ui('icon', `fx-${name}`, `Subject: a visual effect sprite: ${subject}.`, 'Only the effect, on transparent, bright and additive-looking.',
      [`Effect — ${name}`, `Transparent PNG · ${where}`]);
  }
  ui('icon', 'fx-splat', 'Subject: a damage marker for a card game: a jagged crimson impact burst with a thick polished gold rim, '
    + 'glossy and lit from the top left, seen straight on.',
  'Only the burst, on transparent. Leave the middle plain: a number is drawn over it. The game tints it green for heals and gold for headshots.',
  ['Effect — damage splat', 'Transparent PNG · damage and heal numbers']);

  // Small inline icons for keywords, rules terms, House Rules, rules-line triggers and the rest of the UI.
  // Until one exists the game shows a lettered disc in its place (fx.js artIcon).
  const SMALL = 'One object, centered, bold simple silhouette that still reads at 16 pixels, with a little empty margin around it. No badge, plate or circle behind it unless described.';
  const smallIcon = (key, subject, glow, label, where) =>
    ui('icon', key, `Subject: a small game icon: ${subject}, with a soft ${glow} glow.`, SMALL, [label, `Transparent PNG · ${where}`]);
  for (const k of Object.keys(KEYWORDS)) {
    const [subject, kind] = KEYWORD_ICON[k];
    smallIcon(keywordIconKey(k), subject, KIND_GLOW[kind], `Keyword — ${KEYWORDS[k].name}`, 'keyword chips, badges and tooltips');
  }
  for (const t of Object.keys(TERMS)) {
    if (keywordIconKey(t) in KEYWORDS_BY_ICON) continue; // drawn once, for the keyword
    const [subject, kind] = TERM_ICON[t];
    smallIcon(keywordIconKey(t), subject, KIND_GLOW[kind], `Rules term — ${t}`, 'rules text, tooltips and the glossary');
  }
  for (const [id, rule] of Object.entries(RULES)) {
    smallIcon(ruleIconKey(id), RULE_ICON[id], KIND_GLOW.passive, `House Rule — ${rule.name}`, 'the House Rule banner and callouts');
  }
  for (const t of TRIGGERS) {
    smallIcon(triggerIconKey(t), TRIGGER_ICON[t], 'pale silver-blue', `Trigger — ${t}`, `"${t}:" at the start of a rules line`);
  }
  for (const name of UI_ICONS) {
    const [subject, where] = UI_ICON[name];
    smallIcon(uiIconKey(name), subject, 'warm gold', `Icon — ${name}`, where);
  }
  return slots;
}

const KEYWORDS_BY_ICON = Object.fromEntries(Object.keys(KEYWORDS).map(k => [keywordIconKey(k), k]));

// The glow colour for each keyword kind, matching the chip colours in src/ui/keywords.js.
const KIND_GLOW = {
  combat: 'red-orange', defense: 'sky-blue', trigger: 'violet', bonus: 'gold', economy: 'cyan', passive: 'silver-grey',
};
// [what to draw, keyword kind] per keyword id (src/engine/constants.js KEYWORDS).
const KEYWORD_ICON = {
  Rush: ['a jagged lightning bolt', 'combat'],
  Guard: ['a sturdy kite shield with a gold rim', 'defense'],
  FirstStrike: ['two crossed swords, the front one slightly ahead and gleaming', 'combat'],
  Counter: ['a shield with a curved arrow bouncing back off its face', 'defense'],
  Stealth: ['a half-closed eye inside a wisp of shadow', 'defense'],
  Suppression: ['a gauntlet pressing down with a struck-through sword under it', 'combat'],
  Headshot: ['a targeting crosshair with a small burst at its centre', 'combat'],
  Drone: ['a small hovering quadcopter drone seen from the front', 'passive'],
  Fear: ['a cracked skull mask with wide hollow eyes', 'combat'],
  Haunt: ['a small wailing ghost wisp', 'trigger'],
  Devour: ['an open fanged maw', 'trigger'],
  DoubleJump: ['a winged boot mid-leap with two little motion arcs below it', 'combat'],
  PoweredUp: ['a glowing mushroom-shaped power-up orb wrapped in a ring of light', 'defense'],
  Checkpoint: ['a pennant flag planted on a small post, glowing at its tip', 'defense'],
  XP: ['a gem-studded upward chevron like a level-up arrow', 'trigger'],
  Momentum: ['a heavy rolling wheel gathering speed, three swooshing motion trails behind it, no boot or foot', 'bonus'],
  Clutch: ['a clenched fist bursting out of a cracked heart', 'bonus'],
  Combo: ['three linked chain rings', 'bonus'],
  Structure: ['a small columned stone temple building', 'passive'],
  Fortify: ['a stack of three thick stone bricks bound with a gold band', 'defense'],
  Generate: ['a crystal battery cell charging with a spark', 'economy'],
  District: ['a cluster of three small city towers on a hex tile', 'passive'],
  Tax: ['a tied coin pouch with a gold coin spilling out', 'economy'],
  Populate: ['two little hooded villager figures side by side', 'trigger'],
  Topdeck: ['a playing card lifting off the top of a short card stack', 'trigger'],
  JudgeCall: ['a gavel striking a small round block', 'trigger'],
  Copy: ['two overlapping cards, the back one a faint duplicate', 'economy'],
  Overtake: ['a chequered racing flag whipping forward', 'economy'],
  Slipstream: ['three swept curved wind streaks', 'bonus'],
  Inspire: ['a raised war horn with sound rings coming out of it', 'bonus'],
};
// [what to draw, kind] per rules term (src/engine/constants.js TERMS).
const TERM_ICON = {
  'Level Up': ['a gold star with an upward arrow', 'bonus'],
  Silence: ['a closed mouth crossed by a thin silver bar', 'combat'],
  Boost: ['a flame bursting out of an exhaust nozzle', 'economy'],
  Nitro: ['a small nitro canister with a flame at its valve', 'economy'],
  Bandwidth: ['a faceted electric-blue crystal with a gold setting', 'economy'],
  Quick: ['a stopwatch with its hand mid-sweep', 'trigger'],
  Revive: ['a rising phoenix feather wreathed in light', 'trigger'],
  Errata: ['a quill pen crossing out a line on a scrap of parchment', 'combat'],
  'Alt Art': ['a painter\'s palette with a brush across it', 'economy'],
  'House Rule': ['a rolled scroll with a wax seal', 'passive'],
  Objection: ['a raised open hand, palm forward', 'trigger'],
  Typo: ['a pencil with its eraser end worn down', 'economy'],
  Exile: ['a swirling dark void portal', 'combat'],
};
// What to draw per House Rule (src/engine/constants.js RULES).
const RULE_ICON = {
  LimitedFormat: 'a short measuring ruler with a gold end cap',
  PauperFormat: 'a single worn copper coin',
  ErrataWeek: 'a quill pen crossing out a line on a scrap of parchment',
  DraftNight: 'a pair of dice mid-tumble',
  BalancePatch: 'a set of balance scales with a small bandage on the beam',
  HandSize: 'a fanned stack of folders with a card sticking out',
};
// What to draw per rules-line trigger (src/ui/icon-keys.js TRIGGERS).
const TRIGGER_ICON = {
  'Play': 'a card being laid down with a small flash under it',
  'Death': 'a small skull',
  'Turn start': 'a sun rising over a horizon line',
  'Turn end': 'a crescent moon with a small star',
};
// [what to draw, where it shows] per general UI icon (src/ui/icon-keys.js UI_ICONS).
const UI_ICON = {
  lock: ['a heavy gold padlock, closed', 'locked decks, cards, cosmetics and rewards'],
  key: ['an ornate gold key with a blue gem in its bow', 'account recovery code'],
  account: ['a hooded adventurer bust in silhouette', 'account button and sign-up'],
  trophy: ['a gold trophy cup with two handles', 'player hub and leaderboard'],
  streak: ['a blazing flame', 'win streak'],
  tip: ['a glowing lantern', 'tutorial tips'],
  gift: ['a wrapped gift box with a gold ribbon bow', 'tutorial reward'],
  'quick-match': ['two crossed swords over a lightning bolt', 'Quick find / Ranked match mode'],
  'open-room': ['an open arched doorway with light pouring out', 'Open room mode and empty room list'],
  cosmetic: ['a painter\'s palette with three colour swatches', 'cosmetic rewards'],
  'premium-card': ['a playing card with a shining gold border and a star on its face', 'premium (gold) cards'],
  'holo-card': ['a playing card with a rainbow holographic shimmer across its face', 'holo cards'],
  cards: ['a small fanned stack of three cards', 'card bundle rewards'],
};

// Paths the art tool may write: assets/img/<cards|decks|heroes|ui>/<name>.webp
export const SAVE_PATH = /^assets\/img\/(cards|decks|heroes|ui)\/[A-Za-z0-9_-]+\.webp$/;
