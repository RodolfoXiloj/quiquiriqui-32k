// Dev-only balance meter (never shipped). Plays the bot (tools/browser/bot.js) over several seeds,
// with the same headless simulation as the tests, and prints for each run: when the hen fell (or
// DAWN), her level, when she was first hurt, how much of the run was calm (fewer than 4 predators
// on screen), the golden eggs it earned, and the predators on screen / her health each minute.
// A summary follows: the median, fastest and slowest fall, and how many runs reached dawn.
//
// The bot stands in for a new player (a person dodges better), so read it as a floor.
//
// Usage: npm run balance -- [--seeds 8] [--peril 0] [--shop 0] [--hen 0]
//   --peril takes one level or a list (0,1,2); --shop takes one level for all five upgrades (3) or
//   five levels (5,0,0,2,0).
import { resetRun, playWithBot, game, hen, enemies } from '../test/harness.js';
import { onScreen } from '../src/enemies.js';
import { eggsEarned, SHOP } from '../src/profile.js';
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
/** Fewer predators than this on screen counts as calm. */
const CALM = 4;

const median = (list) => {
  const s = [...list].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

for (const peril of perils) {
  console.log(`\nPERIL ${peril} · shop ${shop.join(',')} · hen ${henChoice} · ${seeds} seeds`);
  const falls = [];
  const hurts = [];
  const eggs = [];
  let dawns = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    resetRun({ peaceful: false, seed, peril, hen: henChoice, shop });
    let calm = 0;
    let frames = 0;
    let firstHurt = null;
    let lastHp = hen.hp;
    const minutes = [];
    playWithBot(RUN_LENGTH / 5 + 5, {
      onFrame() {
        if (game.started && !game.over) {
          frames++;
          const near = enemies.filter((e) => e.alive && !e.prop && onScreen(e.x, e.y)).length;
          if (near < CALM) calm++;
          if (firstHurt === null && hen.hp < lastHp) firstHurt = game.time;
          lastHp = hen.hp;
          const minute = Math.floor(game.time / 60);
          if (minute >= 1 && !minutes[minute]) minutes[minute] = `${near}/${Math.round(hen.hp)}`;
        }
        return game.over;
      },
    });
    const won = game.won;
    if (won) dawns++;
    falls.push(won ? RUN_LENGTH : game.time);
    hurts.push(firstHurt ?? RUN_LENGTH);
    const earned = eggsEarned(game.time, game.kills, won, peril) + game.eggBonus;
    eggs.push(earned);
    const end = won ? ' DAWN' : formatClock(game.time);
    const hurt = firstHurt === null ? ' none' : formatClock(firstHurt);
    console.log(
      `  seed ${String(seed).padStart(2)}  ${end}  lv${String(game.level).padEnd(3)} hurt ${hurt}  ` +
        `calm ${String(Math.round((100 * calm) / Math.max(1, frames))).padStart(2)}%  eggs ${String(earned).padStart(3)}  | ` +
        minutes.slice(1).map((m) => m || '-').join(' ')
    );
  }
  console.log(
    `  → fall: median ${formatClock(median(falls))}, fastest ${formatClock(Math.min(...falls))}, slowest ${formatClock(Math.max(...falls))}` +
      ` · dawns ${dawns}/${seeds} · first hurt: median ${formatClock(median(hurts))} · eggs: median ${median(eggs)}`
  );
}
