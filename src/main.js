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
import { build, resetBuild, rollCards, applyCard, hatchReady, ITEM_BY_ID } from './items.js';
import { enemies, clearEnemies, updateEnemies } from './enemies.js';
import { clearCorn, scatterStartingCorn, updateCorn } from './corn.js';
import { clearPickups, updatePickups } from './pickups.js';
import { resetWaves, updateWaves } from './waves.js';
import { resetEvents, updateEvents } from './events.js';
import { resetWeapons, updateWeapons, updateProjectiles } from './weapons.js';
import { juice, snapCamera, updateJuice } from './juice.js';
import { clearPools, updatePools, spawnParticle, spawnPuff, spawnPopup } from './pool.js';
import { sfxCluck, sfxLevelUp, sfxPickup, sfxCrow, sfxChest, sfxSplat } from './sfx.js';
import { game, settings, resetGame, loadBest, saveBest, xpToNext, showBanner } from './state.js';
import { RUN_LENGTH, weatherAt } from './weather.js';
import { updateMusic, loadMusicSetting, toggleMusic } from './music.js';
import { renderScene, cardAt, titleRowAt, shopRowAt } from './render.js';
import { profile, loadProfile, choosePeril, chooseHen, henUnlocked, unlockAfterDawn, HENS, eggsEarned, bankEggs, buyUpgrade, SHOP, TWO_CARDS } from './profile.js';

/** Real seconds before a card can be picked once the cards open. */
const CARD_LOCK = 0.35;
/** Seconds after the fall before a key or tap leaves the game-over screen. */
const GAME_OVER_WAIT = 1.5;
/** Health restored when nothing at all can be offered (a safety net), and by the Warm Meal boon. */
const MAXED_HEAL = 25;
const MEAL_HEAL = 30;
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
  loadProfile();
  loadMusicSetting();
  resetRun();
}

/** Which part of the music fits the moment, or null for silence. */
function musicMood() {
  if (!game.started) return null;
  if (game.over) return game.dawnChoice ? 'dawn' : null;
  if (enemies.some((e) => e.alive && e.boss)) return 'boss';
  return weatherAt(game.time).night > 0.5 ? 'night' : 'day';
}

/**
 * Back to the title screen with a fresh hen and an empty meadow. `seed` fixes the run's
 * randomness (tests and the bot pass one; players get a new run every time).
 */
export function resetRun(seed = (Math.random() * 2 ** 31) | 0) {
  seedGame(seed);
  resetGame();
  game.peril = profile.peril;
  game.hen = profile.hen;
  loadBest();
  resetHen();
  resetBuild(HENS[game.hen].start);
  syncHenStats(); // the shop's Tough Hide
  dressHen();
  resetWaves();
  resetEvents();
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
  const outfit = { ...outfitOf(build), hen: game.hen };
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

/** The first dawn: she made it. The rooster crows, the predators run, and she may keep going. */
function winRun() {
  game.time = RUN_LENGTH;
  game.over = true;
  game.won = true;
  game.dawnChoice = true;
  game.overTime = 0;
  game.newBest = saveBest(RUN_LENGTH);
  game.unlockNote = unlockAfterDawn(game.peril).join('  ');
  sfxCrow();
  for (let k = 0; k < 30; k++) {
    const a = Math.random() * Math.PI * 2;
    spawnParticle(hen.x, hen.y, 10, Math.cos(a) * 2.5, Math.sin(a) * 2.5, 40 + Math.random() * 40, k % 3 ? 10 : 13, 2, 1.2);
  }
}

/**
 * The title screen's menu rows: Q / E choose the hen and Z / C the peril (or a tap on the left /
 * right half of a row). Returns true if the input was for the menu, so it does not start the run.
 */
function titleMenu() {
  const tap = input.tap;
  const row = tap ? titleRowAt(tap.y) : null;
  const side = tap && tap.x < WIDTH / 2 ? -1 : 1;
  const press = (code) => input.pressed.has(code);
  const peril = press('KeyZ') ? -1 : press('KeyC') ? 1 : row === 'peril' ? side : 0;
  const hen = press('KeyQ') ? -1 : press('KeyE') ? 1 : row === 'hen' ? side : 0;
  if (peril) {
    choosePeril(profile.peril + peril);
    game.peril = profile.peril;
    loadBest();
  }
  if (hen) {
    game.hen = chooseHen(game.hen, hen);
    resetBuild(HENS[game.hen].start);
    dressHen();
  }
  if (press('KeyB') || row === 'shop') game.shopOpen = true;
  if (row) releasePointer();
  return !!(peril || hen || row || game.shopOpen);
}

/** The shop, on the title screen: 1-5 (or a tap on a row) buy; B, Escape or BACK close it. */
function shopMenu() {
  const tap = input.tap;
  const row = tap ? shopRowAt(tap.y) : -1;
  input.anyAction = false;
  releasePointer();
  let pick = row >= 0 && row < SHOP.length ? row : -1;
  SHOP.forEach((_, i) => {
    if (input.pressed.has(`Digit${i + 1}`) || input.pressed.has(`Numpad${i + 1}`)) pick = i;
  });
  if (pick >= 0) (buyUpgrade(pick) ? sfxChest : sfxSplat)();
  if (input.pressed.has('KeyB') || input.pressed.has('Escape') || row === SHOP.length) {
    game.shopOpen = false;
    game.titleLock = 0.3; // a key still held does not start the run at once
  }
}

/** Adds to the profile the golden eggs the run has earned and not banked yet. */
function bankRunEggs() {
  const earned = eggsEarned(game.time, game.kills, game.won, game.peril) + game.eggBonus;
  if (earned > game.eggs) bankEggs(earned - game.eggs);
  game.eggs = earned;
}

/** Endless play: the next day begins (after the dawn screen, or at each later dawn). */
function newDay() {
  game.day++;
  showBanner(`DAY ${game.day}`);
  sfxCrow();
}

/** On the dawn screen: 1 or a tap on the left half keeps going; any other key or tap ends the run. */
function dawnPicked() {
  const tap = input.tap;
  if (input.pressed.has('Digit1') || input.pressed.has('Numpad1') || (tap && tap.x < WIDTH / 2)) return 'keep';
  return input.pressed.size > 0 || tap ? 'end' : null;
}

/** Opens the level-up cards (or heals when nothing is left to upgrade). */
function openCards() {
  // At peril TWO CARDS, one fewer to choose from
  game.cards = rollCards(game.level === 2).slice(0, game.peril >= TWO_CARDS ? 2 : 3);
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
  // A rainbow elite's chest holds three; any other, one or (now and then) three
  const count = game.bigChests > 0 ? (game.bigChests--, 3) : gameRand() < BIG_CHEST ? 3 : 1;
  for (let k = 0; k < count; k++) {
    const cards = rollCards(false);
    if (!cards.length) break;
    const card = cards.find((c) => build[c.id]) || cards[0];
    takeCard(card);
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

/**
 * Applies a picked or chest card. A hatch puts its new name across the screen with a chime and a
 * burst of gold; a card that completes a weapon's pair says so (it hatches at the next level-up).
 */
function takeCard(card) {
  const ready = hatchReady().length;
  applyCard(card);
  if (!card.hatch) {
    if (hatchReady().length > ready) showBanner('READY TO HATCH!');
    return;
  }
  showBanner(`${ITEM_BY_ID[card.id].hatch.name}!`);
  sfxChest();
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    spawnParticle(hen.x, hen.y, 10, Math.cos(a) * 3, Math.sin(a) * 3, 40, k % 2 ? 10 : 13, 2, 0.7);
  }
}

/** Card `i` was picked with a key, a click or a tap. */
function pickCard(i) {
  const card = game.cards[i];
  takeCard(card);
  syncHenStats();
  if (card.id === 'meal') {
    hen.hp = Math.min(hen.maxHp, hen.hp + MEAL_HEAL);
    spawnPopup(hen.x, hen.y, `+${MEAL_HEAL}`, 10);
  }
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
  if (input.pressed.has('KeyM')) toggleMusic();
  // Menus and the pause keep the music, quieter.
  updateMusic(musicMood(), game.paused || game.cards.length || game.reward.length ? 0.3 : 1);

  if (game.paused) {
    if (input.anyAction) {
      input.anyAction = false;
      game.paused = false;
    }
    return;
  }

  if (!game.started) {
    if (game.shopOpen) {
      shopMenu();
      updateJuice(dt, hen.x, hen.y);
      return;
    }
    if (titleMenu()) input.anyAction = false;
    if (game.titleLock > 0) {
      game.titleLock -= dt;
      input.anyAction = false;
    }
    game.lockShake = Math.max(0, game.lockShake - dt);
    if (input.anyAction && !henUnlocked(game.hen)) {
      // A locked hen is only on show: she cannot start a run. Her padlock shakes instead.
      input.anyAction = false;
      if (!game.lockShake) sfxSplat();
      game.lockShake = 0.3;
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
    if (game.overTime === 0) bankRunEggs();
    game.overTime += dt;
    updateJuice(dt, hen.x, hen.y);
    updateEnemies(dt);
    updatePools(dt);
    if (game.overTime > GAME_OVER_WAIT) {
      const pick = game.dawnChoice ? dawnPicked() : input.pressed.size > 0 || input.tap ? 'end' : null;
      if (pick === 'keep') {
        // Endless: the predators come back, harder, and the timeline starts over.
        game.over = false;
        game.dawnChoice = false;
        releasePointer();
        newDay();
      } else if (pick === 'end') {
        resetRun();
        game.titleLock = 0.6;
      }
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
  game.bannerTime = Math.max(0, game.bannerTime - simDt);
  if (game.time >= RUN_LENGTH * game.day) {
    if (game.day === 1) {
      winRun();
      return;
    }
    newDay();
  }
  updateWaves(simDt);
  updateEvents(simDt);
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
