// Art flagged for redoing by the art audit of 2026-11-14. The Art Studio badges these slots and lists them
// under "Flagged". A flag clears by itself once a new image is saved over the flagged one: `bytes` is the
// flagged file's size, so the flag stays up only while that same file (or no file) is in place.
// REDO flags single images; REDO_THEMES (at the end) flags every image drawn in a deck's art style.

export const REDO_REASONS = {
  ip: { label: 'IP risk', fix: 'Make every character clearly original, with nothing taken from an existing game or franchise.' },
  dark: { label: 'Hard to see', fix: 'Make the subject large, bright and clearly separated from the background, readable as a tiny thumbnail.' },
  twin: { label: 'Too similar', fix: 'Give it a clearly different subject, pose and composition from the other cards in this deck.' },
  unclear: { label: 'Hard to understand', fix: 'Show the idea of the card name plainly, so it reads at a glance.' },
  theme: { label: 'Theme rework', fix: 'Follow the art style above, not the look of earlier images from this deck.' },
};

export const REDO = {
  'cards/FIG_S06_CornerPressure': { why: 'ip', bytes: 110834, note: 'Copies Ryu from Street Fighter (red headband, red gloves, torn white gi).' },
  'cards/FIG_S11_SuperArt': { why: 'ip', bytes: 119986, note: 'Copies Ryu from Street Fighter (red headband, red gloves, fireball).' },
  'cards/FIG_S13_FrameTrap': { why: 'ip', bytes: 96956, note: 'Copies Ryu from Street Fighter (red headband, red gloves, torn white gi).' },
  'cards/FIG_S01_PerfectBlock': { why: 'ip', bytes: 94066, note: 'Copies Chun-Li from Street Fighter (hair buns with ribbons, spiked bracelets, qipao).' },
  'cards/FIG_M23_ComboBreaker': { why: 'ip', bytes: 87370, note: 'Close to Chun-Li from Street Fighter (qipao top, wrist bands, palm-strike pose).' },
  'cards/FIG_M20_SparringPartner': { why: 'ip', bytes: 105300, note: 'Close to Gouken and Akuma from Street Fighter (prayer beads, wild white beard).' },
  'cards/PLA_M25_MiniBoss': { why: 'ip', bytes: 135464, note: 'Copies Bowser from Super Mario (horned turtle king, red mane, spiked shell and cuffs).' },
  'cards/PLA_M21_ShellHopper': { why: 'ip', bytes: 125776, note: 'Uses a Koopa shell and a Spiny shell from Super Mario.' },
  'cards/PLA_M12_WarpPipeHopper': { why: 'ip', bytes: 118760, note: 'Uses the green warp pipe from Super Mario.' },
  'cards/PLA_S02_BouncePad': { why: 'ip', bytes: 103756, note: 'The blue spiky runner silhouette reads as Sonic the Hedgehog.' },
  'cards/PLA_S06_WarpPipe': { why: 'ip', bytes: 117242, note: 'The blue spiky runner silhouette reads as Sonic the Hedgehog.' },
  'cards/RPG_M15_FinalBoss': { why: 'unclear', bytes: 156068, note: 'Only a giant hand is visible: no boss can be made out.' },
  'cards/CCG_S15_BoardWipe': { why: 'unclear', bytes: 108444, note: 'A glowing ring on a dark table: nothing shows a board being swept clean.' },
  'cards/CCG_S10_Reprint': { why: 'dark', bytes: 122874, note: 'Busy gold swirl: the printing press and the creature are hard to pick out.' },
  'cards/PLA_S07_Springboard': { why: 'twin', bytes: 99218, note: 'Same spring and leaping silhouette as Double Jump.' },
  'cards/PLA_S12_GroundPound': { why: 'twin', bytes: 121442, note: 'Same silhouette stomping a purple blob as Head Stomp.' },
  'cards/PLA_M17_SpeedrunLegend': { why: 'twin', bytes: 135540, note: 'Same flying spiky-blond hero with a cape as Invincible Runner.' },
  'cards/PLA_M24_TimeTrialAce': { why: 'twin', bytes: 131710, note: 'Same pink-haired girl with goggles as Coin Collector and Springboard Trickster.' },
  'cards/HOR_M02_PossessedVermin': { why: 'twin', bytes: 85950, note: 'Another giant rat, like Plague Rat.' },
  'cards/HOR_M25_ThingInTheWalls': { why: 'twin', bytes: 89948, note: 'Same tentacle maw as Eldritch Abomination and Nightmare Manifest.' },
  'cards/HOR_S13_CreepingDread': { why: 'twin', bytes: 69618, note: 'Same reaching zombie horde as Crypt Horde and Night Falls.' },
  'cards/RPG_S06_TalentPoint': { why: 'twin', bytes: 178320, note: 'Same armored hero with arms raised in a glow as Gain XP.' },
  'cards/RPG_M23_Paladin': { why: 'twin', bytes: 191860, note: 'Same red-haired armored woman with sword and sun shield as Dragon Slayer and Legendary Hero.' },
  'cards/RAC_M09_NitroVeteran': { why: 'twin', bytes: 82088, note: 'Same young driver with a red canister as Nitro Scout, and she does not read as a veteran.' },
  'cards/RAC_M20_TireChanger': { why: 'twin', bytes: 94318, note: 'Same crew member with an impact wrench as Pit Crew Intern.' },
  'cards/RAC_M14_TurboInterceptor': { why: 'twin', bytes: 78164, note: 'Same white-and-red car, head-on, as Getaway Driver.' },
  'cards/RAC_S09_FullThrottle': { why: 'twin', bytes: 71262, note: 'Same white-and-red car, head-on, as Getaway Driver.' },
  'cards/FIG_M12_FootsiesExpert': { why: 'twin', bytes: 97134, note: 'Same brown-haired fighter in a palm-forward stance as Dojo Student.' },
  'cards/FIG_M06_StanceSwitcher': { why: 'twin', bytes: 109366, note: 'Same brown-haired fighter in a palm-forward stance as Dojo Student.' },
  'cards/SPO_M18_HatTrickHero': { why: 'twin', bytes: 87056, note: 'Same hockey player in an ice spray as Clutch Specialist.' },
  'cards/SPO_M25_Superstar': { why: 'twin', bytes: 62072, note: 'Same basketball dunk as Power Forward.' },
  'cards/SPO_S02_Timeout': { why: 'twin', bytes: 79896, note: 'Same kneeling coach with a tactics board as Pep Talk.' },
  'cards/STR_S15_GrandStrategy': { why: 'twin', bytes: 134378, note: 'Same bearded leader with hand on chin as War Council Chair.' },
  'cards/STR_S14_FortressWalls': { why: 'twin', bytes: 139598, note: 'Same castle wall with red banners as Structure Wall.' },
  'cards/CTY_S09_GoldenAge': { why: 'twin', bytes: 107006, note: 'Same bearded man in a green robe with arms spread as Mayor.' },
  'cards/CTY_M10_ZoningOfficer': { why: 'twin', bytes: 90322, note: 'Same man studying a map as Town Architect.' },
  'cards/CCG_S08_Topdeck': { why: 'twin', bytes: 97830, note: 'Same hooded figure drawing cards over a box as Search Card and Shuffle Deck.' },
  'cards/CCG_S02_HandReveal': { why: 'twin', bytes: 81962, note: 'Same red-haired woman as Card Collector and Game Store Owner.' },
  'cards/FPS_M29_GhostSniper': { why: 'twin', bytes: 98004, note: 'Same ghillie-suit sniper with a green scope as Sniper Operative.' },
  'cards/FPS_M26_SpecOpsInfiltrator': { why: 'twin', bytes: 87310, note: 'Another hooded rifleman aiming a scope, like Sniper Operative.' },
  'cards/FPS_M16_ShieldBearerUnit': { why: 'twin', bytes: 100720, note: 'Same soldier behind a riot shield as Riot Shield Trooper.' },
  'cards/FPS_M19_JuggernautExoSuit': { why: 'twin', bytes: 111448, note: 'Another soldier behind a riot shield, and it does not read as an exosuit.' },
  'cards/FPS_M18_DroneCommander': { why: 'twin', bytes: 91618, note: 'Same soldier with a tablet and drones as Drone Spotter.' },
};

// Decks whose whole art style needs reworking. Every image drawn in that style is flagged, tokens included.
export const REDO_THEMES = {};
