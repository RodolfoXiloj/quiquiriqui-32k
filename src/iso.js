// 2:1 isometric projection helpers and depth sorting.
// World coordinates (wx, wy) are in tile units on an endless meadow; wz is height in pixels.

export const TILE_W = 16;
export const TILE_H = 8;
export const HALF_W = TILE_W / 2; // 8
export const HALF_H = TILE_H / 2; // 4

/** World (wx, wy) to isometric screen X, before the camera offset. */
export function toIsoX(wx, wy) {
  return (wx - wy) * HALF_W;
}

/** World (wx, wy, wz) to isometric screen Y, before the camera offset. */
export function toIsoY(wx, wy, wz = 0) {
  return (wx + wy) * HALF_H - wz;
}

/**
 * Converts a screen-space vector or point (sx, sy), in pixels, to world space on the ground.
 * Used to turn "screen up/right" input into a world direction and to find the visible cells.
 */
export function screenToWorld(sx, sy) {
  const a = sx / HALF_W;
  const b = sy / HALF_H;
  return { x: (a + b) * 0.5, y: (b - a) * 0.5 };
}

/** Depth key for painter's-algorithm sorting (back-to-front). */
export function depthKey(wx, wy) {
  return wx + wy;
}
