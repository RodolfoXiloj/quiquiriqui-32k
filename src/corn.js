// Corn: the experience. Kernels lie in the grass until the hen comes within reach of her magnet;
// then they hop up and fly to her. A handful is scattered around her at the start of a run, so
// the first two level-ups come within seconds.
import { gameRand } from './rng.js';
import { game } from './state.js';
import { hen } from './hen.js';
import { stats } from './items.js';
import { spawnParticle } from './pool.js';
import { sfxPickup } from './sfx.js';

export const MAX_CORN = 300;
const STARTING_CORN = 12;
/** Seconds a kernel hops in place before flying to the hen. */
const HOP_TIME = 0.18;
/** Pull acceleration (tiles/s²) and top speed (tiles/s) of a flying kernel. */
const PULL = 70;
const MAX_PULL_SPEED = 16;
/** A flying kernel this close (tiles) is eaten. */
const EAT_RADIUS = 0.4;

const IDLE = 0;
const HOP = 1;
const FLY = 2;

export const corn = Array.from({ length: MAX_CORN }, () => ({
  alive: false,
  x: 0,
  y: 0,
  prevX: 0,
  prevY: 0,
  /** Height in pixels (hops). */
  z: 0,
  vz: 0,
  vx: 0,
  vy: 0,
  value: 1,
  state: IDLE,
  timer: 0,
}));

/** Value tier for drawing: 0 gold (1), 1 blue (2–4), 2 red (5+). */
export function cornTier(value) {
  return value >= 5 ? 2 : value >= 2 ? 1 : 0;
}

/**
 * Drops a kernel worth `value` at (x, y), popping up at `bounce` px/s. When the pool is full, the
 * value joins an existing kernel instead.
 */
export function spawnCorn(x, y, value = 1, bounce = 30) {
  const c = corn.find((item) => !item.alive);
  if (!c) {
    corn[Math.floor(gameRand() * MAX_CORN)].value += value;
    return;
  }
  Object.assign(c, { alive: true, x, y, prevX: x, prevY: y, z: 0, vz: bounce, vx: 0, vy: 0, value, state: IDLE, timer: 0 });
}

export function clearCorn() {
  for (const c of corn) c.alive = false;
}

/** The kernels scattered around the hen when a run starts. */
export function scatterStartingCorn() {
  for (let i = 0; i < STARTING_CORN; i++) {
    const a = gameRand() * Math.PI * 2;
    const d = 2.6 + gameRand() * 3.5;
    spawnCorn(hen.x + Math.cos(a) * d, hen.y + Math.sin(a) * d, 1, 0);
  }
}

export function updateCorn(dt) {
  const reach2 = stats.magnet * stats.magnet;
  for (const c of corn) {
    if (!c.alive) continue;
    c.prevX = c.x;
    c.prevY = c.y;
    // Little bounce when dropped or when it starts to fly
    if (c.z > 0 || c.vz !== 0) {
      c.z += c.vz * dt;
      c.vz -= 160 * dt;
      if (c.z <= 0) c.z = c.vz = 0;
    }
    const dx = hen.x - c.x;
    const dy = hen.y - c.y;
    const d2 = dx * dx + dy * dy;
    if (c.state === IDLE) {
      if (!game.over && d2 < reach2) {
        c.state = HOP;
        c.timer = HOP_TIME;
        c.vz = 40;
      }
    } else if (c.state === HOP) {
      c.timer -= dt;
      if (c.timer <= 0) c.state = FLY;
    } else {
      const d = Math.sqrt(d2) || 1;
      c.vx += (dx / d) * PULL * dt;
      c.vy += (dy / d) * PULL * dt;
      // Damp the sideways part so kernels curve in instead of orbiting.
      const along = (c.vx * dx + c.vy * dy) / d;
      c.vx = c.vx * 0.9 + (dx / d) * along * 0.1;
      c.vy = c.vy * 0.9 + (dy / d) * along * 0.1;
      const speed = Math.hypot(c.vx, c.vy);
      if (speed > MAX_PULL_SPEED) {
        c.vx *= MAX_PULL_SPEED / speed;
        c.vy *= MAX_PULL_SPEED / speed;
      }
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (d < EAT_RADIUS) {
        c.alive = false;
        game.xp += c.value;
        spawnParticle(hen.x, hen.y, 10, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 25, 10, 1, 0.3);
        sfxPickup();
      }
    }
  }
}
