import { M } from './helpers.js';

// Tokens are created by effects and never appear in decks. When they leave the board they vanish.
export const TOKENS = [
  M('token_citizen', 'Citizen', 0, 1, 1, [], [], { plural: 'Citizens' }),
  M('token_soldier', 'Soldier', 0, 2, 1, [], [], { plural: 'Soldiers' }),
  M('token_barricade', 'Barricade', 0, 0, 4, ['Guard', 'Structure'], [], { plural: 'Barricades' }),
  M('token_drone', 'Drone', 0, 1, 1, ['Drone'], [], { plural: 'Drones' }),
  M('token_ghoul', 'Ghoul', 0, 1, 1, ['Fear'], [], { plural: 'Ghouls' }),
  M('token_proxy', 'Proxy', 0, 1, 1, [], [], { plural: 'Proxies' }),
  M('token_district_block', 'District Block', 0, 0, 3, ['Guard', 'District'], [], { plural: 'District Blocks' }),
  M('token_landmark', 'Landmark', 0, 6, 8, ['Guard', 'District'], [], { plural: 'Landmarks' }),
  M('token_benchwarmer', 'Benchwarmer', 0, 1, 1, ['Momentum'], [], { plural: 'Benchwarmers' }),
  M('token_assist', 'Assist Fighter', 0, 2, 1, ['Rush'], [], { plural: 'Assist Fighters' }),
].map(t => ({ ...t, isToken: true }));
