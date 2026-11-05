// Dev-only autoplay and test hooks. tools/dev.mjs injects this module into the page when the URL
// has ?autoplay. It is never bundled (tools/build.mjs only follows src/main.js).
//
// It imports the game's modules by the same URLs the page uses, so it shares the running game's
// state, and it adds:
//   - a speed booster: the game runs `?speed=N` times faster than real time (default 5);
//   - window.__qq, which lets tools/playtest.mjs read the game state and use dev cheats;
//   - the bot (tools/browser/bot.js) playing on its own so you can watch: it dodges, collects
//     corn, picks cards and starts a new run after a game over. &drive=cdp turns it off, for
//     when the playtest sends the real input itself;
//   - &peaceful: no waves and no starting corn (the playtest's movement checks use it).
//
// Usage: npm run dev, then open http://localhost:8080/?autoplay   (&speed=3, &drive=cdp, &peaceful)
// The wardrobe (every worn item at each of its looks) is at http://localhost:8080/__dev/wardrobe.html
import { update } from '/main.js';
import { STEP } from '/loop.js';
import { game, settings, formatClock, xpToNext } from '/state.js';
import { hen, damageHen, syncHenStats } from '/hen.js';
import { holdKey } from '/input.js';
import { toIsoX, toIsoY } from '/iso.js';
import { enemies, spawnEnemy, countEnemies, ENEMY_TYPES } from '/enemies.js';
import { corn } from '/corn.js';
import { ITEMS, ITEM_BY_ID, build, buildOrder, applyCard } from '/items.js';
import { bakeHen, outfitOf } from '/sprites.js';
import { cardRect } from '/render.js';
import { createBot } from '/__dev/bot.js';

const params = new URLSearchParams(location.search);
const speed = Math.max(1, Number(params.get('speed')) || 5);
const externalDriver = params.get('drive') === 'cdp';
settings.peaceful = params.has('peaceful');

// --- Speed booster -------------------------------------------------------------------------
// The game's own loop already runs 1x; each frame we add (speed - 1)x worth of fixed steps,
// measured on real elapsed time so 60 Hz and 120 Hz screens get the same speed.
let last = performance.now();
let owed = 0;
function boost(now) {
  owed += Math.min((now - last) / 1000, 0.25) * (speed - 1);
  last = now;
  while (owed >= STEP) {
    update(STEP);
    owed -= STEP;
  }
  requestAnimationFrame(boost);
}
requestAnimationFrame(boost);

// --- Test hooks ------------------------------------------------------------------------------
const cardsWithKind = () => game.cards.map((c) => ({ ...c, weapon: !!ITEM_BY_ID[c.id].weapon }));

/** Best results across every run of this page, so a long watch can be summed up. */
const record = { runs: 0, maxLevel: 1, maxKills: 0, maxTime: 0 };

window.__qq = {
  speed,
  record,
  snapshot: () => ({
    started: game.started,
    paused: game.paused,
    over: game.over,
    won: game.won,
    time: game.time,
    level: game.level,
    xp: game.xp,
    kills: game.kills,
    best: game.best,
    cards: cardsWithKind(),
    cardLock: game.cardLock,
    build: buildOrder.map((id) => [id, build[id]]),
    enemies: countEnemies(),
    corn: corn.filter((c) => c.alive).length,
    hen: {
      x: hen.x,
      y: hen.y,
      isoX: toIsoX(hen.x, hen.y),
      isoY: toIsoY(hen.x, hen.y),
      facing: hen.facing,
      moving: hen.moving,
      hp: hen.hp,
    },
  }),
  /** Canvas-pixel center of card `i` while cards are open (for real clicks and taps). */
  cardCenter(i) {
    const r = cardRect(i, game.cards.length);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  },
  /** Dev cheats, the playtest's shortcuts to states that take minutes to reach. */
  cheat: {
    /** Fills the XP bar: the cards open on the next step. */
    levelUp() {
      game.xp = Math.max(game.xp, xpToNext(game.level));
    },
    damage(amount) {
      damageHen(amount, hen.x + 1, hen.y);
    },
    /** Spawns `n` predators of a kind ('rat', 'fox', 'snake', 'crow', 'badger') just off-screen. */
    spawn(kind = 'rat', n = 1) {
      const index = Math.max(0, ENEMY_TYPES.findIndex((type) => type.name === kind));
      for (let i = 0; i < n; i++) spawnEnemy(index);
    },
    /** Spawns one predator of each kind in a row in front of the hen, standing still. */
    lineup() {
      ENEMY_TYPES.forEach((type, i) => {
        const e = spawnEnemy(i, hen.x + 2 + i * 1.2, hen.y - 2 - i * 1.2);
        if (e) {
          e.speed = 0;
          e.hp = e.maxHp = 1e9;
        }
      });
    },
    setTime(seconds) {
      game.time = seconds;
    },
    /** Raises item `id` to `level` (ignoring slots) and dresses the hen for it. */
    give(id, level = 1) {
      while ((build[id] || 0) < level) applyCard({ id });
      syncHenStats();
      bakeHen(outfitOf(build));
    },
    /** Every item at `level`: the fully dressed hen. */
    giveAll(level = 5) {
      for (const item of ITEMS) window.__qq.cheat.give(item.id, level);
    },
  },
};

// --- Watch-mode bot --------------------------------------------------------------------------
if (!externalDriver) {
  const label = document.createElement('div');
  label.style.cssText =
    'position:fixed;bottom:6px;left:6px;padding:2px 6px;font:bold 12px monospace;color:#fff;' +
    'background:rgba(29,26,47,.7);border-radius:3px;pointer-events:none;z-index:1';
  document.body.appendChild(label);

  const bot = createBot();
  const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  let tapped = null;
  let wasOver = false;

  const drive = () => {
    if (tapped) {
      holdKey(tapped, false);
      tapped = null;
    }
    const { keys, tap } = bot.decide({ hen, enemies, corn, game, cards: cardsWithKind() });
    for (const code of MOVE_KEYS) holdKey(code, keys.includes(code));
    if (tap) {
      holdKey(tap, true);
      tapped = tap;
    }
    if (game.over && !wasOver) record.runs++;
    wasOver = game.over;
    record.maxLevel = Math.max(record.maxLevel, game.level);
    record.maxKills = Math.max(record.maxKills, game.kills);
    record.maxTime = Math.max(record.maxTime, game.time);
    label.textContent =
      `AUTOPLAY x${speed} · ${formatClock(game.time)} · LV ${game.level} · KILLS ${game.kills}` +
      ` · BEST ${formatClock(game.best)}${settings.peaceful ? ' · PEACEFUL' : ''}`;
    requestAnimationFrame(drive);
  };
  requestAnimationFrame(drive);
}
