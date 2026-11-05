// Renderer: endless meadow, corn, shadows, predators and the hen sorted by depth, eggs and darts,
// particles, damage numbers, the touch stick, the HUD and the menus (cards, game over, pause,
// title). Everything is drawn at 320x180 and upscaled by an integer factor.
import { PALETTE } from './palette.js';
import { WIDTH, HEIGHT } from './screen.js';
import { toIsoX, toIsoY, depthKey, HALF_W, HALF_H } from './iso.js';
import { drawGround } from './ground.js';
import { henSprites, enemySprites, cornSprites, eggSprites, chickSprite, iconSprites, pickupSprites, outfitTier } from './sprites.js';
import { hen } from './hen.js';
import { enemies, bossName, RISE_TIME } from './enemies.js';
import { pickups, CHEST } from './pickups.js';
import { corn, cornTier } from './corn.js';
import { projectiles, chicks, EGG, KERNEL } from './weapons.js';
import { ITEM_BY_ID, build, buildOrder, cardText } from './items.js';
import { juice } from './juice.js';
import { particles, popups, rings, bolts, RING_LIFE, BOLT_LIFE } from './pool.js';
import { input, STICK_RADIUS } from './input.js';
import { game, formatClock, xpToNext } from './state.js';
import { weatherAt, DAWN_START, RUN_LENGTH } from './weather.js';

/** Every fixed on-screen string. A test checks that each fits the 320 px canvas. */
export const HUD_STRINGS = {
  title: 'QUIQUIRIQUI',
  subtitle: 'SURVIVE UNTIL DAWN',
  start: 'MOVE TO START',
  controls: 'WASD / ARROWS / HOLD MOUSE / TOUCH',
  music: 'M: MUSIC ON / OFF',
  paused: 'PAUSED',
  resume: 'PRESS ANY KEY',
  levelUp: 'LEVEL UP!',
  choose: 'CHOOSE ONE: 1, 2, 3, CLICK OR TAP',
  chest: 'CHEST!',
  chestNote: 'NEW GEAR FOR THE HEN',
  gameOver: 'GAME OVER',
  dawn: 'DAWN!',
  crow: 'THE ROOSTER CROWS',
  nod: 'HOLDING OUT FOR A HEN',
  keepGoing: '1: KEEP GOING',
  endRun: '2: END RUN',
  newBest: 'NEW BEST!',
  tutorial: 'PICK UP CORN TO LEVEL UP',
};

/** Font size (px) each HUD string is drawn at. The fit test reads these too. */
export const HUD_SIZES = {
  title: 16,
  subtitle: 7,
  start: 8,
  controls: 7,
  music: 7,
  paused: 14,
  resume: 8,
  levelUp: 12,
  choose: 7,
  chest: 12,
  chestNote: 7,
  gameOver: 16,
  dawn: 16,
  crow: 8,
  nod: 7,
  keepGoing: 8,
  endRun: 8,
  newBest: 8,
  tutorial: 7,
};

/** Upgrade card layout, shared with main.js (taps) and the tests (text fit). */
export const CARD_W = 92;
export const CARD_H = 104;
const CARD_GAP = 8;
/** Font sizes of the card name and description lines. */
export const CARD_NAME_SIZE = 7;
export const CARD_TEXT_SIZE = 6;

/** Rectangle of card `i` out of `n`, in canvas pixels (centered a little above the middle). */
export function cardRect(i, n) {
  const x0 = (WIDTH - (n * CARD_W + (n - 1) * CARD_GAP)) / 2;
  return { x: Math.round(x0 + i * (CARD_W + CARD_GAP)), y: Math.round(HEIGHT / 2 - 46), w: CARD_W, h: CARD_H };
}

/** Index of the card under canvas point (x, y) out of `n`, or -1. */
export function cardAt(x, y, n) {
  for (let i = 0; i < n; i++) {
    const r = cardRect(i, n);
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
  }
  return -1;
}

/** The stats line of the game-over screen. */
export function gameOverLine(time, kills, level) {
  return `TIME ${formatClock(time)}   KILLS ${kills}   LV ${level}`;
}

/** Conservative width estimate for bold monospace text at `px`. */
export function estimateTextWidth(text, px) {
  return Math.ceil(text.length * px * 0.62);
}

/** Draws crisp text with a 1 px ink outline so it reads on any background. */
function drawText(ctx, text, x, y, px, color = 13, align = 'center') {
  ctx.font = `bold ${px}px monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE[0];
  for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillText(text, x + ox, y + oy);
  ctx.fillStyle = PALETTE[color];
  ctx.fillText(text, x, y);
}

function dim(ctx, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PALETTE[0];
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.globalAlpha = 1;
}

/** Interpolated screen position of an entity with prevX/prevY. */
function screenPos(e, alpha, camX, camY) {
  const x = e.prevX + (e.x - e.prevX) * alpha;
  const y = e.prevY + (e.y - e.prevY) * alpha;
  return { sx: Math.round(toIsoX(x, y) - camX), sy: Math.round(toIsoY(x, y) - camY) };
}

const visible = (sx, sy) => sx > -24 && sx < WIDTH + 24 && sy > -24 && sy < HEIGHT + 32;

/**
 * Draws `sprite` (normal or flash) with its feet at (sx, sy), mirrored when `facing` < 0 and
 * enlarged `scale` times (bosses).
 */
function drawSprite(ctx, sprite, sx, sy, facing, white = false, upsideDown = false, scale = 1) {
  ctx.save();
  ctx.translate(sx, upsideDown ? sy - sprite.h / 2 : sy);
  ctx.scale((facing < 0 ? -1 : 1) * scale, (upsideDown ? -1 : 1) * scale);
  ctx.drawImage(white ? sprite.flash : sprite.normal, -sprite.w / 2, upsideDown ? -sprite.h / 2 : -sprite.footY - 1);
  ctx.restore();
}

function drawHen(ctx, sx, sy, time) {
  const step = Math.floor(hen.walkPhase) % 2 ? 'stepA' : 'stepB';
  const pose = hen.moving && !game.over ? step : 'idle';
  // Walking bobs on every step; standing still breathes now and then.
  let bob = hen.moving ? -1 : Math.sin(time * 3) > 0.8 ? -1 : 0;
  let ox = 0;
  if (hen.peckTime > 0) {
    // Jab toward the pecked predator
    ox = Math.round((hen.peckX - hen.peckY) * 2);
    bob += Math.round((hen.peckX + hen.peckY) * 1);
  }
  const white = hen.hurtTime > 0 && Math.floor(hen.hurtTime * 30) % 2 === 0;
  drawSprite(ctx, henSprites[pose], sx + ox, sy + bob, hen.facing, white, game.over && !game.won);
}

function drawHealthBar(ctx, sx, sy) {
  ctx.fillStyle = PALETTE[0];
  ctx.fillRect(sx - 9, sy + 3, 18, 4);
  ctx.fillStyle = PALETTE[9];
  ctx.fillRect(sx - 8, sy + 4, Math.ceil((16 * hen.hp) / hen.maxHp), 2);
}

const drawList = [];

function drawWorld(ctx, camX, camY, alpha, time) {
  // Corn lies on the grass, under everything else.
  for (const c of corn) {
    if (!c.alive) continue;
    const { sx, sy } = screenPos(c, alpha, camX, camY);
    if (!visible(sx, sy)) continue;
    const bob = c.state === 0 ? 0 : Math.round(c.z);
    ctx.drawImage(cornSprites[cornTier(c.value)].normal, sx - 3, sy - 6 - bob);
  }

  // Prizes bob above the grass; a chest sits still and glints.
  for (const p of pickups) {
    if (!p.alive) continue;
    const sx = Math.round(toIsoX(p.x, p.y) - camX);
    const sy = Math.round(toIsoY(p.x, p.y) - camY);
    if (!visible(sx, sy)) continue;
    const sprite = pickupSprites[p.kind];
    const bob = Math.round(p.z + (p.kind === CHEST ? 0 : 1.5 + Math.sin(time * 4 + p.x) * 1.5));
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = PALETTE[0];
    ctx.beginPath();
    ctx.ellipse(sx, sy, sprite.w / 2 - 1, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.drawImage(sprite.normal, sx - sprite.w / 2, sy - sprite.footY - 1 - bob);
    if (p.kind === CHEST && Math.sin(time * 5 + p.x) > 0.9) {
      ctx.fillStyle = PALETTE[13];
      ctx.fillRect(sx + 3, sy - 11, 1, 1);
    }
  }

  // One path for every soft shadow.
  drawList.length = 0;
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = PALETTE[0];
  ctx.beginPath();
  for (const e of enemies) {
    if (!e.alive) continue;
    const p = screenPos(e, alpha, camX, camY);
    if (!visible(p.sx, p.sy)) continue;
    const rx = e.r * 13;
    ctx.moveTo(p.sx + rx, p.sy);
    ctx.ellipse(p.sx, p.sy, rx, rx * 0.4, 0, 0, Math.PI * 2);
    drawList.push({ depth: depthKey(e.x, e.y), e, sx: p.sx, sy: p.sy });
  }
  const henPos = screenPos(hen, alpha, camX, camY);
  ctx.moveTo(henPos.sx + 6, henPos.sy);
  ctx.ellipse(henPos.sx, henPos.sy, 6, 2.5, 0, 0, Math.PI * 2);
  drawList.push({ depth: depthKey(hen.x, hen.y), e: null, sx: henPos.sx, sy: henPos.sy });
  for (const p of projectiles) {
    if (!p.alive || p.kind !== EGG) continue;
    const q = screenPos(p, alpha, camX, camY);
    ctx.moveTo(q.sx + 2, q.sy);
    ctx.ellipse(q.sx, q.sy, 2, 1, 0, 0, Math.PI * 2);
  }
  for (let k = 0; k < chicks.count; k++) {
    const c = chicks.list[k];
    const q = screenPos(c, alpha, camX, camY);
    ctx.moveTo(q.sx + 3, q.sy);
    ctx.ellipse(q.sx, q.sy, 3, 1.2, 0, 0, Math.PI * 2);
    drawList.push({ depth: depthKey(c.x, c.y), e: c, chick: true, sx: q.sx, sy: q.sy });
  }
  ctx.fill();
  ctx.globalAlpha = 1;
  drawRings(ctx, camX, camY);

  // Painter's algorithm: back to front.
  drawList.sort((a, b) => a.depth - b.depth);
  for (const d of drawList) {
    if (!d.e) {
      drawHen(ctx, d.sx, d.sy, time);
      continue;
    }
    if (d.chick) {
      // Hop along and face the way the chick is going
      const c = d.e;
      const facing = toIsoX(c.x - c.prevX, c.y - c.prevY) < 0 ? -1 : 1;
      drawSprite(ctx, chickSprite, d.sx, d.sy - Math.round(Math.abs(Math.sin(time * 14 + c.x)) * 2), facing);
      continue;
    }
    const e = d.e;
    const set = enemySprites[e.kind];
    const pose = e.knockTime > 0 ? 'idle' : Math.floor(e.walkPhase) % 2 ? 'stepA' : 'stepB';
    // Flyers keep to the air above their shadow, bobbing with each wing beat. Newborns fade in
    // (rising out of the grass, or dropping in from above for a flyer).
    const rise = Math.min(1, e.age / RISE_TIME);
    let lift = e.flying ? (e.boss ? 20 : 12) + Math.round(Math.sin(e.walkPhase * Math.PI) * 2) + Math.round((1 - rise) * 24) : 0;
    if (!e.flying) lift -= Math.round((1 - rise) * 4);
    ctx.globalAlpha = rise;
    drawSprite(ctx, set[pose], d.sx, d.sy - lift, e.facing, e.flash > 0.1, false, e.boss ? 2 : 1);
    ctx.globalAlpha = 1;
  }
  if (game.started && !game.over) drawHealthBar(ctx, henPos.sx, henPos.sy);

  // Eggs arc through the air; darts are short streaks.
  for (const p of projectiles) {
    if (!p.alive) continue;
    const { sx, sy } = screenPos(p, alpha, camX, camY);
    const z = Math.round(p.z);
    if (p.kind === EGG) {
      ctx.drawImage(eggSprites[Math.max(0, outfitTier(build.egg) - 1)].normal, sx - 4, sy - 8 - z);
      continue;
    }
    const vsx = (p.vx - p.vy) * 8;
    const vsy = (p.vx + p.vy) * 4;
    const len = Math.hypot(vsx, vsy) || 1;
    // Darts: a white head and a cream quill; kernels: a gold head and a brown trail.
    const colors = p.kind === KERNEL ? [10, 10, 19, 19] : [13, 7, 8, 8];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = PALETTE[colors[i]];
      ctx.fillRect(Math.round(sx - (vsx / len) * i * 1.5), Math.round(sy - z - (vsy / len) * i * 1.5), i ? 1 : 2, i ? 1 : 2);
    }
  }
}

/** Wing Gust: a ring that grows to the gust's reach and fades, drawn flat on the ground. */
function drawRings(ctx, camX, camY) {
  ctx.lineWidth = 1;
  for (const ring of rings) {
    if (!ring.alive) continue;
    const u = 1 - ring.life / RING_LIFE;
    const r = ring.r * (0.35 + 0.65 * u);
    const sx = Math.round(toIsoX(ring.x, ring.y) - camX);
    const sy = Math.round(toIsoY(ring.x, ring.y) - camY);
    ctx.globalAlpha = 1 - u * 0.8;
    for (const [k, color] of [[1, 13], [0.8, 12]]) {
      ctx.strokeStyle = PALETTE[color];
      ctx.beginPath();
      ctx.ellipse(sx, sy, r * k * HALF_W * Math.SQRT2, r * k * HALF_H * Math.SQRT2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** Thunder Comb: a jagged bolt from the top of the screen down to the struck predator. */
function drawBolts(ctx, camX, camY) {
  for (const bolt of bolts) {
    if (!bolt.alive) continue;
    const sx = Math.round(toIsoX(bolt.x, bolt.y) - camX);
    const sy = Math.round(toIsoY(bolt.x, bolt.y) - camY);
    ctx.globalAlpha = Math.min(1, (bolt.life / BOLT_LIFE) * 1.5);
    let x = sx;
    for (let y = 0; y < sy; y += 6) {
      const nx = sx + (((bolt.seed * 7 + y * 13) % 9) - 4) * Math.min(1, (sy - y) / 30);
      ctx.fillStyle = PALETTE[10];
      ctx.fillRect(Math.min(x, nx) - 1, y, Math.abs(nx - x) + 3, 7);
      ctx.fillStyle = PALETTE[13];
      ctx.fillRect(Math.min(x, nx), y, Math.abs(nx - x) + 1, 7);
      x = nx;
    }
  }
  ctx.globalAlpha = 1;
}

function drawEffects(ctx, camX, camY) {
  drawBolts(ctx, camX, camY);
  for (const p of particles) {
    if (!p.alive) continue;
    ctx.globalAlpha = Math.min(1, (p.life / p.maxLife) * 2);
    ctx.fillStyle = PALETTE[p.color];
    ctx.fillRect(Math.round(toIsoX(p.x, p.y) - camX), Math.round(toIsoY(p.x, p.y, p.z) - camY), p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (const p of popups) {
    if (!p.alive) continue;
    ctx.globalAlpha = Math.min(1, (p.life / p.maxLife) * 2);
    drawText(ctx, p.text, Math.round(toIsoX(p.x, p.y) - camX), Math.round(toIsoY(p.x, p.y, p.z) - camY), p.size, p.color);
  }
  ctx.globalAlpha = 1;
}

function drawStick(ctx) {
  const s = input.stick;
  if (!s.active) return;
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = PALETTE[13];
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(s.ox, s.oy, STICK_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = PALETTE[13];
  ctx.beginPath();
  ctx.arc(s.ox + s.dx, s.oy + s.dy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** XP bar, level, clock, kills and the row of owned upgrades. */
function drawTopBar(ctx, time) {
  const need = xpToNext(game.level);
  const full = game.cards.length > 0;
  ctx.fillStyle = PALETTE[0];
  ctx.fillRect(2, 2, WIDTH - 4, 6);
  ctx.fillStyle = PALETTE[full && Math.sin(time * 12) > 0 ? 13 : 10];
  ctx.fillRect(3, 3, full ? WIDTH - 6 : Math.floor(((WIDTH - 6) * Math.min(game.xp, need)) / need), 4);
  drawText(ctx, `LV ${game.level}`, 4, 14, 8, 13, 'left');
  drawText(ctx, (game.day > 1 ? `DAY ${game.day}  ` : '') + formatClock(game.time), WIDTH / 2, 14, 8, 13);
  if (game.bannerTime > 0 && !game.over) drawText(ctx, game.banner, WIDTH / 2, HEIGHT / 2 - 40, 16, 10);
  drawText(ctx, `KILLS ${game.kills}`, WIDTH - 4, 14, 8, 13, 'right');
  // The strongest boss on the field: its name and health under the top bar.
  let boss = null;
  for (const e of enemies) if (e.alive && e.boss && (!boss || e.hp > boss.hp)) boss = e;
  const menu = game.over || game.cards.length || game.reward.length;
  if (boss && !menu) {
    drawText(ctx, bossName(boss), WIDTH / 2, 25, 6, 13);
    ctx.fillStyle = PALETTE[0];
    ctx.fillRect(WIDTH / 2 - 50, 30, 100, 4);
    ctx.fillStyle = PALETTE[9];
    ctx.fillRect(WIDTH / 2 - 49, 31, Math.ceil((98 * boss.hp) / boss.maxHp), 2);
  }

  // Owned upgrades: weapons on the first row, passives on the second, each with level pips.
  const column = [0, 0];
  for (const id of buildOrder) {
    const row = ITEM_BY_ID[id].weapon ? 0 : 1;
    const x = 4 + column[row]++ * 16;
    const y = 21 + row * 19;
    ctx.drawImage(iconSprites[id].normal, x, y);
    ctx.fillStyle = PALETTE[10];
    for (let l = 0; l < build[id]; l++) ctx.fillRect(x + 1 + l * 3, y + 15, 2, 2);
  }
}

/**
 * A row of upgrade cards under a title: the level-up choice (numbered, `lock` slides them in) or
 * the chest's reward (`numbered` false).
 */
function drawCards(ctx, time, cards, title, note, lock, numbered) {
  const S = HUD_STRINGS;
  const Z = HUD_SIZES;
  dim(ctx, 0.55);
  // Slide in while the pick lock runs down
  const slide = Math.round(Math.max(0, lock) * 60);
  const top = cardRect(0, 1).y;
  drawText(ctx, S[title], WIDTH / 2, top - 20 - slide, Z[title], 10);
  drawText(ctx, S[note], WIDTH / 2, top - 8 - slide, Z[note], 13);
  const n = cards.length;
  cards.forEach((card, i) => {
    const item = ITEM_BY_ID[card.id];
    const icon = iconSprites[card.boon ? 'boon' : card.id];
    const r = cardRect(i, n);
    const y = r.y + slide;
    const cx = r.x + r.w / 2;
    ctx.fillStyle = PALETTE[card.boon ? 10 : item.weapon ? 9 : 12];
    ctx.fillRect(r.x, y, r.w, r.h);
    ctx.fillStyle = PALETTE[15];
    ctx.fillRect(r.x + 2, y + 2, r.w - 4, r.h - 4);
    if (numbered) drawText(ctx, String(i + 1), r.x + 8, y + 9, 7, 10);
    ctx.drawImage(icon.normal, cx - 14, y + 10 + Math.round(Math.sin(time * 4 + i) * 1.5), 28, 28);
    drawText(ctx, item.name, cx, y + 50, CARD_NAME_SIZE, 13);
    drawText(ctx, card.boon ? 'BOON' : card.level === 1 ? 'NEW!' : `LV ${card.level}`, cx, y + 61, 7, card.boon || card.level === 1 ? 10 : 12);
    const [a, b] = cardText(card);
    drawText(ctx, a, cx, y + 76, CARD_TEXT_SIZE, 7);
    if (b) drawText(ctx, b, cx, y + 85, CARD_TEXT_SIZE, 7);
  });
}

function drawGameOver(ctx, time) {
  const S = HUD_STRINGS;
  const Z = HUD_SIZES;
  if (game.overTime < 0.8) return;
  // At dawn the hen stays in sight between the title and the stats; after a fall the stats cover her.
  const won = game.won;
  const cy = HEIGHT / 2;
  dim(ctx, won ? 0.12 : 0.55);
  if (won) {
    drawText(ctx, S.dawn, WIDTH / 2, cy - 52, Z.dawn, 10);
    drawText(ctx, S.crow, WIDTH / 2, cy - 35, Z.crow, 13);
    drawText(ctx, S.nod, WIDTH / 2, cy - 24, Z.nod, 10);
  } else {
    drawText(ctx, S.gameOver, WIDTH / 2, cy - 34, Z.gameOver, 9);
  }
  const statsY = cy + (won ? 26 : -10);
  drawText(ctx, gameOverLine(game.time, game.kills, game.level), WIDTH / 2, statsY, 7, 13);
  if (game.newBest) drawText(ctx, S.newBest, WIDTH / 2, statsY + 14, Z.newBest, 10);
  else drawText(ctx, `BEST ${formatClock(game.best)}`, WIDTH / 2, statsY + 14, 7, 13);
  if (game.overTime > 1.5 && game.dawnChoice) {
    // Keep going (left) or end the run (right)
    drawText(ctx, S.keepGoing, WIDTH / 4, cy + 62, Z.keepGoing, Math.sin(time * 5) > -0.3 ? 10 : 13);
    drawText(ctx, S.endRun, (WIDTH * 3) / 4, cy + 62, Z.endRun, 13);
  } else if (game.overTime > 1.5 && Math.sin(time * 5) > -0.3) drawText(ctx, S.resume, WIDTH / 2, cy + 40, Z.resume, 13);
}

function drawHud(ctx, time) {
  const S = HUD_STRINGS;
  const Z = HUD_SIZES;
  const cy = HEIGHT / 2;
  if (!game.started) {
    drawText(ctx, S.title, WIDTH / 2, cy - 44, Z.title, 10);
    drawText(ctx, S.subtitle, WIDTH / 2, cy - 28, Z.subtitle, 13);
    if (game.best > 0) drawText(ctx, `BEST ${formatClock(game.best)}`, WIDTH / 2, cy - 14, 7, 10);
    if (Math.sin(time * 5) > -0.3) drawText(ctx, S.start, WIDTH / 2, cy + 46, Z.start, 13);
    drawText(ctx, S.controls, WIDTH / 2, cy + 60, Z.controls, 13);
    drawText(ctx, S.music, WIDTH / 2, cy + 72, Z.music, 13);
    return;
  }
  drawTopBar(ctx, time);
  if (game.level === 1 && !game.over && !game.cards.length && !game.reward.length && Math.sin(time * 4) > -0.5) {
    drawText(ctx, S.tutorial, WIDTH / 2, HEIGHT - 12, Z.tutorial, 10);
  }
  if (game.over) drawGameOver(ctx, time);
  else if (game.cards.length) drawCards(ctx, time, game.cards, 'levelUp', 'choose', game.cardLock, true);
  else if (game.reward.length) {
    drawCards(ctx, time, game.reward, 'chest', 'chestNote', game.rewardLock, false);
    const below = cardRect(0, 1).y + CARD_H + 12;
    if (game.rewardLock <= 0 && Math.sin(time * 5) > -0.3) drawText(ctx, S.resume, WIDTH / 2, below, Z.resume, 13);
  }
  if (game.paused) {
    dim(ctx, 0.5);
    drawText(ctx, S.paused, WIDTH / 2, cy - 10, Z.paused, 10);
    drawText(ctx, S.resume, WIDTH / 2, cy + 10, Z.resume, 13);
  }
}

/** Stable pseudo-random value in [0, 1) for particle `i`, channel `k` (weather only). */
function noise(i, k) {
  const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Paints `alpha` of palette color `color` over the whole screen. */
function tint(ctx, color, alpha) {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = PALETTE[color];
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.globalAlpha = 1;
}

/**
 * The day arc over the world: rain streaks, snowflakes, the night with a pool of light around the
 * hen and fireflies, then a warm dawn with the sun coming up. (hx, hy): the hen on screen.
 */
function drawWeather(ctx, time, hx, hy) {
  const w = weatherAt(game.time);
  if (w.rain > 0) {
    tint(ctx, 15, 0.25 * w.rain);
    ctx.globalAlpha = 0.75 * w.rain;
    ctx.fillStyle = PALETTE[12];
    for (let i = 0; i < 90; i++) {
      const x = (noise(i, 1) * (WIDTH + 40) - time * 40) % (WIDTH + 40);
      const y = (noise(i, 2) * (HEIGHT + 20) + time * (200 + noise(i, 3) * 80)) % (HEIGHT + 20);
      const px = Math.round(x < 0 ? x + WIDTH + 40 : x) - 20;
      const py = Math.round(y) - 10;
      ctx.fillRect(px, py, 1, 3);
      ctx.fillRect(px - 1, py + 3, 1, 2);
    }
  }
  if (w.snow > 0) {
    tint(ctx, 13, 0.14 * w.snow);
    ctx.globalAlpha = 0.9 * w.snow;
    ctx.fillStyle = PALETTE[13];
    for (let i = 0; i < 80; i++) {
      const x = noise(i, 4) * WIDTH + Math.sin(time * 1.3 + i) * 6;
      const y = (noise(i, 5) * (HEIGHT + 10) + time * (16 + noise(i, 6) * 18)) % (HEIGHT + 10);
      const size = noise(i, 7) > 0.7 ? 2 : 1;
      ctx.fillRect(Math.round(x), Math.round(y) - 5, size, size);
    }
  }
  if (w.night > 0) {
    // Three soft steps of darkness, each with a hole around the hen.
    ctx.fillStyle = PALETTE[0];
    for (const [r, a] of [[96, 0.32], [74, 0.26], [54, 0.2]]) {
      ctx.globalAlpha = a * w.night;
      ctx.beginPath();
      ctx.rect(0, 0, WIDTH, HEIGHT);
      ctx.ellipse(hx, hy - 6, r, r * 0.72, 0, 0, Math.PI * 2);
      ctx.fill('evenodd');
    }
    ctx.fillStyle = PALETTE[10];
    for (let i = 0; i < 22; i++) {
      ctx.globalAlpha = w.night * (0.5 + 0.5 * Math.sin(time * 3 + i * 1.7));
      const x = noise(i, 8) * WIDTH + Math.sin(time * 0.6 + i) * 14;
      const y = noise(i, 9) * HEIGHT + Math.cos(time * 0.5 + i * 2) * 10;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }
  if (w.dawn > 0) {
    tint(ctx, 18, 0.16 * w.dawn);
    // The sun comes up over the top edge as the last half minute runs out (and stays up while a
    // new day's morning glow fades).
    const local = game.time % RUN_LENGTH;
    const p = local >= DAWN_START ? (local - DAWN_START) / (RUN_LENGTH - DAWN_START) : 1;
    const sx = WIDTH - 44;
    const sy = Math.round(-14 + p * 40);
    ctx.globalAlpha = 0.35 * w.dawn;
    ctx.fillStyle = PALETTE[10];
    ctx.beginPath();
    ctx.arc(sx, sy, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = w.dawn;
    ctx.beginPath();
    ctx.arc(sx, sy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE[13];
    ctx.beginPath();
    ctx.arc(sx - 2, sy - 2, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function renderScene(ctx, alpha, time) {
  const camX = Math.round(juice.camX + juice.shakeX);
  const camY = Math.round(juice.camY + juice.shakeY);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = PALETTE[2];
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawGround(ctx, camX, camY);
  drawWorld(ctx, camX, camY, alpha, time);
  drawEffects(ctx, camX, camY);
  if (game.started) {
    const x = hen.prevX + (hen.x - hen.prevX) * alpha;
    const y = hen.prevY + (hen.y - hen.prevY) * alpha;
    drawWeather(ctx, time, Math.round(toIsoX(x, y) - camX), Math.round(toIsoY(x, y) - camY));
  }
  tint(ctx, 13, (juice.flash / juice.flashDur) * 0.7);
  drawStick(ctx);
  drawHud(ctx, time);
}
