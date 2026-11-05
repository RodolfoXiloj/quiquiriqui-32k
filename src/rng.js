// Deterministic randomness, from two separate seeded generators (mulberry32 pattern) and a
// stateless per-cell hash:
//   - rand():     baking textures at boot, so the meadow always looks the same;
//   - gameRand(): everything that changes the simulation (spawns, drops, cards). It is reseeded
//     on every run, so a fixed seed replays the same run (tests and the bot rely on this);
//   - hash2():    per-cell randomness for the endless meadow.

let bakeState = 0x51554951; // "QUIQ"
let gameState = 1;

/** Shared mulberry32 output stage: an int32 state to a float in [0, 1). */
function mix(t) {
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Stateless hash of an integer grid cell (plus a salt) to [0, 1). */
export function hash2(x, y, salt = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Seeds the baking generator with an integer. */
export function seedRng(seed) {
  bakeState = seed | 0 || 1;
}

/** Baking: a deterministic float in [0, 1). */
export function rand() {
  return mix((bakeState = (bakeState + 0x6d2b79f5) | 0));
}

/** Baking: a deterministic float in [min, max). */
export function randRange(min, max) {
  return min + rand() * (max - min);
}

/** Baking: a deterministic integer in [min, max]. */
export function randInt(min, max) {
  return (min + rand() * (max - min + 1)) | 0;
}

/** Seeds the gameplay generator. Called once per run. */
export function seedGame(seed) {
  gameState = seed | 0 || 1;
}

/** Gameplay: a float in [0, 1), reproducible for a given run seed. */
export function gameRand() {
  return mix((gameState = (gameState + 0x6d2b79f5) | 0));
}
