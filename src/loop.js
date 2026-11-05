// Fixed-timestep game loop with an accumulator.
// Prior art: Glenn Fiedler, "Fix Your Timestep!". Re-implemented for this project.

/** Simulation step in seconds (60 Hz). */
export const STEP = 1 / 60;

/** Longest frame delta we accept, to avoid a "spiral of death" after a tab switch. */
const MAX_FRAME = 0.25;

/**
 * Starts the main loop.
 * @param {(dt: number) => void} update Called zero or more times per frame with a fixed `dt`.
 * @param {(alpha: number) => void} render Called once per frame; `alpha` in [0, 1) is the
 *   interpolation factor between the previous and the current simulation state.
 */
export function startLoop(update, render) {
  let last = performance.now();
  let accumulator = 0;

  function frame(now) {
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
    }
    render(accumulator / STEP);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
