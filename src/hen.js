// The hen: walks in 8 screen directions over the endless meadow, takes bites from predators and
// falls when her health runs out. Weapons fire on their own (weapons.js), so movement is the
// only thing the player controls.
import { input } from './input.js';
import { stats } from './items.js';
import { gameRand } from './rng.js';
import { game, saveBest } from './state.js';
import { triggerHitstop, triggerShake } from './juice.js';
import { spawnParticle, spawnPopup } from './pool.js';
import { sfxHurt, sfxDeath } from './sfx.js';

/**
 * Walking speed in tiles per second, before Running Boots: about 68 screen pixels a second
 * sideways (half that up and down, the isometric view's foreshortening).
 */
export const HEN_SPEED = 6;
/** Body radius in tiles, for bites and pickups. */
export const HEN_RADIUS = 0.45;
export const START_HP = 1000;
/** Seconds the hen flashes white after a bite. */
const HURT_FLASH = 0.25;
/** A bite freezes the action briefly, but at most once per this many seconds, so a swarm does not stutter. */
const HITSTOP_GAP = 0.4;
let lastHitstopAt = -1;

export const hen = {
  x: 0,
  y: 0,
  prevX: 0,
  prevY: 0,
  hp: START_HP,
  maxHp: START_HP,
  /** 1 faces screen-right, -1 faces screen-left (the sprite is mirrored). */
  facing: 1,
  /** Last world-space walking direction (unit vector): Feather Darts fly the opposite way. */
  dirX: Math.SQRT1_2,
  dirY: -Math.SQRT1_2,
  moving: false,
  /** Advances while walking; the renderer picks the step pose from it. */
  walkPhase: 0,
  /** Counts down after a bite; the renderer flashes her while it is positive. */
  hurtTime: 0,
  /** Counts down after a peck; the renderer jabs her toward (peckX, peckY), a unit vector. */
  peckTime: 0,
  peckX: 0,
  peckY: 0,
};

export function resetHen() {
  hen.x = hen.prevX = 0;
  hen.y = hen.prevY = 0;
  hen.hp = hen.maxHp = START_HP;
  hen.facing = 1;
  hen.dirX = Math.SQRT1_2;
  hen.dirY = -Math.SQRT1_2;
  hen.moving = false;
  hen.walkPhase = 0;
  hen.hurtTime = 0;
  hen.peckTime = 0;
}

export function updateHen(dt) {
  hen.prevX = hen.x;
  hen.prevY = hen.y;
  hen.hurtTime = Math.max(0, hen.hurtTime - dt);
  hen.peckTime = Math.max(0, hen.peckTime - dt);
  hen.moving = input.moveX !== 0 || input.moveY !== 0;
  if (!hen.moving) return;
  const speed = HEN_SPEED * stats.speed;
  hen.x += input.moveX * speed * dt;
  hen.y += input.moveY * speed * dt;
  hen.dirX = input.moveX;
  hen.dirY = input.moveY;
  if (input.screenX !== 0) hen.facing = input.screenX;
  // About 4.5 strides per second: each whole step of walkPhase swaps the planted leg.
  hen.walkPhase += dt * 9;
}

/**
 * Applies the passives that change the hen herself: Hero Cape raises her max health, and every
 * extra point it adds is healed. Call after each pick.
 */
export function syncHenStats() {
  const maxHp = START_HP + stats.maxHp;
  hen.hp = Math.min(maxHp, hen.hp + Math.max(0, maxHp - hen.maxHp));
  hen.maxHp = maxHp;
}

/**
 * A bite of `amount` from world point (fromX, fromY). Lucky Bandana may dodge it; Pot Helmet
 * takes off a share (`stats.guard`).
 */
export function damageHen(amount, fromX, fromY) {
  if (game.over) return;
  if (stats.dodge > 0 && gameRand() < stats.dodge) {
    spawnPopup(hen.x, hen.y, 'MISS', 12, 0.5, 6);
    return;
  }
  const taken = Math.max(1, Math.round(amount * (1 - stats.guard)));
  hen.hp = Math.max(0, hen.hp - taken);
  hen.hurtTime = HURT_FLASH;
  spawnPopup(hen.x, hen.y, '-' + taken, 9);
  // Shake away from the biter, in screen space.
  const dx = hen.x - fromX;
  const dy = hen.y - fromY;
  triggerShake(dx - dy, (dx + dy) * 0.5, 2, 0.12);
  if (game.time - lastHitstopAt > HITSTOP_GAP || game.time < lastHitstopAt) {
    lastHitstopAt = game.time;
    triggerHitstop(0.06);
  }
  sfxHurt();
  if (hen.hp <= 0) fallHen();
}

/** Out of health: feathers everywhere, the run ends and the game-over screen follows. */
function fallHen() {
  game.over = true;
  game.overTime = 0;
  game.newBest = saveBest(game.time);
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 0.5 + Math.random() * 2;
    spawnParticle(hen.x, hen.y, 8, Math.cos(a) * s, Math.sin(a) * s, 20 + Math.random() * 40, i % 3 ? 7 : 8, 2, 0.6 + Math.random() * 0.8);
  }
  triggerShake(1, 0, 4, 0.3);
  sfxDeath();
}
