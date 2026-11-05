// Predators: they appear just outside the screen, chase the hen in a straight line, push each
// other apart so a horde reads as a crowd instead of one blob, and bite on contact. Hits flash
// them, knock them back and float a damage number; a kill drops corn most of the time.
import { HALF_W, HALF_H, screenToWorld } from './iso.js';
import { WIDTH, HEIGHT } from './screen.js';
import { gameRand } from './rng.js';
import { game } from './state.js';
import { hen, HEN_RADIUS, damageHen } from './hen.js';
import { spawnCorn } from './corn.js';
import { spawnParticle, spawnPopup } from './pool.js';
import { sfxPeck } from './sfx.js';

export const RAT = 0;
export const FOX = 1;

/**
 * Enemy kinds. hp: health at player level 1 · speed: tiles per second · r: body radius (tiles)
 * · dmg: bite damage · colors: palette indices for the hit puff.
 */
export const ENEMY_TYPES = [
  { name: 'rat', hp: 6, speed: 1.4, r: 0.32, dmg: 5, colors: [16, 17] },
  { name: 'fox', hp: 26, speed: 1.7, r: 0.45, dmg: 8, colors: [18, 13] },
];

export const MAX_ENEMIES = 300;
/** Seconds between two bites of the same predator. */
export const BITE_COOLDOWN = 0.5;
/** Seconds a hit predator stays white. */
const HIT_FLASH = 0.25;
/** A predator this far (tiles) from the hen is moved back to the edge of the screen. */
const FAR_AWAY = 30;
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

/** A random world point on a rectangle just outside the screen around the hen. */
export function spawnPoint() {
  const hw = WIDTH / 2 + SPAWN_MARGIN;
  const hh = HEIGHT / 2 + SPAWN_MARGIN;
  let u = gameRand() * 4 * (hw + hh);
  let sx;
  let sy;
  if (u < 2 * hw) {
    sx = u - hw;
    sy = -hh;
  } else if ((u -= 2 * hw) < 2 * hh) {
    sx = hw;
    sy = u - hh;
  } else if ((u -= 2 * hh) < 2 * hw) {
    sx = hw - u;
    sy = hh;
  } else {
    sx = -hw;
    sy = hh - (u - 2 * hw);
  }
  const w = screenToWorld(sx, sy);
  return { x: hen.x + w.x, y: hen.y + w.y };
}

/** Spawns a predator at (x, y), or just off-screen if no position is given. Returns it, or null when the pool is full. */
export function spawnEnemy(kind, x, y) {
  const e = enemies.find((item) => !item.alive);
  if (!e) return null;
  if (x === undefined) ({ x, y } = spawnPoint());
  const type = ENEMY_TYPES[kind];
  // Tougher as the hen levels up, a little faster too.
  const hp = Math.floor(type.hp * (1 + (game.level - 1) / 10));
  Object.assign(e, {
    alive: true,
    kind,
    x,
    y,
    prevX: x,
    prevY: y,
    hp,
    maxHp: hp,
    speed: type.speed * (1 + (game.level - 1) / 100),
    r: type.r,
    dmg: type.dmg,
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
  if (killed || alwaysKnock || gameRand() < KNOCKBACK_CHANCE) {
    const dx = e.x - fromX;
    const dy = e.y - fromY;
    const len = Math.hypot(dx, dy) || 1;
    e.knockX = (dx / len) * knock;
    e.knockY = (dy / len) * knock;
    e.knockTime = 0.15;
  }
  if (killed) killEnemy(e);
}

function killEnemy(e) {
  e.alive = false;
  game.kills++;
  const type = ENEMY_TYPES[e.kind];
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    spawnParticle(e.x, e.y, 4, Math.cos(a) * 1.5, Math.sin(a) * 1.5, 10 + Math.random() * 25, type.colors[i % 2], 1, 0.3 + Math.random() * 0.3);
  }
  // Corn is worth more the longer the run lasts.
  if (gameRand() < DROP_CHANCE) spawnCorn(e.x, e.y, Math.floor(1 + game.time / 200));
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

    if (d > FAR_AWAY && !game.over) {
      // Left far behind: come back from the edge of the screen.
      const p = spawnPoint();
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

    if (!game.over && d < e.r + HEN_RADIUS && e.biteCooldown <= 0) {
      e.biteCooldown = BITE_COOLDOWN;
      damageHen(e.dmg, e.x, e.y);
    }
  }

  // Push overlapping predators apart (each pair once), then out of the hen so she stays visible.
  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j];
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
