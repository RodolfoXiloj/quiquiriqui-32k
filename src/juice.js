// Game feel: hitstop, directional screen shake, and a smooth camera that follows the hen.
import { toIsoX, toIsoY } from './iso.js';
import { WIDTH, HEIGHT } from './screen.js';

/** The camera aims at the hen's body, this many pixels above her feet. */
const AIM_Z = 8;

export const juice = {
  hitstop: 0,
  shakeX: 0,
  shakeY: 0,
  shakeVX: 0,
  shakeVY: 0,
  shakeTime: 0,
  shakeDur: 0.12,
  /** Top-left of the view in isometric pixels (before rounding). */
  camX: 0,
  camY: 0,
};

/** Freezes the simulation for `seconds`. Never shortens a running hitstop. */
export function triggerHitstop(seconds = 0.05) {
  if (seconds > juice.hitstop) juice.hitstop = seconds;
}

/** Kicks the camera along screen direction (dx, dy). */
export function triggerShake(dx, dy, magnitude = 3, duration = 0.12) {
  const len = Math.hypot(dx, dy) || 1;
  juice.shakeVX = (dx / len) * magnitude;
  juice.shakeVY = (dy / len) * magnitude;
  juice.shakeTime = juice.shakeDur = duration;
}

function cameraTarget(wx, wy) {
  return { x: toIsoX(wx, wy) - WIDTH / 2, y: toIsoY(wx, wy, AIM_Z) - HEIGHT / 2 };
}

/** Puts the camera on (wx, wy) at once, with no easing. Used when a run starts. */
export function snapCamera(wx, wy) {
  const t = cameraTarget(wx, wy);
  juice.camX = t.x;
  juice.camY = t.y;
}

/**
 * Advances shake and camera on real time toward world point (wx, wy) and returns the
 * simulation dt: 0 during hitstop, otherwise `rawDt`.
 */
export function updateJuice(rawDt, wx, wy) {
  if (juice.shakeTime > 0) {
    juice.shakeTime = Math.max(0, juice.shakeTime - rawDt);
    const k = Math.cos(juice.shakeTime * 75) * (juice.shakeTime / juice.shakeDur);
    juice.shakeX = juice.shakeVX * k;
    juice.shakeY = juice.shakeVY * k;
  } else {
    juice.shakeX = juice.shakeY = 0;
  }

  const t = cameraTarget(wx, wy);
  const follow = Math.min(1, rawDt * 8);
  juice.camX += (t.x - juice.camX) * follow;
  juice.camY += (t.y - juice.camY) * follow;

  if (juice.hitstop > 0) {
    juice.hitstop = Math.max(0, juice.hitstop - rawDt);
    return 0;
  }
  return rawDt;
}
