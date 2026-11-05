// The wave timeline of the ten minutes: timed events that each start a spawner, which releases
// `count` predators spread evenly over `over` seconds, picking each one's kind at random from
// `kinds` (repeat a kind to make it more common). Snakes join at 3:00, crows at 5:00 and
// badgers at 7:00; weasels, which lunge, at 2:00, magpies, which keep away and throw pebbles,
// at 4:00, and skunks, which leave a stink cloud, at 6:00. The last minute brings everything. Events with `boss` send one boss of that
// kind. A crate appears every 20 seconds near the edge of the screen. In endless play the timeline
// starts over each day, with half as many predators again per day gone by.
import { gameRand } from './rng.js';
import { game, settings, showBanner } from './state.js';
import { RUN_LENGTH } from './weather.js';
import { PERIL } from './profile.js';
import { hen } from './hen.js';
import { RAT, FOX, SNAKE, CROW, BADGER, CRATE, MAGPIE, WEASEL, SKUNK, ENEMY_TYPES, enemies, spawnEnemy, spawnBoss, spawnPoint, makeElite, makeRoom } from './enemies.js';

/** Seconds between two crates. */
export const CRATE_EVERY = 20;
/** Each day gone by adds this share of predators to every wave. */
export const MORE_PER_DAY = 0.5;
/**
 * The first elite comes at ELITE_FROM seconds, then one every 40 to 60 s, of a kind from the
 * latest common wave. From RAINBOW_FROM, RAINBOW_SHARE of them are rainbow.
 */
export const ELITE_FROM = 60;
export const RAINBOW_FROM = 180;
const RAINBOW_SHARE = 0.2;
/** During a FRENZY! (events.js) the waves come this many times as fast. */
export const FRENZY_RATE = 3;

export const TIMELINE = [
  { at: 0, kinds: [RAT], count: 4, over: 2 },
  { at: 0, kinds: [RAT], count: 60, over: 60 },
  { at: 30, kinds: [RAT], count: 30, over: 30 },
  { at: 60, boss: FOX },
  { at: 60, kinds: [RAT, RAT, FOX], count: 80, over: 60 },
  { at: 120, kinds: [RAT, FOX], count: 120, over: 60 },
  { at: 120, kinds: [WEASEL], count: 12, over: 60 },
  { at: 180, boss: RAT },
  { at: 180, kinds: [RAT, FOX, SNAKE, SNAKE], count: 140, over: 60 },
  { at: 180, kinds: [WEASEL], count: 14, over: 60 },
  { at: 240, boss: SNAKE },
  { at: 240, kinds: [FOX, SNAKE, RAT], count: 160, over: 60 },
  { at: 240, kinds: [MAGPIE], count: 8, over: 60 },
  { at: 300, boss: CROW },
  { at: 300, kinds: [CROW, CROW, RAT, FOX], count: 170, over: 60 },
  { at: 300, kinds: [MAGPIE], count: 10, over: 60 },
  { at: 300, kinds: [WEASEL], count: 16, over: 60 },
  { at: 360, kinds: [CROW, SNAKE, FOX], count: 190, over: 60 },
  { at: 360, kinds: [MAGPIE], count: 12, over: 60 },
  { at: 360, kinds: [SKUNK], count: 12, over: 60 },
  { at: 420, boss: BADGER },
  { at: 420, kinds: [BADGER, RAT, RAT, CROW], count: 200, over: 60 },
  { at: 420, kinds: [WEASEL], count: 18, over: 60 },
  { at: 420, kinds: [SKUNK], count: 14, over: 60 },
  { at: 480, boss: FOX },
  { at: 480, kinds: [BADGER, FOX, SNAKE, CROW], count: 240, over: 60 },
  { at: 480, kinds: [MAGPIE], count: 14, over: 60 },
  { at: 480, kinds: [SKUNK], count: 16, over: 60 },
  { at: 540, boss: SNAKE },
  { at: 540, boss: CROW },
  { at: 540, boss: BADGER },
  { at: 540, kinds: [RAT, FOX, SNAKE, CROW, BADGER], count: 300, over: 60 },
  { at: 540, kinds: [MAGPIE], count: 16, over: 60 },
  { at: 540, kinds: [WEASEL], count: 20, over: 60 },
  { at: 540, kinds: [SKUNK], count: 18, over: 60 },
];

const spawners = [];
let nextEvent = 0;
let nextCrateAt = CRATE_EVERY;
let nextEliteAt = ELITE_FROM;
/** The kinds of the latest wave of common predators: elites are picked from them. */
let commonKinds = [RAT];
/** The day the timeline is playing; a new day starts it over. */
let waveDay = 1;

export function resetWaves() {
  spawners.length = 0;
  nextEvent = 0;
  nextCrateAt = CRATE_EVERY;
  nextEliteAt = ELITE_FROM;
  commonKinds = [RAT];
  waveDay = 1;
}

/** A crate just inside the edge of the screen. */
function spawnCrate() {
  const p = spawnPoint();
  spawnEnemy(CRATE, hen.x + (p.x - hen.x) * 0.7, hen.y + (p.y - hen.y) * 0.7);
}

/**
 * A kind picked at random from `kinds`; a rat instead when that kind already has its `max` alive
 * (a sky full of magpies would be no fun).
 */
export function pickKind(kinds) {
  const kind = kinds[Math.floor(gameRand() * kinds.length)];
  const max = ENEMY_TYPES[kind].max;
  if (max && enemies.filter((e) => e.alive && e.kind === kind).length >= max) return RAT;
  return kind;
}

function startSpawner(event) {
  const count = Math.round(event.count * (1 + MORE_PER_DAY * (game.day - 1)) * (1 + PERIL.spawns * game.peril));
  spawners.push({ kinds: event.kinds, left: count, period: event.over / count, timer: 0 });
  if (!event.kinds.some((kind) => ENEMY_TYPES[kind].rare)) commonKinds = event.kinds;
}

/** An elite of a common kind, golden or (from RAINBOW_FROM, now and then) rainbow. */
function spawnElite() {
  const kind = commonKinds[Math.floor(gameRand() * commonKinds.length)];
  const rainbow = game.time >= RAINBOW_FROM && gameRand() < RAINBOW_SHARE;
  if (!enemies.some((e) => !e.alive)) makeRoom();
  const e = spawnEnemy(kind);
  if (!e) return;
  makeElite(e, rainbow);
  if (rainbow) showBanner(`RAINBOW ${ENEMY_TYPES[kind].name.toUpperCase()}!`);
}

export function updateWaves(dt) {
  if (settings.peaceful) return;
  if (game.day !== waveDay) {
    waveDay = game.day;
    nextEvent = 0;
  }
  const local = game.time - RUN_LENGTH * (game.day - 1);
  while (nextEvent < TIMELINE.length && local >= TIMELINE[nextEvent].at) {
    const event = TIMELINE[nextEvent++];
    if (event.boss !== undefined) spawnBoss(event.boss);
    else startSpawner(event);
  }
  if (game.time >= nextCrateAt) {
    nextCrateAt += CRATE_EVERY;
    spawnCrate();
  }
  if (game.time >= nextEliteAt) {
    nextEliteAt = game.time + 40 + gameRand() * 20;
    spawnElite();
  }
  for (let i = spawners.length - 1; i >= 0; i--) {
    const s = spawners[i];
    s.timer += game.frenzy > 0 ? dt * FRENZY_RATE : dt;
    while (s.timer >= s.period && s.left > 0) {
      s.timer -= s.period;
      s.left--;
      spawnEnemy(pickKind(s.kinds));
    }
    if (s.left <= 0) spawners.splice(i, 1);
  }
}
