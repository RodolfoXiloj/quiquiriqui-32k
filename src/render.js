// Renderer: endless meadow, corn, shadows, predators and the hen sorted by depth, eggs and darts,
// particles, damage numbers, the touch stick, the HUD and the menus (cards, game over, pause,
// title). Everything is drawn at 320x180 and upscaled by an integer factor.
import { PALETTE } from './palette.js';
import { drawPixelText, textWidth } from './font.js';
import { WIDTH, HEIGHT } from './screen.js';
import { toIsoX, toIsoY, depthKey, HALF_W, HALF_H } from './iso.js';
import { drawGround } from './ground.js';
import { henSprites, enemySprites, cornSprites, eggSprites, chickSprite, iconSprites, pickupSprites, outfitTier, lockSprite } from './sprites.js';
import { hen } from './hen.js';
import { enemies, shots, clouds, bossName, RISE_TIME, CLOUD_R } from './enemies.js';
import { pickups, CHEST } from './pickups.js';
import { corn, cornTier } from './corn.js';
import { projectiles, chicks, EGG, KERNEL } from './weapons.js';
import { ITEM_BY_ID, build, buildOrder, cardText } from './items.js';
import { juice } from './juice.js';
import { particles, popups, rings, bolts, RING_LIFE, BOLT_LIFE } from './pool.js';
import { input, STICK_RADIUS } from './input.js';
import { game, formatClock, xpToNext } from './state.js';
import { weatherAt, DAWN_START, RUN_LENGTH } from './weather.js';
import { hawk, HAWK_HUNT, HAWK_STRIKE, HAWK_R } from './events.js';
import { profile, MAX_PERIL, HENS, henUnlocked, SHOP, SHOP_COSTS } from './profile.js';

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

/** Font scale (font.js: 1 body text, 2 headings, 3 titles) of each HUD string. The fit test reads these too. */
export const HUD_SCALES = {
  title: 3,
  subtitle: 1,
  start: 2,
  controls: 1,
  music: 1,
  paused: 2,
  resume: 1,
  levelUp: 2,
  choose: 1,
  chest: 2,
  chestNote: 1,
  gameOver: 3,
  dawn: 3,
  crow: 1,
  nod: 1,
  keepGoing: 1,
  endRun: 1,
  newBest: 1,
  tutorial: 1,
};

/** Title screen rows that react to taps, as offsets (px) from the middle of the screen. */
const TITLE_ROWS = { hen: 34, peril: 45, shop: 56 };

/** The title row under canvas height `y` ('peril'), or null. */
export function titleRowAt(y) {
  for (const [row, dy] of Object.entries(TITLE_ROWS)) if (Math.abs(y - (HEIGHT / 2 + dy)) <= 5) return row;
  return null;
}

/** The shop row of the title screen. */
export function shopLine() {
  return `B: SHOP   ${profile.eggs} GOLDEN EGGS`;
}

/** Height (px) of a shop row. */
const SHOP_ROW_H = 19;
/** Canvas y of the middle of shop row `i`: the upgrades, then BACK. */
export const shopRowY = (i) => HEIGHT / 2 - 30 + i * SHOP_ROW_H;
/** A shop row's left edge and width, where its name starts and where its level pips start. */
export const SHOP_ROW = { x: 36, w: 248, text: 70, pips: 190 };

/** The shop row under canvas height `y`: an upgrade index, SHOP.length for BACK, or -1. */
export function shopRowAt(y) {
  for (let i = 0; i <= SHOP.length; i++) if (Math.abs(y - shopRowY(i)) <= SHOP_ROW_H / 2) return i;
  return -1;
}

/** What the next level of shop upgrade `i` costs in golden eggs ('40'), or 'MAX'. */
export function shopCost(i) {
  const level = profile.shop[i];
  return level < SHOP_COSTS.length ? String(SHOP_COSTS[level]) : 'MAX';
}

/** The shop: a row per upgrade with its key, icon, name and effect, level pips and price. */
function drawShop(ctx) {
  const cy = HEIGHT / 2;
  const { x, w, text, pips } = SHOP_ROW;
  const egg = eggSprites[2].normal;
  ctx.fillStyle = PALETTE[15];
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawText(ctx, 'SHOP', WIDTH / 2, cy - 62, 2, 10);
  const eggs = `${profile.eggs} GOLDEN EGGS`;
  const left = Math.round(WIDTH / 2 - (textWidth(eggs) + 11) / 2);
  ctx.drawImage(egg, left, cy - 52);
  drawText(ctx, eggs, left + 11, cy - 47, 1, 10, 'left');
  SHOP.forEach((upgrade, i) => {
    const y = shopRowY(i);
    const level = profile.shop[i];
    const maxed = level >= SHOP_COSTS.length;
    // Too dear for now: the whole row fades
    ctx.globalAlpha = maxed || profile.eggs >= SHOP_COSTS[level] ? 1 : 0.5;
    ctx.fillStyle = PALETTE[maxed ? 10 : 17];
    ctx.fillRect(x, y - 9, w, 18);
    ctx.fillStyle = PALETTE[15];
    ctx.fillRect(x + 1, y - 8, w - 2, 16);
    drawText(ctx, String(i + 1), x + 7, y, 1, 10);
    ctx.drawImage(iconSprites[upgrade.id].normal, x + 13, y - 7);
    drawText(ctx, upgrade.name, text, y - 4, 1, 13, 'left');
    drawText(ctx, upgrade.text, text, y + 4, 1, 16, 'left');
    for (let l = 0; l < SHOP_COSTS.length; l++) {
      ctx.fillStyle = PALETTE[0];
      ctx.fillRect(pips + l * 6, y - 3, 5, 5);
      ctx.fillStyle = PALETTE[l < level ? 10 : 17];
      ctx.fillRect(pips + l * 6 + 1, y - 2, 3, 3);
    }
    if (maxed) drawText(ctx, 'MAX', x + w - 6, y, 1, 10, 'right');
    else {
      drawText(ctx, shopCost(i), x + w - 15, y, 1, 13, 'right');
      ctx.drawImage(egg, x + w - 12, y - 5);
    }
  });
  ctx.globalAlpha = 1;
  drawText(ctx, 'B: BACK', WIDTH / 2, shopRowY(SHOP.length), 1, 13);
}

/** The hen row of the title screen: the hen on show, locked or not. */
export function henLine() {
  return `Q < ${HENS[game.hen].name} > E` + (henUnlocked(game.hen) ? '' : '  LOCKED');
}

/** The peril row of the title screen. */
export function perilLine() {
  const locked = MAX_PERIL - profile.perilUnlocked;
  return `Z < PERIL ${profile.peril} > C` + (locked ? `   ${locked} LOCKED` : '');
}

/** Upgrade card layout, shared with main.js (taps) and the tests (text fit). */
export const CARD_W = 92;
export const CARD_H = 104;
const CARD_GAP = 8;
/** Font scales of the card name and description lines. */
export const CARD_NAME_SCALE = 1;
export const CARD_TEXT_SCALE = 1;

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

/** Exact width (px) of `text` at font scale `scale`; the fit tests use it. */
export { textWidth };

/** Crisp pixel-font text with a 1 px ink outline, so it reads on any background (font.js). */
const drawText = drawPixelText;

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

/** The colors a rainbow elite cycles through. */
const RAINBOW = [9, 18, 10, 12, 14, 11];
let tintCanvas = null;

/** `sprite` washed with palette color `color` at strength `amount` (0-1), ready for drawSprite. */
function tinted(sprite, color, amount) {
  if (!tintCanvas) tintCanvas = document.createElement('canvas');
  tintCanvas.width = sprite.w; // also clears it
  tintCanvas.height = sprite.h;
  const g = tintCanvas.getContext('2d');
  g.drawImage(sprite.normal, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.globalAlpha = amount;
  g.fillStyle = PALETTE[color];
  g.fillRect(0, 0, sprite.w, sprite.h);
  return { ...sprite, normal: tintCanvas };
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
  for (const s of shots) {
    if (!s.alive) continue;
    const q = screenPos(s, alpha, camX, camY);
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
  drawClouds(ctx, camX, camY, time);
  drawHawkShadow(ctx, camX, camY, time);

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
    // White: just hit, or blinking before it acts (a magpie about to throw)
    const white = e.flash > 0.1 || (e.warn && Math.floor(time * 16) % 2 === 0);
    const shake = e.warn ? (Math.floor(time * 30) % 2) * 2 - 1 : 0;
    let sprite = set[pose];
    if (e.elite) {
      // Elites: a pulsing ring on the ground and a golden (or shifting rainbow) sheen
      const color = e.elite > 1 ? RAINBOW[Math.floor(time * 10) % RAINBOW.length] : 10;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 6);
      ctx.strokeStyle = PALETTE[color];
      ctx.beginPath();
      ctx.ellipse(d.sx, d.sy, 10, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = rise;
      sprite = tinted(sprite, color, e.elite > 1 ? 0.6 : 0.55);
    }
    drawSprite(ctx, sprite, d.sx + shake, d.sy - lift, e.facing, white, false, e.boss ? 2 : e.elite ? 1.5 : 1);
    ctx.globalAlpha = 1;
  }
  if (game.started && !game.over) drawHealthBar(ctx, henPos.sx, henPos.sy);

  // Magpie pebbles: grey stones flying a little above their shadows.
  for (const s of shots) {
    if (!s.alive) continue;
    const { sx, sy } = screenPos(s, alpha, camX, camY);
    ctx.fillStyle = PALETTE[0];
    ctx.fillRect(sx - 2, sy - 9, 4, 4);
    ctx.fillStyle = PALETTE[16];
    ctx.fillRect(sx - 1, sy - 8, 2, 2);
    ctx.fillStyle = PALETTE[13];
    ctx.fillRect(sx - 1, sy - 8, 1, 1);
  }

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

/** Where the hawk is on screen, for its shadow and the hawk itself. */
const hawkPos = (camX, camY) => [Math.round(toIsoX(hawk.x, hawk.y) - camX), Math.round(toIsoY(hawk.x, hawk.y) - camY)];

/**
 * The hawk's shadow grows as it comes down; once it takes aim it holds still inside a blinking
 * red ring that closes in until the dive.
 */
function drawHawkShadow(ctx, camX, camY, time) {
  if (!hawk.dives || hawk.t >= HAWK_STRIKE) return;
  const [sx, sy] = hawkPos(camX, camY);
  const rx = HAWK_R * HALF_W * Math.SQRT2;
  const near = hawk.t / HAWK_STRIKE;
  ctx.globalAlpha = 0.25 + 0.25 * near;
  ctx.fillStyle = PALETTE[0];
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx * (0.5 + 0.5 * near), rx * (0.25 + 0.25 * near), 0, 0, Math.PI * 2);
  ctx.fill();
  if (hawk.t > HAWK_HUNT) {
    const k = 1 + (2 * (HAWK_STRIKE - hawk.t)) / (HAWK_STRIKE - HAWK_HUNT);
    ctx.globalAlpha = Math.floor(time * 16) % 2 ? 1 : 0.5;
    ctx.strokeStyle = PALETTE[9];
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx * k, (rx * k) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** The hawk itself (a big brown crow): diving in from the upper left, climbing away to the right. */
function drawHawk(ctx, camX, camY, time) {
  const u = hawk.t - HAWK_STRIKE;
  if (!hawk.dives || u < -0.25 || u > 0.4) return;
  const [sx, sy] = hawkPos(camX, camY);
  const k = u < 0 ? u / 0.25 : u / 0.4;
  const sprite = tinted(enemySprites[3][Math.floor(time * 12) % 2 ? 'stepA' : 'stepB'], 19, 0.55);
  drawSprite(ctx, sprite, sx + Math.round(k * 50), sy - 4 - Math.round(Math.abs(k) * 70), 1, false, false, 2);
}

/** Skunk stink: a violet haze over its reach, with puffs drifting around it; it fades as it clears. */
function drawClouds(ctx, camX, camY, time) {
  ctx.fillStyle = PALETTE[14];
  for (const c of clouds) {
    if (!c.alive) continue;
    const sx = Math.round(toIsoX(c.x, c.y) - camX);
    const sy = Math.round(toIsoY(c.x, c.y) - camY);
    const rx = CLOUD_R * HALF_W * Math.SQRT2;
    const fade = Math.min(1, c.life * 2);
    for (let k = 0; k < 6; k++) {
      const a = k * 1.25 + time * (k % 2 ? 1 : -1);
      ctx.globalAlpha = (k ? 0.5 : 0.3) * fade;
      ctx.beginPath();
      if (k) ctx.ellipse(sx + Math.cos(a) * rx * 0.6, sy - 4 + Math.sin(a) * rx * 0.3, 6, 4, 0, 0, Math.PI * 2);
      else ctx.ellipse(sx, sy, rx, rx / 2, 0, 0, Math.PI * 2);
      ctx.fill();
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
    drawText(ctx, p.text, Math.round(toIsoX(p.x, p.y) - camX), Math.round(toIsoY(p.x, p.y, p.z) - camY), 1, p.color);
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
  drawText(ctx, `LV ${game.level}`, 4, 14, 1, 13, 'left');
  drawText(ctx, (game.peril ? `P${game.peril} ` : '') + (game.day > 1 ? `DAY ${game.day}  ` : '') + formatClock(game.time), WIDTH / 2, 14, 1, 13);
  if (game.bannerTime > 0 && !game.over) drawText(ctx, game.banner, WIDTH / 2, HEIGHT / 2 - 40, 3, 10);
  drawText(ctx, `KILLS ${game.kills}`, WIDTH - 4, 14, 1, 13, 'right');
  // The strongest boss on the field: its name and health under the top bar.
  let boss = null;
  for (const e of enemies) if (e.alive && e.boss && (!boss || e.hp > boss.hp)) boss = e;
  const menu = game.over || game.cards.length || game.reward.length;
  if (boss && !menu) {
    drawText(ctx, bossName(boss), WIDTH / 2, 25, 1, 13);
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
  const Z = HUD_SCALES;
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
    if (numbered) drawText(ctx, String(i + 1), r.x + 8, y + 9, 1, 10);
    ctx.drawImage(icon.normal, cx - 14, y + 10 + Math.round(Math.sin(time * 4 + i) * 1.5), 28, 28);
    drawText(ctx, item.name, cx, y + 50, CARD_NAME_SCALE, 13);
    drawText(ctx, card.boon ? 'BOON' : card.level === 1 ? 'NEW!' : `LV ${card.level}`, cx, y + 61, 1, card.boon || card.level === 1 ? 10 : 12);
    const [a, b] = cardText(card);
    drawText(ctx, a, cx, y + 76, CARD_TEXT_SCALE, 7);
    if (b) drawText(ctx, b, cx, y + 85, CARD_TEXT_SCALE, 7);
  });
}

function drawGameOver(ctx, time) {
  const S = HUD_STRINGS;
  const Z = HUD_SCALES;
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
  drawText(ctx, gameOverLine(game.time, game.kills, game.level), WIDTH / 2, statsY, 1, 13);
  const eggs = game.eggs ? `   +${game.eggs} GOLDEN EGGS` : '';
  if (game.newBest) drawText(ctx, S.newBest + eggs, WIDTH / 2, statsY + 14, Z.newBest, 10);
  else drawText(ctx, `BEST ${formatClock(game.best)}` + eggs, WIDTH / 2, statsY + 14, 1, 13);
  if (game.unlockNote) drawText(ctx, game.unlockNote, WIDTH / 2, statsY + 25, 1, 10);
  if (game.overTime > 1.5 && game.dawnChoice) {
    // Keep going (left) or end the run (right)
    drawText(ctx, S.keepGoing, WIDTH / 4, cy + 62, Z.keepGoing, Math.sin(time * 5) > -0.3 ? 10 : 13);
    drawText(ctx, S.endRun, (WIDTH * 3) / 4, cy + 62, Z.endRun, 13);
  } else if (game.overTime > 1.5 && Math.sin(time * 5) > -0.3) drawText(ctx, S.resume, WIDTH / 2, cy + 40, Z.resume, 13);
}

function drawHud(ctx, time) {
  const S = HUD_STRINGS;
  const Z = HUD_SCALES;
  const cy = HEIGHT / 2;
  if (!game.started) {
    drawText(ctx, S.title, WIDTH / 2, cy - 58, Z.title, 10);
    drawText(ctx, S.subtitle, WIDTH / 2, cy - 41, Z.subtitle, 13);
    if (game.best > 0) drawText(ctx, `BEST ${formatClock(game.best)}`, WIDTH / 2, cy - 31, 1, 10);
    if (!henUnlocked(game.hen)) {
      // A locked hen is only on show: a padlock beside her, and how to unlock her instead of START
      const shake = game.lockShake > 0 ? Math.round(Math.sin(time * 60) * 1.5) : 0;
      ctx.drawImage(lockSprite.normal, WIDTH / 2 + 8 + shake, cy - 18);
      drawText(ctx, HENS[game.hen].hint, WIDTH / 2, cy + 22, 1, 10);
    } else if (Math.sin(time * 5) > -0.3) drawText(ctx, S.start, WIDTH / 2, cy + 22, Z.start, 13);
    drawText(ctx, henLine(), WIDTH / 2, cy + TITLE_ROWS.hen, 1, 13);
    drawText(ctx, perilLine(), WIDTH / 2, cy + TITLE_ROWS.peril, 1, profile.peril ? 10 : 13);
    drawText(ctx, shopLine(), WIDTH / 2, cy + TITLE_ROWS.shop, 1, 10);
    drawText(ctx, S.controls, WIDTH / 2, cy + 67, Z.controls, 13);
    drawText(ctx, S.music, WIDTH / 2, cy + 77, Z.music, 13);
    if (game.shopOpen) drawShop(ctx);
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
  drawHawk(ctx, camX, camY, time);
  if (game.started) {
    const x = hen.prevX + (hen.x - hen.prevX) * alpha;
    const y = hen.prevY + (hen.y - hen.prevY) * alpha;
    drawWeather(ctx, time, Math.round(toIsoX(x, y) - camX), Math.round(toIsoY(x, y) - camY));
  }
  tint(ctx, 13, (juice.flash / juice.flashDur) * 0.7);
  if (game.frenzy > 0 && !game.over) {
    // FRENZY!: a red frame pulses around the screen
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(time * 12);
    ctx.strokeStyle = PALETTE[9];
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, WIDTH - 4, HEIGHT - 4);
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1;
  }
  drawStick(ctx);
  drawHud(ctx, time);
}
