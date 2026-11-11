// Seeded RNG (mulberry32). Its state lives on the game state so a match is reproducible and an AI
// simulation on a cloned state can't change the real game's random outcomes.

export function nextRandom(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randInt = (state, n) => Math.floor(nextRandom(state) * n);

export const pick = (state, list) => (list.length ? list[randInt(state, list.length)] : null);

export function shuffleInPlace(state, list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randInt(state, i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
