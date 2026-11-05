// Prizes on the ground. Bosses drop a chest (more upgrades); broken crates drop a magnet (pulls
// every kernel on the map), a bomb (clears the screen, hurts bosses), food (heals) or corn. The
// hen picks a prize up by walking over it.
import { game } from './state.js';
import { hen, HEN_RADIUS } from './hen.js';
import { pullAllCorn } from './corn.js';
import { enemies, hitEnemy, onScreen } from './enemies.js';
import { triggerShake, triggerFlash } from './juice.js';
import { spawnParticle, spawnPopup } from './pool.js';
import { sfxPickup, sfxBoom, sfxMagnet, sfxFood } from './sfx.js';

export const CHEST = 0;
export const MAGNET = 1;
export const BOMB = 2;
export const FOOD = 3;
export const MAX_PICKUPS = 24;
const FOOD_HEAL = 30;
/** A bomb kills every regular predator on screen and takes this much from a boss. */
const BOMB_BOSS_DAMAGE = 60;
/** Extra reach (tiles) beyond her body at which the hen grabs a prize. */
const GRAB_PAD = 0.35;

export const pickups = Array.from({ length: MAX_PICKUPS }, () => ({ alive: false, kind: CHEST, x: 0, y: 0, z: 0, vz: 0, age: 0 }));

/** Drops prize `kind` at (x, y). A `big` chest holds three upgrades (a rainbow elite's). */
export function spawnPickup(kind, x, y, big = false) {
  const p = pickups.find((item) => !item.alive);
  if (p) Object.assign(p, { alive: true, kind, x, y, z: 0, vz: 45, age: 0, big });
}

export function clearPickups() {
  for (const p of pickups) p.alive = false;
}

/** A bomb: everything on screen is hit; regular predators die, bosses take a big hit. */
export function detonate() {
  for (const e of enemies) {
    if (!e.alive || !onScreen(e.x, e.y)) continue;
    hitEnemy(e, e.boss ? BOMB_BOSS_DAMAGE : e.hp, hen.x, hen.y, 8);
  }
  triggerFlash(0.25);
  triggerShake(1, 1, 4, 0.3);
  sfxBoom();
}

function grab(p) {
  p.alive = false;
  sfxPickup();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    spawnParticle(p.x, p.y, 6, Math.cos(a) * 1.8, Math.sin(a) * 1.8, 25, i % 2 ? 10 : 13, 1, 0.4);
  }
  if (p.kind === CHEST) {
    game.chests++;
    if (p.big) game.bigChests++;
  }
  else if (p.kind === MAGNET) {
    pullAllCorn();
    sfxMagnet();
  } else if (p.kind === BOMB) detonate();
  else {
    sfxFood();
    const healed = Math.min(FOOD_HEAL, hen.maxHp - hen.hp);
    hen.hp += healed;
    spawnPopup(hen.x, hen.y, `+${healed}`, 10);
  }
}

export function updatePickups(dt) {
  for (const p of pickups) {
    if (!p.alive) continue;
    p.age += dt;
    if (p.z > 0 || p.vz !== 0) {
      p.z += p.vz * dt;
      p.vz -= 160 * dt;
      if (p.z <= 0) p.z = p.vz = 0;
    }
    const reach = HEN_RADIUS + GRAB_PAD;
    if (!game.over && (p.x - hen.x) ** 2 + (p.y - hen.y) ** 2 < reach * reach) grab(p);
  }
}
