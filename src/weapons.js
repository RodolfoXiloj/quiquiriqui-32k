// The hen's weapons fire on their own. Each owned weapon waits its cooldown, then acts:
//   Egg Toss:      lobs eggs, one after another, at the nearest predator on screen. An egg breaks
//                  on the first predator it touches, or splashes everything around where it lands.
//   Peck:          a quick jab at the closest predator within reach (two at the top level).
//   Feather Darts: a fan of tail feathers shot behind her (opposite to where she last walked),
//                  so running away fights back; each dart pierces two foes.
//   Corn Spray:    a tight fan of kernels at a random predator on screen.
//   Wing Gust:     a burst of wind around her that hurts and shoves back everything close.
//   Chick Orbit:   chicks circle her and nip what they touch (each foe at most every 0.5 s).
//   Thunder Comb:  bolts strike random predators on screen.
// Stats per level come from items.js; Sunglasses scale every hit (weaponDamage).
import { hen } from './hen.js';
import { buildOrder, weaponStat, weaponDamage, weaponCooldown } from './items.js';
import { enemies, hitEnemy, nearestEnemy, onScreen } from './enemies.js';
import { gameRand } from './rng.js';
import { game } from './state.js';
import { triggerShake } from './juice.js';
import { spawnParticle, spawnRing, spawnBolt } from './pool.js';
import { sfxSplat, sfxGust, sfxThunder } from './sfx.js';

export const EGG = 0;
export const DART = 1;
export const KERNEL = 2;
export const MAX_PROJECTILES = 96;
export const MAX_CHICKS = 4;

const EGG_SPEED = 12; // tiles per second, faster than the hen
const EGG_ARC = 14; // peak height in pixels
const EGG_SPLASH = 0.75; // tiles
const EGG_GAP = 0.22; // seconds between eggs of one volley
const PECK_RANGE = 2.1;
const DART_SPEED = 14;
const DART_LIFE = 0.55;
const DART_PIERCE = 2;
const DART_SPREAD = 0.22; // radians between darts
const KERNEL_SPEED = 12;
const KERNEL_LIFE = 0.75;
const KERNEL_SPREAD = 0.12;
const GUST_KNOCK = 12;
const CHICK_ORBIT = 1.6; // tiles from the hen
const CHICK_REACH = 0.3; // added to a predator's radius
const CHICK_COOLDOWN = 0.5;
const BOLT_SPLASH = 0.6;
/** Extra reach (tiles) added to a predator's radius when a projectile tests it. */
const HIT_PAD = 0.15;

export const projectiles = Array.from({ length: MAX_PROJECTILES }, () => ({
  alive: false,
  kind: EGG,
  x: 0,
  y: 0,
  prevX: 0,
  prevY: 0,
  z: 0,
  vx: 0,
  vy: 0,
  age: 0,
  /** Egg: seconds until it lands. Dart, kernel: seconds until it fades. */
  life: 0,
  dmg: 0,
  /** Hits left before it is used up, and the predators it already hit (no double hits). */
  pierce: 1,
  hitA: null,
  hitB: null,
}));

/** Chick Orbit chicks: positions for the renderer; only the first `count` are out. */
export const chicks = { count: 0, list: Array.from({ length: MAX_CHICKS }, () => ({ x: 0, y: 0, prevX: 0, prevY: 0 })) };

/** Cooldown and volley progress per weapon id. */
const timers = {};
/** On-screen predators of this step, reused by the random-target weapons. */
const targets = [];

export function resetWeapons() {
  for (const p of projectiles) p.alive = false;
  for (const id of Object.keys(timers)) delete timers[id];
  chicks.count = 0;
}

function timerFor(id) {
  // A new weapon fires soon after it is picked.
  return (timers[id] ??= { cd: 0.4, shots: 0, gap: 0 });
}

function spawnProjectile(kind, vx, vy, life, dmg, pierce) {
  const p = projectiles.find((item) => !item.alive);
  if (!p) return null;
  Object.assign(p, { alive: true, kind, x: hen.x, y: hen.y, prevX: hen.x, prevY: hen.y, z: 8, vx, vy, age: 0, life, dmg, pierce, hitA: null, hitB: null });
  return p;
}

/** Collects the alive predators on screen into `targets` and returns how many there are. */
function gatherTargets() {
  targets.length = 0;
  for (const e of enemies) if (e.alive && onScreen(e.x, e.y, 6)) targets.push(e);
  return targets.length;
}

function randomTarget() {
  return targets[Math.floor(gameRand() * targets.length)];
}

function throwEgg(target, dmg) {
  const dx = target.x - hen.x;
  const dy = target.y - hen.y;
  const d = Math.hypot(dx, dy) || 1;
  const flight = Math.max(0.25, d / EGG_SPEED);
  spawnProjectile(EGG, dx / flight, dy / flight, flight, dmg, 1);
}

/** A fan of `n` projectiles around angle `base`, `spread` radians apart. */
function fan(kind, n, base, spread, speed, life, dmg, pierce) {
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) / 2) * spread;
    spawnProjectile(kind, Math.cos(a) * speed, Math.sin(a) * speed, life, dmg, pierce);
  }
}

function peck(id) {
  const first = nearestEnemy(hen.x, hen.y, PECK_RANGE);
  if (!first) return false;
  const hits = [first];
  if (weaponStat(id, 'n') > 1) {
    const second = nearestEnemy(hen.x, hen.y, PECK_RANGE, first);
    if (second) hits.push(second);
  }
  const dx = first.x - hen.x;
  const dy = first.y - hen.y;
  const d = Math.hypot(dx, dy) || 1;
  hen.peckTime = 0.12;
  hen.peckX = dx / d;
  hen.peckY = dy / d;
  for (const e of hits) {
    for (let i = 0; i < 4; i++) {
      spawnParticle(e.x, e.y, 7, (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2.5, 20, i % 2 ? 10 : 13);
    }
    hitEnemy(e, weaponDamage(id), hen.x, hen.y, 9);
  }
  return true;
}

/** Wing Gust: hurts and shoves back everything within reach. Returns false if nothing was close. */
function gust(id) {
  const r = weaponStat(id, 'r');
  let any = false;
  for (const e of enemies) {
    if (!e.alive || (e.x - hen.x) ** 2 + (e.y - hen.y) ** 2 > (r + e.r) ** 2) continue;
    any = true;
    hitEnemy(e, weaponDamage(id), hen.x, hen.y, GUST_KNOCK, true);
  }
  if (any) {
    spawnRing(hen.x, hen.y, r);
    sfxGust();
  }
  return any;
}

/** Thunder Comb: bolts on `n` different random predators on screen. */
function thunder(id) {
  if (!gatherTargets()) return false;
  const n = Math.min(weaponStat(id, 'n'), targets.length);
  for (let i = 0; i < n; i++) {
    const k = Math.floor(gameRand() * targets.length);
    const e = targets[k];
    targets[k] = targets[targets.length - 1];
    targets.pop();
    spawnBolt(e.x, e.y);
    splash(e.x, e.y, BOLT_SPLASH, weaponDamage(id));
  }
  triggerShake(0, 1, 1.5, 0.1);
  sfxThunder();
  return true;
}

/** Chick Orbit: moves the chicks around the hen and lets them nip whatever they touch. */
function updateChicks(id) {
  const n = weaponStat(id, 'n');
  const angle = game.time * weaponStat(id, 'spin');
  for (let k = 0; k < n; k++) {
    const c = chicks.list[k];
    const a = angle + (k / n) * Math.PI * 2;
    const x = hen.x + Math.cos(a) * CHICK_ORBIT;
    const y = hen.y + Math.sin(a) * CHICK_ORBIT;
    // A chick that just joined (or a new run) appears in place instead of sliding in.
    c.prevX = k < chicks.count ? c.x : x;
    c.prevY = k < chicks.count ? c.y : y;
    c.x = x;
    c.y = y;
    for (const e of enemies) {
      if (!e.alive || e.chickCooldown > 0) continue;
      const reach = e.r + CHICK_REACH;
      if ((e.x - x) ** 2 + (e.y - y) ** 2 > reach * reach) continue;
      e.chickCooldown = CHICK_COOLDOWN;
      hitEnemy(e, weaponDamage(id), x, y, 4);
    }
  }
  chicks.count = n;
}

export function updateWeapons(dt) {
  for (const id of buildOrder) {
    if (id === 'chicks') {
      updateChicks(id);
      continue;
    }
    const t = timerFor(id);
    if (id === 'egg') {
      if (t.shots > 0) {
        t.gap -= dt;
        if (t.gap <= 0) {
          const target = nearestEnemy(hen.x, hen.y);
          if (target) throwEgg(target, weaponDamage(id));
          t.shots--;
          t.gap = EGG_GAP;
        }
        continue;
      }
      t.cd -= dt;
      if (t.cd <= 0 && nearestEnemy(hen.x, hen.y)) {
        t.cd = weaponCooldown(id);
        t.shots = weaponStat(id, 'n');
        t.gap = 0;
      }
      continue;
    }
    if (!(id in WEAPON_ACTIONS)) continue; // passives
    t.cd -= dt;
    if (t.cd <= 0 && WEAPON_ACTIONS[id](id)) t.cd = weaponCooldown(id);
  }
}

/** Cooldown weapons: each returns true if it fired (false waits for a target). */
const WEAPON_ACTIONS = {
  peck,
  gust,
  thunder,
  darts(id) {
    if (!gatherTargets()) return false;
    fan(DART, weaponStat(id, 'n'), Math.atan2(-hen.dirY, -hen.dirX), DART_SPREAD, DART_SPEED, DART_LIFE, weaponDamage(id), DART_PIERCE);
    return true;
  },
  corn(id) {
    if (!gatherTargets()) return false;
    const e = randomTarget();
    fan(KERNEL, weaponStat(id, 'n'), Math.atan2(e.y - hen.y, e.x - hen.x), KERNEL_SPREAD, KERNEL_SPEED, KERNEL_LIFE, weaponDamage(id), 1);
    return true;
  },
};

/** Damages every predator within `radius` of (x, y). */
function splash(x, y, radius, dmg) {
  for (const e of enemies) {
    if (e.alive && (e.x - x) ** 2 + (e.y - y) ** 2 < (radius + e.r) ** 2) hitEnemy(e, dmg, x, y);
  }
}

function breakEgg(p) {
  p.alive = false;
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2;
    spawnParticle(p.x, p.y, Math.max(1, p.z), Math.cos(a) * 1.4, Math.sin(a) * 1.4, 18 + Math.random() * 20, i % 3 ? 10 : 13, 1, 0.35);
  }
  sfxSplat();
}

export function updateProjectiles(dt) {
  for (const p of projectiles) {
    if (!p.alive) continue;
    p.prevX = p.x;
    p.prevY = p.y;
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === EGG) {
      const u = Math.min(1, p.age / p.life);
      p.z = 8 * (1 - u) + EGG_ARC * 4 * u * (1 - u);
      if (u >= 1) {
        splash(p.x, p.y, EGG_SPLASH, p.dmg);
        breakEgg(p);
        continue;
      }
    } else if (p.age >= p.life) {
      p.alive = false;
      continue;
    }
    for (const e of enemies) {
      if (!e.alive || e === p.hitA || e === p.hitB) continue;
      const r = e.r + HIT_PAD;
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 >= r * r) continue;
      hitEnemy(e, p.dmg, p.x - p.vx * 0.05, p.y - p.vy * 0.05);
      if (p.kind === EGG) {
        breakEgg(p);
        break;
      }
      if (p.hitA) p.hitB = e;
      else p.hitA = e;
      if (--p.pierce <= 0) {
        p.alive = false;
        break;
      }
    }
  }
}
