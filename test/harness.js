// Drives the real 60 Hz simulation with no drawing and no frame wait.
// SPEED 5: each scenario frame runs five fixed steps, so play(2) covers 10 s of gameplay.
import './dom-stub.js';
import { STEP } from '../src/loop.js';
import { boot, update, resetRun as resetGameRun, handleBlur } from '../src/main.js';
import { holdKey, releaseAllInput, input } from '../src/input.js';
import { hen } from '../src/hen.js';
import { game, settings } from '../src/state.js';
import { enemies } from '../src/enemies.js';
import { corn } from '../src/corn.js';
import { pickups } from '../src/pickups.js';
import { ITEM_BY_ID } from '../src/items.js';
import { profile } from '../src/profile.js';
import { createBot } from '../tools/browser/bot.js';

export const SPEED = 5;
/** Every run in the tests uses this seed unless a test passes another, so results replay exactly. */
export const SEED = 1;
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];

boot(document.createElement('canvas'));

/**
 * Fresh title screen with no held input. Module state is shared, so every test calls this.
 * `peaceful` (the default) turns off the waves and the starting corn, for tests that only
 * look at movement or set up their own predators. `peril` picks the difficulty tier and `hen` the
 * hen (both 0 by default: the white hen with Egg Toss).
 */
export function resetRun({ peaceful = true, seed = SEED, peril = 0, hen = 0 } = {}) {
  settings.peaceful = peaceful;
  profile.peril = peril;
  profile.hen = hen;
  releaseAllInput();
  resetGameRun(seed);
}

/** Advances `seconds` of scenario time, which is `seconds * SPEED` of gameplay. */
export function play(seconds) {
  const frames = Math.max(1, Math.round(seconds * 60));
  for (let i = 0; i < frames; i++) {
    for (let s = 0; s < SPEED; s++) update(STEP);
  }
}

/** Starts the run from the title screen without moving, as a tap would. */
export function start() {
  input.anyAction = true;
  update(STEP);
}

/** Taps `code` once (pressed for one step, then released). */
export function tapKey(code) {
  holdKey(code, true);
  update(STEP);
  holdKey(code, false);
}

/** The snapshot the bot reads; cards also say whether they are weapons. */
export function botWorld() {
  return {
    hen,
    enemies,
    corn,
    pickups,
    game,
    cards: game.cards.map((card) => ({ ...card, weapon: !!ITEM_BY_ID[card.id].weapon })),
  };
}

/**
 * Plays `seconds` of scenario time with the bot at the controls, deciding once per frame like
 * the watch mode does. `onFrame` runs after each frame (return true to stop early).
 */
export function playWithBot(seconds, { bot = createBot(), onFrame } = {}) {
  const frames = Math.max(1, Math.round(seconds * 60));
  let tapped = null;
  for (let i = 0; i < frames; i++) {
    if (tapped) {
      holdKey(tapped, false);
      tapped = null;
    }
    const { keys, tap } = bot.decide(botWorld());
    for (const code of MOVE_KEYS) holdKey(code, keys.includes(code));
    if (tap) {
      holdKey(tap, true);
      tapped = tap;
    }
    for (let s = 0; s < SPEED; s++) update(STEP);
    if (onFrame && onFrame()) break;
  }
  for (const code of MOVE_KEYS) holdKey(code, false);
  if (tapped) holdKey(tapped, false);
}

export { update, STEP, handleBlur, holdKey, releaseAllInput, input, hen, game, settings, enemies, corn, pickups };
