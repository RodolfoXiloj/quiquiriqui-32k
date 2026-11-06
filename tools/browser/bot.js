// Dev-only bot brain, shared by the watch mode (tools/browser/autoplay.js, in the browser) and the
// Node tests (test/harness.js). Never bundled.
//
// It imports nothing from the game, so the browser and Node can each hand it their own module
// instances: decide() reads a plain snapshot of the world and answers which keys to hold and which
// key to tap. Strategy: try the 8 screen directions, score each by how close it would bring the
// hen to predators (looking a little ahead) and how well it heads for the nearest prize or corn,
// and keep the current direction unless another one is clearly better. Hazards (pebbles in flight,
// stink clouds, the spot a hawk is about to dive on) count as danger too. Cards: new weapons first,
// then weapon levels, then passives. It closes the chest screen, and after a game over it waits a
// moment and starts again.

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
const PRIZE_RANGE = 14;
const STAY_BONUS = 0.04;

/** Danger at world point (px, py): every predator in range adds weight / distance². */
function dangerAt(px, py, enemies) {
  let danger = 0;
  for (const e of enemies) {
    if (!e.alive) continue;
    const d2 = (e.x - px) ** 2 + (e.y - py) ** 2;
    if (d2 > DANGER_RANGE * DANGER_RANGE) continue;
    danger += (e.dmg / 50) / Math.max(0.12, d2);
  }
  return danger;
}

/**
 * The hazards to steer clear of, as { x, y, r, weight }: where each flying pebble will be in a
 * moment, each stink cloud, and the hawk's target once it takes aim. `k` holds the game's sizes
 * and timings: { cloudR, hawkR, hawkHunt, hawkStrike }.
 */
export function hazardsOf(shots, clouds, hawk, k) {
  const list = [];
  for (const s of shots) if (s.alive) list.push({ x: s.x + s.vx * 0.25, y: s.y + s.vy * 0.25, r: 0.9, weight: 2 });
  for (const c of clouds) if (c.alive) list.push({ x: c.x, y: c.y, r: k.cloudR + 0.3, weight: 3 });
  if (hawk.dives && hawk.t > k.hawkHunt && hawk.t < k.hawkStrike) list.push({ x: hawk.x, y: hawk.y, r: k.hawkR + 0.6, weight: 6 });
  return list;
}

/** Danger at world point (px, py) from the hazards it lies in. */
function hazardAt(px, py, hazards) {
  let danger = 0;
  for (const h of hazards) if (Math.hypot(h.x - px, h.y - py) < h.r) danger += h.weight;
  return danger;
}

/** The nearest alive item of `list` within `range` tiles of the hen, or null. */
function nearest(hen, list, range) {
  let best = null;
  let bestD = range * range;
  for (const c of list) {
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
    const rank = (card.hatch ? 10 : 0) + (card.weapon ? 2 : 0) + (card.level === 1 ? 1 : 0) + (card.weapon ? 0 : card.id === 'boots' ? 0.5 : 0);
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
     * world: { hen, enemies, corn, pickups, hazards, game, cards } where cards carry { id, level,
     * weapon } and hazards come from hazardsOf().
     * Returns { keys, tap }: the movement keys to hold now, and a key to tap once (or null).
     */
    decide(world) {
      const { hen, enemies, corn, pickups = [], hazards = [], game, cards } = world;
      // After a fall (or a win), start over.
      if (game.over) return { keys: [], tap: game.overTime > 2 ? 'Space' : null };
      if (cards.length) return { keys: [], tap: game.cardLock <= 0 ? `Digit${pickCard(cards) + 1}` : null };
      if (game.reward && game.reward.length) return { keys: [], tap: game.rewardLock <= 0 ? 'Space' : null };

      const here = dangerAt(hen.x, hen.y, enemies);
      // Prizes (chests, magnets, bombs, food) are worth more than corn.
      const prize = nearest(hen, pickups, PRIZE_RANGE);
      const food = prize || nearest(hen, corn, CORN_RANGE);
      const pull = prize ? 2 : 1;
      let bestScore = -Infinity;
      let best = held;
      DIRECTIONS.forEach((d, i) => {
        let score = -dangerAt(hen.x + d.x * LOOK_NEAR, hen.y + d.y * LOOK_NEAR, enemies);
        score -= 0.6 * dangerAt(hen.x + d.x * LOOK_FAR, hen.y + d.y * LOOK_FAR, enemies);
        score -= hazardAt(hen.x + d.x * LOOK_NEAR, hen.y + d.y * LOOK_NEAR, hazards);
        if (food) {
          const fx = food.x - hen.x;
          const fy = food.y - hen.y;
          const fd = Math.hypot(fx, fy) || 1;
          // Corn matters less when predators are close.
          score += ((d.x * fx + d.y * fy) / fd) * (here < 0.3 ? 0.6 : 0.15) * pull;
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
