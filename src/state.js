// Run state shared by the simulation and the renderer (kept apart from main.js to avoid an
// import cycle with render.js).
export const game = {
  /** False on the title screen; the first input starts the run. */
  started: false,
  /** True after the window loses focus; the next input resumes. */
  paused: false,
  /** Seconds survived in this run (stops while paused, choosing a card or during hitstop). */
  time: 0,
  /** Player level, from 1. Corn fills `xp` up to xpToNext(level). */
  level: 1,
  xp: 0,
  kills: 0,
  /** The upgrade cards on offer. While it is non-empty the run is frozen until one is picked. */
  cards: [],
  /** Seconds before a card can be picked, so a stray tap or key does not choose one. */
  cardLock: 0,
  /** Chests picked up and not opened yet. */
  chests: 0,
  /** What the last chest gave ([{ id, level }]); the run is frozen while it is shown. */
  reward: [],
  rewardLock: 0,
  /** True once the run ends (the hen falls, or she wins); `overTime` counts the seconds since. */
  over: false,
  /** True once she has won the run. */
  won: false,
  /** Which day of the run it is: 1, then 2, 3... after each dawn (the run goes on). */
  day: 1,
  /** A short message across the screen ('DAY 2'), and the seconds it stays. */
  banner: '',
  bannerTime: 0,
  overTime: 0,
  /** True on the game-over screen when this run beat the best time. */
  newBest: false,
  /** Seconds the title ignores input after a game over, so a held key does not restart at once. */
  titleLock: 0,
  /** Longest run so far at this peril, in seconds (kept across runs, saved in localStorage). */
  best: 0,
  /** The peril (difficulty tier) and the hen (profile.js HENS) of this run, chosen on the title screen. */
  peril: 0,
  hen: 0,
  /** Golden eggs this run has earned (already added to the profile). */
  eggs: 0,
  /** True while the shop is open on the title screen. */
  shopOpen: false,
  /** Seconds the padlock of a locked hen keeps shaking after a try to start with her. */
  lockShake: 0,
  /** Golden eggs won from elites this run, on top of eggsEarned. */
  eggBonus: 0,
  /** Chests waiting to be opened that hold three upgrades for sure (a rainbow elite's). */
  bigChests: 0,
  /** Seconds left of a FRENZY! event (events.js): faster waves, faster predators. */
  frenzy: 0,
};

/** Shows `text` across the screen for a few seconds. */
export function showBanner(text) {
  game.banner = text;
  game.bannerTime = 2.5;
}

/** Test and dev switches. They survive resetRun(). */
export const settings = {
  /** No waves and no starting corn: lets the movement tests measure movement alone. */
  peaceful: false,
};

/** Where the best time of the current peril is kept (peril 0 keeps the original key). */
const bestKey = () => 'qq_best' + (game.peril || '');

export function resetGame() {
  game.started = false;
  game.paused = false;
  game.time = 0;
  game.level = 1;
  game.xp = 0;
  game.kills = 0;
  game.cards = [];
  game.cardLock = 0;
  game.chests = 0;
  game.reward = [];
  game.rewardLock = 0;
  game.over = false;
  game.won = false;
  game.day = 1;
  game.banner = '';
  game.bannerTime = 0;
  game.overTime = 0;
  game.newBest = false;
  game.titleLock = 0;
  game.eggs = 0;
  game.shopOpen = false;
  game.lockShake = 0;
  game.eggBonus = 0;
  game.bigChests = 0;
  game.frenzy = 0;
}

/** Reads the saved best time of the current peril (0 if storage is missing or blocked). */
export function loadBest() {
  try {
    game.best = Number(localStorage.getItem(bestKey())) || 0;
  } catch {
    game.best = 0;
  }
}

/** Records `seconds` as the best time if it beats it. Returns true when it does. */
export function saveBest(seconds) {
  if (seconds <= game.best) return false;
  game.best = seconds;
  try {
    localStorage.setItem(bestKey(), String(Math.floor(seconds)));
  } catch {
    // Storage can be blocked (private mode); the best time then lasts for this visit only.
  }
  return true;
}

/**
 * Corn needed to go from `level` to the next one: 4, 6, 9, 11, 14... Each level costs more than the
 * last: quick up to level 40 (about 125 corn in all to level 10, 500 to 20, 2,000 to 40, about the
 * first dawn), then steep, as the days bring ever bigger hordes (15,000 to 70, 83,000 to 100,
 * around the third dawn). A boss comes every ten levels (waves.js), the last at 100.
 */
export function xpToNext(level) {
  const n = level - 1;
  return Math.floor(4 + 2.5 * n + (n > 39 ? (n - 39) ** 2 : 0));
}

/** Formats seconds as MM:SS. */
export function formatClock(seconds) {
  const s = Math.floor(seconds);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
