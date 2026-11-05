// Predators: they appear just outside the screen, chase the hen in a straight line, push each
// other apart so a horde reads as a crowd instead of one blob, and bite on contact. Hits flash
// them, knock them back and float a damage number; a kill drops corn most of the time.
// Bosses are big versions of a kind and drop a chest. Crates are props in the same pool: they
// stand still, never bite, are not kills, and break into a prize.
import { HALF_W, HALF_H } from './iso.js';
import { WIDTH, HEIGHT } from './screen.js';
import { gameRand } from './rng.js';
import { game } from './state.js';
import { hen, HEN_RADIUS, damageHen } from './hen.js';
import { spawnCorn } from './corn.js';
import { spawnParticle, spawnPopup } from './pool.js';
import { spawnPickup, CHEST, MAGNET, BOMB, FOOD } from './pickups.js';
import { triggerShake } from './juice.js';
import { sfxPeck, sfxBoom, sfxKill } from './sfx.js';

export const RAT = 0;
export const FOX = 1;
export const SNAKE = 2;
export const CROW = 3;
export const BADGER = 4;
export const CRATE = 5;

/**
 * Enemy kinds. hp: health at player level 1 · speed: tiles per second · r: body radius (tiles)
 * · dmg: bite damage · colors: palette indices for the hit puff · flying: drawn in the air and
 * only pushed apart from other flyers.
 */
export const ENEMY_TYPES = [
  { name: 'rat', hp: 6, speed: 2.1, r: 0.32, dmg: 5, colors: [16, 17] },
  { name: 'fox', hp: 26, speed: 2.55, r: 0.45, dmg: 8, colors: [18, 13] },
  { name: 'snake', hp: 5, speed: 3.45, r: 0.3, dmg: 6, colors: [12, 15] },
  { name: 'crow', hp: 9, speed: 3, r: 0.3, dmg: 5, colors: [15, 0], flying: true },
  { name: 'badger', hp: 60, speed: 1.65, r: 0.55, dmg: 10, colors: [17, 13] },
  { name: 'crate', hp: 5, speed: 0, r: 0.4, dmg: 0, colors: [19, 8], prop: true },
];

/** Bosses: this many times the health, radius and bite of their kind. */
export const BOSS_HP = 10;
export const BOSS_SIZE = 2;
export const BOSS_BITE = 3;
/** Knockback a boss still takes, as a share of a regular predator's. */
const BOSS_KNOCK = 0.25;

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
const AHEAD_SHARE = 0.4;
const AHEAD_SPREAD = Math.PI / 3;
/** Seconds a newborn predator takes to rise out of the grass (it fades in and does not bite). */
export const RISE_TIME = 0.25;
/** Spawns happen this many pixels outside the visible screen. */
const SPAWN_MARGIN = 14;
/** Chance that a hit that does not kill also knocks the predator back. */
const KNOCKBACK_CHANCE = 0.5;
const DROP_CHANCE = 0.9;

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
}));

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

/** Spawns a predator at (x, y), or just off-screen if no position is given. Returns it, or null when the pool is full. */
export function spawnEnemy(kind, x, y) {
  const e = enemies.find((item) => !item.alive);
  if (!e) return null;
  if (x === undefined) ({ x, y } = spawnPoint());
  // A little dust where it comes out of the grass (only worth it when she can see it)
  if (onScreen(x, y, -20)) for (let i = 0; i < 4; i++) spawnParticle(x, y, 1, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 12, 6, 1, 0.35);
  const type = ENEMY_TYPES[kind];
  // Tougher as the hen levels up and as the run goes on, a little faster too; each endless day
  // adds their whole base health again and 10% speed (crates stay as they are).
  const days = game.day - 1;
  const hp = type.prop ? type.hp : Math.floor(type.hp * (1 + (game.level - 1) / 12 + game.time / 240) * (1 + days));
  Object.assign(e, {
    alive: true,
    kind,
    x,
    y,
    prevX: x,
    prevY: y,
    hp,
    maxHp: hp,
    speed: type.speed * (1 + (game.level - 1) / 100) * (1 + 0.1 * days),
    r: type.r,
    dmg: type.dmg,
    flying: !!type.flying,
    boss: false,
    prop: !!type.prop,
    age: 0,
    flash: 0,
    biteCooldown: 0,
    chickCooldown: 0,
    knockTime: 0,
    facing: 1,
    walkPhase: gameRand() * 2,
  });
  return e;
}

/**
 * Spawns a boss of `kind` just off-screen. If the pool is full, the farthest regular predator
 * makes room: a boss always arrives.
 */
export function spawnBoss(kind) {
  if (!enemies.some((e) => !e.alive)) {
    let far = null;
    let farD = -1;
    for (const e of enemies) {
      const d = (e.x - hen.x) ** 2 + (e.y - hen.y) ** 2;
      if (!e.boss && d > farD) {
        farD = d;
        far = e;
      }
    }
    if (far) far.alive = false;
  }
  const e = spawnEnemy(kind);
  if (!e) return null;
  e.boss = true;
  e.hp = e.maxHp = e.hp * BOSS_HP;
  e.r *= BOSS_SIZE;
  e.dmg *= BOSS_BITE;
  return e;
}

/** The on-screen name of a boss. */
export function bossName(e) {
  return `BIG ${ENEMY_TYPES[e.kind].name.toUpperCase()}`;
}

export function clearEnemies() {
  for (const e of enemies) e.alive = false;
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
 * Deals `dmg` to predator `e`, hit from world point (fromX, fromY). `knock` is the knockback
 * speed in tiles per second, applied on a kill and on half of the other hits (on every hit when
 * `alwaysKnock` is set, as Wing Gust does).
 */
export function hitEnemy(e, dmg, fromX, fromY, knock = 6, alwaysKnock = false) {
  if (!e.alive) return;
  e.hp -= dmg;
  e.flash = HIT_FLASH;
  spawnPopup(e.x, e.y, String(dmg), dmg >= 15 ? 10 : 13, 0.5, 6);
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
    const k = knock * (e.boss ? BOSS_KNOCK : 1);
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
  } else if (e.prop) crateDrop(e);
  // Corn is worth more the longer the run lasts.
  else if (gameRand() < DROP_CHANCE) spawnCorn(e.x, e.y, Math.floor(1 + game.time / 200));
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

    if (e.prop) {
      // Crates stay put; one left far behind is gone.
      if (d > FAR_AWAY) e.alive = false;
      continue;
    }

    if (d > FAR_AWAY && !game.over) {
      // Left far behind: come back in front of her.
      const p = spawnPoint(1);
      e.x = e.prevX = p.x;
      e.y = e.prevY = p.y;
      continue;
    }

    if (e.knockTime > 0) {
      e.knockTime -= dt;
      e.x += e.knockX * dt;
      e.y += e.knockY * dt;
    } else {
      // Chase; after the hen falls, wander off; at dawn, run away.
      const s = (game.over ? (game.won ? -1.4 : -0.5) : 1) * e.speed * dt;
      e.x += (dx / d) * s;
      e.y += (dy / d) * s;
      e.walkPhase += dt * 8;
    }
    const screenDx = dx - dy;
    if (Math.abs(screenDx) > 0.05) e.facing = (screenDx > 0) === !game.over ? 1 : -1;

    if (!game.over && e.age > RISE_TIME && d < e.r + HEN_RADIUS && e.biteCooldown <= 0) {
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
}
