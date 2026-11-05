// Dev-only bot brain, shared by the watch mode (tools/browser/autoplay.js, in the browser) and the
// Node tests (test/harness.js). Never bundled.
//
// It imports nothing from the game, so the browser and Node can each hand it their own module
// instances: decide() reads a plain snapshot of the world and answers which keys to hold and which
// key to tap. Strategy: try the 8 screen directions, score each by how close it would bring the
// hen to predators (looking a little ahead) and how well it heads for the nearest corn, and keep
// the current direction unless another one is clearly better. Cards: new weapons first, then
// weapon levels, then passives. After a game over it waits a moment and starts again.

/** The 8 screen directions as [screen x, screen y, keys to hold]. */
const DIRECTIONS = [
  [1, 0, ['KeyD']],
  [1, 1, ['KeyD', 'KeyS']],
  [0, 1, ['KeyS']],
  [-1, 1, ['KeyA', 'KeyS']],
  [-1, 0, ['KeyA']],
  [-1, -1, ['KeyA', 'KeyW']],
  [0, -1, ['KeyW']],
  [1, -1, ['KeyD', 'KeyW']],
].map(([sx, sy, keys]) => {
  // Screen to world, the same math as src/iso.js screenToWorld (16x8 tiles), then normalized.
  const a = sx / 8;
  const b = sy / 4;
  const x = (a + b) / 2;
  const y = (b - a) / 2;
  const len = Math.hypot(x, y);
  return { x: x / len, y: y / len, keys };
});

const LOOK_NEAR = 1.2; // tiles
const LOOK_FAR = 2.8;
const DANGER_RANGE = 8;
const CORN_RANGE = 10;
const STAY_BONUS = 0.04;

/** Danger at world point (px, py): every predator in range adds weight / distance². */
function dangerAt(px, py, enemies) {
  let danger = 0;
  for (const e of enemies) {
    if (!e.alive) continue;
    const d2 = (e.x - px) ** 2 + (e.y - py) ** 2;
    if (d2 > DANGER_RANGE * DANGER_RANGE) continue;
    danger += (e.dmg / 5) / Math.max(0.12, d2);
  }
  return danger;
}

function nearestCorn(hen, corn) {
  let best = null;
  let bestD = CORN_RANGE * CORN_RANGE;
  for (const c of corn) {
    if (!c.alive) continue;
    const d2 = (c.x - hen.x) ** 2 + (c.y - hen.y) ** 2;
    if (d2 < bestD) {
      bestD = d2;
      best = c;
    }
  }
  return best;
}

/** Index of the card the bot prefers. Cards are { id, level, weapon }. */
export function pickCard(cards) {
  let best = 0;
  let bestRank = -1;
  cards.forEach((card, i) => {
    const rank = (card.weapon ? 2 : 0) + (card.level === 1 ? 1 : 0) + (card.weapon ? 0 : card.id === 'boots' ? 0.5 : 0);
    if (rank > bestRank) {
      bestRank = rank;
      best = i;
    }
  });
  return best;
}

export function createBot() {
  let held = 0;
  return {
    /**
     * world: { hen, enemies, corn, game, cards } where cards carry { id, level, weapon }.
     * Returns { keys, tap }: the movement keys to hold now, and a key to tap once (or null).
     */
    decide(world) {
      const { hen, enemies, corn, game, cards } = world;
      if (game.over) return { keys: [], tap: game.overTime > 2 ? 'Space' : null };
      if (cards.length) return { keys: [], tap: game.cardLock <= 0 ? `Digit${pickCard(cards) + 1}` : null };

      const here = dangerAt(hen.x, hen.y, enemies);
      const food = nearestCorn(hen, corn);
      let bestScore = -Infinity;
      let best = held;
      DIRECTIONS.forEach((d, i) => {
        let score = -dangerAt(hen.x + d.x * LOOK_NEAR, hen.y + d.y * LOOK_NEAR, enemies);
        score -= 0.6 * dangerAt(hen.x + d.x * LOOK_FAR, hen.y + d.y * LOOK_FAR, enemies);
        if (food) {
          const fx = food.x - hen.x;
          const fy = food.y - hen.y;
          const fd = Math.hypot(fx, fy) || 1;
          // Corn matters less when predators are close.
          score += ((d.x * fx + d.y * fy) / fd) * (here < 0.3 ? 0.6 : 0.15);
        }
        if (i === held) score += STAY_BONUS;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
      held = best;
      return { keys: DIRECTIONS[held].keys, tap: null };
    },
  };
}
