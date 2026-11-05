// Drives the real 60 Hz simulation with no drawing and no frame wait.
// SPEED 5: one pumped frame runs five fixed steps, so play(8) covers 40s of gameplay.
import './dom-stub.js';
import { STEP } from '../src/loop.js';
import { boot, update } from '../src/main.js';
import { holdKey, tapAttack, tapDash, input } from '../src/input.js';
import { player, resetPlayer } from '../src/player.js';
import { enemies, altars, floorBeams, waveState, startWave } from '../src/enemy.js';
import { buildArena } from '../src/bake.js';
import { juice } from '../src/juice.js';
import { particles, ghosts, projectiles, popups } from '../src/pool.js';

export const SPEED = 5;

const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];

boot(document.createElement('canvas'));

function releaseMove() {
  for (const code of MOVE_KEYS) holdKey(code, false);
}

/** Aims WASD at a world-space direction. Screen axes are rotated -45° into the sanctuary. */
function aimWorld(dx, dy) {
  releaseMove();
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return;
  const nx = dx / len;
  const ny = dy / len;
  const rawX = nx - ny;
  const rawY = nx + ny;
  if (rawX < -0.35) holdKey('KeyA', true);
  else if (rawX > 0.35) holdKey('KeyD', true);
  if (rawY < -0.35) holdKey('KeyW', true);
  else if (rawY > 0.35) holdKey('KeyS', true);
}

function nearestLiving() {
  let best = null;
  let bestDist = Infinity;
  for (const e of enemies) {
    if (e.dead || e.state === 'falling') continue;
    const dist = Math.hypot(e.x - player.x, e.y - player.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = e;
    }
  }
  return best ? { enemy: best, dist: bestDist } : null;
}

/**
 * Walks at the nearest foe, slashes inside reach, and dashes out of a nearby telegraph.
 * Shielded enemies are approached from behind until a parry empowers the blade.
 */
export function combatBot() {
  if (player.dead) return;
  const target = nearestLiving();
  if (!target) {
    releaseMove();
    return;
  }

  const { enemy, dist } = target;
  let gx = enemy.x - player.x;
  let gy = enemy.y - player.y;
  if (enemy.shielded && enemy.state !== 'stunned' && !player.empowered) {
    gx = enemy.x - enemy.dirX * 0.85 - player.x;
    gy = enemy.y - enemy.dirY * 0.85 - player.y;
  }
  aimWorld(gx, gy);

  const lateTelegraph = enemy.state === 'telegraph' && enemy.stateTimer <= 0.18 && dist <= 1.3;
  if (lateTelegraph && player.slashTimer <= 0) {
    tapAttack();
    return;
  }

  if (enemy.state === 'telegraph' && dist < 1.8 && player.dashCooldown <= 0 && player.dashTimer <= 0) {
    aimWorld(player.x - enemy.x, player.y - enemy.y);
    tapDash();
    return;
  }

  if (player.slashTimer <= 0 && dist <= 1.2) tapAttack();
}

/** Rebuilds a fresh wave-1 run. Module state is a singleton, so every test calls this. */
export function resetRun() {
  juice.hitstop = 0;
  juice.slowMo = 0;
  juice.shakeTime = 0;
  juice.shakeX = 0;
  juice.shakeY = 0;
  juice.flashScreen = 0;
  input.attackBuffer = 0;
  input.dashBuffer = 0;
  input.driftHeld = false;
  input.driftTapped = false;
  input.anyAction = false;
  input.moveX = 0;
  input.moveY = 0;
  releaseMove();
  for (const p of particles) p.alive = false;
  for (const g of ghosts) g.alive = false;
  for (const pr of projectiles) pr.alive = false;
  for (const pop of popups) pop.alive = false;
  altars.length = 0;
  floorBeams.length = 0;
  waveState.score = 0;
  waveState.ascension = 0;
  waveState.waveDelay = 0.6;
  buildArena(2026);
  resetPlayer();
  startWave(1);
}

/** Advances `seconds` of scenario time. At SPEED 5 that is `seconds * 5` of gameplay. */
export function play(seconds, bot) {
  const frames = Math.max(1, Math.round(seconds * 60));
  for (let i = 0; i < frames; i++) {
    if (bot) bot();
    for (let s = 0; s < SPEED; s++) update(STEP);
  }
}

export { update, STEP, player, enemies, altars, waveState, tapAttack, tapDash, holdKey };
