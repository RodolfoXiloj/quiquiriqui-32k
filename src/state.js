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
  /** True once the run ends (the hen falls, or dawn comes); `overTime` counts the seconds since. */
  over: false,
  /** True once she has seen the first dawn: the run is won (it may go on, endless). */
  won: false,
  /** True while the dawn screen asks whether to keep going. */
  dawnChoice: false,
  /** Which day of the run it is: 1, then 2, 3... after each dawn in endless play. */
  day: 1,
  /** A short message across the screen ('DAY 2'), and the seconds it stays. */
  banner: '',
  bannerTime: 0,
  overTime: 0,
  /** True on the game-over screen when this run beat the best time. */
  newBest: false,
  /** Seconds the title ignores input after a game over, so a held key does not restart at once. */
  titleLock: 0,
  /** Longest run so far, in seconds (kept across runs, saved in localStorage). */
  best: 0,
};

/** Test and dev switches. They survive resetRun(). */
export const settings = {
  /** No waves and no starting corn: lets the movement tests measure movement alone. */
  peaceful: false,
};

const BEST_KEY = 'qq_best';

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
  game.dawnChoice = false;
  game.day = 1;
  game.banner = '';
  game.bannerTime = 0;
  game.overTime = 0;
  game.newBest = false;
  game.titleLock = 0;
}

/** Reads the saved best time (0 if storage is missing or blocked). */
export function loadBest() {
  try {
    game.best = Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    game.best = 0;
  }
}

/** Records `seconds` as the best time if it beats it. Returns true when it does. */
export function saveBest(seconds) {
  if (seconds <= game.best) return false;
  game.best = seconds;
  try {
    localStorage.setItem(BEST_KEY, String(Math.floor(seconds)));
  } catch {
    // Storage can be blocked (private mode); the best time then lasts for this visit only.
  }
  return true;
}

/**
 * Corn needed to go from `level` to the next one: 5, 9, 13, 18, 23... Each level costs more than
 * the last (about 214 corn in all to reach level 10, 1,040 to 20, 2,730 to 30), so a run that
 * gathers everything ends near level 30, and levels never run out.
 */
export function xpToNext(level) {
  const n = level - 1;
  return 5 + 4 * n + Math.floor((n * n) / 8);
}

/** Formats seconds as MM:SS. */
export function formatClock(seconds) {
  const s = Math.floor(seconds);
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}
