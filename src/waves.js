// The wave timeline: timed events that each start a spawner, which releases `count` predators
// spread evenly over `over` seconds, picking each one's kind at random from `kinds` (repeat a kind
// to make it more common). After the last event, every minute adds a denser copy of it.
// M3 fills in the full ten minutes, the bosses and the boxes.
import { gameRand } from './rng.js';
import { game, settings } from './state.js';
import { RAT, FOX, spawnEnemy } from './enemies.js';

export const TIMELINE = [
  { at: 0, kinds: [RAT], count: 4, over: 2 },
  { at: 0, kinds: [RAT], count: 60, over: 60 },
  { at: 30, kinds: [RAT], count: 30, over: 30 },
  { at: 60, kinds: [RAT, RAT, FOX], count: 80, over: 60 },
  { at: 120, kinds: [RAT, FOX], count: 140, over: 60 },
  { at: 180, kinds: [RAT, FOX, FOX], count: 180, over: 60 },
];
/** Extra predators per minute in each copy of the last event. */
const RAMP_PER_MINUTE = 40;

const spawners = [];
let nextEvent = 0;
let nextRampAt = 0;

export function resetWaves() {
  spawners.length = 0;
  nextEvent = 0;
  nextRampAt = TIMELINE[TIMELINE.length - 1].at + 60;
}

function startSpawner(event) {
  spawners.push({ kinds: event.kinds, left: event.count, period: event.over / event.count, timer: 0 });
}

export function updateWaves(dt) {
  if (settings.peaceful) return;
  while (nextEvent < TIMELINE.length && game.time >= TIMELINE[nextEvent].at) startSpawner(TIMELINE[nextEvent++]);
  if (nextEvent === TIMELINE.length && game.time >= nextRampAt) {
    const last = TIMELINE[TIMELINE.length - 1];
    const minutes = Math.round((nextRampAt - last.at) / 60);
    startSpawner({ ...last, count: last.count + RAMP_PER_MINUTE * minutes });
    nextRampAt += 60;
  }
  for (let i = spawners.length - 1; i >= 0; i--) {
    const s = spawners[i];
    s.timer += dt;
    while (s.timer >= s.period && s.left > 0) {
      s.timer -= s.period;
      s.left--;
      spawnEnemy(s.kinds[Math.floor(gameRand() * s.kinds.length)]);
    }
    if (s.left <= 0) spawners.splice(i, 1);
  }
}
