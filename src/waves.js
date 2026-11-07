// The wave timeline of the ten minutes: timed events that each start a spawner, which releases
// `count` predators spread evenly over `over` seconds, picking each one's kind at random from
// `kinds` (repeat a kind to make it more common). Snakes join at 3:00, crows at 5:00 and
// badgers at 7:00; weasels, which lunge, at 2:00, magpies, which keep away and throw pebbles,
// at 4:00, and skunks, which leave a stink cloud, at 6:00. The last minute brings everything. A
// crate appears every 20 seconds near the edge of the screen. In endless play the timeline starts
// over each day, with half as many predators again per day gone by. Bosses come by her level, not
// the clock: one of `BOSSES` at every tenth level (see `levelBosses`).
import { gameRand } from './rng.js';
import { game, settings, showBanner } from './state.js';
import { RUN_LENGTH } from './weather.js';
import { ELITES_X2, TWO_BOSSES, NO_MERCY } from './profile.js';
import { hen } from './hen.js';
import { RAT, FOX, SNAKE, CROW, BADGER, CRATE, MAGPIE, WEASEL, SKUNK, ENEMY_TYPES, BOSSES, BOSS_EVERY, BOSS_PAIR_SHARE, enemies, spawnEnemy, spawnBoss, spawnPoint, makeElite, makeRoom, SPAWN_MAX } from './enemies.js';

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
/** At peril ELITES X2, one every 20 to 30 s, and rainbow ones from 2:00. */
export const RAINBOW_FROM_X2 = 120;
const RAINBOW_SHARE = 0.2;
/** During a FRENZY! (events.js) the waves come this many times as fast. */
export const FRENZY_RATE = 3;
/**
 * The fewest predators that must be around the hen (within SPAWN_MAX) in each minute of the day:
 * while there are fewer, more are born, QUOTA_RATE a second, from the
 * latest common wave. A hen that clears the screen fast faces more; a struggling one, only the
 * timeline. Each day gone by raises it as it raises the waves.
 */
export const QUOTA = [18, 26, 32, 38, 46, 54, 62, 70, 78, 90];
export const QUOTA_RATE = 4;
/** At peril NO MERCY the quota is this much higher. */
export const NO_MERCY_QUOTA = 1.5;

export const TIMELINE = [
  { at: 0, kinds: [RAT], count: 4, over: 2 },
  { at: 0, kinds: [RAT], count: 60, over: 60 },
  { at: 30, kinds: [RAT], count: 30, over: 30 },
  { at: 20, kinds: [FOX], count: 12, over: 40 },
  { at: 60, kinds: [WEASEL], count: 8, over: 60 },
  { at: 60, kinds: [RAT, RAT, FOX], count: 80, over: 60 },
  { at: 120, kinds: [RAT, FOX], count: 120, over: 60 },
  { at: 120, kinds: [WEASEL], count: 12, over: 60 },
  { at: 180, kinds: [RAT, FOX, SNAKE, SNAKE], count: 140, over: 60 },
  { at: 180, kinds: [WEASEL], count: 14, over: 60 },
  { at: 240, kinds: [FOX, SNAKE, RAT], count: 160, over: 60 },
  { at: 240, kinds: [MAGPIE], count: 8, over: 60 },
  { at: 300, kinds: [CROW, CROW, RAT, FOX], count: 170, over: 60 },
  { at: 300, kinds: [MAGPIE], count: 10, over: 60 },
  { at: 300, kinds: [WEASEL], count: 16, over: 60 },
  { at: 360, kinds: [CROW, SNAKE, FOX], count: 190, over: 60 },
  { at: 360, kinds: [MAGPIE], count: 12, over: 60 },
  { at: 360, kinds: [SKUNK], count: 12, over: 60 },
  { at: 420, kinds: [BADGER, RAT, RAT, CROW], count: 200, over: 60 },
  { at: 420, kinds: [WEASEL], count: 18, over: 60 },
  { at: 420, kinds: [SKUNK], count: 14, over: 60 },
  { at: 480, kinds: [BADGER, FOX, SNAKE, CROW], count: 240, over: 60 },
  { at: 480, kinds: [MAGPIE], count: 14, over: 60 },
  { at: 480, kinds: [SKUNK], count: 16, over: 60 },
  { at: 540, kinds: [RAT, FOX, SNAKE, CROW, BADGER], count: 300, over: 60 },
  { at: 540, kinds: [MAGPIE], count: 16, over: 60 },
  { at: 540, kinds: [WEASEL], count: 20, over: 60 },
  { at: 540, kinds: [SKUNK], count: 18, over: 60 },
];

const spawners = [];
let nextEvent = 0;
let nextCrateAt = CRATE_EVERY;
let nextEliteAt = ELITE_FROM;
let quotaTimer = 0;
/** The kinds of the latest wave of common predators: elites are picked from them. */
let commonKinds = [RAT];
/** The day the timeline is playing; a new day starts it over. */
let waveDay = 1;
/** Her level at which the next boss comes (every BOSS_EVERY levels; at NO MERCY also halfway). */
let nextBossAt = BOSS_EVERY;

export function resetWaves() {
  spawners.length = 0;
  nextEvent = 0;
  nextCrateAt = CRATE_EVERY;
  nextEliteAt = ELITE_FROM;
  quotaTimer = 0;
  commonKinds = [RAT];
  waveDay = 1;
  nextBossAt = BOSS_EVERY;
}

/**
 * Bosses by her level: at every BOSS_EVERY levels the next of BOSSES comes, with a banner. From
 * TWO BOSSES the boss before it comes along (two of the first at level 10), each with
 * BOSS_PAIR_SHARE of the health. At NO MERCY, halfway between (levels 15, 25...) a boss she has
 * already met comes back. Called only while the run moves, so a level-up's cards hold them.
 */
function levelBosses() {
  while (game.level >= nextBossAt) {
    const at = nextBossAt;
    nextBossAt += game.peril >= NO_MERCY ? BOSS_EVERY / 2 : BOSS_EVERY;
    const seen = Math.floor(at / BOSS_EVERY); // how many bosses have come
    let id;
    if (at % BOSS_EVERY) {
      if (!seen) continue;
      id = Math.floor(gameRand() * seen);
    } else {
      if (seen > BOSSES.length) continue;
      id = seen - 1;
      if (game.peril >= TWO_BOSSES) {
        spawnBoss(id, BOSS_PAIR_SHARE);
        spawnBoss(Math.max(0, id - 1), BOSS_PAIR_SHARE);
        showBanner(`${BOSSES[id].name}!`);
        continue;
      }
    }
    spawnBoss(id);
    showBanner(`${BOSSES[id].name}!`);
  }
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
  const count = Math.round(event.count * (1 + MORE_PER_DAY * (game.day - 1)));
  spawners.push({ kinds: event.kinds, left: count, period: event.over / count, timer: 0 });
  if (!event.kinds.some((kind) => ENEMY_TYPES[kind].rare)) commonKinds = event.kinds;
}

/** The quota `local` seconds into the day. */
export function quota(local) {
  const mercy = game.peril >= NO_MERCY ? NO_MERCY_QUOTA : 1;
  return Math.round(QUOTA[Math.min(QUOTA.length - 1, Math.floor(local / 60))] * (1 + MORE_PER_DAY * (game.day - 1)) * mercy);
}

/** Predators (not crates) within SPAWN_MAX of the hen. */
function nearby() {
  let n = 0;
  for (const e of enemies) if (e.alive && !e.prop && Math.hypot(e.x - hen.x, e.y - hen.y) < SPAWN_MAX) n++;
  return n;
}

/** An elite of a common kind, golden or (from RAINBOW_FROM, now and then) rainbow. */
function spawnElite() {
  const kind = commonKinds[Math.floor(gameRand() * commonKinds.length)];
  const rainbow = game.time >= (game.peril >= ELITES_X2 ? RAINBOW_FROM_X2 : RAINBOW_FROM) && gameRand() < RAINBOW_SHARE;
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
  levelBosses();
  const local = game.time - RUN_LENGTH * (game.day - 1);
  while (nextEvent < TIMELINE.length && local >= TIMELINE[nextEvent].at) startSpawner(TIMELINE[nextEvent++]);
  if (game.time >= nextCrateAt) {
    nextCrateAt += CRATE_EVERY;
    spawnCrate();
  }
  quotaTimer += dt;
  if (quotaTimer >= 1 / QUOTA_RATE) {
    quotaTimer = 0;
    if (nearby() < quota(local)) spawnEnemy(pickKind(commonKinds));
  }
  if (game.time >= nextEliteAt) {
    nextEliteAt = game.time + (game.peril >= ELITES_X2 ? 20 + gameRand() * 10 : 40 + gameRand() * 20);
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
