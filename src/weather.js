// The day arc of a run: a sunny morning, rain, snow, a long night and then dawn, when the rooster
// crows and the run is won. Weather is only a look (tints and falling particles drawn by
// render.js); it never changes the simulation.

/** A run is won by surviving this many seconds. */
export const RUN_LENGTH = 600;
/** Seconds each weather takes to fade in and out. */
const FADE = 5;
/** [start, end] in seconds of play. */
export const RAIN = [150, 240];
export const SNOW = [330, 390];
export const NIGHT = [450, 570];
/** Dawn starts here and lasts until the end of the run. */
export const DAWN_START = 570;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** 0 outside [start, end], 1 inside, with linear fades at both ends. */
function band(t, [start, end]) {
  return clamp01(Math.min((t - start) / FADE, (end - t) / FADE));
}

/** Weather intensities (each 0..1) at `t` seconds of play. */
export function weatherAt(t) {
  return {
    rain: band(t, RAIN),
    snow: band(t, SNOW),
    night: band(t, NIGHT),
    dawn: clamp01((t - DAWN_START) / FADE),
  };
}
