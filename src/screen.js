// Internal render resolution: always 320 pixels wide, and as tall as the window's shape allows
// (180 on a wide screen, up to 640 on a phone held upright, so it sees more meadow above and
// below). HEIGHT is a live binding: every module reads the current value. main.js scales the
// canvas up: by whole numbers when it can (crisp pixels), by a fraction on small screens.
export const WIDTH = 320;
export const MIN_HEIGHT = 180;
export const MAX_HEIGHT = 640;
export let HEIGHT = MIN_HEIGHT;

/** Fits the internal height to a window of w x h CSS pixels and returns it. */
export function fitScreen(w, h) {
  HEIGHT = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round((WIDTH * h) / w)));
  return HEIGHT;
}

/** CSS pixels per canvas pixel for a w x h window: whole numbers from 2x up, a fraction below. */
export function screenScale(w, h) {
  const fit = Math.min(w / WIDTH, h / HEIGHT);
  return fit >= 2 ? Math.floor(fit) : fit;
}
