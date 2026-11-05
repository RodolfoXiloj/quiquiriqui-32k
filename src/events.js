// Events: the first, at 0:50, is always SURROUNDED! (a ring of rats, to teach breaking out early);
// then every 45 to 75 seconds a random short burst of danger, announced across the screen and
// never the same twice in a row (none while a boss is out: it waits ten seconds).
// - HAWK!       a hawk's shadow hunts the hen, holds still, and the hawk dives there, four times;
//               it hurts her if she is still under it, and any predator it lands on.
// - STAMPEDE!   a band of rats runs straight across the meadow at twice their speed, then leaves.
// - SURROUNDED! a ring of predators (rats early, then foxes, badgers late) appears around her and
//               closes in.
// - FRENZY!     for ten seconds the waves come three times as fast and every predator runs faster.
// Each scales with the day and the peril, as the waves do.
import { gameRand } from './rng.js';
import { game, settings, showBanner } from './state.js';
import { hen, HEN_RADIUS, damageHen } from './hen.js';
import { enemies, spawnEnemy, hitEnemy, makeRoom, RAT, FOX, BADGER, RUN, CLOSE } from './enemies.js';
import { spawnParticle } from './pool.js';
import { triggerShake } from './juice.js';
import { sfxAlarm, sfxScreech, sfxBoom } from './sfx.js';
import { PERIL } from './profile.js';
import { RUN_LENGTH } from './weather.js';

export const HAWK = 0;
export const STAMPEDE = 1;
export const SURROUNDED = 2;
export const FRENZY = 3;
/** The banner of each event. */
export const EVENTS = ['HAWK!', 'STAMPEDE!', 'SURROUNDED!', 'FRENZY!'];

/** The first event (always SURROUNDED!) comes at EVENT_FROM seconds; then one every EVENT_GAP to EVENT_GAP + 30. */
export const EVENT_FROM = 50;
export const EVENT_GAP = 45;
/** Each day gone by adds this share to an event's predators (as MORE_PER_DAY does to waves). */
const MORE_PER_DAY = 0.5;

/**
 * A hawk dives HAWK_DIVES times. Each dive lasts HAWK_CYCLE seconds: its shadow follows the hen
 * until HAWK_HUNT, holds still (a red ring closing in) until HAWK_STRIKE, when the hawk lands
 * within HAWK_R tiles, then it climbs away.
 */
export const HAWK_DIVES = 4;
export const HAWK_HUNT = 0.9;
export const HAWK_STRIKE = 1.5;
export const HAWK_CYCLE = 2;
export const HAWK_R = 1.2;
export const HAWK_DMG = 12;
/** What a dive does to a predator it lands on. */
const HAWK_HIT = 60;

/** A stampede: this many rats, in a band this wide (tiles), starting this far behind her. */
const STAMPEDE_RATS = 30;
const STAMPEDE_BAND = 6;
const STAMPEDE_FROM = 16;
/** A ring: this many predators, this far (tiles) around her, closing in for RING_TIME seconds. */
const RING_COUNT = 16;
export const RING_R = 6;
const RING_TIME = 8;
/** A frenzy lasts this long. */
export const FRENZY_TIME = 10;

/** The hawk of the current HAWK! event: dives left, seconds into this dive, its target. */
export const hawk = { dives: 0, t: 0, x: 0, y: 0 };

let nextEventAt = EVENT_FROM;
let lastEvent = -1;

export function resetEvents() {
  nextEventAt = EVENT_FROM;
  lastEvent = -1;
  hawk.dives = 0;
}

/** How many predators an event brings today, at this peril. */
const scaled = (n) => Math.round(n * (1 + MORE_PER_DAY * (game.day - 1)) * (1 + PERIL.spawns * game.peril));

/** Spawns a predator of `kind` at (x, y), making room in a full pool. */
function place(kind, x, y) {
  if (!enemies.some((e) => !e.alive)) makeRoom();
  return spawnEnemy(kind, x, y);
}

/** Starts event `kind` now (the schedule calls it; so do the tests and the dev cheats). */
export function startEvent(kind) {
  lastEvent = kind;
  showBanner(EVENTS[kind]);
  sfxAlarm();
  if (kind === HAWK) Object.assign(hawk, { dives: HAWK_DIVES, t: 0, x: hen.x + 4, y: hen.y - 4 });
  else if (kind === STAMPEDE) {
    // Straight across, from behind one side of the screen to beyond the other
    const a = gameRand() * Math.PI * 2;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const n = scaled(STAMPEDE_RATS);
    for (let i = 0; i < n; i++) {
      const across = ((i % 10) / 9 - 0.5) * 2 * STAMPEDE_BAND;
      const back = STAMPEDE_FROM + Math.floor(i / 10) * 1.5 + gameRand();
      const e = place(RAT, hen.x - ux * back - uy * across, hen.y - uy * back + ux * across);
      if (!e) break;
      Object.assign(e, { act: RUN, dirX: ux, dirY: uy, speed: e.speed * 2 });
    }
  } else if (kind === SURROUNDED) {
    const n = scaled(RING_COUNT);
    const t = game.time % RUN_LENGTH;
    const kindOf = t < 120 ? RAT : t < 420 ? FOX : BADGER;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const e = place(kindOf, hen.x + Math.cos(a) * RING_R, hen.y + Math.sin(a) * RING_R);
      if (e) Object.assign(e, { act: CLOSE, dirX: hen.x, dirY: hen.y, timer: RING_TIME });
    }
  } else game.frenzy = FRENZY_TIME;
}

/** The hawk lands at its target. */
function strike() {
  sfxBoom();
  triggerShake(0, 1, 3, 0.2);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    spawnParticle(hawk.x, hawk.y, 1, Math.cos(a) * 2.5, Math.sin(a) * 2.5, 10, i % 2 ? 6 : 19, 1, 0.4);
  }
  if (Math.hypot(hen.x - hawk.x, hen.y - hawk.y) < HAWK_R + HEN_RADIUS) {
    damageHen(Math.round(HAWK_DMG * (1 + PERIL.bite * game.peril)), hawk.x, hawk.y);
  }
  for (const e of enemies) {
    if (e.alive && !e.prop && Math.hypot(e.x - hawk.x, e.y - hawk.y) < HAWK_R + e.r) hitEnemy(e, HAWK_HIT, hawk.x, hawk.y, 10, true);
  }
}

function updateHawk(dt) {
  if (!hawk.dives) return;
  const before = hawk.t;
  hawk.t += dt;
  if (hawk.t < HAWK_HUNT) {
    // The shadow hunts her, a little behind
    const k = Math.min(1, dt * 5);
    hawk.x += (hen.x - hawk.x) * k;
    hawk.y += (hen.y - hawk.y) * k;
  } else if (before < HAWK_HUNT) sfxScreech();
  if (before < HAWK_STRIKE && hawk.t >= HAWK_STRIKE) strike();
  if (hawk.t >= HAWK_CYCLE) {
    hawk.t = 0;
    hawk.dives--;
  }
}

export function updateEvents(dt) {
  game.frenzy = Math.max(0, game.frenzy - dt);
  updateHawk(dt);
  // A peaceful meadow schedules none (an event started by hand still plays out)
  if (settings.peaceful || game.time < nextEventAt) return;
  if (enemies.some((e) => e.alive && e.boss)) {
    nextEventAt = game.time + 10;
    return;
  }
  // Any event but the last one
  let kind = SURROUNDED;
  if (lastEvent >= 0) {
    kind = Math.floor(gameRand() * (EVENTS.length - 1));
    if (kind >= lastEvent) kind++;
  }
  startEvent(kind);
  nextEventAt = game.time + EVENT_GAP + gameRand() * 30;
}
