// Predators: they appear just outside the screen, chase the hen in a straight line, push each
// other apart so a horde reads as a crowd instead of one blob, and bite on contact (from ROOSTER,
// one close by now and then hops at her too). Hits flash
// them, knock them back and float a damage number; a kill drops corn most of the time.
// Bosses (`BOSSES`, one at every tenth level, waves.js) are big, tinted, named versions of a kind
// and drop a chest. Crates are props in the same pool: they
// stand still, never bite, are not kills, and break into a prize. Some kinds act on their own
// (`act`): the magpie keeps its distance and throws pebbles (`shots`); the weasel stops, blinks
// and lunges in a straight line. A skunk leaves a stink cloud where it falls (`clouds`). Any
// common predator may come as an elite (`makeElite`): golden or, rarely, rainbow; much tougher,
// a chest and golden eggs when it falls.
import { HALF_W, HALF_H } from './iso.js';
import { WIDTH, HEIGHT } from './screen.js';
import { gameRand } from './rng.js';
import { game, saveBest, showBanner } from './state.js';
import { hen, HEN_RADIUS, HEN_SPEED, damageHen } from './hen.js';
import { stats } from './items.js';
import { spawnCorn } from './corn.js';
import { spawnParticle, spawnPopup } from './pool.js';
import { spawnPickup, CHEST, MAGNET, BOMB, FOOD } from './pickups.js';
import { triggerShake } from './juice.js';
import { sfxPeck, sfxBoom, sfxKill, sfxThrow, sfxLunge, sfxScreech, sfxCrow } from './sfx.js';
import { PERIL, NO_MERCY, HOPS } from './profile.js';

export const RAT = 0;
export const FOX = 1;
export const SNAKE = 2;
export const CROW = 3;
export const BADGER = 4;
export const CRATE = 5;
export const MAGPIE = 6;
export const WEASEL = 7;
export const SKUNK = 8;

/**
 * What a predator does besides biting: chase the hen, keep away and throw pebbles, or lunge. The
 * events (events.js) also send predators that RUN straight along (dirX, dirY) and leave, or CLOSE
 * in on the point (dirX, dirY) for `timer` seconds before they chase.
 */
export const CHASE = 0;
export const SHOOT = 1;
export const CHARGE = 2;
export const RUN = 3;
export const CLOSE = 4;
/** During a FRENZY! every predator runs this much faster; at peril NO MERCY, always this much. */
export const FRENZY_SPEED = 1.2;
export const NO_MERCY_SPEED = 1.1;
/**
 * Each minute of the run adds SPEED_MIN to a newborn's speed, up to SPEED_CAP (minute 20): the
 * fast kinds come to outrun her (a snake from about 9:00, a crow from about 17:00), the swarm never
 * does. And every other chaser cuts her off: it heads for where she will be in LEAD seconds, a
 * lead that starts at minute LEAD_FROM and grows to its full length over LEAD_RAMP minutes (the
 * first minutes bite enough as they are).
 */
export const SPEED_MIN = 0.03;
export const SPEED_CAP = 0.6;
export const LEAD = 0.5;
export const LEAD_FROM = 3;
export const LEAD_RAMP = 5;

/**
 * Enemy kinds, each with a role and its own growth: hp and dmg are the health and
 * bite (and pebble) of one born at 0:00, and hpMin / dmgMin what each minute of the day adds ·
 * speed: tiles per second, its own and steady (the hen runs 6) · kr: knockback resistance, 0-1 ·
 * armor: taken off every hit (at least MIN_HIT gets through) · r: body radius (tiles) · colors: palette
 * indices for the hit puff · flying:
 * drawn in the air and only pushed apart from other flyers · act: CHASE (default), SHOOT or CHARGE ·
 * max: how many may be alive at once (waves.js sends another kind instead) · stink: leaves a
 * stink cloud where it falls · rare: when the pool is full, it takes the place of the farthest
 * common predator (as a boss does), so it never misses its minute.
 */
export const ENEMY_TYPES = [
  // The swarm: weak alone, many
  { name: 'rat', hp: 80, hpMin: 50, dmg: 60, dmgMin: 12, speed: 2.8, r: 0.32, colors: [16, 17] },
  // The brawler: sturdy, hits harder, shrugs off some knockback
  { name: 'fox', hp: 300, hpMin: 200, dmg: 90, dmgMin: 15, speed: 3.3, kr: 0.3, r: 0.45, colors: [18, 13] },
  // The fast one: frail, nearly as quick as the hen
  { name: 'snake', hp: 60, hpMin: 40, dmg: 70, dmgMin: 12, speed: 4.8, r: 0.3, colors: [12, 15] },
  { name: 'crow', hp: 100, hpMin: 60, dmg: 60, dmgMin: 10, speed: 4, r: 0.3, colors: [15, 0], flying: true },
  // The tank: slow, armored (small hits barely scratch it), hardly pushed
  { name: 'badger', hp: 700, hpMin: 450, dmg: 140, dmgMin: 20, speed: 2.2, kr: 0.8, armor: 30, r: 0.55, colors: [17, 13] },
  { name: 'crate', hp: 50, speed: 0, r: 0.4, dmg: 0, colors: [19, 8], prop: true },
  { name: 'magpie', hp: 140, hpMin: 60, dmg: 70, dmgMin: 12, speed: 2.8, r: 0.3, colors: [15, 13], flying: true, act: SHOOT, max: 6, rare: true },
  { name: 'weasel', hp: 160, hpMin: 80, dmg: 90, dmgMin: 15, speed: 2.8, kr: 0.5, r: 0.34, colors: [19, 13], act: CHARGE, rare: true },
  { name: 'skunk', hp: 350, hpMin: 150, dmg: 90, dmgMin: 15, speed: 1.9, kr: 0.5, armor: 10, r: 0.45, colors: [15, 13], stink: true, rare: true },
];

/** The least a hit deals through armor. */
export const MIN_HIT = 10;
/** A hit this strong shows its number twice as big. */
export const BIG_HIT = 250;
/** A critical hit (a `stats.crit` chance on every hit) deals this many times as much. */
export const CRIT_MULT = 2;

/** An elite's health, size and speed against its kind's; a rainbow one is tougher still. */
export const ELITE_HP = 6;
export const RAINBOW_HP = 10;
const ELITE_SIZE = 1.4;
export const ELITE_ARMOR = 20;
export const ELITE_SPEED = 1.15;
/** Golden eggs for a golden elite and for a rainbow one. */
export const ELITE_EGGS = [2, 8];

/** A stink cloud lasts CLOUD_TIME seconds and hurts the hen inside CLOUD_R tiles every CLOUD_TICK. */
export const CLOUD_TIME = 3;
export const CLOUD_R = 1.6;
const CLOUD_TICK = 0.5;

/**
 * A lunger closer than DASH_FROM tiles (and farther than DASH_NEAR) stops and blinks for
 * DASH_WARN seconds, aiming where the hen is, then lunges that way at DASH_SPEED for DASH_TIME and
 * rests DASH_REST before the next one. Stepping aside while it blinks makes it miss.
 */
const DASH_FROM = 6;
const DASH_NEAR = 2.5;
export const DASH_WARN = 0.5;
export const DASH_TIME = 0.45;
const DASH_SPEED = 11;
const DASH_REST = 1.5;

/**
 * From ROOSTER (peril HOPS) a predator whose body comes within HOP_FROM tiles of hers, without
 * touching her, now and then hops at her on the spot, with no warning: at HOP_SPEED for HOP_TIME
 * (an arc in the air, 1.2 tiles), toward where she is, biting if it lands on her. Then it waits
 * HOP_EVERY to twice that before the next. Short, so walking away makes it miss.
 */
const HOP_FROM = 0.8;
export const HOP_TIME = 0.15;
export const HOP_SPEED = 8;
export const HOP_EVERY = 2;

/** A shooter comes closer from farther than this (tiles), backs off from nearer, and circles between. */
const KEEP_FAR = 6;
const KEEP_NEAR = 4.5;
/** Seconds between two pebbles; the last SHOT_WARN of them it blinks white, as a warning. */
export const SHOT_EVERY = 2.6;
export const SHOT_WARN = 0.4;
/** Pebble speed (tiles/s), lifetime (s) and radius (tiles). They fly straight: she can dodge them. */
const SHOT_SPEED = 5;
export const SHOT_LIFE = 3;
const SHOT_R = 0.2;

/**
 * The ten bosses, one at every BOSS_EVERY levels of hers (waves.js): the kind it is a big version
 * of, its name on the boss bar, its tint (a palette index), and its attack: `atk` SUMMON (a ring
 * of rats around it), FAN (a fan of venom drops), LEAP (it rises, a shadow marks where she is and
 * locks a moment before it lands within `reach` tiles), RING (pebbles all around), VANISH (it
 * fades away, comes back beside her blinking, and lunges), TRAIL (stink clouds where it walks) or
 * PACK (foxes run from behind it past her), or `act` CHARGE (three lunges in a row). Every attack
 * warns first, so she can step away. The last boss, at level 100, is the final one: MIDNIGHT
 * lunges, RAGEs (rings and rats) under half its health, and its fall wins the run.
 */
export const BOSS_EVERY = 10;
export const SUMMON = 1;
export const FAN = 2;
export const LEAP = 3;
export const RING = 4;
export const VANISH = 5;
export const TRAIL = 6;
export const PACK = 7;
export const RAGE = 8;
export const BOSSES = [
  { kind: RAT, name: 'KING RAT', color: 10, atk: SUMMON },
  { kind: FOX, name: 'OLD RED', color: 9, act: CHARGE },
  { kind: SNAKE, name: 'THE COIL', color: 11, atk: FAN },
  { kind: CROW, name: 'CROW MOTHER', color: 18, atk: LEAP, reach: 1.2 },
  { kind: BADGER, name: 'IRON BADGER', color: 16, atk: LEAP, reach: 2 },
  { kind: MAGPIE, name: 'MAGPIE BARON', color: 12, atk: RING },
  { kind: WEASEL, name: 'SHADOW WEASEL', color: 15, atk: VANISH },
  { kind: SKUNK, name: 'STINK DUKE', color: 14, atk: TRAIL },
  { kind: FOX, name: 'PACK LEADER', color: 16, atk: PACK },
  { kind: FOX, name: 'MIDNIGHT', color: 15, act: CHARGE },
];
/**
 * A boss attacks when she is within BOSS_RANGE tiles: it blinks for BOSS_WARN (a leap takes
 * LEAP_WARN, its shadow following her until LEAP_LOCK seconds before it lands), acts, then waits
 * BOSS_REST (BOSS_FIRST after it is born). A lunger's combo is three lunges, then its usual rest.
 */
const BOSS_RANGE = 8;
export const BOSS_WARN = 0.6;
export const LEAP_WARN = 1.3;
export const LEAP_LOCK = 0.5;
const BOSS_REST = 5;
const BOSS_FIRST = 2;
const LUNGE_COMBO = 3;
export const SUMMON_RATS = 4;
export const FAN_SHOTS = 5;
const FAN_STEP = 0.3;
export const RING_SHOTS = 8;
/** A vanished boss comes back this far (tiles) from her. */
export const VANISH_TO = 3;
/** Seconds between two stink clouds of a trail. */
export const TRAIL_EVERY = 1.2;
/** A pack: this many foxes, in a band this wide (tiles), from this far behind the boss. */
export const PACK_FOXES = 8;
const PACK_BAND = 4;
const PACK_FROM = 5;
/** When two bosses come at once (TWO BOSSES), each has this share of a boss's health. */
export const BOSS_PAIR_SHARE = 0.75;
/**
 * A boss's health is its own, the same for every kind: BOSS_BASE, growing with the square of her
 * level over BOSS_GROWTH (bosses come by level: about 1,000 at level 10, 10,600 at 50, 40,600 at
 * 100), plus peril's share. Its radius and bite are its kind's, times BOSS_SIZE and BOSS_BITE,
 * with BOSS_ARMOR on top.
 */
export const BOSS_BASE = 600;
export const BOSS_GROWTH = 150;
export const BOSS_SIZE = 2;
export const BOSS_BITE = 3;
export const BOSS_ARMOR = 30;
/** Bosses and elites take at most this much knockback resistance less than a full wall (1). */
export const HEAVY_KR = 0.8;

export const MAX_ENEMIES = 300;
/** Seconds between two bites of the same predator. */
export const BITE_COOLDOWN = 0.5;
/** Seconds a hit predator stays white. */
const HIT_FLASH = 0.25;
/**
 * Predators are born at most this far (tiles) from the hen: just off-screen on a wide screen,
 * a little inside the view on a tall one. So they take as long to reach her on any screen.
 */
export const SPAWN_MAX = 24;
/** A predator farther than this (tiles) is moved back, in front of the hen. */
const FAR_AWAY = SPAWN_MAX + 8;
/** While she walks, this share of births happens in front of her, within ±60° of her heading. */
const AHEAD_SHARE = 0.6;
const AHEAD_SPREAD = Math.PI / 3;
/** Each day gone by adds this share of a predator's health (it keeps growing by the minute too). */
export const DAY_HP = 0.5;
/** Seconds a newborn predator takes to rise out of the grass (it fades in and does not bite). */
export const RISE_TIME = 0.25;
/** Spawns happen this many pixels outside the visible screen. */
const SPAWN_MARGIN = 14;
/** Chance that a hit that does not kill also knocks the predator back. */
const KNOCKBACK_CHANCE = 0.5;
const DROP_CHANCE = 0.8;

export const enemies = Array.from({ length: MAX_ENEMIES }, () => ({
  alive: false,
  kind: RAT,
  x: 0,
  y: 0,
  prevX: 0,
  prevY: 0,
  hp: 0,
  maxHp: 0,
  speed: 0,
  r: 0,
  dmg: 0,
  flying: false,
  boss: false,
  /** Which of BOSSES it is (when `boss`), its attack (SUMMON, FAN, LEAP or 0), a leap's reach, and its lunges in a row. */
  bossId: 0,
  atk: 0,
  reach: 0,
  combo: 0,
  /** Crates: still, harmless, not counted as kills. */
  prop: false,
  /** Seconds since it appeared. */
  age: 0,
  flash: 0,
  biteCooldown: 0,
  /** Seconds before a Chick Orbit chick may nip this predator again. */
  chickCooldown: 0,
  /** Knockback velocity (tiles/s) while knockTime > 0; it does not chase meanwhile. */
  knockX: 0,
  knockY: 0,
  knockTime: 0,
  facing: 1,
  walkPhase: 0,
  act: CHASE,
  /** Seconds to the next pebble (shooters). */
  timer: 0,
  /** True while it blinks before acting: the player's warning. */
  warn: false,
  /** Which way a shooter circles the hen: 1 or -1. */
  side: 1,
  /** A lunger or a hopper: 0 chasing, 1 winding up, 2 in the air along (dirX, dirY). */
  state: 0,
  /** True when its leap is a short hop (HOPS), not a weasel's long lunge. */
  hop: false,
  dirX: 0,
  dirY: 0,
  /** 0, or 1 for a golden elite and 2 for a rainbow one. */
  elite: 0,
  /** Knockback resistance (0-1) and armor (taken off every hit). */
  kr: 0,
  armor: 0,
}));

/** Stink clouds left by skunks. */
export const clouds = Array.from({ length: 12 }, () => ({ alive: false, x: 0, y: 0, life: 0, tick: 0, dmg: 0 }));

/** Pebbles thrown by magpies (and a boss's venom drops, `color` 14), flying straight at where the hen was. */
export const shots = Array.from({ length: 32 }, () => ({ alive: false, x: 0, y: 0, prevX: 0, prevY: 0, vx: 0, vy: 0, life: 0, dmg: 0, color: 16 }));

/** Predator `e` throws a pebble along (ux, uy), a unit vector, hurting `dmg` (its bite). */
function throwPebble(e, ux, uy, dmg = e.dmg, color = 16) {
  const s = shots.find((p) => !p.alive);
  if (!s) return;
  Object.assign(s, { alive: true, x: e.x, y: e.y, prevX: e.x, prevY: e.y, vx: ux * SHOT_SPEED, vy: uy * SHOT_SPEED, life: SHOT_LIFE, dmg, color });
  sfxThrow();
}

/** A stink cloud at (x, y) that hurts `dmg` while she stands in it (a skunk's death, a duke's trail). */
function stink(x, y, dmg) {
  const c = clouds.find((item) => !item.alive);
  if (c) Object.assign(c, { alive: true, x, y, life: CLOUD_TIME, tick: 0, dmg });
}

/** Spawns a predator of `kind` at (x, y), making room in a full pool. */
function place(kind, x, y) {
  if (!enemies.some((o) => !o.alive)) makeRoom();
  return spawnEnemy(kind, x, y);
}

/**
 * Boss `e` does its attack, the hen being along (ux, uy), and sets what it does next (rest, or
 * for a vanished weasel the blink and the lunge): see BOSSES. `bite` is its kind's plain bite.
 */
function bossAttack(e, ux, uy) {
  const bite = Math.round(e.dmg / BOSS_BITE);
  e.state = 0;
  e.timer = BOSS_REST;
  if (e.atk === SUMMON || e.atk === RAGE) {
    for (let i = 0; i < SUMMON_RATS; i++) {
      const a = (i / SUMMON_RATS) * Math.PI * 2;
      place(RAT, e.x + Math.cos(a) * 2, e.y + Math.sin(a) * 2);
    }
  }
  if (e.atk === FAN) {
    const a0 = Math.atan2(uy, ux);
    for (let i = 0; i < FAN_SHOTS; i++) {
      const a = a0 + (i - (FAN_SHOTS - 1) / 2) * FAN_STEP;
      throwPebble(e, Math.cos(a), Math.sin(a), bite, 14);
    }
  } else if (e.atk === RING || e.atk === RAGE) {
    for (let i = 0; i < RING_SHOTS; i++) {
      const a = (i / RING_SHOTS) * Math.PI * 2;
      throwPebble(e, Math.cos(a), Math.sin(a), bite);
    }
  } else if (e.atk === VANISH) {
    if (e.combo) {
      // Back in sight beside her: the lunge
      e.combo = 0;
      e.state = 2;
      e.timer = DASH_TIME;
      sfxLunge();
    } else {
      // Gone: it comes back VANISH_TO tiles from her, blinking, aimed at her
      const a = gameRand() * Math.PI * 2;
      e.x = e.prevX = hen.x + Math.cos(a) * VANISH_TO;
      e.y = e.prevY = hen.y + Math.sin(a) * VANISH_TO;
      e.dirX = -Math.cos(a);
      e.dirY = -Math.sin(a);
      e.combo = 1;
      e.state = 1;
      e.timer = DASH_WARN;
    }
  } else if (e.atk === PACK) {
    // A howl: foxes run from behind it, past her, at twice their speed
    for (let i = 0; i < PACK_FOXES; i++) {
      const across = ((i % 4) / 3 - 0.5) * PACK_BAND;
      const back = PACK_FROM + Math.floor(i / 4) * 1.5;
      const f = place(FOX, e.x - ux * back - uy * across, e.y - uy * back + ux * across);
      if (f) Object.assign(f, { act: RUN, dirX: ux, dirY: uy, speed: f.speed * 2 });
    }
  } else if (e.atk === LEAP) {
    // It lands where its shadow locked: dust, a shake, and a bite if she is still under it
    e.x = e.prevX = e.dirX;
    e.y = e.prevY = e.dirY;
    sfxBoom();
    triggerShake(0, 1, 3, 0.2);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      spawnParticle(e.x, e.y, 1, Math.cos(a) * 2.5, Math.sin(a) * 2.5, 10, i % 2 ? 6 : 19, 1, 0.4);
    }
    if (Math.hypot(hen.x - e.x, hen.y - e.y) < e.reach + HEN_RADIUS) damageHen(e.dmg, e.x, e.y);
    e.biteCooldown = BITE_COOLDOWN; // the landing is its bite: no touch bite on top
  }
}

/** Pebbles fly and hit; stink clouds hurt the hen while she stands in them, then clear. */
function updateHazards(dt) {
  for (const c of clouds) {
    if (!c.alive) continue;
    c.life -= dt;
    c.tick -= dt;
    if (c.life <= 0 || game.over) c.alive = false;
    else if (c.tick <= 0 && Math.hypot(hen.x - c.x, hen.y - c.y) < CLOUD_R) {
      c.tick = CLOUD_TICK;
      damageHen(c.dmg, c.x, c.y);
    }
  }
  for (const s of shots) {
    if (!s.alive) continue;
    s.prevX = s.x;
    s.prevY = s.y;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.life <= 0 || game.over) s.alive = false;
    else if (Math.hypot(hen.x - s.x, hen.y - s.y) < HEN_RADIUS + SHOT_R) {
      s.alive = false;
      damageHen(s.dmg, s.x, s.y);
    }
  }
}

/** The alive predators of the current step, reused to avoid allocating every frame. */
const active = [];

/** Screen-space offset in pixels from the hen to world point (x, y). */
export function screenOffset(x, y) {
  const dx = x - hen.x;
  const dy = y - hen.y;
  return { sx: (dx - dy) * HALF_W, sy: (dx + dy) * HALF_H };
}

/** True if world point (x, y) is inside the screen, with `margin` pixels to spare. */
export function onScreen(x, y, margin = 0) {
  const { sx, sy } = screenOffset(x, y);
  return Math.abs(sx) < WIDTH / 2 - margin && Math.abs(sy) < HEIGHT / 2 - margin;
}

/**
 * A birth place for a predator: in a random world direction (or, `ahead` of the time while she
 * walks, roughly where she is heading), where that direction leaves the screen, but never more
 * than SPAWN_MAX tiles away. Running in a straight line therefore runs into fresh predators.
 */
export function spawnPoint(ahead = AHEAD_SHARE) {
  let angle = gameRand() * Math.PI * 2;
  if (hen.moving && gameRand() < ahead) angle = Math.atan2(hen.dirY, hen.dirX) + (gameRand() * 2 - 1) * AHEAD_SPREAD;
  const cx = Math.cos(angle);
  const cy = Math.sin(angle);
  // Pixels on screen per tile walked in that direction
  const sx = Math.abs(cx - cy) * HALF_W || 1e-6;
  const sy = Math.abs(cx + cy) * HALF_H || 1e-6;
  const reach = Math.min((WIDTH / 2 + SPAWN_MARGIN) / sx, (HEIGHT / 2 + SPAWN_MARGIN) / sy, SPAWN_MAX);
  return { x: hen.x + cx * reach, y: hen.y + cy * reach };
}

/** Frees a slot in a full pool: the farthest predator that is not a boss leaves. */
export function makeRoom() {
  let far = null;
  let farD = -1;
  for (const e of enemies) {
    const d = (e.x - hen.x) ** 2 + (e.y - hen.y) ** 2;
    if (!e.boss && !ENEMY_TYPES[e.kind].rare && d > farD) {
      farD = d;
      far = e;
    }
  }
  if (far) far.alive = false;
}

/**
 * Spawns a predator at (x, y), or just off-screen if no position is given. Returns it, or null
 * when the pool is full (a rare kind makes room instead).
 */
export function spawnEnemy(kind, x, y) {
  if (ENEMY_TYPES[kind].rare && !enemies.some((item) => !item.alive)) makeRoom();
  const e = enemies.find((item) => !item.alive);
  if (!e) return null;
  if (x === undefined) ({ x, y } = spawnPoint());
  // A little dust where it comes out of the grass (only worth it when she can see it)
  if (onScreen(x, y, -20)) for (let i = 0; i < 4; i++) spawnParticle(x, y, 1, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 12, 6, 1, 0.35);
  const type = ENEMY_TYPES[kind];
  // Tougher as the run goes on, a little faster too; each endless day adds their whole base health
  // again and 10% speed (crates stay as they are). Peril adds its shares of health, speed and bite.
  const days = game.day - 1;
  const peril = type.prop ? 0 : game.peril;
  // Each kind grows by the minute at its own pace, all the run long (a new day does not start it
  // over); each day gone by adds DAY_HP of its health and peril its share. Never her level.
  const minutes = game.time / 60;
  const hp = type.prop ? type.hp : Math.floor((type.hp + (type.hpMin || 0) * minutes) * (1 + DAY_HP * days) * (1 + PERIL.hp * peril));
  const phase = gameRand() * 2;
  Object.assign(e, {
    alive: true,
    kind,
    x,
    y,
    prevX: x,
    prevY: y,
    hp,
    maxHp: hp,
    speed: type.speed * (1 + Math.min(SPEED_CAP, SPEED_MIN * minutes)) * (1 + 0.1 * days) * (peril >= NO_MERCY ? NO_MERCY_SPEED : 1),
    r: type.r,
    dmg: Math.round((type.dmg + (type.dmgMin || 0) * minutes) * (1 + PERIL.bite * peril)),
    kr: type.kr || 0,
    armor: type.armor || 0,
    flying: !!type.flying,
    boss: false,
    bossId: 0,
    atk: 0,
    reach: 0,
    combo: 0,
    prop: !!type.prop,
    age: 0,
    flash: 0,
    biteCooldown: 0,
    chickCooldown: 0,
    knockTime: 0,
    facing: 1,
    walkPhase: phase,
    act: type.act || CHASE,
    timer: SHOT_EVERY * (0.5 + phase / 2),
    warn: false,
    side: phase < 1 ? 1 : -1,
    state: 0,
    hop: false,
    elite: 0,
  });
  return e;
}

/** Makes predator `e` an elite: golden, or `rainbow`. Much tougher, a little bigger and faster. */
export function makeElite(e, rainbow) {
  e.elite = rainbow ? 2 : 1;
  e.hp = e.maxHp = e.hp * (rainbow ? RAINBOW_HP : ELITE_HP);
  e.r *= ELITE_SIZE;
  e.speed *= ELITE_SPEED;
  e.armor += ELITE_ARMOR;
  e.kr = Math.max(e.kr, HEAVY_KR);
}

/**
 * Spawns boss `id` (a BOSSES index) just off-screen: a big version of its kind (×BOSS_HP health,
 * ×BOSS_SIZE radius, ×BOSS_BITE bite, armor), with `share` of that health when two come at once.
 * It always finds room.
 */
export function spawnBoss(id, share = 1) {
  if (!enemies.some((e) => !e.alive)) makeRoom();
  const e = spawnEnemy(BOSSES[id].kind);
  if (!e) return null;
  e.boss = true;
  e.bossId = id;
  e.hp = e.maxHp = Math.floor(BOSS_BASE * (1 + game.level ** 2 / BOSS_GROWTH) * (1 + PERIL.hp * game.peril) * share);
  e.r *= BOSS_SIZE;
  e.dmg *= BOSS_BITE;
  e.armor += BOSS_ARMOR;
  e.kr = Math.max(e.kr, HEAVY_KR);
  const b = BOSSES[id];
  e.atk = b.atk || 0;
  e.reach = b.reach || 0;
  if (b.act) e.act = b.act;
  e.timer = BOSS_FIRST;
  return e;
}

/** The on-screen name of a boss. */
export function bossName(e) {
  return BOSSES[e.bossId].name;
}

export function clearEnemies() {
  for (const e of enemies) e.alive = false;
  for (const s of shots) s.alive = false;
  for (const c of clouds) c.alive = false;
}

export function countEnemies() {
  let n = 0;
  for (const e of enemies) if (e.alive) n++;
  return n;
}

/** The alive predator nearest to (x, y) within `range` tiles that is on screen, or null. */
export function nearestEnemy(x, y, range = Infinity, skip = null) {
  let best = null;
  let bestD = range * range;
  for (const e of enemies) {
    if (!e.alive || e === skip || !onScreen(e.x, e.y, 6)) continue;
    const d = (e.x - x) ** 2 + (e.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/**
 * Deals `dmg` to predator `e`, hit from world point (fromX, fromY). A critical hit doubles it and
 * shows big and gold. Its armor comes off next (at least MIN_HIT gets through, and an armored hit
 * shows grey) unless `ignoreArmor`. `knock` is the
 * knockback speed in tiles per second, cut by its resistance, applied on a kill and on half of the
 * other hits (on every hit when `alwaysKnock` is set, as Wing Gust does).
 */
export function hitEnemy(e, dmg, fromX, fromY, knock = 6, alwaysKnock = false, ignoreArmor = false) {
  if (!e.alive) return;
  const crit = gameRand() < stats.crit;
  if (crit) dmg *= CRIT_MULT;
  const armor = ignoreArmor ? 0 : e.armor;
  dmg = Math.max(MIN_HIT, dmg - armor);
  e.hp -= dmg;
  e.flash = HIT_FLASH;
  spawnPopup(e.x, e.y, String(dmg), crit ? 10 : armor ? 16 : 13, crit || dmg >= BIG_HIT ? 2 : 1);
  const type = ENEMY_TYPES[e.kind];
  for (let i = 0; i < 3; i++) {
    spawnParticle(e.x, e.y, 6, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 15 + Math.random() * 20, i ? 13 : type.colors[0]);
  }
  sfxPeck();
  const killed = e.hp <= 0;
  if (!e.prop && (killed || alwaysKnock || gameRand() < KNOCKBACK_CHANCE)) {
    const dx = e.x - fromX;
    const dy = e.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    const k = knock * (1 - e.kr);
    e.knockX = (dx / len) * k;
    e.knockY = (dy / len) * k;
    e.knockTime = 0.15;
  }
  if (killed) killEnemy(e);
}

/** What a broken crate leaves: a magnet or a bomb, else food when she is hurt, else corn. */
function crateDrop(e) {
  if (gameRand() < 0.3) spawnPickup(gameRand() < 0.5 ? MAGNET : BOMB, e.x, e.y);
  else if (hen.hp < hen.maxHp && gameRand() < 0.8) spawnPickup(FOOD, e.x, e.y);
  else spawnCorn(e.x, e.y, 3);
}

function killEnemy(e) {
  e.alive = false;
  if (!e.prop) game.kills++;
  sfxKill(e.kind);
  const type = ENEMY_TYPES[e.kind];
  const puffs = e.boss ? 30 : 8;
  for (let i = 0; i < puffs; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = e.boss ? 3 : 1.5;
    spawnParticle(e.x, e.y, 4, Math.cos(a) * s, Math.sin(a) * s, 10 + Math.random() * 25, type.colors[i % 2], e.boss ? 2 : 1, 0.3 + Math.random() * 0.3);
  }
  if (e.boss) {
    spawnPickup(CHEST, e.x, e.y);
    triggerShake(1, 0, 3, 0.2);
    sfxBoom();
    if (e.bossId === BOSSES.length - 1) {
      // MIDNIGHT falls: she wins. The rooster crows and the predators run.
      game.over = game.won = true;
      game.overTime = 0;
      game.newBest = saveBest(game.time);
      sfxCrow();
    }
  } else if (e.prop) crateDrop(e);
  if (e.elite) {
    // A chest (three upgrades in a rainbow one's) and golden eggs
    const eggs = ELITE_EGGS[e.elite - 1];
    spawnPickup(CHEST, e.x, e.y, e.elite > 1);
    game.eggBonus += eggs;
    spawnPopup(e.x, e.y, `+${eggs} EGGS`, 10, 1, 1.2);
    sfxBoom();
  }
  if (type.stink) stink(e.x, e.y, Math.ceil(e.dmg / 3));
  // Corn is worth more the longer the run lasts.
  else if (gameRand() < DROP_CHANCE) spawnCorn(e.x, e.y, Math.floor(1 + game.time / 200));
}

/**
 * One step of what predator `e` does, the hen being `d` tiles away along (ux, uy): chase her;
 * (a shooter) hold its distance, circle her and throw a pebble now and then while on screen;
 * (a lunger) now and then stop, blink, and lunge at where she was; (a boss with an attack) now and
 * then stop, blink, and do it; and from ROOSTER (a chaser or a lunger close by) now and then hop at
 * her (bosses never hop).
 */
function act(e, ux, uy, d, dt) {
  let mx = ux;
  let my = uy;
  let speed = e.speed;
  // MIDNIGHT under half its health rages: rings of pebbles and rats instead of lunges
  if (e.bossId === BOSSES.length - 1 && !e.atk && e.hp < e.maxHp / 2) {
    e.atk = RAGE;
    e.state = 0;
    e.timer = 0.5;
    showBanner('MIDNIGHT RAGES!');
    sfxScreech();
  }
  if (e.atk) {
    e.timer -= dt;
    if (e.state === 1) {
      // Winding up: still, blinking; a leap's shadow follows her until it locks
      e.warn = true;
      speed = 0;
      if (e.atk === LEAP && e.timer > LEAP_LOCK) {
        e.dirX = hen.x;
        e.dirY = hen.y;
      }
      if (e.timer <= 0) bossAttack(e, ux, uy);
    } else if (e.state === 2) {
      // A vanished weasel's lunge
      mx = e.dirX;
      my = e.dirY;
      speed = DASH_SPEED;
      if (e.timer <= 0) {
        e.state = 0;
        e.timer = BOSS_REST;
      }
    } else if (e.timer <= 0 && d < BOSS_RANGE) {
      if (e.atk === TRAIL) {
        // No wind-up: the stink it leaves on the ground is the warning
        stink(e.x, e.y, Math.round(e.dmg / BOSS_BITE));
        e.timer = TRAIL_EVERY;
      } else {
        e.state = 1;
        e.timer = e.atk === LEAP ? LEAP_WARN : BOSS_WARN;
        e.dirX = hen.x;
        e.dirY = hen.y;
        e.warn = true;
        speed = 0;
        sfxScreech();
      }
    }
  } else if (e.act === SHOOT) {
    const toward = d > KEEP_FAR ? 1 : d < KEEP_NEAR ? -1 : 0;
    mx = toward ? ux * toward : -uy * e.side;
    my = toward ? uy * toward : ux * e.side;
    if (!toward) speed *= 0.6;
    if (onScreen(e.x, e.y, 8)) {
      e.timer -= dt;
      e.warn = e.timer < SHOT_WARN;
      if (e.timer <= 0) {
        e.timer = SHOT_EVERY;
        throwPebble(e, ux, uy);
      }
    }
  } else if (e.act === RUN) {
    mx = e.dirX;
    my = e.dirY;
  } else if (e.act === CLOSE) {
    const cx = e.dirX - e.x;
    const cy = e.dirY - e.y;
    const c = Math.hypot(cx, cy) || 1;
    mx = cx / c;
    my = cy / c;
    speed *= 0.6;
    e.timer -= dt;
    if (e.timer <= 0 || c < 1) e.act = CHASE;
  } else if (e.act === CHARGE || (e.act === CHASE && game.peril >= HOPS)) {
    e.timer -= dt;
    if (e.state === 1) {
      // Winding up: still, blinking, aimed
      e.warn = true;
      speed = 0;
      if (e.timer <= 0) {
        e.state = 2;
        e.timer = DASH_TIME;
        sfxLunge();
      }
    } else if (e.state === 2) {
      mx = e.dirX;
      my = e.dirY;
      speed = e.hop ? HOP_SPEED : DASH_SPEED;
      if (e.timer <= 0) {
        e.state = 0;
        // A boss lunges LUNGE_COMBO times in a row before it rests
        e.timer = e.hop ? HOP_EVERY * (1 + gameRand()) : e.boss && ++e.combo % LUNGE_COMBO ? 0.05 : DASH_REST;
      }
    } else if (e.timer <= 0) {
      // Close by (HOPS): a hop, at once; a lunger from farther: blink, then its long lunge
      const gap = d - e.r - HEN_RADIUS;
      e.hop = !e.boss && game.peril >= HOPS && gap > 0 && gap < HOP_FROM;
      e.dirX = ux;
      e.dirY = uy;
      if (e.hop) {
        e.state = 2;
        e.timer = HOP_TIME;
      } else if (e.act === CHARGE && d < DASH_FROM && (d > DASH_NEAR || e.boss)) {
        e.state = 1;
        e.timer = DASH_WARN;
        e.warn = true;
        speed = 0;
      }
    }
  }
  if (game.frenzy > 0) speed *= FRENZY_SPEED;
  e.x += mx * speed * dt;
  e.y += my * speed * dt;
  e.walkPhase += dt * 8;
}

export function updateEnemies(dt) {
  active.length = 0;
  for (const e of enemies) if (e.alive) active.push(e);

  for (const e of active) {
    e.prevX = e.x;
    e.prevY = e.y;
    e.age += dt;
    e.flash = Math.max(0, e.flash - dt);
    e.biteCooldown = Math.max(0, e.biteCooldown - dt);
    e.chickCooldown = Math.max(0, e.chickCooldown - dt);
    const dx = hen.x - e.x;
    const dy = hen.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    // Every other chaser (side 1) cuts her off: it heads for where she will be in LEAD seconds
    // while she moves. Bites and ranges keep the true distance.
    const lead = e.side > 0 && hen.moving && !e.flying && e.act === CHASE ? LEAD * HEN_SPEED * Math.min(1, Math.max(0, (game.time / 60 - LEAD_FROM) / LEAD_RAMP)) : 0;
    const ax = dx + hen.dirX * lead;
    const ay = dy + hen.dirY * lead;
    const a = Math.hypot(ax, ay) || 1;

    if (e.prop) {
      // Crates stay put; one left far behind is gone.
      if (d > FAR_AWAY) e.alive = false;
      continue;
    }

    if (d > FAR_AWAY && !game.over) {
      // A stampede rat has crossed the meadow: gone.
      if (e.act === RUN) {
        e.alive = false;
        continue;
      }
      // Left far behind: come back in front of her.
      const p = spawnPoint(1);
      e.x = e.prevX = p.x;
      e.y = e.prevY = p.y;
      continue;
    }

    e.warn = false;
    if (e.knockTime > 0) {
      e.knockTime -= dt;
      e.x += e.knockX * dt;
      e.y += e.knockY * dt;
    } else if (game.over) {
      // After the hen falls, wander off; at dawn, run away.
      const s = (game.won ? -1.4 : -0.5) * e.speed * dt;
      e.x += (dx / d) * s;
      e.y += (dy / d) * s;
      e.walkPhase += dt * 8;
    } else act(e, ax / a, ay / a, d, dt);
    // Face her, or (a stampede rat) the way it runs
    const screenDx = e.act === RUN ? e.dirX - e.dirY : dx - dy;
    if (Math.abs(screenDx) > 0.05) e.facing = (screenDx > 0) === !game.over ? 1 : -1;

    // (A boss in the air, winding up a leap or a fan, does not bite by touch.)
    if (!game.over && e.age > RISE_TIME && d < e.r + HEN_RADIUS && e.biteCooldown <= 0 && !(e.atk && e.state)) {
      e.biteCooldown = BITE_COOLDOWN;
      damageHen(e.dmg, e.x, e.y);
    }
  }

  // Push overlapping predators apart (each pair once; flyers only push flyers), then out of the
  // hen so she stays visible.
  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    if (a.prop) continue;
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j];
      if (a.flying !== b.flying || b.prop) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.01;
      const push = ((min - d) / d) * 0.5;
      a.x -= dx * push;
      a.y -= dy * push;
      b.x += dx * push;
      b.y += dy * push;
    }
    const hx = a.x - hen.x;
    const hy = a.y - hen.y;
    const min = (a.r + HEN_RADIUS) * 0.8;
    const d = Math.hypot(hx, hy);
    if (d < min) {
      const k = d > 0.001 ? min / d : 0;
      a.x = hen.x + (k ? hx * k : min);
      a.y = hen.y + (k ? hy * k : 0);
    }
  }
  updateHazards(dt);
}
