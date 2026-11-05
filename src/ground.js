// Endless isometric meadow. Five flat tile types (two variants each) are baked once at boot,
// pixel by pixel so neighboring diamonds tile with no seams, and every world cell picks its
// tile from a stateless hash. Only the cells around the camera are drawn each frame.
import { PALETTE } from './palette.js';
import { hash2, rand, seedRng } from './rng.js';
import { TILE_W, TILE_H, HALF_W, HALF_H, toIsoX, toIsoY, screenToWorld } from './iso.js';
import { WIDTH, HEIGHT } from './screen.js';

export const GRASS = 0;
export const GRASS_DARK = 1;
export const TUFTS = 2;
export const FLOWERS = 3;
export const DIRT = 4;

/** Every palette index the meadow uses. The hen must never use these (readability test). */
export const GROUND_PALETTE_INDICES = [1, 2, 3, 4, 5, 6, 11, 14];

const MEADOW_SALT = 2026;

/** groundTiles[type][variant]: offscreen 16x8 canvases. */
export const groundTiles = [];

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * True if pixel (x, y) of a tile canvas belongs to its diamond. No pixel center ever lands
 * exactly on a diamond edge, so every screen pixel belongs to exactly one cell.
 */
function inDiamond(x, y) {
  return Math.abs(x + 0.5 - HALF_W) / HALF_W + Math.abs(y + 0.5 - HALF_H) / HALF_H <= 1;
}

/**
 * Bakes one tile: `base` color with random `speckles` ([paletteIndex, chance] pairs),
 * then `decorate(g)` for blades or flowers drawn on top.
 */
function bakeTile(base, speckles, decorate) {
  const c = makeCanvas(TILE_W, TILE_H);
  const g = c.getContext('2d');
  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      if (!inDiamond(x, y)) continue;
      let col = base;
      for (const [idx, chance] of speckles) {
        if (rand() < chance) {
          col = idx;
          break;
        }
      }
      g.fillStyle = PALETTE[col];
      g.fillRect(x, y, 1, 1);
    }
  }
  if (decorate) decorate(g);
  return c;
}

/** Paints `count` single pixels of `color` at random spots inside the diamond. */
function sprinkle(g, count, color) {
  g.fillStyle = PALETTE[color];
  for (let i = 0; i < count; i++) {
    let x;
    let y;
    do {
      x = (rand() * TILE_W) | 0;
      y = (rand() * TILE_H) | 0;
    } while (!inDiamond(x, y));
    g.fillRect(x, y, 1, 1);
  }
}

/** Bakes every meadow tile. Call once at boot. */
export function bakeGround(seed = 1337) {
  seedRng(seed);
  groundTiles.length = 0;
  for (let variant = 0; variant < 2; variant++) {
    const set = [
      bakeTile(2, [[3, 0.08], [1, 0.03]]),
      // Dark grass stays close to the mid tone so neighboring patches don't form a checkerboard.
      bakeTile(2, [[1, 0.3]]),
      bakeTile(2, [[3, 0.1]], (g) => sprinkle(g, 5, 4)),
      bakeTile(3, [[2, 0.12]], (g) => {
        sprinkle(g, 3, 11);
        sprinkle(g, 2, 14);
      }),
      bakeTile(6, [[5, 0.25], [2, 0.04]]),
    ];
    set.forEach((canvas, type) => {
      groundTiles[type] = groundTiles[type] || [];
      groundTiles[type][variant] = canvas;
    });
  }
}

/**
 * Tile type of world cell (cx, cy). Dirt and flowers come in 4x4 patches and dark grass in
 * 2x2 patches, so the meadow reads as calm areas instead of per-tile noise behind the action.
 */
export function groundTileAt(cx, cy) {
  const patch = hash2(cx >> 2, cy >> 2, MEADOW_SALT + 1);
  const shade = hash2(cx >> 1, cy >> 1, MEADOW_SALT + 3);
  const h = hash2(cx, cy, MEADOW_SALT);
  if (patch > 0.88 && h < 0.75) return DIRT;
  if (patch < 0.1 && h < 0.45) return FLOWERS;
  if (h > 0.93) return TUFTS;
  return shade < 0.4 ? GRASS_DARK : GRASS;
}

/** Draws the cells visible from integer camera position (camX, camY). */
export function drawGround(ctx, camX, camY) {
  const corners = [
    screenToWorld(camX, camY),
    screenToWorld(camX + WIDTH, camY),
    screenToWorld(camX, camY + HEIGHT),
    screenToWorld(camX + WIDTH, camY + HEIGHT),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const x0 = Math.floor(Math.min(...xs)) - 1;
  const x1 = Math.ceil(Math.max(...xs)) + 1;
  const y0 = Math.floor(Math.min(...ys)) - 1;
  const y1 = Math.ceil(Math.max(...ys)) + 1;

  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const sx = toIsoX(cx, cy) - HALF_W - camX;
      const sy = toIsoY(cx, cy) - camY;
      if (sx <= -TILE_W || sx >= WIDTH || sy <= -TILE_H || sy >= HEIGHT) continue;
      const variant = hash2(cx, cy, MEADOW_SALT + 2) < 0.5 ? 0 : 1;
      ctx.drawImage(groundTiles[groundTileAt(cx, cy)][variant], sx, sy);
    }
  }
}
