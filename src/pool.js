// Fixed-size object pools (no allocation during play): particles, floating text popups (damage
// numbers), Wing Gust rings and Thunder Comb bolts. Each pool is an array of reusable objects
// with an `alive` flag; when a pool is full the new effect is skipped. Enemies, corn and
// projectiles have their own pools.

export const MAX_PARTICLES = 240;
export const MAX_POPUPS = 64;
const MAX_RINGS = 8;
const MAX_BOLTS = 8;
/** Seconds a floating number stays up, and the first moment of it, drawn one size larger (a pop). */
export const POPUP_LIFE = 0.8;
export const POP_TIME = 0.1;
/** Numbers from one spot land up to this far apart (tiles), so hits in the same step never cover each other. */
const POPUP_SPREAD = 0.6;
/** Seconds a gust ring grows and a bolt stays on screen. */
export const RING_LIFE = 0.25;
export const BOLT_LIFE = 0.14;
/** Downward pull on particles, in pixels per second squared. */
const GRAVITY = 75;

export const particles = Array.from({ length: MAX_PARTICLES }, () => ({
  alive: false,
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  color: 0,
  size: 1,
  life: 0,
  maxLife: 1,
}));

export const popups = Array.from({ length: MAX_POPUPS }, () => ({
  alive: false,
  x: 0,
  y: 0,
  z: 0,
  text: '',
  color: 13,
  scale: 1,
  life: 0,
  maxLife: 0,
}));

/** Expanding rings on the ground: (x, y) center, `r` final radius in tiles. */
export const rings = Array.from({ length: MAX_RINGS }, () => ({ alive: false, x: 0, y: 0, r: 0, life: 0 }));
/** Lightning bolts from the top of the screen down to (x, y). `seed` shapes the zigzag. */
export const bolts = Array.from({ length: MAX_BOLTS }, () => ({ alive: false, x: 0, y: 0, life: 0, seed: 0 }));

/** First dead object in `pool`, or null when the pool is full (the effect is skipped). */
function claim(pool) {
  for (const item of pool) if (!item.alive) return item;
  return null;
}

/** Spawns one particle. `color` is a palette index; x, y in tiles, z and velocities in px. */
export function spawnParticle(x, y, z, vx, vy, vz, color, size = 1, life = 0.4) {
  const p = claim(particles);
  if (!p) return;
  Object.assign(p, { alive: true, x, y, z, vx, vy, vz, color, size, life, maxLife: life });
}

/** A small burst of `count` particles thrown out from (x, y). */
export function spawnPuff(x, y, count, color, speed = 1, rise = 18) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (0.3 + Math.random() * 0.7) * speed;
    spawnParticle(x, y, 1, Math.cos(a) * s, Math.sin(a) * s, rise * (0.5 + Math.random()), color, 1, 0.25 + Math.random() * 0.25);
  }
}

/**
 * Floating text that rises and fades near world point (x, y), at font `scale` (1 or 2). Each lands
 * at a random spot around it (visual only, so Math.random), and its height varies too.
 */
export function spawnPopup(x, y, text, color = 13, scale = 1, life = POPUP_LIFE) {
  const p = claim(popups);
  if (!p) return;
  const r = () => (Math.random() - 0.5) * POPUP_SPREAD;
  Object.assign(p, { alive: true, x: x + r(), y: y + r(), z: 14 + Math.random() * 8, text, color, scale, life, maxLife: life });
}

export function spawnRing(x, y, r) {
  const ring = claim(rings);
  if (ring) Object.assign(ring, { alive: true, x, y, r, life: RING_LIFE });
}

export function spawnBolt(x, y) {
  const bolt = claim(bolts);
  if (!bolt) return;
  Object.assign(bolt, { alive: true, x, y, life: BOLT_LIFE, seed: Math.floor(Math.random() * 1000) });
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    spawnParticle(x, y, 2, Math.cos(a) * 2, Math.sin(a) * 2, 20 + Math.random() * 20, i % 2 ? 10 : 13, 1, 0.3);
  }
}

export function clearPools() {
  for (const pool of [particles, popups, rings, bolts]) for (const p of pool) p.alive = false;
}

export function updatePools(dt) {
  for (const p of particles) {
    if (!p.alive) continue;
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vz -= GRAVITY * dt;
    if (p.z <= 0) {
      p.z = 0;
      p.vx *= 0.5;
      p.vy *= 0.5;
      p.vz = 0;
    }
    if (p.life <= 0) p.alive = false;
  }
  for (const p of popups) {
    if (!p.alive) continue;
    p.life -= dt;
    p.z += 18 * dt;
    if (p.life <= 0) p.alive = false;
  }
  for (const pool of [rings, bolts]) {
    for (const p of pool) {
      if (p.alive && (p.life -= dt) <= 0) p.alive = false;
    }
  }
}
