// Entry point: sets up the 320x180 canvas, bakes the meadow and every sprite, wires input, and
// runs the 60 Hz fixed-timestep simulation. `boot` and `update` are exported so the tests can
// drive the game under Node without a browser.
import { startLoop } from './loop.js';
import { WIDTH, HEIGHT, fitScreen, screenScale } from './screen.js';
import { bakeGround } from './ground.js';
import { bakeHen, bakeWorldSprites, outfitOf, outfitKey, henLook } from './sprites.js';
import { initInput, updateInput, releaseAllInput, releasePointer, input } from './input.js';
import { seedGame, gameRand } from './rng.js';
import { hen, resetHen, updateHen, syncHenStats } from './hen.js';
import { build, resetBuild, rollCards, applyCard } from './items.js';
import { clearEnemies, updateEnemies } from './enemies.js';
import { clearCorn, scatterStartingCorn, updateCorn } from './corn.js';
import { clearPickups, updatePickups } from './pickups.js';
import { resetWaves, updateWaves } from './waves.js';
import { resetWeapons, updateWeapons, updateProjectiles } from './weapons.js';
import { juice, snapCamera, updateJuice } from './juice.js';
import { clearPools, updatePools, spawnParticle, spawnPuff, spawnPopup } from './pool.js';
import { sfxCluck, sfxLevelUp, sfxPickup, sfxCrow, sfxChest } from './sfx.js';
import { game, settings, resetGame, loadBest, saveBest, xpToNext } from './state.js';
import { RUN_LENGTH } from './weather.js';
import { renderScene, cardAt } from './render.js';

/** Real seconds before a card can be picked once the cards open. */
const CARD_LOCK = 0.35;
/** Seconds after the fall before a key or tap leaves the game-over screen. */
const GAME_OVER_WAIT = 1.5;
/** Health restored instead of cards when every upgrade is maxed. */
const MAXED_HEAL = 25;
/** Real seconds the chest screen ignores input. */
const REWARD_LOCK = 0.6;
/** Chance that a chest holds three upgrades instead of one. */
const BIG_CHEST = 0.3;

let ctx = null;
let time = 0;

export function boot(canvas) {
  ctx = canvas.getContext('2d');

  /** Fits the internal height to the window's shape, then scales the canvas up to fill it. */
  function resize() {
    fitScreen(innerWidth, innerHeight);
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const scale = screenScale(innerWidth, innerHeight);
    canvas.style.width = WIDTH * scale + 'px';
    canvas.style.height = HEIGHT * scale + 'px';
  }
  addEventListener('resize', resize);
  resize();

  bakeGround(1337);
  bakeWorldSprites();
  initInput(canvas);
  addEventListener('blur', handleBlur);
  loadBest();
  resetRun();
}

/**
 * Back to the title screen with a fresh hen and an empty meadow. `seed` fixes the run's
 * randomness (tests and the bot pass one; players get a new run every time).
 */
export function resetRun(seed = (Math.random() * 2 ** 31) | 0) {
  seedGame(seed);
  resetGame();
  resetHen();
  resetBuild();
  dressHen();
  resetWaves();
  resetWeapons();
  clearEnemies();
  clearCorn();
  clearPickups();
  clearPools();
  juice.hitstop = 0;
  juice.shakeTime = 0;
  snapCamera(hen.x, hen.y);
}

/** The window lost focus: drop held input and pause a running game. */
export function handleBlur() {
  releaseAllInput();
  if (game.started && !game.over) game.paused = true;
}

/** Re-bakes the hen when what she wears changes. Returns true if it did. */
function dressHen() {
  const outfit = outfitOf(build);
  if (outfitKey(outfit) === henLook.key) return false;
  bakeHen(outfit);
  return true;
}

/** Leaves the title screen: the run begins. */
function startRun() {
  game.started = true;
  sfxCluck();
  spawnPuff(hen.x, hen.y, 10, 4, 1.4);
  if (!settings.peaceful) scatterStartingCorn();
}

/** Dawn: she made it. The rooster crows and the predators run away. */
function winRun() {
  game.time = RUN_LENGTH;
  game.over = true;
  game.won = true;
  game.overTime = 0;
  game.newBest = saveBest(RUN_LENGTH);
  sfxCrow();
  for (let k = 0; k < 30; k++) {
    const a = Math.random() * Math.PI * 2;
    spawnParticle(hen.x, hen.y, 10, Math.cos(a) * 2.5, Math.sin(a) * 2.5, 40 + Math.random() * 40, k % 3 ? 10 : 13, 2, 1.2);
  }
}

/** Opens the level-up cards (or heals when nothing is left to upgrade). */
function openCards() {
  game.cards = rollCards(game.level === 2);
  game.cardLock = CARD_LOCK;
  sfxLevelUp();
  if (!game.cards.length) {
    hen.hp = Math.min(hen.maxHp, hen.hp + MAXED_HEAL);
    spawnPopup(hen.x, hen.y, `+${MAXED_HEAL} HP`, 10);
  }
}

/**
 * A chest: one upgrade, or three now and then, chosen for her (favoring what she already has)
 * and applied at once. The run waits on the CHEST! screen until a key or a tap.
 */
function openChest() {
  const reward = [];
  const count = gameRand() < BIG_CHEST ? 3 : 1;
  for (let k = 0; k < count; k++) {
    const cards = rollCards(false);
    if (!cards.length) break;
    const card = cards.find((c) => build[c.id]) || cards[0];
    applyCard(card);
    reward.push(card);
  }
  syncHenStats();
  dressHen();
  sfxChest();
  if (!reward.length) {
    hen.hp = Math.min(hen.maxHp, hen.hp + MAXED_HEAL);
    spawnPopup(hen.x, hen.y, `+${MAXED_HEAL} HP`, 10);
    return;
  }
  game.reward = reward;
  game.rewardLock = REWARD_LOCK;
}

/** Card `i` was picked with a key, a click or a tap. */
function pickCard(i) {
  applyCard(game.cards[i]);
  syncHenStats();
  game.cards = [];
  releasePointer();
  sfxPickup();
  // A ring of sparkles; a new look also throws off a few loose feathers.
  const dressed = dressHen();
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    spawnParticle(hen.x, hen.y, 8, Math.cos(a) * 2, Math.sin(a) * 2, 30, k % 2 ? 10 : 13, 1, 0.5);
  }
  if (dressed) {
    hen.hurtTime = 0;
    for (let k = 0; k < 8; k++) {
      spawnParticle(hen.x, hen.y, 14, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 25 + Math.random() * 25, 7, 2, 0.8);
    }
  }
}

/** Which card the input of this step picks, or -1. */
function cardPicked() {
  const n = game.cards.length;
  for (let i = 0; i < n; i++) {
    if (input.pressed.has(`Digit${i + 1}`) || input.pressed.has(`Numpad${i + 1}`)) return i;
  }
  return input.tap ? cardAt(input.tap.x, input.tap.y, n) : -1;
}

export function update(dt) {
  time += dt;
  updateInput();

  if (game.paused) {
    if (input.anyAction) {
      input.anyAction = false;
      game.paused = false;
    }
    return;
  }

  if (!game.started) {
    if (game.titleLock > 0) {
      game.titleLock -= dt;
      input.anyAction = false;
    }
    if (!input.anyAction) {
      updateJuice(dt, hen.x, hen.y);
      return;
    }
    input.anyAction = false;
    startRun();
  }

  if (game.over) {
    // The hen lies still, feathers settle and the predators wander off.
    game.overTime += dt;
    updateJuice(dt, hen.x, hen.y);
    updateEnemies(dt);
    updatePools(dt);
    if (game.overTime > GAME_OVER_WAIT && (input.pressed.size > 0 || input.tap)) {
      resetRun();
      game.titleLock = 0.6;
    }
    return;
  }

  if (game.cards.length) {
    // Frozen until a card is picked.
    game.cardLock -= dt;
    const i = game.cardLock <= 0 ? cardPicked() : -1;
    if (i >= 0) pickCard(i);
    return;
  }

  if (game.reward.length) {
    // Frozen on the chest screen until a key or a tap.
    game.rewardLock -= dt;
    if (game.rewardLock <= 0 && (input.pressed.size > 0 || input.tap)) {
      game.reward = [];
      releasePointer();
    }
    return;
  }

  const simDt = updateJuice(dt, hen.x, hen.y);
  if (simDt <= 0) return;
  game.time += simDt;
  if (game.time >= RUN_LENGTH) {
    winRun();
    return;
  }
  updateWaves(simDt);
  updateHen(simDt);
  updateWeapons(simDt);
  updateProjectiles(simDt);
  updateEnemies(simDt);
  updateCorn(simDt);
  updatePickups(simDt);
  // Little dust kicks while walking
  if (hen.moving && Math.random() < 0.15) {
    spawnParticle(hen.x, hen.y, 1, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 10, 6, 1, 0.3);
  }
  updatePools(simDt);

  if (game.over) return;
  if (game.chests > 0) {
    game.chests--;
    openChest();
  } else if (game.xp >= xpToNext(game.level)) {
    game.xp -= xpToNext(game.level);
    game.level++;
    openCards();
  }
}

const pageCanvas = document.getElementById('c');
if (pageCanvas) {
  boot(pageCanvas);
  startLoop(update, (alpha) => renderScene(ctx, alpha, time));
}
