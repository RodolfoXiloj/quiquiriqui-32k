// Dev-only balance meter (never shipped). Plays the bot (tools/browser/bot.js) over several seeds,
// with the same headless simulation as the tests, and prints for each run: when the hen fell (or
// DAWN), her level at 3:00 and at the end, when she was first hurt, how much of the run was calm
// (fewer than 4 predators on screen), the golden eggs it earned, and the predators on screen / her
// health each minute. A summary follows: the median, fastest and slowest fall, and how many runs
// reached dawn.
//
// --favor <id> makes the bot take that item whenever a card offers it; --items runs every item as
// the favorite in turn and prints how long the bot lasts with each (does the choice matter?).
//
// The bot stands in for a new player (a person dodges better), so read it as a floor.
//
// Usage: npm run balance -- [--seeds 8] [--peril 0] [--shop 0] [--hen 0] [--favor peck] [--items]
//   --peril takes one level or a list (0,1,2); --shop takes one level for all five upgrades (3) or
//   five levels (5,0,0,2,0).
import { resetRun, playWithBot, game, hen, enemies } from '../test/harness.js';
import { createBot } from './browser/bot.js';
import { onScreen } from '../src/enemies.js';
import { eggsEarned, SHOP } from '../src/profile.js';
import { ITEMS, build } from '../src/items.js';
import { formatClock } from '../src/state.js';
import { RUN_LENGTH } from '../src/weather.js';

function option(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

const seeds = Number(option('seeds', 8));
const perils = option('peril', '0').split(',').map(Number);
const shopArg = option('shop', '0').split(',').map(Number);
const shop = shopArg.length === 1 ? SHOP.map(() => shopArg[0]) : shopArg;
const henChoice = Number(option('hen', 0));
const favorArg = option('favor', null);
/** Fewer predators than this on screen counts as calm. */
const CALM = 4;

const median = (list) => {
  const s = [...list].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;

/** The bot, taking item `favor` whenever a card offers it (and any card of it, hatch included). */
function botFavoring(favor) {
  const base = createBot();
  if (!favor) return base;
  return {
    decide(world) {
      if (world.cards.length && world.game.cardLock <= 0) {
        const i = world.cards.findIndex((card) => card.id === favor);
        if (i >= 0) return { keys: [], tap: `Digit${i + 1}` };
      }
      return base.decide(world);
    },
  };
}

/** One run; returns what the report needs. */
function runOnce(seed, peril, favor) {
  resetRun({ peaceful: false, seed, peril, hen: henChoice, shop });
  let calm = 0;
  let frames = 0;
  let firstHurt = null;
  let lastHp = hen.hp;
  let levelAt3 = null;
  const minutes = [];
  playWithBot(RUN_LENGTH / 5 + 5, {
    bot: botFavoring(favor),
    onFrame() {
      if (game.started && !game.over) {
        frames++;
        const near = enemies.filter((e) => e.alive && !e.prop && onScreen(e.x, e.y)).length;
        if (near < CALM) calm++;
        if (firstHurt === null && hen.hp < lastHp) firstHurt = game.time;
        lastHp = hen.hp;
        if (levelAt3 === null && game.time >= 180) levelAt3 = game.level;
        const minute = Math.floor(game.time / 60);
        if (minute >= 1 && !minutes[minute]) minutes[minute] = `${near}/${Math.round(hen.hp)}`;
      }
      return game.over;
    },
  });
  const won = game.won;
  return {
    won,
    time: won ? RUN_LENGTH : game.time,
    level: game.level,
    levelAt3,
    firstHurt,
    calm: Math.round((100 * calm) / Math.max(1, frames)),
    eggs: eggsEarned(game.time, game.kills, won, peril) + game.eggBonus,
    minutes,
    favorLevel: favor ? build[favor] || 0 : 0,
  };
}

if (process.argv.includes('--items')) {
  // Does the choice matter? How long the bot lasts when it favors each item.
  const peril = perils[0];
  console.log(`\nFAVORITE ITEM · peril ${peril} · shop ${shop.join(',')} · ${seeds} seeds`);
  let base = 0;
  for (const favor of [null, ...ITEMS.map((item) => item.id)]) {
    const runs = [];
    for (let seed = 1; seed <= seeds; seed++) runs.push(runOnce(seed, peril, favor));
    const m = mean(runs.map((r) => r.time));
    if (!favor) base = m;
    const delta = favor ? `${m >= base ? '+' : ''}${Math.round((100 * (m - base)) / base)}%` : 'base';
    console.log(
      `  ${(favor || 'none').padEnd(8)} mean ${formatClock(m)} (${delta.padStart(5)})  median ${formatClock(median(runs.map((r) => r.time)))}` +
        `  · its level ${runs.map((r) => r.favorLevel).join(' ')}`
    );
  }
} else {
  for (const peril of perils) {
    console.log(`\nPERIL ${peril} · shop ${shop.join(',')} · hen ${henChoice}${favorArg ? ` · favors ${favorArg}` : ''} · ${seeds} seeds`);
    const runs = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const r = runOnce(seed, peril, favorArg);
      runs.push(r);
      const end = r.won ? ' DAWN' : formatClock(r.time);
      const hurt = r.firstHurt === null ? ' none' : formatClock(r.firstHurt);
      console.log(
        `  seed ${String(seed).padStart(2)}  ${end}  lv${String(r.levelAt3 ?? '-').padStart(2)}→${String(r.level).padEnd(3)} hurt ${hurt}  ` +
          `calm ${String(r.calm).padStart(2)}%  eggs ${String(r.eggs).padStart(3)}  | ` +
          r.minutes.slice(1).map((m) => m || '-').join(' ')
      );
    }
    const falls = runs.map((r) => r.time);
    console.log(
      `  → fall: median ${formatClock(median(falls))}, fastest ${formatClock(Math.min(...falls))}, slowest ${formatClock(Math.max(...falls))}` +
        ` · dawns ${runs.filter((r) => r.won).length}/${seeds}` +
        ` · first hurt: median ${formatClock(median(runs.map((r) => r.firstHurt ?? RUN_LENGTH)))}` +
        ` · level at 3:00: median ${median(runs.map((r) => r.levelAt3 ?? r.level))} · eggs: median ${median(runs.map((r) => r.eggs))}`
    );
  }
}
