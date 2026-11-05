// The wave timeline of the ten minutes: timed events that each start a spawner, which releases
// `count` predators spread evenly over `over` seconds, picking each one's kind at random from
// `kinds` (repeat a kind to make it more common). Snakes join at 3:00, crows at 5:00 and
// badgers at 7:00; the last minute brings everything.
import { gameRand } from './rng.js';
import { game, settings } from './state.js';
import { RAT, FOX, SNAKE, CROW, BADGER, spawnEnemy } from './enemies.js';

export const TIMELINE = [
  { at: 0, kinds: [RAT], count: 4, over: 2 },
  { at: 0, kinds: [RAT], count: 60, over: 60 },
  { at: 30, kinds: [RAT], count: 30, over: 30 },
  { at: 60, kinds: [RAT, RAT, FOX], count: 80, over: 60 },
  { at: 120, kinds: [RAT, FOX], count: 120, over: 60 },
  { at: 180, kinds: [RAT, FOX, SNAKE, SNAKE], count: 140, over: 60 },
  { at: 240, kinds: [FOX, SNAKE, RAT], count: 160, over: 60 },
  { at: 300, kinds: [CROW, CROW, RAT, FOX], count: 170, over: 60 },
  { at: 360, kinds: [CROW, SNAKE, FOX], count: 190, over: 60 },
  { at: 420, kinds: [BADGER, RAT, RAT, CROW], count: 200, over: 60 },
  { at: 480, kinds: [BADGER, FOX, SNAKE, CROW], count: 240, over: 60 },
  { at: 540, kinds: [RAT, FOX, SNAKE, CROW, BADGER], count: 300, over: 60 },
];

const spawners = [];
let nextEvent = 0;

export function resetWaves() {
  spawners.length = 0;
  nextEvent = 0;
}

function startSpawner(event) {
  spawners.push({ kinds: event.kinds, left: event.count, period: event.over / event.count, timer: 0 });
}

export function updateWaves(dt) {
  if (settings.peaceful) return;
  while (nextEvent < TIMELINE.length && game.time >= TIMELINE[nextEvent].at) startSpawner(TIMELINE[nextEvent++]);
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
