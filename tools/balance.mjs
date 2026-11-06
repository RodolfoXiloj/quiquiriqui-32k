// Dev-only balance meter (never shipped). Plays the bot (tools/browser/bot.js) over several seeds,
// with the same headless simulation as the tests, for --minutes (10, the first dawn, by default),
// and prints for each run: when the hen fell (or UP, still standing at the end), her level at 3:00
// and at the end, when she was first hurt, how much of the run was calm (fewer than 4 predators on
// screen), the golden eggs it earned, and the predators on screen / her health each minute. A
// summary follows: the median, fastest and slowest fall, and how many runs were still standing.
// Then, minute by minute (medians of the runs still standing): her level, the experience earned
// so far, the hits a typical predator on screen takes ("hits per foe": their average health over
// her average hit, read from the damage numbers) and her health. Hits per foe that stay flat while
// she levels mean the predators fall behind her.
//
// --god keeps her from falling, to measure how fast she levels over a long run (--minutes 30).
//
// --favor <id> makes the bot take that item whenever a card offers it; --items runs every item as
// the favorite in turn and prints how long the bot lasts with each (does the choice matter?).
//
// The bot stands in for a new player (a person dodges better), so read it as a floor.
//
// Usage: npm run balance -- [--seeds 8] [--peril 0] [--shop 0] [--hen 0] [--favor peck] [--items]
//                            [--minutes 10] [--god]
//   --peril takes one level or a list (0,1,2); --shop takes one level for all five upgrades (3) or
//   five levels (5,0,0,2,0).
import { resetRun, playWithBot, game, hen, enemies } from '../test/harness.js';
import { createBot } from './browser/bot.js';
import { onScreen } from '../src/enemies.js';
import { popups } from '../src/pool.js';
import { eggsEarned, SHOP } from '../src/profile.js';
import { ITEMS, build } from '../src/items.js';
import { formatClock, xpToNext } from '../src/state.js';

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
/** Seconds each run lasts at most, and whether she can fall. */
const LENGTH = Number(option('minutes', 10)) * 60;
const god = process.argv.includes('--god');
/** Fewer predators than this on screen counts as calm. */
const CALM = 4;

const median = (list) => {
  const s = [...list].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
/** A damage number on a predator (not her bites, heals or MISS). */
const isHit = (p) => p.alive && /^\d+$/.test(p.text);
/** Experience she has earned so far in the run. */
function xpEarned() {
  let xp = game.xp;
  for (let level = 1; level < game.level; level++) xp += xpToNext(level);
  return xp;
}

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
  // Per minute: her level and health as it starts, damage numbers seen, foe health on screen
  const byMinute = [];
  // Each popup's spot when last seen: a number at a new spot is a new hit
  const seen = new Map();
  playWithBot(LENGTH / 5 + 5, {
    bot: botFavoring(favor),
    onFrame() {
      if (god) hen.hp = hen.maxHp = 1e9;
      if (game.started && !game.over) {
        frames++;
        const m = Math.floor(game.time / 60);
        const b = (byMinute[m] ||= { level: game.level, xp: xpEarned(), health: hen.hp / hen.maxHp, hit: 0, hits: 0, foe: 0, foes: 0 });
        for (const p of popups) {
          const spot = p.alive ? `${p.x},${p.y}` : '';
          if (isHit(p) && seen.get(p) !== spot) {
            b.hit += Number(p.text);
            b.hits++;
          }
          seen.set(p, spot);
        }
        for (const e of enemies) {
          if (!e.alive || e.prop || e.boss || e.elite || !onScreen(e.x, e.y)) continue;
          b.foe += e.maxHp;
          b.foes++;
        }
        const near = enemies.filter((e) => e.alive && !e.prop && onScreen(e.x, e.y)).length;
        if (near < CALM) calm++;
        if (firstHurt === null && hen.hp < lastHp) firstHurt = game.time;
        lastHp = hen.hp;
        if (levelAt3 === null && game.time >= 180) levelAt3 = game.level;
        const minute = Math.floor(game.time / 60);
        if (minute >= 1 && !minutes[minute]) minutes[minute] = `${near}/${Math.round(hen.hp)}`;
      }
      return game.over || game.time >= LENGTH;
    },
  });
  const up = !game.over;
  return {
    up,
    time: up ? LENGTH : game.time,
    level: game.level,
    levelAt3,
    firstHurt,
    calm: Math.round((100 * calm) / Math.max(1, frames)),
    eggs: eggsEarned(game.time, game.kills, game.day > 1, peril) + game.eggBonus,
    minutes,
    byMinute: byMinute.map((b) => b && { level: b.level, xp: b.xp, health: b.health, perFoe: b.hits && b.foes ? b.foe / b.foes / (b.hit / b.hits) : null }),
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
    console.log(
      `\nPERIL ${peril} · shop ${shop.join(',')} · hen ${henChoice}${favorArg ? ` · favors ${favorArg}` : ''} · ${seeds} seeds · ` +
        `${LENGTH / 60} min${god ? ' · she cannot fall' : ''}`
    );
    const runs = [];
    for (let seed = 1; seed <= seeds; seed++) {
      const r = runOnce(seed, peril, favorArg);
      runs.push(r);
      const end = r.up ? '   UP' : formatClock(r.time);
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
        ` · standing ${runs.filter((r) => r.up).length}/${seeds}` +
        ` · first hurt: median ${formatClock(median(runs.map((r) => r.firstHurt ?? LENGTH)))}` +
        ` · level at 3:00: median ${median(runs.map((r) => r.levelAt3 ?? r.level))} · eggs: median ${median(runs.map((r) => r.eggs))}`
    );
    // Minute by minute, over the runs still standing
    const rows = [];
    for (let m = 0; m < LENGTH / 60; m++) {
      const here = runs.map((r) => r.byMinute[m]).filter(Boolean);
      if (!here.length) break;
      const perFoe = here.map((b) => b.perFoe).filter((v) => v !== null);
      rows.push(
        `${m}:00 lv ${median(here.map((b) => b.level))} · xp ${Math.round(median(here.map((b) => b.xp)))} · ` +
          `${perFoe.length ? median(perFoe).toFixed(1) : '-'} hits/foe · ` +
          `${Math.round(100 * median(here.map((b) => b.health)))}% (${here.length})`
      );
    }
    console.log('  → by minute: level · experience · hits per foe · health (runs standing)\n    ' + rows.join('\n    '));
  }
}
