import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetRun,
  play,
  start,
  tapKey,
  playWithBot,
  update,
  STEP,
  SPEED,
  handleBlur,
  holdKey,
  releaseAllInput,
  input,
  hen,
  game,
  enemies,
  corn,
} from './harness.js';
import { tapAt } from '../src/input.js';
import { toIsoX, toIsoY } from '../src/iso.js';
import { groundTileAt, GROUND_PALETTE_INDICES } from '../src/ground.js';
import {
  HEN_PALETTE_INDICES,
  ENEMY_PALETTE_INDICES,
  HEN_W,
  HEN_H,
  WORN_ITEMS,
  henShape,
  henLook,
  outfitOf,
  outfitKey,
  iconSprites,
  eggSprites,
  chickSprite,
} from '../src/sprites.js';
import {
  HUD_STRINGS,
  HUD_SCALES,
  CARD_W,
  CARD_NAME_SCALE,
  CARD_TEXT_SCALE,
  textWidth,
  gameOverLine,
  cardRect,
  cardAt,
  perilLine,
  henLine,
  shopLine,
  shopCost,
  shopRowAt,
  shopRowY,
  titleRowY,
  titleScale,
  SHOP_ROW,
  viewOrigin,
  HEALTH_BAR,
  healthText,
} from '../src/render.js';
import { frameAlpha } from '../src/main.js';
import { WIDTH, HEIGHT, MIN_HEIGHT, MAX_HEIGHT, fitScreen, screenScale } from '../src/screen.js';
import { formatClock, xpToNext } from '../src/state.js';
import {
  RAT,
  FOX,
  SNAKE,
  CROW,
  BADGER,
  CRATE,
  MAGPIE,
  WEASEL,
  SKUNK,
  clouds,
  CLOUD_TIME,
  makeElite,
  ELITE_HP,
  RAINBOW_HP,
  ELITE_SPEED,
  ELITE_EGGS,
  DASH_WARN,
  DASH_TIME,
  HOP_TIME,
  HOP_EVERY,
  ENEMY_TYPES,
  MAX_ENEMIES,
  shots,
  SHOT_EVERY,
  SHOT_LIFE,
  NO_MERCY_SPEED,
  BOSS_ARMOR,
  MIN_HIT,
  BIG_HIT,
  CRIT_MULT,
  BOSS_HP,
  BOSS_SIZE,
  BOSS_BITE,
  SPAWN_MAX,
  DAY_HP,
  bossName,
  spawnEnemy,
  spawnBoss,
  hitEnemy,
  screenOffset,
  countEnemies,
  clearEnemies,
} from '../src/enemies.js';
import { pickups, spawnPickup, CHEST, MAGNET, BOMB, FOOD } from '../src/pickups.js';
import { TIMELINE, CRATE_EVERY, pickKind, ELITE_FROM, RAINBOW_FROM, FRENZY_RATE, quota, QUOTA, NO_MERCY_QUOTA } from '../src/waves.js';
import {
  EVENTS,
  EVENT_FROM,
  EVENT_GAP,
  MORE_GAP,
  HAWK,
  STAMPEDE,
  SURROUNDED,
  FRENZY,
  HAWK_DIVES,
  HAWK_HUNT,
  HAWK_STRIKE,
  HAWK_CYCLE,
  HAWK_DMG,
  RING_R,
  FRENZY_TIME,
  hawk,
  startEvent,
} from '../src/events.js';
import { spawnCorn, MAX_CORN } from '../src/corn.js';
import {
  HATCH_LEVEL,
  hatchReady,
  weaponStat,
  ITEMS,
  BOONS,
  ITEM_BY_ID,
  MAX_ITEM_LEVEL,
  SLOTS,
  build,
  buildOrder,
  boons,
  applyCard,
  rollCards,
  cardText,
  cardHint,
  stats,
  weaponDamage,
  weaponCooldown,
} from '../src/items.js';
import { projectiles, chicks, KERNEL } from '../src/weapons.js';
import { HEN_SPEED, HEN_RADIUS, START_HP, damageHen, syncHenStats } from '../src/hen.js';
import { particles, popups, bolts, POPUP_LIFE } from '../src/pool.js';
import { weatherAt, RUN_LENGTH } from '../src/weather.js';
import { GLYPHS, GLYPH_W, GLYPH_H } from '../src/font.js';
import {
  profile,
  PERIL,
  MAX_PERIL,
  PERIL_RULES,
  PERIL_NAMES,
  MORE_EVENTS,
  ELITES_X2,
  TWO_BOSSES,
  HOPS,
  TWO_CARDS,
  NO_MERCY,
  HENS,
  SHOP,
  SHOP_COSTS,
  unlockAfterDawn,
  loadProfile,
  choosePeril,
  eggsEarned,
  buyUpgrade,
} from '../src/profile.js';
import { audio, sfxKill, sfxLevelUp, sfxPeck, HIT_SOUNDS } from '../src/sfx.js';
import { music, PARTS, notesAt, sectionLength } from '../src/music.js';

/** Holds `code` for `seconds` of scenario time and returns the hen's screen-space shift. */
function walk(code, seconds) {
  const x0 = toIsoX(hen.x, hen.y);
  const y0 = toIsoY(hen.x, hen.y);
  holdKey(code, true);
  play(seconds);
  holdKey(code, false);
  return { dx: toIsoX(hen.x, hen.y) - x0, dy: toIsoY(hen.x, hen.y) - y0 };
}

/** A predator that cannot die, for tests about movement and contact. */
function sturdy(kind, x, y) {
  const e = spawnEnemy(kind, x, y);
  e.hp = e.maxHp = 1e9;
  return e;
}

const alive = (pool) => pool.filter((item) => item.alive);

/** Feeds the hen exactly enough corn for her first level-up and steps until the cards open. */
function openFirstCards() {
  for (let i = 0; i < xpToNext(1); i++) spawnCorn(hen.x + 0.5, hen.y, 1, 0);
  for (let i = 0; i < 300 && !game.cards.length; i++) update(STEP);
  assert.equal(game.cards.length, 3, 'the cards did not open');
}

/** Steps `seconds` of game time one fixed step at a time. */
function steps(seconds) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) update(STEP);
}

/** Ends the run: she falls, and a key after the game-over wait goes back to the title. */
function endRun() {
  damageHen(1e9, hen.x + 1, hen.y);
  steps(1.6);
  tapKey('Space');
  steps(0.7); // past the title lock
}

/** Kills every predator, kernel and prize (between checks in one test). */
function clearAll() {
  for (const pool of [enemies, corn, pickups]) for (const item of pool) item.alive = false;
}

/** Starts a run whose only weapon is `id`, so other weapons do not interfere. */
function armedWith(id) {
  start();
  for (const key of Object.keys(build)) delete build[key];
  buildOrder.length = 0;
  applyCard({ id });
}

/** The hen's 30x24 shape as a flat array of palette indices, for one pose and outfit. */
function henGrid(outfit, step = 'idle') {
  const shape = henShape(step, outfit);
  const grid = [];
  for (let y = 1; y < HEN_H - 1; y++) for (let x = 1; x < HEN_W - 1; x++) grid.push(shape(x, y));
  return grid.join(',');
}

/** The colors of the hen's shape in sprite columns [x0, x1) and rows [y0, y1), one string per pose. */
function henPatch(outfit, step, x0, x1, y0, y1) {
  const shape = henShape(step, outfit);
  const cells = [];
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cells.push(shape(x, y));
  return cells;
}

describe('quiquiriqui at 5x: moving around', () => {
  beforeEach(() => {
    resetRun();
  });

  it('boots on the title screen with a healthy hen at the origin', () => {
    assert.equal(game.started, false);
    assert.equal(game.time, 0);
    assert.equal(hen.hp, hen.maxHp);
    assert.equal(hen.x, 0);
    assert.equal(hen.y, 0);
  });

  it('waits on the title screen until the first input', () => {
    play(1);
    assert.equal(game.started, false);
    assert.equal(game.time, 0);
  });

  it('walking, she holds her pixel on screen and the meadow never steps back, at 60 or 144 Hz', () => {
    for (const hz of [60, 144]) {
      for (const keys of [['KeyD'], ['KeyD', 'KeyW'], ['KeyS']]) {
        resetRun();
        start();
        for (const k of keys) holdKey(k, true);
        let acc = 0;
        let last = null;
        const spots = new Set();
        const moves = new Set();
        // Frames as a display at `hz` shows them: whole steps, then a blend of the last two
        for (let f = 0; f < hz * 2; f++) {
          acc += 1 / hz;
          while (acc >= STEP) {
            update(STEP);
            acc -= STEP;
          }
          const { camX, camY, ix, iy } = viewOrigin(frameAlpha(acc / STEP));
          // After a second the camera has settled behind her
          if (f >= hz) {
            spots.add(`${Math.round(ix - camX)},${Math.round(iy - camY)}`);
            moves.add(`${Math.sign(camX - last.camX)},${Math.sign(camY - last.camY)}`);
            assert.ok(Math.abs(camX - last.camX) <= 2 && Math.abs(camY - last.camY) <= 2, `a jump at ${hz} Hz`);
          }
          last = { camX, camY };
        }
        for (const k of keys) holdKey(k, false);
        assert.equal(spots.size, 1, `${keys} at ${hz} Hz: she wobbles between ${[...spots].join(' ')}`);
        const back = [...moves].map((m) => m.split(',').map(Number));
        for (const axis of [0, 1]) {
          assert.ok(!(back.some((m) => m[axis] > 0) && back.some((m) => m[axis] < 0)), `${keys} at ${hz} Hz: the meadow stepped back`);
        }
      }
    }
  });

  it('a frozen step (cards open) draws the latest state, not a blend of two', () => {
    holdKey('KeyD', true);
    play(1);
    assert.equal(frameAlpha(0.3), 0.3, 'a moving step blends');
    game.cards = [{ id: 'egg', level: 2 }];
    update(STEP);
    assert.equal(frameAlpha(0.3), 1, 'a frozen step blends');
    const a = viewOrigin(frameAlpha(0.1));
    const b = viewOrigin(frameAlpha(0.9));
    assert.deepEqual([a.camX, a.camY], [b.camX, b.camY], 'the view moves while frozen');
    holdKey('KeyD', false);
  });

  it('the first move starts the run and the clock', () => {
    holdKey('KeyD', true);
    play(1);
    assert.equal(game.started, true);
    assert.ok(game.time > 4.9 && game.time <= 5.01, `time ${game.time}`);
  });

  it('D walks screen-right and W walks screen-up', () => {
    const right = walk('KeyD', 0.2);
    assert.ok(right.dx > 10, `dx ${right.dx}`);
    assert.ok(Math.abs(right.dy) < 1e-6, `dy ${right.dy}`);
    const up = walk('KeyW', 0.2);
    assert.ok(up.dy < -5, `dy ${up.dy}`);
    assert.ok(Math.abs(up.dx) < 1e-6, `dx ${up.dx}`);
  });

  it('she runs at least 60 screen pixels a second sideways', () => {
    holdKey('KeyD', true);
    update(STEP); // the first input starts the run
    const x0 = toIsoX(hen.x, hen.y);
    for (let i = 0; i < 60; i++) update(STEP);
    holdKey('KeyD', false);
    assert.ok(toIsoX(hen.x, hen.y) - x0 >= 60, `${(toIsoX(hen.x, hen.y) - x0).toFixed(1)} px in 1 s`);
  });

  it('the hen faces the way she walks', () => {
    walk('KeyA', 0.1);
    assert.equal(hen.facing, -1);
    walk('KeyD', 0.1);
    assert.equal(hen.facing, 1);
  });

  it('the meadow is stable per cell and varied across cells', () => {
    const counts = new Map();
    let cells = 0;
    for (let cy = -20; cy < 20; cy++) {
      for (let cx = -20; cx < 20; cx++) {
        const type = groundTileAt(cx, cy);
        assert.equal(groundTileAt(cx, cy), type);
        counts.set(type, (counts.get(type) || 0) + 1);
        cells++;
      }
    }
    assert.ok(counts.size >= 4, `only ${counts.size} tile types`);
    for (const n of counts.values()) assert.ok(n / cells < 0.7);
  });

  it('losing focus pauses the clock until the next input', () => {
    holdKey('KeyD', true);
    play(0.2);
    handleBlur();
    assert.equal(game.paused, true);
    const t = game.time;
    const x = hen.x;
    play(1);
    assert.equal(game.time, t);
    assert.equal(hen.x, x);
    input.anyAction = true;
    update(STEP);
    assert.equal(game.paused, false);
  });

  it('losing focus on the title screen does not pause', () => {
    handleBlur();
    assert.equal(game.paused, false);
  });

  it('releasing all input stops the hen', () => {
    holdKey('KeyS', true);
    play(0.1);
    releaseAllInput();
    update(STEP);
    assert.equal(hen.moving, false);
    assert.equal(input.moveX, 0);
  });
});

describe('quiquiriqui at 5x: predators', () => {
  beforeEach(() => {
    resetRun({ peaceful: false });
  });

  it('predators appear just outside the screen and close in on the hen', () => {
    start();
    play(0.4); // 2 s of play: the first rats are out
    const fresh = alive(enemies);
    assert.ok(fresh.length >= 2, `only ${fresh.length} predators`);
    const newest = fresh.filter((e) => e.age < 0.6);
    assert.ok(newest.length > 0);
    for (const e of newest) {
      const { sx, sy } = screenOffset(e.x, e.y);
      assert.ok(Math.abs(sx) > WIDTH / 2 - 4 || Math.abs(sy) > HEIGHT / 2 - 4, `spawned on screen at ${sx}, ${sy}`);
    }
    const watched = fresh[0];
    const d0 = Math.hypot(watched.x - hen.x, watched.y - hen.y);
    const age0 = watched.age;
    play(0.4);
    // Pool objects are reused: only judge the same rat (still alive, and older than before).
    if (watched.alive && watched.age > age0) {
      assert.ok(Math.hypot(watched.x - hen.x, watched.y - hen.y) < d0, 'the rat did not come closer');
    }
  });

  it('a crowd spreads out instead of stacking on one spot', () => {
    resetRun();
    start();
    for (let i = 0; i < 30; i++) sturdy(RAT, 5 + i * 0.001, 5);
    play(0.2);
    const crowd = alive(enemies);
    let closest = Infinity;
    for (let i = 0; i < crowd.length; i++) {
      for (let j = i + 1; j < crowd.length; j++) {
        closest = Math.min(closest, Math.hypot(crowd[i].x - crowd[j].x, crowd[i].y - crowd[j].y));
      }
    }
    assert.ok(closest > 0.3, `two rats only ${closest.toFixed(3)} tiles apart`);
  });

  it('enemy colors never match the meadow', () => {
    for (const idx of ENEMY_PALETTE_INDICES) assert.equal(GROUND_PALETTE_INDICES.includes(idx), false, `index ${idx}`);
  });

  it('the hen never wears meadow colors', () => {
    for (const idx of HEN_PALETTE_INDICES) assert.equal(GROUND_PALETTE_INDICES.includes(idx), false);
  });

  it('a predator bites at most every 0.5 s, and Pot Helmet takes the edge off', () => {
    resetRun();
    start();
    buildOrder.length = 0; // no weapons: nothing knocks the rat away
    const rat = sturdy(RAT, hen.x + 0.2, hen.y);
    play(0.2); // 1 s of contact
    const bites = (START_HP - hen.hp) / rat.dmg;
    assert.ok(Number.isInteger(bites) && bites >= 2 && bites <= 3, `${bites} bites in 1 s`);
    applyCard({ id: 'helmet' });
    applyCard({ id: 'helmet' });
    const before = hen.hp;
    damageHen(100, rat.x, rat.y);
    assert.equal(before - hen.hp, 80, 'two pots should take 20% off a bite');
  });

  it('the predator pool never overflows', () => {
    resetRun();
    start();
    for (let i = 0; i < MAX_ENEMIES + 20; i++) spawnEnemy(FOX, 20, 0);
    assert.equal(countEnemies(), MAX_ENEMIES);
  });
});

describe('quiquiriqui at 5x: no safe direction, on any screen', () => {
  /** Plays a run holding `keys`, picking the first card and closing chests; returns when she was first bitten and when she fell. */
  function holdThrough(keys, limit) {
    resetRun({ peaceful: false, seed: 1 });
    for (const k of keys) holdKey(k, true);
    let bitten = null;
    while (!game.over && game.time < limit) {
      play(0.1);
      if (bitten === null && hen.hp < hen.maxHp) bitten = game.time;
      if (game.cards.length && game.cardLock <= 0) tapKey('Digit1');
      if (game.reward.length && game.rewardLock <= 0) tapKey('Space');
    }
    for (const k of keys) holdKey(k, false);
    return { bitten, fell: game.over ? game.time : null };
  }

  /** Newborn predators (seen in their first frame) over `seconds` of game time: their offsets from the hen. */
  function births(seconds) {
    const seen = [];
    const end = game.time + seconds;
    while (game.time < end && !game.over) {
      hen.hp = hen.maxHp = 1e6; // a pick re-syncs her health, so keep her standing every frame
      play(1 / 60);
      for (const e of enemies) if (e.alive && !e.prop && !e.boss && e.age <= 5 * STEP + 1e-9) seen.push({ dx: e.x - hen.x, dy: e.y - hen.y });
      if (game.cards.length && game.cardLock <= 0) tapKey('Digit1');
      if (game.reward.length && game.rewardLock <= 0) tapKey('Space');
    }
    return seen;
  }

  for (const [w, h] of [[320, 180], [390, 844]]) {
    for (const key of ['KeyW', 'KeyS']) {
      it(`holding ${key} on a ${w}x${h} screen gets her bitten soon and eaten before 4:00`, () => {
        try {
          fitScreen(w, h);
          const { bitten, fell } = holdThrough([key], 240);
          assert.ok(bitten !== null && bitten < 90, `first bite at ${bitten}`);
          assert.ok(fell !== null, 'she survived four minutes running in a straight line');
        } finally {
          fitScreen(WIDTH, MIN_HEIGHT);
        }
      });
    }
  }

  it('standing still on a tall screen, predators are born all around her and never too far', () => {
    try {
      fitScreen(390, 844);
      resetRun({ peaceful: false });
      start();
      const seen = births(90);
      assert.ok(seen.length > 100, `${seen.length} births`);
      const quarters = [0, 0, 0, 0];
      for (const { dx, dy } of seen) {
        assert.ok(Math.hypot(dx, dy) <= SPAWN_MAX + 1e-6, `born ${Math.hypot(dx, dy).toFixed(1)} tiles away`);
        quarters[Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 4) % 4]++;
      }
      for (const n of quarters) assert.ok(n / seen.length >= 0.15, `quarters ${quarters}`);
    } finally {
      fitScreen(WIDTH, MIN_HEIGHT);
    }
  });

  it('while she walks, most predators are born in front of her', () => {
    resetRun({ peaceful: false });
    holdKey('KeyD', true);
    const seen = births(40);
    holdKey('KeyD', false);
    const ahead = seen.filter(({ dx, dy }) => dx * hen.dirX + dy * hen.dirY > 0).length;
    assert.ok(ahead / seen.length >= 0.55, `${ahead} of ${seen.length} born ahead`);
  });
});

describe('quiquiriqui at 5x: weapons, corn and cards', () => {
  beforeEach(() => {
    resetRun();
  });

  it('Egg Toss kills a rat that comes close', () => {
    start();
    spawnEnemy(RAT, hen.x + 4, hen.y - 4);
    play(0.6);
    assert.equal(game.kills, 1);
    assert.equal(countEnemies(), 0);
  });

  it('most kills drop corn', () => {
    start();
    let drops = 0;
    for (let i = 0; i < 100; i++) {
      const before = alive(corn).length;
      const rat = spawnEnemy(RAT, hen.x + 30 + i, hen.y);
      rat.hp = 1;
      hitEnemy(rat, 5, hen.x, hen.y);
      if (alive(corn).length > before) drops++;
    }
    assert.ok(drops >= 68 && drops <= 92, `${drops} drops in 100 kills (80% expected)`);
  });

  it('the starting corn spreads evenly all around her, on screen and never clumped', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      resetRun({ peaceful: false, seed });
      start();
      const kernels = corn.filter((c) => c.alive);
      assert.equal(kernels.length, 12);
      // On screen, around her (screen pixels from her)
      const spots = kernels.map((c) => [toIsoX(c.x - hen.x, c.y - hen.y), toIsoY(c.x - hen.x, c.y - hen.y)]);
      for (const [sx, sy] of spots) assert.ok(Math.abs(sx) < WIDTH / 2 - 10 && Math.abs(sy) < HEIGHT / 2 - 10, `a kernel off screen at ${sx}, ${sy}`);
      // All beyond her starting reach (3 tiles): she walks to eat them
      for (const c of kernels) assert.ok(Math.hypot(c.x - hen.x, c.y - hen.y) > 3.2, 'a kernel within her reach at the start');
      for (const [name, side] of [['right', ([x]) => x > 0], ['left', ([x]) => x < 0], ['below', ([, y]) => y > 0], ['above', ([, y]) => y < 0]]) {
        assert.ok(spots.filter(side).length >= 3, `seed ${seed}: few kernels ${name} her`);
      }
      // Apart from each other
      for (let i = 0; i < kernels.length; i++) {
        for (let j = i + 1; j < kernels.length; j++) {
          const d = Math.hypot(kernels[i].x - kernels[j].x, kernels[i].y - kernels[j].y);
          assert.ok(d >= 1.5, `seed ${seed}: two kernels ${d.toFixed(2)} tiles apart`);
        }
      }
    }
    resetRun();
  });

  it('a kernel at the edge of her reach is eaten within 0.35 s', () => {
    start();
    spawnCorn(hen.x + stats.magnet - 0.05, hen.y, 1, 0);
    steps(0.35);
    assert.equal(game.xp, 1);
  });

  it('a full corn pool: a new kernel takes the place of the one farthest from her, with its value, so none is lost', () => {
    start();
    for (let i = 0; i < MAX_CORN; i++) spawnCorn(hen.x + 50 + i * 0.01, hen.y, 1, 0);
    const total = () => corn.reduce((sum, c) => sum + (c.alive ? c.value : 0), 0);
    assert.equal(total(), MAX_CORN);
    spawnCorn(hen.x + 1, hen.y, 1, 0);
    assert.equal(total(), MAX_CORN + 1, 'the new kernel was lost');
    const near = corn.filter((c) => c.alive && Math.abs(c.x - hen.x - 1) < 0.01);
    assert.equal(near.length, 1, 'no kernel where it fell');
    assert.equal(near[0].value, 2, 'the farthest kernel did not roll into it');
    assert.ok(!corn.some((c) => c.alive && c.x > hen.x + 50 + (MAX_CORN - 1.5) * 0.01), 'the farthest kernel is still there');
    resetRun();
  });

  it('the magnet pulls nearby corn in and fills the XP bar', () => {
    start();
    spawnCorn(hen.x + 1.5, hen.y, 1, 0);
    spawnCorn(hen.x + 12, hen.y, 1, 0);
    play(0.2);
    assert.equal(game.xp, 1);
    assert.equal(alive(corn).length, 1, 'far corn should stay put');
  });

  it('reaching the XP target freezes the run on three weapon cards; a number key picks one', () => {
    start();
    openFirstCards();
    assert.equal(game.level, 2);
    assert.ok(game.cards.every((c) => ITEM_BY_ID[c.id].weapon), 'the first level-up offers weapons only');
    assert.equal(new Set(game.cards.map((c) => c.id)).size, 3, 'cards repeat');
    const t = game.time;
    play(0.5);
    assert.equal(game.time, t, 'the clock ran while choosing');
    const chosen = game.cards[1];
    tapKey('Digit2');
    assert.equal(game.cards.length, 0);
    assert.equal(build[chosen.id], chosen.level);
    play(0.1);
    assert.ok(game.time > t, 'the run did not resume');
  });

  it('a key pressed as the cards open does not pick one by accident', () => {
    start();
    openFirstCards();
    tapKey('Digit1');
    assert.equal(game.cards.length, 3, 'picked during the lock');
    steps(0.5);
    tapKey('Digit1');
    assert.equal(game.cards.length, 0, 'a key after the lock did not pick');
  });

  it('a click or tap on a card picks it; a tap beside the cards does not', () => {
    start();
    openFirstCards();
    steps(0.5);
    const chosen = game.cards[2];
    const r = cardRect(2, 3);
    assert.equal(cardAt(r.x + 5, r.y + 5, 3), 2);
    assert.equal(cardAt(2, 2, 3), -1);
    tapAt(2, 2);
    update(STEP);
    assert.equal(game.cards.length, 3, 'a tap outside the cards picked one');
    tapAt(r.x + r.w / 2, r.y + r.h / 2);
    update(STEP);
    assert.equal(game.cards.length, 0);
    assert.equal(build[chosen.id], chosen.level);
  });

  it('cards respect the six weapon slots, never offer a maxed item, and owned items reach the top', () => {
    start();
    for (let level = 2; level < 80; level++) {
      const cards = rollCards(false);
      if (!cards.length) break;
      assert.equal(new Set(cards.map((c) => c.id)).size, cards.length);
      for (const c of cards) assert.ok(c.level <= (c.hatch ? HATCH_LEVEL : MAX_ITEM_LEVEL));
      applyCard(cards[0]);
      const weapons = buildOrder.filter((id) => ITEM_BY_ID[id].weapon).length;
      assert.ok(weapons <= SLOTS, `${weapons} weapons`);
    }
    for (const id of buildOrder) assert.ok(build[id] >= MAX_ITEM_LEVEL, id);
    const weapons = ITEMS.filter((item) => item.weapon);
    assert.equal(buildOrder.filter((id) => ITEM_BY_ID[id].weapon).length, Math.min(SLOTS, weapons.length));
  });

  it('once everything is maxed, levels go on: three different boons, and each one counts', () => {
    start();
    for (let k = 0; k < 80; k++) {
      const cards = rollCards(false);
      if (cards[0].boon) break;
      applyCard(cards[0]);
    }
    const cards = rollCards(false);
    assert.equal(cards.length, 3);
    assert.ok(cards.every((c) => c.boon), 'not boons');
    assert.equal(new Set(cards.map((c) => c.id)).size, 3);
    const damage = stats.damage;
    const cooldown = weaponCooldown('egg');
    applyCard({ id: 'grit', boon: true });
    applyCard({ id: 'wings', boon: true });
    assert.ok(Math.abs(stats.damage - (damage + 0.06)) < 1e-9);
    assert.ok(weaponCooldown('egg') < cooldown);
    assert.equal(boons.grit, 1);
    for (let k = 0; k < 40; k++) applyCard(rollCards(false)[0]);
    assert.ok(Object.values(boons).reduce((a, b) => a + b, 0) >= 42, 'boons ran out');
  });

  it('predators grow tougher with the clock, not with her level', () => {
    start();
    game.time = 120;
    const a = { ...spawnEnemy(FOX, hen.x + 20, hen.y) };
    game.level = 20;
    const b = { ...spawnEnemy(FOX, hen.x + 20, hen.y + 1) };
    assert.equal(b.maxHp, a.maxHp, 'leveling up made them tougher');
    assert.equal(a.maxHp, Math.floor(ENEMY_TYPES[FOX].hp + ENEMY_TYPES[FOX].hpMin * 2));
  });

  it('each kind grows by the minute at its own pace, in health and in bite', () => {
    start();
    const early = { ...spawnEnemy(BADGER, hen.x + 20, hen.y) };
    const rat0 = { ...spawnEnemy(RAT, hen.x + 20, hen.y + 1) };
    game.time = 300;
    const late = { ...spawnEnemy(BADGER, hen.x + 20, hen.y + 2) };
    const rat5 = { ...spawnEnemy(RAT, hen.x + 20, hen.y + 3) };
    for (const [a, b, kind] of [[early, late, BADGER], [rat0, rat5, RAT]]) {
      const type = ENEMY_TYPES[kind];
      assert.equal(b.maxHp - a.maxHp, Math.floor(type.hp + type.hpMin * 5) - type.hp, `${type.name} health`);
      assert.equal(b.dmg, Math.round(type.dmg + type.dmgMin * 5), `${type.name} bite`);
      assert.equal(b.speed, a.speed, `${type.name} speed should stay its own`);
    }
    assert.ok(late.maxHp - early.maxHp > (rat5.maxHp - rat0.maxHp) * 5, 'the tank should grow much faster than the swarm');
  });

  it('armor takes off every hit (at least MIN_HIT gets through); heavy kinds shrug off knockback', () => {
    start();
    buildOrder.length = 0;
    const badger = spawnEnemy(BADGER, hen.x + 5, hen.y);
    const rat = spawnEnemy(RAT, hen.x + 5, hen.y + 2);
    badger.hp = badger.maxHp = rat.hp = rat.maxHp = 10000;
    stats.crit = 0;
    hitEnemy(badger, 20, hen.x, hen.y);
    assert.equal(badger.hp, 10000 - MIN_HIT, 'at least MIN_HIT should get through');
    hitEnemy(badger, 100, hen.x, hen.y, 6, true);
    assert.equal(badger.hp, 10000 - MIN_HIT - (100 - ENEMY_TYPES[BADGER].armor));
    hitEnemy(rat, 100, hen.x, hen.y, 6, true);
    assert.equal(rat.hp, 9900, 'a rat has no armor');
    const push = (e) => Math.hypot(e.knockX, e.knockY);
    assert.ok(Math.abs(push(badger) / push(rat) - (1 - ENEMY_TYPES[BADGER].kr)) < 1e-9, 'knockback resistance');
    hitEnemy(badger, 100, hen.x, hen.y, 6, true, true);
    assert.equal(badger.hp, 10000 - MIN_HIT - 70 - 100, 'ignoring armor should deal it all');
    const boss = spawnBoss(FOX);
    assert.equal(boss.armor, BOSS_ARMOR);
  });

  it('numbers run in the tens and hundreds: a rat has 80 health and bites 60, an egg hits 100, she has 1000', () => {
    start();
    const rat = spawnEnemy(RAT, hen.x + 8, hen.y);
    assert.deepEqual([rat.maxHp, rat.dmg], [80, 60]);
    assert.equal(weaponDamage('egg'), 100);
    assert.deepEqual([hen.hp, hen.maxHp], [1000, 1000]);
  });

  it('every hit shows its number for POPUP_LIFE, each at its own spot, and a strong hit twice as big', () => {
    start();
    buildOrder.length = 0;
    const rat = sturdy(RAT, hen.x + 5, hen.y);
    stats.crit = 0;
    hitEnemy(rat, 100, hen.x, hen.y);
    hitEnemy(rat, 100, hen.x, hen.y);
    hitEnemy(rat, BIG_HIT, hen.x, hen.y);
    const [a, b, big] = alive(popups);
    assert.ok(a.x !== b.x || a.y !== b.y, 'two hits in one step cover each other');
    assert.deepEqual([a.text, a.scale, big.text, big.scale], ['100', 1, String(BIG_HIT), 2]);
    steps(POPUP_LIFE - 0.05);
    assert.equal(alive(popups).length, 3, 'the numbers left too soon');
    steps(0.1);
    assert.equal(alive(popups).length, 0, 'the numbers stayed too long');
    resetRun();
  });

  it('critical hits: a 5% chance on every hit, Lucky Bandana adds 3% a level, double damage in big gold', () => {
    start();
    assert.equal(stats.crit, 0.05);
    applyCard({ id: 'bandana' });
    applyCard({ id: 'bandana' });
    assert.ok(Math.abs(stats.crit - 0.11) < 1e-9, 'bandana: +3% crit a level');
    assert.ok(Math.abs(stats.dodge - 0.14) < 1e-9, 'bandana still dodges');
    buildOrder.length = 0;
    const rat = sturdy(RAT, hen.x + 5, hen.y);
    stats.crit = 1;
    hitEnemy(rat, 100, hen.x, hen.y);
    assert.equal(rat.maxHp - rat.hp, 100 * CRIT_MULT);
    const p = alive(popups).find((q) => q.text === String(100 * CRIT_MULT));
    assert.deepEqual([p.color, p.scale], [10, 2], 'a crit shows big and gold');
    stats.crit = 0;
    for (let i = 0; i < 50; i++) hitEnemy(rat, 100, hen.x, hen.y);
    assert.equal(rat.maxHp - rat.hp, 100 * CRIT_MULT + 50 * 100, 'a crit at 0%');
    // Over many hits the base chance shows
    stats.crit = 0.05;
    const before = rat.hp;
    for (let i = 0; i < 4000; i++) hitEnemy(rat, 100, hen.x, hen.y);
    const share = (before - rat.hp - 4000 * 100) / 100 / 4000;
    assert.ok(share > 0.035 && share < 0.065, `${(share * 100).toFixed(1)}% critical hits`);
    resetRun();
  });

  it('the fast kinds nearly keep up with her: the snake runs at 80% of her speed', () => {
    assert.ok(Math.abs(ENEMY_TYPES[SNAKE].speed / HEN_SPEED - 0.8) < 0.01);
    for (const type of ENEMY_TYPES) assert.ok(type.speed < HEN_SPEED, `${type.name} outruns her`);
  });

  it('predators born later in the run are tougher, at the same hen level', () => {
    start();
    const early = spawnEnemy(RAT, 20, 0);
    game.time = 300;
    const late = spawnEnemy(RAT, 20, 1);
    assert.ok(late.maxHp >= early.maxHp * 2, `${early.maxHp} -> ${late.maxHp}`);
  });

  it('Sunglasses scale every weapon hit', () => {
    start();
    assert.equal(weaponDamage('egg'), 100);
    applyCard({ id: 'shades' });
    applyCard({ id: 'shades' });
    assert.equal(weaponDamage('egg'), 130);
  });

  it('Hero Cape raises max health and heals what it adds', () => {
    start();
    hen.hp = 500;
    applyCard({ id: 'cape' });
    syncHenStats();
    assert.equal(hen.maxHp, 1250);
    assert.equal(hen.hp, 750);
  });

  it('Lucky Bandana dodges about 7% of bites per level', () => {
    start();
    for (let i = 0; i < 3; i++) applyCard({ id: 'bandana' });
    hen.hp = hen.maxHp = 1e6;
    let dodged = 0;
    for (let i = 0; i < 2000; i++) {
      const before = hen.hp;
      damageHen(5, hen.x + 1, hen.y);
      if (hen.hp === before) dodged++;
    }
    assert.ok(dodged / 2000 > 0.17 && dodged / 2000 < 0.25, `${dodged / 20}% dodged`);
  });

  it('Corn Spray fires a fan of kernels at a foe on screen', () => {
    armedWith('corn');
    const rat = sturdy(RAT, hen.x + 4, hen.y - 4);
    rat.speed = 0;
    steps(0.5);
    assert.equal(projectiles.filter((p) => p.alive && p.kind === KERNEL).length, 3);
  });

  it('Wing Gust hurts and shoves back every foe close by', () => {
    armedWith('gust');
    const ring = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      ring.push(sturdy(RAT, hen.x + Math.cos(a), hen.y + Math.sin(a)));
    }
    for (let i = 0; i < 90 && ring.every((e) => e.hp === e.maxHp); i++) update(STEP);
    steps(0.15);
    for (const e of ring) {
      assert.ok(e.hp < e.maxHp, 'a rat was not hurt');
      assert.ok(Math.hypot(e.x - hen.x, e.y - hen.y) > 1.6, 'a rat was not pushed back');
    }
  });

  it('Chick Orbit chicks nip what they touch, each foe at most every 0.5 s', () => {
    armedWith('chicks');
    update(STEP);
    assert.equal(chicks.count, 1);
    const rat = sturdy(RAT, chicks.list[0].x, chicks.list[0].y);
    rat.speed = 0;
    stats.crit = 0;
    for (let i = 0; i < 60; i++) {
      // Keep the rat right on the chick for 1 s
      rat.x = chicks.list[0].x;
      rat.y = chicks.list[0].y;
      update(STEP);
    }
    const nips = (rat.maxHp - rat.hp) / weaponDamage('chicks');
    assert.ok(nips >= 2 && nips <= 3, `${nips} nips in 1 s`);
  });

  it('Thunder Comb strikes foes on screen, never off it', () => {
    armedWith('thunder');
    const near = sturdy(RAT, hen.x + 3, hen.y - 3);
    const far = sturdy(RAT, hen.x + 14, hen.y - 14);
    near.speed = far.speed = 0;
    for (let i = 0; i < 60 && near.hp === near.maxHp; i++) update(STEP);
    assert.ok(near.hp < near.maxHp, 'the rat on screen was not struck');
    assert.ok(bolts.some((b) => b.alive), 'no bolt drawn');
    steps(3);
    assert.equal(far.hp, far.maxHp, 'a rat off screen was struck');
  });

  it('passives add up into the stats, costs included', () => {
    const { speed, maxHp, xp, guard } = stats;
    applyCard({ id: 'boots' });
    applyCard({ id: 'boots' });
    assert.ok(Math.abs(stats.speed - (speed + 0.2)) < 1e-9, 'boots: +10% speed a level');
    assert.equal(stats.maxHp, maxHp - 100, 'boots: -50 max health a level');
    applyCard({ id: 'helmet' });
    assert.ok(Math.abs(stats.guard - (guard + 0.1)) < 1e-9, 'pot: 10% less damage');
    assert.ok(Math.abs(stats.speed - (speed + 0.2 - 0.04)) < 1e-9, 'pot: -4% speed');
    applyCard({ id: 'basket' });
    assert.ok(stats.magnet > 3);
    assert.ok(Math.abs(stats.xp - (xp + 0.08)) < 1e-9, 'basket: +8% XP');
    assert.deepEqual(cardText({ id: 'boots', level: 1 }), ['RUN 10% FASTER', '-50 MAX HEALTH'], 'the cost is on the card');
  });

  it('Feather Darts fly behind the hen', () => {
    start();
    applyCard({ id: 'darts' });
    holdKey('KeyD', true);
    play(0.05);
    holdKey('KeyD', false);
    sturdy(RAT, hen.x - 6, hen.y + 6); // something on screen to shoot at
    play(0.1);
    const darts = projectiles.filter((p) => p.alive && p.kind === 1);
    assert.ok(darts.length > 0, 'no darts');
    for (const p of darts) assert.ok(toIsoX(p.vx, p.vy) < 0, 'a dart flew forward');
  });
});

describe('quiquiriqui: the hen dresses up', () => {
  beforeEach(() => {
    resetRun();
  });

  it('every item has an icon, and Egg Toss and Chick Orbit have their own looks', () => {
    for (const item of ITEMS) assert.ok(iconSprites[item.id], `no icon for ${item.id}`);
    assert.equal(eggSprites.length, 3);
    assert.ok(chickSprite);
    for (const item of ITEMS) {
      if (item.id === 'egg' || item.id === 'chicks') continue;
      assert.ok(WORN_ITEMS.includes(item.id), `${item.id} is not worn`);
    }
  });

  it('every worn item changes the hen, and each of its three looks is different', () => {
    const bare = henGrid({});
    for (const id of WORN_ITEMS) {
      const looks = [1, 2, 3].map((tier) => henGrid({ [id]: tier }));
      assert.notEqual(looks[0], bare, `${id} does not show`);
      assert.notEqual(looks[1], looks[0], `${id}: tier 2 looks like tier 1`);
      assert.notEqual(looks[2], looks[1], `${id}: tier 3 looks like tier 2`);
    }
  });

  it('the Hero Cape lies over her back and flies behind her tail, fluttering as she walks; the tail tips still show', () => {
    const red = (cells) => cells.filter((c) => c === 9 || c === 19).length; // red, and its darker folds
    for (const tier of [1, 2, 3]) {
      for (const step of ['idle', 'stepA', 'stepB']) {
        // Behind her (left of her body and tail, where the bare hen has nothing)
        assert.equal(red(henPatch({}, step, 1, 6, 1, HEN_H - 1)), 0);
        assert.ok(red(henPatch({ cape: tier }, step, 1, 6, 1, HEN_H - 1)) >= 4, `tier ${tier} ${step}: no cape behind her`);
        // Over the top of her back, between her tail and her head
        assert.ok(red(henPatch({ cape: tier }, step, 11, 17, 10, 13)) >= 4, `tier ${tier} ${step}: no cape on her back`);
      }
      // Walking, the part in the wind changes from step to step (the bare hen's back half does not)
      const flag = (outfit, step) => henPatch(outfit, step, 1, 12, 1, HEN_H - 1).join(',');
      assert.equal(flag({}, 'stepA'), flag({}, 'stepB'));
      assert.notEqual(flag({ cape: tier }, 'stepA'), flag({ cape: tier }, 'stepB'), `tier ${tier}: the cape does not flutter`);
    }
    // Longer from tier 2
    assert.ok(red(henPatch({ cape: 2 }, 'idle', 1, 4, 1, HEN_H - 1)) > red(henPatch({ cape: 1 }, 'idle', 1, 4, 1, HEN_H - 1)));
    // Feather Darts' blue tips still peek out of the cape
    for (const darts of [1, 2]) {
      for (const step of ['idle', 'stepA', 'stepB']) {
        assert.ok(henGrid({ cape: 3, darts }, step).split(',').includes('12'), `darts ${darts} under the cape, ${step}`);
      }
    }
  });

  it('no outfit ever uses a meadow color', () => {
    for (const tier of [1, 2, 3]) {
      const full = Object.fromEntries(WORN_ITEMS.map((id) => [id, tier]));
      const outfits = [full, { ...full, hen: 1 }, { ...full, hen: 2 }, ...WORN_ITEMS.map((id) => ({ [id]: tier }))];
      for (const outfit of outfits) {
        for (const step of ['idle', 'stepA', 'stepB']) {
          for (const c of henGrid(outfit, step).split(',').map(Number)) {
            assert.equal(GROUND_PALETTE_INDICES.includes(c), false, `${JSON.stringify(outfit)} uses ${c}`);
          }
        }
      }
    }
  });

  it('item levels map to three looks: 1-2, 3-4 and 5', () => {
    const tiers = [1, 2, 3, 4, 5].map((level) => outfitOf({ helmet: level }).helmet);
    assert.deepEqual(tiers, [1, 1, 2, 2, 3]);
  });

  it('picking a card re-bakes the hen only when her look changes', () => {
    start();
    openFirstCards();
    steps(0.5);
    for (let i = 0; i < game.cards.length; i++) {
      const card = game.cards[i];
      const changes = outfitKey(outfitOf({ ...build, [card.id]: card.level })) !== henLook.key;
      const bakes = henLook.bakes;
      tapKey(`Digit${i + 1}`);
      assert.equal(henLook.bakes - bakes, changes ? 1 : 0, `${card.id} level ${card.level}`);
      return;
    }
  });
});

describe('quiquiriqui at 5x: the end of a run', () => {
  beforeEach(() => {
    resetRun();
  });

  it('falling shows the game over; a key after a moment goes back to the title and keeps the best time', () => {
    localStorage.removeItem('qq_best');
    game.best = 0;
    start();
    play(1);
    const survived = game.time;
    damageHen(1000, hen.x + 1, hen.y);
    assert.equal(game.over, true);
    assert.equal(game.newBest, true);
    assert.equal(localStorage.getItem('qq_best'), String(Math.floor(survived)));
    tapKey('Space');
    assert.equal(game.over, true, 'left the game over at once');
    play(0.4);
    tapKey('Space');
    assert.equal(game.started, false);
    assert.equal(game.over, false);
    assert.ok(game.best >= Math.floor(survived));
    // A key still held from the last run does not restart it at once
    holdKey('KeyD', true);
    play(0.05);
    assert.equal(game.started, false, 'restarted during the title lock');
    play(0.2);
    holdKey('KeyD', false);
    assert.equal(game.started, true);
  });

  it('a new run starts clean', () => {
    resetRun({ peaceful: false });
    start();
    play(4);
    assert.ok(game.kills > 0 && countEnemies() > 0);
    resetRun({ peaceful: false });
    assert.equal(countEnemies(), 0);
    assert.equal(alive(corn).length, 0);
    assert.equal(alive(projectiles).length, 0);
    assert.equal(alive(particles).length, 0);
    assert.equal(alive(popups).length, 0);
    assert.deepEqual(buildOrder, ['egg']);
    assert.equal(henLook.key, outfitKey({}), 'the hen kept her outfit');
    assert.equal(game.level, 1);
    assert.equal(game.xp, 0);
    assert.equal(game.kills, 0);
    assert.equal(game.cards.length, 0);
  });

  it('the same seed replays the same run', () => {
    const runOnce = () => {
      resetRun({ peaceful: false, seed: 42 });
      playWithBot(3);
      return [game.time, game.kills, game.level, hen.x, hen.y, countEnemies()].join(',');
    };
    assert.equal(runOnce(), runOnce());
  });
});

describe('quiquiriqui at 5x: bosses, chests, crates and prizes', () => {
  beforeEach(() => {
    resetRun();
  });

  it('bosses come on minutes 1, 3, 4, 5, 7 and 8, and three at once on minute 9', () => {
    const bosses = TIMELINE.filter((event) => event.boss !== undefined).map((event) => event.at);
    assert.deepEqual(bosses, [60, 180, 240, 300, 420, 480, 540, 540, 540]);
  });

  it('a boss is a big, tough version of its kind and drops a chest', () => {
    start();
    const boss = spawnBoss(FOX);
    const type = ENEMY_TYPES[FOX];
    assert.equal(boss.boss, true);
    assert.equal(boss.maxHp, type.hp * BOSS_HP);
    assert.equal(boss.r, type.r * BOSS_SIZE);
    assert.equal(boss.dmg, type.dmg * BOSS_BITE);
    const kills = game.kills;
    hitEnemy(boss, boss.hp + boss.armor, hen.x, hen.y);
    assert.equal(game.kills, kills + 1);
    assert.ok(pickups.some((p) => p.alive && p.kind === CHEST), 'no chest');
  });

  it('a boss always gets in, even when the predator pool is full', () => {
    start();
    for (let i = 0; i < MAX_ENEMIES; i++) spawnEnemy(RAT, 20 + i * 0.01, 0);
    assert.equal(countEnemies(), MAX_ENEMIES);
    assert.ok(spawnBoss(BADGER), 'the boss did not fit');
  });

  it('a chest gives one or three upgrades at once, and the run waits until a key', () => {
    start();
    const levels = () => Object.values(build).reduce((a, b) => a + b, 0);
    const before = levels();
    spawnPickup(CHEST, hen.x + 0.3, hen.y);
    for (let i = 0; i < 120 && !game.reward.length; i++) update(STEP);
    const n = game.reward.length;
    assert.ok(n === 1 || n === 3, `${n} upgrades`);
    assert.equal(levels(), before + n);
    const t = game.time;
    steps(0.3);
    tapKey('Space');
    assert.equal(game.reward.length, n, 'closed during the lock');
    assert.equal(game.time, t, 'the clock ran on the chest screen');
    steps(0.5);
    tapKey('Space');
    assert.equal(game.reward.length, 0);
  });

  it('chests hold three upgrades now and then', () => {
    let big = 0;
    for (let seed = 1; seed <= 40; seed++) {
      resetRun({ seed });
      start();
      spawnPickup(CHEST, hen.x, hen.y);
      for (let i = 0; i < 60 && !game.reward.length; i++) update(STEP);
      if (game.reward.length === 3) big++;
    }
    assert.ok(big >= 5 && big <= 22, `${big} of 40 chests held three`);
  });

  it('a crate shows up every 20 s, never bites and is not a kill', () => {
    resetRun({ peaceful: false });
    start();
    buildOrder.length = 0; // nothing breaks the crates
    hen.hp = hen.maxHp = 1e6;
    // Bites freeze the action for a moment, so wait on the game clock, not on steps (and close
    // any cards, or the clock would stop for good).
    while (game.time < CRATE_EVERY * 2 + 1) {
      game.cards = [];
      update(STEP);
    }
    assert.equal(enemies.filter((e) => e.alive && e.prop).length, 2);
    resetRun();
    start();
    const box = spawnEnemy(CRATE, hen.x + 0.2, hen.y);
    steps(1);
    assert.equal(hen.hp, hen.maxHp, 'a crate bit the hen');
    const kills = game.kills;
    hitEnemy(box, 99, hen.x, hen.y);
    assert.equal(game.kills, kills, 'a crate counted as a kill');
  });

  it('a broken crate always leaves something', () => {
    start();
    for (let i = 0; i < 30; i++) {
      const before = alive(pickups).length + alive(corn).length;
      const box = spawnEnemy(CRATE, hen.x + 40, hen.y - 40 - i);
      hitEnemy(box, 99, box.x, box.y);
      assert.ok(alive(pickups).length + alive(corn).length > before, 'empty crate');
      clearAll();
    }
  });

  it('the magnet pulls every kernel on the map', () => {
    start();
    spawnCorn(hen.x + 20, hen.y - 20, 1, 0);
    spawnCorn(hen.x - 25, hen.y + 10, 2, 0);
    spawnPickup(MAGNET, hen.x, hen.y);
    steps(4);
    assert.equal(alive(corn).length, 0);
    assert.equal(game.xp, 3);
  });

  it('the bomb clears the screen and hurts bosses', () => {
    start();
    buildOrder.length = 0;
    const near = [0, 1, 2].map((k) => spawnEnemy(RAT, hen.x + 2 + k, hen.y - 2));
    for (const e of near) e.speed = 0;
    const far = spawnEnemy(FOX, hen.x + 14, hen.y - 14);
    far.speed = 0;
    const boss = spawnBoss(BADGER);
    boss.x = hen.x - 3;
    boss.y = hen.y + 3;
    boss.speed = 0;
    spawnPickup(BOMB, hen.x, hen.y);
    steps(0.1);
    for (const e of near) assert.equal(e.alive, false, 'a rat on screen survived');
    assert.equal(far.alive, true, 'a fox off screen died');
    assert.ok(boss.alive && boss.hp < boss.maxHp, 'the boss was not hurt (or died)');
  });

  it('food heals', () => {
    start();
    hen.hp = 500;
    spawnPickup(FOOD, hen.x, hen.y);
    steps(0.1);
    assert.equal(hen.hp, 800);
  });
});

describe('quiquiriqui: the day arc', () => {
  beforeEach(() => {
    resetRun();
  });

  it('the weather follows the clock with soft fades', () => {
    assert.deepEqual(weatherAt(60), { rain: 0, snow: 0, night: 0, dawn: 0 });
    assert.equal(weatherAt(200).rain, 1);
    const fading = weatherAt(152.5).rain;
    assert.ok(fading > 0.4 && fading < 0.6, `rain ${fading} while fading in`);
    assert.equal(weatherAt(360).snow, 1);
    assert.equal(weatherAt(500).night, 1);
    assert.equal(weatherAt(RUN_LENGTH).dawn, 1);
    assert.equal(weatherAt(RUN_LENGTH).night, 0);
  });

  it('at ten minutes dawn breaks and the run goes on: the rooster crows and day 2 begins, with no stop', () => {
    start();
    hen.hp = hen.maxHp = 1e6;
    game.time = RUN_LENGTH - 0.05;
    steps(0.2);
    assert.equal(game.over, false, 'the run stopped at dawn');
    assert.equal(game.won, false, 'a dawn is not the win');
    assert.equal(game.day, 2);
    assert.ok(game.time > RUN_LENGTH, 'the clock stopped');
  });
});

describe('quiquiriqui at 5x: endless days', () => {
  /** Plays past the first dawn, into day 2. */
  function reachDawn() {
    start();
    hen.hp = hen.maxHp = 1e6;
    game.time = RUN_LENGTH - 0.05;
    steps(0.1);
    assert.equal(game.day, 2, 'no dawn');
  }

  it('past the first dawn, day 2: predators keep growing from where day 1 ended, and the day adds half again', () => {
    resetRun();
    reachDawn();
    steps(1);
    const rat = spawnEnemy(RAT, hen.x + 20, hen.y);
    const type = ENEMY_TYPES[RAT];
    const minutes = game.time / 60;
    assert.ok(minutes > 10, 'the minutes started over');
    assert.equal(rat.maxHp, Math.floor((type.hp + type.hpMin * minutes) * (1 + DAY_HP)), 'day 2 should add half their health');
  });

  it('a new day replays the timeline, bosses included, with more predators', () => {
    resetRun({ peaceful: false });
    reachDawn();
    for (const e of enemies) e.alive = false;
    while (game.time < RUN_LENGTH + 62) {
      hen.hp = hen.maxHp = 1e6;
      update(STEP);
      if (game.cards.length && game.cardLock <= 0) tapKey('Digit1');
      if (game.reward.length && game.rewardLock <= 0) tapKey('Space');
    }
    assert.ok(enemies.some((e) => e.alive && e.boss), 'no boss on minute 1 of day 2');
  });

  it('every later dawn starts the next day without stopping the run', () => {
    resetRun();
    reachDawn();
    game.time = RUN_LENGTH * 2 - 0.05;
    steps(0.2);
    assert.equal(game.day, 3);
    assert.equal(game.over, false);
    assert.equal(game.banner, 'DAY 3');
    assert.ok(weatherAt(RUN_LENGTH * 2 + 1).dawn > 0.5, 'no morning glow');
    assert.equal(weatherAt(RUN_LENGTH * 2 + 30).dawn, 0);
    assert.equal(weatherAt(RUN_LENGTH * 2 + 500).night, 1);
  });

  it('falling on day 2 keeps a best time past 10:00', () => {
    localStorage.removeItem('qq_best');
    game.best = 0;
    resetRun();
    reachDawn();
    steps(2);
    damageHen(1e9, hen.x + 1, hen.y);
    assert.equal(game.over, true);
    assert.ok(Number(localStorage.getItem('qq_best')) > RUN_LENGTH);
  });
});

describe('quiquiriqui at 5x: peril levels', () => {
  /** A fresh profile: the hardest peril and only the white hen unlocked. */
  function freshProfile() {
    localStorage.removeItem('qq_profile');
    loadProfile();
  }

  it('peril adds 10% health and bite per level, and leaves numbers and speed to its rules', () => {
    const born = (peril) => {
      resetRun({ peaceful: false, peril });
      start();
      buildOrder.length = 0; // no weapons: everything born stays
      while (game.time < 30) {
        hen.hp = hen.maxHp = 1e6;
        game.cards = []; // open cards would stop the clock for good
        update(STEP);
      }
      return enemies.filter((e) => e.alive && !e.prop).length;
    };
    assert.equal(born(2), born(0), 'peril 2 changed how many predators are born');
    // Copy the values: the pool hands out the same object again after a reset
    resetRun({ peril: 0 });
    start();
    const a = { ...spawnEnemy(RAT, 20, 0) };
    resetRun({ peril: 2 });
    start();
    const b = { ...spawnEnemy(RAT, 20, 0) };
    assert.equal(b.maxHp, Math.floor(ENEMY_TYPES[RAT].hp * (1 + 2 * PERIL.hp)));
    assert.equal(b.speed, a.speed, 'peril 2 changed their speed');
    assert.equal(b.dmg, Math.round(ENEMY_TYPES[RAT].dmg * (1 + 2 * PERIL.bite)));
  });

  it('every peril is open from the start and the hardest comes first; Z and C step through them and never start a run', () => {
    freshProfile();
    assert.equal(profile.peril, MAX_PERIL, 'a fresh profile is not at the hardest');
    assert.equal(PERIL_NAMES[MAX_PERIL], 'NO MERCY');
    resetRun({ peril: profile.peril });
    assert.equal(game.peril, MAX_PERIL);
    assert.ok(perilLine().includes('NO MERCY'), perilLine());
    tapKey('KeyC');
    assert.equal(profile.peril, MAX_PERIL, 'went past the hardest');
    for (let p = MAX_PERIL - 1; p >= 0; p--) {
      tapKey('KeyZ');
      assert.equal(profile.peril, p, 'a peril is locked');
      assert.equal(game.peril, p);
      assert.ok(perilLine().includes(PERIL_NAMES[p]), perilLine());
    }
    tapKey('KeyZ');
    assert.equal(profile.peril, 0, 'went below the easiest');
    assert.equal(JSON.parse(localStorage.getItem('qq_profile')).peril, 0, 'the choice was not saved');
    assert.equal(game.started, false, 'a menu key started the run');
    // A dawn opens no peril any more
    start();
    hen.hp = hen.maxHp = 1e6;
    game.time = RUN_LENGTH - 0.05;
    steps(0.1);
    assert.equal(game.day, 2);
    assert.ok(!game.banner.includes('PERIL'), game.banner);
    endRun();
    assert.equal(game.started, false);
    // A tap on the right half of the peril row also raises it, without starting
    tapAt(WIDTH * 0.75, titleRowY(1));
    update(STEP);
    assert.equal(profile.peril, 1);
    assert.equal(game.started, false, 'a tap on the menu started the run');
    freshProfile();
  });

  it('on the title, a tap anywhere from under START to the last row changes the nearest row and never starts the run, wide or upright', () => {
    try {
      for (const [w, h] of [[640, 360], [390, 844]]) {
        fitScreen(w, h);
        const s = titleScale();
        const rows = [0, 1, 2].map(titleRowY);
        const gap = rows[1] - rows[0];
        assert.equal(s, HEIGHT >= 300 ? 2 : 1);
        if (s > 1) assert.ok(gap >= 24, 'rows too close together for a finger');
        // The menu fits at its scale, and the lines under it stay on screen
        for (let p = 0; p <= MAX_PERIL; p++) {
          profile.peril = p;
          assert.ok(textWidth(perilLine(), s) <= WIDTH - 16, perilLine());
        }
        for (game.hen = 0; game.hen < HENS.length; game.hen++) assert.ok(textWidth(henLine(), s) <= WIDTH - 16, henLine());
        profile.eggs = 99999;
        assert.ok(textWidth(shopLine(), s) <= WIDTH - 16, shopLine());
        profile.eggs = 0;
        assert.ok(rows[2] + 9 * s + 13 <= HEIGHT, 'the music line is off the screen');
        // A quarter pixel off the grid, so no tap is exactly halfway between two rows
        for (let y = HEIGHT / 2 + 28.25; y < rows[2] + gap / 2; y++) {
          const nearest = rows.reduce((b, r, i) => (Math.abs(y - r) < Math.abs(y - rows[b]) ? i : b), 0);
          for (const x of [WIDTH * 0.2, WIDTH * 0.8]) {
            resetRun({ peril: 2 });
            tapAt(x, y);
            update(STEP);
            assert.equal(game.started, false, `a tap at ${x}, ${y} started the run`);
            const changed = [game.hen !== 0, profile.peril !== 2, game.shopOpen];
            assert.deepEqual(changed, rows.map((_, i) => i === nearest), `a tap at ${x}, ${y}`);
          }
        }
        // Above the menu (the hen, START) a tap still starts the run
        resetRun();
        tapAt(WIDTH / 2, HEIGHT / 2 + 22);
        update(STEP);
        assert.equal(game.started, true, 'a tap on START did not start the run');
      }
    } finally {
      fitScreen(WIDTH, MIN_HEIGHT);
      freshProfile();
      resetRun();
    }
  });

  it('an old save, from when perils opened one by one, starts at the hardest and keeps its hens and eggs', () => {
    localStorage.setItem('qq_profile', JSON.stringify({ peril: 0, perilUnlocked: 0, hen: 1, hens: 3, eggs: 40 }));
    loadProfile();
    assert.deepEqual([profile.peril, profile.hen, profile.hens, profile.eggs], [MAX_PERIL, 1, 3, 40]);
    assert.ok(!('perilUnlocked' in profile), 'the old field stayed');
    // A peril chosen since then is kept
    choosePeril(2);
    loadProfile();
    assert.equal(profile.peril, 2);
    freshProfile();
  });

  it('each hen starts with her own weapon and wears her own feathers', () => {
    const looks = new Set();
    HENS.forEach((hen, i) => {
      resetRun({ hen: i });
      assert.deepEqual(buildOrder, [hen.start], hen.name);
      looks.add(henGrid({ hen: i }));
    });
    assert.equal(looks.size, HENS.length, 'two hens look the same');
    resetRun();
  });

  it('locked hens are on show but cannot start a run; the first dawn brings the speckled hen, HEN or harder the black hen', () => {
    freshProfile();
    resetRun();
    tapKey('KeyE');
    assert.equal(game.hen, 1, 'E did not show the next hen');
    assert.equal(profile.hen, 0, 'a locked hen became the saved choice');
    assert.ok(henLine().endsWith('LOCKED'), henLine());
    assert.deepEqual(buildOrder, ['peck'], 'the title did not show her weapon');
    holdKey('KeyD', true);
    steps(0.5);
    holdKey('KeyD', false);
    tapAt(10, 10);
    update(STEP);
    assert.equal(game.started, false, 'a locked hen started a run');
    assert.ok(game.lockShake > 0, 'the padlock did not shake');
    tapKey('KeyE');
    assert.equal(game.hen, 2, 'the black hen was skipped');
    tapKey('KeyE');
    assert.equal(game.hen, 0);
    assert.ok(!henLine().includes('LOCKED'));
    start();
    assert.equal(game.started, true, 'the white hen did not start');
    hen.hp = hen.maxHp = 1e6;
    game.time = RUN_LENGTH - 0.05;
    steps(0.1);
    assert.equal(game.day, 2);
    assert.ok(game.banner.includes('SPECKLED HEN!'), game.banner);
    assert.ok(!game.banner.includes('BLACK HEN!'), 'a dawn at EGG brought the black hen');
    endRun();
    tapKey('KeyE');
    assert.equal(profile.hen, 1);
    assert.deepEqual(buildOrder, ['peck'], 'the title did not switch to her weapon');
    tapKey('KeyE');
    assert.equal(game.hen, 2, 'the black hen is not on show');
    assert.equal(profile.hen, 1, 'the locked black hen became the saved choice');
    assert.equal(game.started, false);
    resetRun({ hen: profile.hen });
    assert.equal(game.hen, 1, 'back on the title, the last unlocked hen she chose is not on show');
    // A dawn at HEN (peril 2) or harder brings the black hen
    assert.deepEqual(unlockAfterDawn(1), []);
    assert.deepEqual(unlockAfterDawn(2), ['BLACK HEN!']);
    freshProfile();
  });

  it('each peril keeps its own best time', () => {
    localStorage.removeItem('qq_best');
    localStorage.removeItem('qq_best1');
    resetRun({ peril: 1 });
    start();
    game.time = 77;
    damageHen(1e9, hen.x + 1, hen.y);
    assert.equal(localStorage.getItem('qq_best1'), '77');
    assert.equal(localStorage.getItem('qq_best'), null);
    resetRun({ peril: 0 });
  });
});

describe('quiquiriqui at 5x: golden eggs and the shop', () => {
  it('a run earns eggs for time, kills, dawn and peril, banked once', () => {
    assert.equal(eggsEarned(600, 400, true, 2), Math.floor((20 + 10 + 10) * 2));
    assert.equal(eggsEarned(59, 39, false, 0), 1);
    profile.eggs = 0;
    resetRun();
    start();
    game.time = 125;
    game.kills = 85;
    damageHen(1e9, hen.x + 1, hen.y);
    update(STEP);
    steps(0.5);
    assert.equal(game.eggs, 4 + 2);
    assert.equal(profile.eggs, 6, 'banked twice or not at all');
  });

  it('a run past dawn earns the dawn bonus, banked once when it ends', () => {
    profile.eggs = 0;
    resetRun();
    start();
    hen.hp = hen.maxHp = 1e6;
    game.time = RUN_LENGTH - 0.05;
    steps(0.1);
    assert.equal(game.day, 2);
    assert.equal(profile.eggs, 0, 'eggs were banked before the run ended');
    game.time += 60;
    damageHen(1e9, hen.x + 1, hen.y);
    update(STEP);
    const earned = eggsEarned(game.time, game.kills, true, 0);
    assert.equal(earned - eggsEarned(game.time, game.kills, false, 0), 10, 'no dawn bonus');
    assert.equal(profile.eggs, earned);
    steps(1);
    assert.equal(profile.eggs, earned, 'banked twice');
  });

  it('buying costs eggs and raises the level; no eggs, no sale; five levels at most', () => {
    profile.eggs = 35;
    profile.shop = [0, 0, 0, 0, 0];
    assert.equal(buyUpgrade(0), true);
    assert.equal(buyUpgrade(0), true);
    assert.deepEqual([profile.eggs, profile.shop[0]], [35 - SHOP_COSTS[0] - SHOP_COSTS[1], 2]);
    assert.equal(buyUpgrade(0), false, 'sold without enough eggs');
    profile.eggs = 1e6;
    for (let k = 0; k < 10; k++) buyUpgrade(1);
    assert.equal(profile.shop[1], SHOP_COSTS.length);
    assert.equal(JSON.parse(localStorage.getItem('qq_profile')).shop[1], SHOP_COSTS.length);
    profile.eggs = 0;
  });

  it('upgrades apply to every run: health, speed, damage, reach and XP', () => {
    resetRun({ shop: [2, 1, 1, 1, 1] });
    const per = Object.fromEntries(SHOP.map((upgrade) => [upgrade.stat, upgrade.per]));
    assert.equal(hen.maxHp, START_HP + 2 * per.maxHp);
    assert.equal(hen.hp, hen.maxHp);
    assert.ok(Math.abs(stats.speed - (1 + per.speed)) < 1e-9);
    assert.ok(Math.abs(stats.damage - (1 + per.damage)) < 1e-9);
    assert.ok(Math.abs(stats.magnet - (3 + per.magnet)) < 1e-9);
    start();
    spawnCorn(hen.x + 0.5, hen.y, 1, 0);
    steps(0.3);
    assert.ok(Math.abs(game.xp - (1 + per.xp)) < 1e-9, `xp ${game.xp}`);
    resetRun();
  });

  it('on the title, B opens the shop, a number buys, B closes, and none of it starts a run', () => {
    resetRun();
    profile.eggs = 15;
    tapKey('KeyB');
    assert.equal(game.shopOpen, true);
    holdKey('KeyD', true); // walking does not leave the shop
    update(STEP);
    holdKey('KeyD', false);
    tapKey('Digit3');
    assert.equal(profile.shop[2], 1);
    assert.equal(profile.eggs, 5);
    tapKey('Digit3'); // too dear now: nothing happens
    assert.equal(profile.shop[2], 1);
    tapAt(WIDTH / 2, shopRowY(SHOP.length));
    update(STEP);
    assert.equal(game.shopOpen, false, 'BACK did not close the shop');
    assert.equal(game.started, false);
    for (let i = 0; i <= SHOP.length; i++) {
      assert.equal(shopRowAt(shopRowY(i)), i);
      assert.equal(shopRowAt(shopRowY(i) + 8), i, 'a tap near the edge of a row');
    }
    profile.eggs = 0;
    resetRun();
  });
});

describe('quiquiriqui at 5x: special predators', () => {
  /** A predator of `kind` (dx, dy) tiles from the hen, already risen, too tough to die. */
  function sturdy(kind, dx, dy) {
    const e = spawnEnemy(kind, hen.x + dx, hen.y + dy);
    e.hp = e.maxHp = 1e9;
    e.age = 1;
    return e;
  }
  const away = (e) => Math.hypot(e.x - hen.x, e.y - hen.y);
  /** A run on the title of a peaceful meadow, started, with a tough hen and no weapons. */
  function quietRun() {
    resetRun();
    start();
    hen.hp = hen.maxHp = 1e6;
    buildOrder.length = 0; // no weapons: nothing knocks them about
  }

  it('a magpie backs off when close, comes closer from afar, and circles in between', () => {
    quietRun();
    const close = sturdy(MAGPIE, 2, 0);
    const far = sturdy(MAGPIE, -5, -5);
    steps(1.5);
    assert.ok(away(close) > 3.5, `the close one stayed ${away(close).toFixed(1)} tiles away`);
    assert.ok(away(far) < 6.5, `the far one stayed ${away(far).toFixed(1)} tiles away`);
    const a0 = Math.atan2(close.y - hen.y, close.x - hen.x);
    steps(1);
    const a1 = Math.atan2(close.y - hen.y, close.x - hen.x);
    assert.ok(away(close) >= 4 && away(close) <= 6.5, `${away(close).toFixed(1)} tiles away`);
    assert.ok(Math.abs(a1 - a0) > 0.2, 'it did not circle her');
    resetRun();
  });

  it('a magpie blinks, then throws a pebble that hurts her if she stays, and misses if she moves', () => {
    quietRun();
    const m = sturdy(MAGPIE, 5, 0);
    let warned = false;
    for (let i = 0; i < Math.round((SHOT_EVERY * 2) / STEP) && !shots.some((s) => s.alive); i++) {
      update(STEP);
      warned ||= m.warn;
    }
    assert.ok(warned, 'no warning before the throw');
    assert.ok(shots.some((s) => s.alive), 'no pebble');
    m.timer = 1e9; // one pebble is enough
    let hp = hen.hp;
    steps(2);
    assert.ok(hen.hp < hp, 'a hen standing still was not hit');
    assert.ok(!shots.some((s) => s.alive));

    // Again, but she steps aside as it flies
    m.timer = 0;
    update(STEP);
    m.timer = 1e9;
    const shot = shots.find((s) => s.alive);
    assert.ok(shot);
    // Step 3 tiles across its path
    const speed = Math.hypot(shot.vx, shot.vy);
    hen.x -= (shot.vy / speed) * 3;
    hen.y += (shot.vx / speed) * 3;
    hp = hen.hp;
    steps(SHOT_LIFE + 0.1);
    assert.equal(hen.hp, hp, 'a dodged pebble still hit');
    assert.ok(!shots.some((s) => s.alive), 'the pebble never landed');
    resetRun();
  });

  it('a weasel stops and blinks, then lunges in a straight line at where she was', () => {
    quietRun();
    const w = sturdy(WEASEL, 4.5, 0);
    w.timer = 0;
    update(STEP);
    assert.ok(w.warn, 'no warning before the lunge');
    const [x0, y0] = [w.x, w.y];
    hen.y += 2; // she steps aside while it winds up
    steps(DASH_WARN - 2 * STEP);
    assert.ok(Math.hypot(w.x - x0, w.y - y0) < 0.01, 'it moved while winding up');
    steps(2 * STEP + DASH_TIME);
    assert.ok(x0 - w.x > 3.5, `it lunged only ${(x0 - w.x).toFixed(2)} tiles`);
    assert.ok(Math.abs(w.y - y0) < 0.3, 'the lunge was not straight');
    assert.equal(hen.hp, hen.maxHp, 'the lunge hit her although she stepped aside');
    steps(0.05);
    assert.equal(w.state, 0, 'it did not stop to rest');
    resetRun();
  });

  it('a skunk leaves a stink cloud where it falls: it hurts her inside, not outside, and clears', () => {
    quietRun();
    const k = spawnEnemy(SKUNK, hen.x + 3, hen.y);
    k.age = 1;
    const [cx, cy] = [k.x, k.y];
    hitEnemy(k, 1e6, hen.x, hen.y);
    const alive = () => clouds.filter((c) => c.alive);
    assert.equal(alive().length, 1, 'no cloud');
    assert.ok(Math.hypot(alive()[0].x - cx, alive()[0].y - cy) < 0.01, 'the cloud is not where it fell');
    const hp = hen.hp;
    steps(1);
    assert.equal(hen.hp, hp, 'the cloud reached her 3 tiles away');
    hen.x = cx - 0.5;
    steps(1.2);
    const lost = hp - hen.hp;
    assert.ok(lost > 0, 'no harm inside the cloud');
    assert.ok(lost <= 3 * Math.ceil(ENEMY_TYPES[SKUNK].dmg / 3), `it hurt too often: -${lost} in 1.2 s`);
    steps(CLOUD_TIME);
    assert.equal(alive().length, 0, 'the cloud never cleared');
    resetRun();
  });

  it('a full pool still lets the special kinds in: the farthest common predator leaves', () => {
    quietRun();
    while (spawnEnemy(RAT)) {}
    for (const kind of [MAGPIE, WEASEL, SKUNK]) assert.ok(spawnEnemy(kind), `${ENEMY_TYPES[kind].name} found no room`);
    assert.equal(countEnemies(), MAX_ENEMIES);
    assert.equal(spawnEnemy(RAT), null, 'a common kind should still wait for room');
    resetRun();
  });

  it('an elite is tougher and faster, and drops a chest and golden eggs; a rainbow one a chest of three', () => {
    quietRun();
    const plain = spawnEnemy(FOX, hen.x + 5, hen.y);
    const gold = spawnEnemy(FOX, hen.x + 5, hen.y + 1);
    const rainbow = spawnEnemy(FOX, hen.x + 5, hen.y + 2);
    makeElite(gold, false);
    makeElite(rainbow, true);
    assert.equal(gold.maxHp, plain.maxHp * ELITE_HP);
    assert.equal(rainbow.maxHp, plain.maxHp * RAINBOW_HP);
    assert.ok(Math.abs(gold.speed - plain.speed * ELITE_SPEED) < 1e-9);
    assert.ok(gold.r > plain.r, 'not bigger');

    hitEnemy(gold, 1e9, hen.x, hen.y);
    assert.equal(game.eggBonus, ELITE_EGGS[0]);
    const chest = pickups.find((p) => p.alive && p.kind === CHEST);
    assert.ok(chest && !chest.big, 'a golden elite drops a plain chest');
    chest.alive = false;
    hitEnemy(rainbow, 1e9, hen.x, hen.y);
    assert.equal(game.eggBonus, ELITE_EGGS[0] + ELITE_EGGS[1]);
    const big = pickups.find((p) => p.alive && p.kind === CHEST);
    assert.ok(big && big.big, 'a rainbow elite drops a big chest');

    // Grabbing the big chest opens three upgrades
    clearEnemies();
    hen.x = big.x;
    hen.y = big.y;
    for (let i = 0; i < 120 && !game.reward.length; i++) update(STEP);
    assert.equal(game.reward.length, 3, 'a big chest did not hold three upgrades');
    resetRun();
  });

  it('the eggs an elite gives are banked with the run', () => {
    profile.eggs = 0;
    resetRun();
    start();
    game.eggBonus = ELITE_EGGS[1];
    damageHen(1e9, hen.x + 1, hen.y);
    update(STEP);
    assert.equal(profile.eggs, eggsEarned(game.time, game.kills, false, 0) + ELITE_EGGS[1]);
    profile.eggs = 0;
    resetRun();
  });

  it('elites come from the first minute every 40 to 60 s, and rainbow ones only from 3:00', () => {
    resetRun({ peaceful: false });
    start();
    // Pool slots are reused, so follow each elite from the step it appears until it is gone
    const seen = [];
    const live = new Set();
    while (game.time < 400 && !game.over) {
      hen.hp = hen.maxHp = 1e6;
      game.cards = [];
      game.reward = [];
      update(STEP);
      for (const e of live) if (!e.alive || !e.elite) live.delete(e);
      for (const e of enemies) {
        if (!e.alive || !e.elite || live.has(e)) continue;
        live.add(e);
        seen.push({ time: game.time, elite: e.elite });
      }
    }
    const times = seen.map((s) => s.time);
    assert.ok(times.length >= 6, `${times.length} elites in 400 s`);
    assert.ok(times[0] >= ELITE_FROM && times[0] < ELITE_FROM + 1, `the first came at ${times[0]}`);
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1];
      assert.ok(gap >= 39.9 && gap <= 60.1, `a gap of ${gap.toFixed(1)} s`);
    }
    for (const s of seen) if (s.elite > 1) assert.ok(s.time >= RAINBOW_FROM, `a rainbow elite at ${s.time}`);
    resetRun();
  });

  it('no more than six magpies at once: the waves send rats instead', () => {
    quietRun();
    for (let i = 0; i < ENEMY_TYPES[MAGPIE].max; i++) sturdy(MAGPIE, 6 + i, 0);
    assert.equal(pickKind([MAGPIE]), RAT);
    clearEnemies();
    assert.equal(pickKind([MAGPIE]), MAGPIE);
    assert.ok(!shots.some((s) => s.alive), 'pebbles outlived the reset');
    resetRun();
  });
});

describe('quiquiriqui at 5x: random events', () => {
  /** A started run with a tough hen, no weapons and (unless `waves`) a peaceful meadow. */
  function eventRun(waves = false) {
    resetRun({ peaceful: !waves });
    start();
    hen.hp = hen.maxHp = 1e6;
    buildOrder.length = 0;
  }
  const alive = () => enemies.filter((e) => e.alive);

  it('events start at 1:30, come every 45 to 75 s, never twice in a row, and not in a peaceful meadow', () => {
    eventRun(true);
    const seen = [];
    while (game.time < 480 && !game.over) {
      hen.hp = hen.maxHp = 1e6;
      game.cards = [];
      game.reward = [];
      for (const e of enemies) if (e.boss) e.alive = false; // a boss would hold events back
      update(STEP);
      // A new banner (hitstop can hold the clock, and the banner, for a step or two)
      const fresh = !seen.length || game.time - seen[seen.length - 1].time > 1;
      if (fresh && game.bannerTime === 2.5 && EVENTS.includes(game.banner)) seen.push({ time: game.time, name: game.banner });
    }
    assert.ok(seen.length >= 5, `${seen.length} events in 8 minutes`);
    assert.ok(seen[0].time >= EVENT_FROM && seen[0].time < EVENT_FROM + 1, `the first came at ${seen[0].time}`);
    assert.equal(seen[0].name, EVENTS[SURROUNDED], 'the first event teaches breaking out of a ring');
    for (let i = 1; i < seen.length; i++) {
      const gap = seen[i].time - seen[i - 1].time;
      assert.ok(gap >= EVENT_GAP - 0.1 && gap <= EVENT_GAP + 30.1, `a gap of ${gap.toFixed(1)} s`);
      assert.notEqual(seen[i].name, seen[i - 1].name, `${seen[i].name} twice in a row`);
    }
    // Peaceful: nothing
    eventRun();
    game.time = 300;
    steps(2);
    assert.ok(!EVENTS.includes(game.banner), 'an event in a peaceful meadow');
    resetRun();
  });

  it('HAWK!: its shadow follows her, then holds still; the dive hurts her only if she stays under it', () => {
    eventRun();
    startEvent(HAWK);
    assert.equal(game.banner, EVENTS[HAWK]);
    steps(HAWK_HUNT + 0.05);
    assert.ok(Math.hypot(hawk.x - hen.x, hawk.y - hen.y) < 0.5, 'the shadow did not catch up with her');
    // She runs out from under it: the dive misses
    const [x0, y0] = [hawk.x, hawk.y];
    hen.x += 3;
    let hp = hen.hp;
    steps(HAWK_STRIKE - HAWK_HUNT);
    assert.ok(Math.hypot(hawk.x - x0, hawk.y - y0) < 0.01, 'the shadow moved after it took aim');
    assert.equal(hen.hp, hp, 'a dive she ran from hit her');
    steps(HAWK_CYCLE - HAWK_STRIKE);
    assert.equal(hawk.dives, HAWK_DIVES - 1);
    // She stays: the next dive hits, and so does a predator standing there
    const rat = spawnEnemy(RAT, hen.x + 0.3, hen.y);
    rat.age = 1;
    rat.speed = 0;
    rat.dmg = 0; // its bites cost her 1 each: the dive must cost more
    hp = hen.hp;
    steps(HAWK_STRIKE + 0.3);
    assert.ok(hp - hen.hp >= HAWK_DMG, `a dive she stayed under missed (-${hp - hen.hp})`);
    assert.ok(!rat.alive, 'the hawk did not hit the rat under it');
    steps(HAWK_CYCLE * HAWK_DIVES);
    assert.equal(hawk.dives, 0, 'the hawk never left');
    resetRun();
  });

  it('STAMPEDE!: rats run straight across, not at her, then leave the meadow', () => {
    eventRun();
    startEvent(STAMPEDE);
    const rats = alive();
    assert.ok(rats.length >= 30, `${rats.length} rats`);
    const before = rats.map((e) => [e.x, e.y]);
    steps(1);
    const dirs = rats.map((e, i) => Math.atan2(e.y - before[i][1], e.x - before[i][0]));
    for (const a of dirs) assert.ok(Math.abs(Math.sin(a - dirs[0])) < 0.05, 'they do not all run the same way');
    steps(16);
    assert.equal(alive().length, 0, 'the stampede never left');
    resetRun();
  });

  it('SURROUNDED!: a ring of predators around her closes in on where she stood', () => {
    eventRun();
    const [cx, cy] = [hen.x, hen.y];
    startEvent(SURROUNDED);
    const ring = alive();
    assert.ok(ring.length >= 16, `${ring.length} in the ring`);
    const mean = () => ring.reduce((s, e) => s + Math.hypot(e.x - cx, e.y - cy), 0) / ring.length;
    assert.ok(Math.abs(mean() - RING_R) < 0.2, `the ring is ${mean().toFixed(1)} tiles wide`);
    hen.x += 12; // she is gone, yet they close in on the spot
    steps(2);
    assert.ok(mean() < RING_R - 1.5, `the ring only closed to ${mean().toFixed(1)}`);
    resetRun();
  });

  it('FRENZY!: for ten seconds the waves come three times as fast and predators run faster', () => {
    const births = (frenzy) => {
      eventRun(true);
      const step = () => {
        hen.hp = hen.maxHp = 1e6;
        game.cards = [];
        game.reward = [];
        update(STEP);
      };
      while (game.time < 70) step();
      if (frenzy) startEvent(FRENZY);
      const n0 = countEnemies();
      while (game.time < 76) step();
      return countEnemies() - n0;
    };
    const calm = births(false);
    const wild = births(true);
    assert.ok(wild > calm * (FRENZY_RATE - 0.8), `${calm} births calm, ${wild} in a frenzy`);

    eventRun();
    const rat = spawnEnemy(RAT, hen.x + 10, hen.y);
    rat.age = 1;
    steps(0.5);
    const calmStep = Math.hypot(rat.x - rat.prevX, rat.y - rat.prevY);
    startEvent(FRENZY);
    steps(0.5);
    const wildStep = Math.hypot(rat.x - rat.prevX, rat.y - rat.prevY);
    assert.ok(Math.abs(wildStep / calmStep - 1.2) < 0.01, `x${(wildStep / calmStep).toFixed(2)} speed`);
    steps(FRENZY_TIME + 1); // bites pause the game a little (hitstop)
    assert.equal(game.frenzy, 0, 'the frenzy never ended');
    resetRun();
  });
});

describe('quiquiriqui at 5x: difficulty', () => {
  const near = () => enemies.filter((e) => e.alive && !e.prop && Math.hypot(e.x - hen.x, e.y - hen.y) < SPAWN_MAX).length;

  it('the quota keeps the meadow full: cleared at 3:20, it fills up again in seconds; none when peaceful', () => {
    resetRun({ peaceful: false });
    start();
    buildOrder.length = 0;
    const step = () => {
      hen.hp = hen.maxHp = 1e6;
      game.cards = [];
      game.reward = [];
      update(STEP);
    };
    while (game.time < 200) step();
    clearEnemies();
    while (game.time < 208) step();
    assert.ok(near() >= quota(200) * 0.9, `${near()} predators around her, the quota is ${quota(200)}`);
    resetRun();
    start();
    game.time = 200;
    steps(3);
    assert.equal(countEnemies(), 0, 'the quota spawned in a peaceful meadow');
  });

  it('peril 0 is hard: with an empty shop the bot mostly falls before 7:00, never before 2:00; the full shop carries it further', () => {
    // A run that lasts past 7:00 counts as 7:00: enough to compare, and the test stays quick
    const CAP = 420;
    const falls = (shop) =>
      [1, 2, 3, 4].map((seed) => {
        resetRun({ peaceful: false, seed, shop });
        playWithBot(CAP / SPEED + 5, { onFrame: () => game.over || game.time >= CAP });
        return game.over && !game.won ? game.time : CAP;
      });
    const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
    const empty = falls([0, 0, 0, 0, 0]);
    for (const t of empty) assert.ok(t >= 120, `with an empty shop it fell at ${t.toFixed(0)} s`);
    assert.ok(empty.filter((t) => t < CAP).length >= 3, `with an empty shop: ${empty.map(Math.round).join(', ')} s`);
    const full = falls([5, 5, 5, 5, 5]);
    assert.ok(mean(full) > mean(empty) + 90, `${mean(empty).toFixed(0)} s -> ${mean(full).toFixed(0)} s with the full shop`);
    resetRun();
  });
});

describe('quiquiriqui at 5x: peril rules', () => {
  /** A run at `peril` with waves, a tough unarmed hen, no bosses (they hold events back), up to `until` s. */
  function playTo(peril, until, onStep = () => {}) {
    resetRun({ peaceful: false, peril });
    start();
    buildOrder.length = 0;
    while (game.time < until) {
      hen.hp = hen.maxHp = 1e6;
      game.cards = [];
      game.reward = [];
      for (const e of enemies) if (e.boss) e.alive = false;
      update(STEP);
      onStep();
    }
  }

  it(`peril ${MORE_EVENTS}, MORE EVENTS: after the first, events come every 30 to 50 s`, () => {
    const times = [];
    playTo(MORE_EVENTS, 330, () => {
      if (game.bannerTime === 2.5 && EVENTS.includes(game.banner) && !(times.length && game.time - times[times.length - 1] < 1)) times.push(game.time);
    });
    assert.ok(times.length >= 6, `${times.length} events in 5:30`);
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1];
      assert.ok(gap >= MORE_GAP - 0.1 && gap <= MORE_GAP + 20.1, `a gap of ${gap.toFixed(1)} s`);
    }
    resetRun();
  });

  it(`peril ${ELITES_X2}, ELITES X2: an elite every 20 to 30 s`, () => {
    const times = [];
    const live = new Set();
    playTo(ELITES_X2, 240, () => {
      for (const e of live) if (!e.alive || !e.elite) live.delete(e);
      for (const e of enemies) {
        if (!e.alive || !e.elite || live.has(e)) continue;
        live.add(e);
        times.push(game.time);
      }
    });
    assert.ok(times.length >= 7, `${times.length} elites in 4 minutes`);
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1];
      assert.ok(gap >= 19.9 && gap <= 30.1, `a gap of ${gap.toFixed(1)} s`);
    }
    resetRun();
  });

  it(`peril ${TWO_BOSSES}, TWO BOSSES: each boss comes with another`, () => {
    const bosses = (peril) => {
      resetRun({ peaceful: false, peril });
      start();
      buildOrder.length = 0;
      while (game.time < 61) {
        hen.hp = hen.maxHp = 1e6;
        game.cards = [];
        game.reward = [];
        update(STEP);
      }
      return enemies.filter((e) => e.alive && e.boss).length;
    };
    assert.equal(bosses(TWO_BOSSES - 1), 1);
    assert.equal(bosses(TWO_BOSSES), 2);
    resetRun();
  });

  /** A run at `peril` with no weapons and a hen too tough to fall. */
  function hopRun(peril) {
    resetRun({ peril });
    start();
    hen.hp = hen.maxHp = 1e6;
    buildOrder.length = 0;
  }

  /** A sturdy rat `gap` tiles from her body, on her screen-right, ready to hop; it only moves by hopping. */
  function ratAt(gap) {
    const d = ENEMY_TYPES[RAT].r + HEN_RADIUS + gap;
    const rat = sturdy(RAT, hen.x + d * Math.SQRT1_2, hen.y - d * Math.SQRT1_2);
    rat.age = 1;
    rat.timer = 0;
    rat.speed = 0;
    return rat;
  }

  it(`peril ${HOPS}, HOPS: close by, a predator now and then hops at her at once; standing still it bites, walking away dodges it`, () => {
    assert.ok(HOP_TIME <= 0.2, 'a slow hop');
    // She stands still: it leaves the ground on the next step, with no warning, and lands on her
    hopRun(HOPS);
    const rat = ratAt(0.5);
    update(STEP);
    assert.ok(rat.hop && rat.state === 2 && !rat.warn, 'it did not hop at once');
    steps(HOP_TIME + 0.1); // the bite's hitstop holds everything a moment
    assert.equal(hen.maxHp - hen.hp, rat.dmg, 'the hop did not bite her');
    assert.equal(rat.state, 0, 'it is still in the air');
    // Only now and then: the next hop comes 2 to 4 s later
    assert.ok(rat.timer > HOP_EVERY - 0.1 && rat.timer <= 2 * HOP_EVERY, `the next hop in ${rat.timer.toFixed(2)} s`);
    // Walking away (screen left) when it hops: it lands short of her
    hopRun(HOPS);
    holdKey('KeyA', true);
    steps(0.3);
    const missed = ratAt(0.5);
    steps(HOP_TIME + 0.2);
    holdKey('KeyA', false);
    assert.ok(missed.hop, 'it did not hop');
    assert.equal(hen.hp, hen.maxHp, 'walking away did not dodge the hop');
    // Farther than a hop away it does not jump
    hopRun(HOPS);
    const far = ratAt(1.5);
    steps(0.5);
    assert.ok(!far.hop && far.state === 0, 'it hopped from too far');
    resetRun();
  });

  it(`peril ${HOPS}: a touch still bites at once; one level easier nobody hops`, () => {
    hopRun(HOPS);
    let rat = ratAt(-0.2);
    update(STEP);
    assert.equal(rat.state, 0, 'it hopped while touching her');
    assert.equal(hen.maxHp - hen.hp, rat.dmg, 'a touch did not bite');
    hopRun(HOPS - 1);
    rat = ratAt(0.5);
    steps(1);
    assert.ok(!rat.hop && rat.state === 0, 'it hopped below HOPS');
    assert.equal(hen.hp, hen.maxHp, 'it reached her below HOPS');
    resetRun();
  });

  it(`peril ${TWO_CARDS}, TWO CARDS: a level-up offers two cards, not three`, () => {
    for (const [peril, n] of [[TWO_CARDS - 1, 3], [TWO_CARDS, 2]]) {
      resetRun({ peril });
      start();
      game.xp = xpToNext(1);
      update(STEP);
      assert.equal(game.cards.length, n, `peril ${peril}`);
      tapKey('Digit1');
      game.xp = xpToNext(2);
      steps(0.5);
      assert.equal(game.cards.length, n, `peril ${peril}, second level-up`);
    }
    resetRun();
  });

  it(`peril ${NO_MERCY}, NO MERCY: a fuller meadow and faster predators`, () => {
    resetRun({ peril: NO_MERCY - 1 });
    start();
    const before = quota(200);
    const a = { ...spawnEnemy(RAT, hen.x + 20, hen.y) };
    resetRun({ peril: NO_MERCY });
    start();
    assert.equal(before, QUOTA[3]);
    assert.equal(quota(200), Math.round(QUOTA[3] * NO_MERCY_QUOTA));
    const b = { ...spawnEnemy(RAT, hen.x + 20, hen.y) };
    assert.ok(Math.abs(b.speed / a.speed - NO_MERCY_SPEED) < 1e-9, `x${(b.speed / a.speed).toFixed(3)}`);
    resetRun();
  });
});

describe('quiquiriqui at 5x: hatching', () => {
  /** A started run with weapon `id` at level 5 and nothing else but `partner` (if given). */
  function armed(id, partner) {
    resetRun({ hen: 0 });
    start();
    buildOrder.length = 0;
    for (const key of Object.keys(build)) delete build[key];
    for (let i = 0; i < MAX_ITEM_LEVEL; i++) applyCard({ id });
    if (partner) applyCard({ id: partner });
  }
  const hatch = (id) => applyCard({ id, level: HATCH_LEVEL, hatch: true });
  /** A predator `kind` at (dx, dy) from the hen, risen, standing still, with health to spare. */
  function dummy(kind, dx, dy) {
    const e = spawnEnemy(kind, hen.x + dx, hen.y + dy);
    Object.assign(e, { age: 1, speed: 0, hp: 1e6, maxHp: 1e6 });
    return e;
  }

  it('a weapon at 5 with its partner passive offers HATCH! first; a chest hatches it', () => {
    armed('egg');
    assert.ok(!rollCards(false).some((c) => c.hatch), 'no partner yet');
    applyCard({ id: 'shades' });
    assert.deepEqual(hatchReady(), ['egg']);
    assert.deepEqual(rollCards(false)[0], { id: 'egg', level: HATCH_LEVEL, hatch: true });
    game.chests = 1;
    update(STEP);
    assert.equal(build.egg, HATCH_LEVEL, 'the chest did not hatch it');
    assert.ok(game.reward.some((c) => c.hatch));
    assert.equal(game.banner, 'GOLDEN OMELETTE!');
    assert.ok(!rollCards(false).some((c) => c.hatch), 'it hatched twice');
    resetRun();
  });

  it('every weapon card names its partner passive; a passive card names the weapon it would hatch', () => {
    resetRun({ hen: 0 });
    buildOrder.length = 0;
    for (const key of Object.keys(build)) delete build[key];
    for (const item of ITEMS.filter((it) => it.weapon)) {
      assert.equal(cardHint({ id: item.id, level: 1 }), `HATCH + ${ITEM_BY_ID[item.hatch.with].name}`);
    }
    assert.equal(cardHint({ id: 'shades', level: 1 }), '', 'a hint with no egg');
    armed('egg');
    assert.equal(cardHint({ id: 'shades', level: 1 }), 'HATCHES EGG TOSS');
    assert.equal(cardHint({ id: 'cape', level: 1 }), '', 'the cape does not hatch the egg');
    assert.equal(cardHint({ id: 'egg', level: HATCH_LEVEL, hatch: true }), '', 'a HATCH! card has no hint');
    assert.equal(cardHint({ id: 'meal', level: 0, boon: true }), '', 'a boon has no hint');
    applyCard({ id: 'shades' });
    hatch('egg');
    assert.equal(cardHint({ id: 'shades', level: 2 }), '', 'the egg has hatched already');
    // The pot serves two weapons: it names the first one she took
    armed('thunder');
    applyCard({ id: 'peck' });
    assert.equal(cardHint({ id: 'helmet', level: 1 }), 'HATCHES THUNDER COMB');
    resetRun();
  });

  it('taking the partner of a weapon at 5 says READY TO HATCH!; any other passive does not', () => {
    for (const [partner, expected] of [['shades', true], ['cape', false]]) {
      armed('egg');
      game.cards = [{ id: partner, level: 1 }];
      game.cardLock = 0;
      tapKey('Digit1');
      assert.equal(game.cards.length, 0, 'the card was not picked');
      assert.equal(game.banner === 'READY TO HATCH!', expected, `${partner}: "${game.banner}"`);
    }
    resetRun();
  });

  it('GOLDEN OMELETTE: an egg bursts wide, so a predator next to its target is hit too', () => {
    for (const [hatchIt, expectHit] of [[false, false], [true, true]]) {
      armed('egg', 'shades');
      if (hatchIt) hatch('egg');
      const target = dummy(RAT, 3, 0);
      const beside = dummy(RAT, 3, 1.3);
      for (let i = 0; i < 90 && beside.hp === beside.maxHp && target.hp === target.maxHp; i++) update(STEP);
      steps(0.3);
      assert.ok(target.hp < target.maxHp, 'the target was not hit');
      assert.equal(beside.hp < beside.maxHp, expectHit, hatchIt ? 'the omelette did not burst wide' : 'a plain egg burst wide');
    }
    resetRun();
  });

  it('IRON BEAK: one jab hits four predators and ignores armor', () => {
    armed('peck', 'helmet');
    hatch('peck');
    const foes = [dummy(BADGER, 1, 0), dummy(RAT, -1, 0), dummy(RAT, 0, 1), dummy(RAT, 0, -1), dummy(RAT, 1, 1)];
    steps(0.5);
    assert.ok(foes.filter((e) => e.hp < e.maxHp).length >= 4, 'fewer than four were jabbed');
    assert.equal((foes[0].maxHp - foes[0].hp) % weaponDamage('peck'), 0, 'armor took some off');
    resetRun();
  });

  it('QUILL STORM: the darts fly all around her', () => {
    armed('darts', 'boots');
    hatch('darts');
    dummy(RAT, 4, 0);
    for (let i = 0; i < 120 && !projectiles.some((p) => p.alive); i++) update(STEP);
    const angles = projectiles.filter((p) => p.alive).map((p) => Math.atan2(p.vy, p.vx)).sort((a, b) => a - b);
    assert.equal(angles.length, weaponStat('darts', 'n'));
    let widest = Math.PI * 2 - (angles[angles.length - 1] - angles[0]);
    for (let i = 1; i < angles.length; i++) widest = Math.max(widest, angles[i] - angles[i - 1]);
    assert.ok(widest < Math.PI / 4, `a gap of ${((widest * 180) / Math.PI).toFixed(0)} degrees`);
    resetRun();
  });

  it('WHIRLWIND: the gust heals her for what it hits', () => {
    armed('gust', 'cape');
    hatch('gust');
    hen.hp = 500;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1]]) dummy(RAT, dx, dy).dmg = 0;
    steps(1.2);
    assert.ok(hen.hp > 500, `still ${hen.hp}`);
    resetRun();
  });

  it('BROOD: six chicks', () => {
    armed('chicks', 'bandana');
    hatch('chicks');
    update(STEP);
    assert.equal(chicks.count, 6);
    resetRun();
  });

  it('STORM POT: bolts jump on to another predator', () => {
    armed('thunder', 'helmet');
    const foes = [];
    for (let k = 0; k < 12; k++) foes.push(dummy(RAT, -6 + k, (k % 3) - 1));
    steps(2);
    const plain = foes.filter((e) => e.hp < e.maxHp).length;
    armed('thunder', 'helmet');
    hatch('thunder');
    const again = [];
    for (let k = 0; k < 12; k++) again.push(dummy(RAT, -6 + k, (k % 3) - 1));
    for (let i = 0; i < 120 && !again.some((e) => e.hp < e.maxHp); i++) update(STEP);
    const struck = again.filter((e) => e.hp < e.maxHp).length;
    assert.ok(struck > weaponStat('thunder', 'n') || struck > plain, `${struck} struck (plain: ${plain})`);
    resetRun();
  });
});

describe('quiquiriqui at 5x: the bot and a long run', () => {
  it('the bot survives the first minute', () => {
    resetRun({ peaceful: false });
    playWithBot(20, { onFrame: () => game.over || game.time >= 60 });
    assert.equal(game.over, false, `the bot fell at ${formatClock(game.time)}`);
    assert.ok(game.time >= 59, `only ${game.time} s`);
    assert.ok(game.level >= 3, `level ${game.level}`);
    assert.ok(game.kills >= 20, `${game.kills} kills`);
  });

  it('ten minutes: every predator joins on its minute, the horde stays inside the pools and the frame budget', () => {
    resetRun({ peaceful: false });
    let peak = 0;
    let worst = 0;
    const firstSeen = {};
    playWithBot(150, {
      onFrame() {
        hen.hp = hen.maxHp = 1e6; // a soak test: keep her standing to see the whole timeline
        peak = Math.max(peak, countEnemies());
        for (const e of enemies) if (e.alive && !(e.kind in firstSeen)) firstSeen[e.kind] = game.time;
        return game.over || game.time >= RUN_LENGTH;
      },
    });
    assert.ok(game.time >= RUN_LENGTH && !game.over, `stopped at ${game.time}`);
    assert.ok(peak >= 150, `the horde peaked at ${peak}`);
    assert.equal(Object.keys(firstSeen).length, ENEMY_TYPES.length, `seen: ${JSON.stringify(firstSeen)}`);
    for (const [kind, from] of [[WEASEL, 60], [SNAKE, 180], [MAGPIE, 240], [CROW, 300], [SKUNK, 360], [BADGER, 420]]) {
      assert.ok(firstSeen[kind] >= from && firstSeen[kind] < from + 20, `${ENEMY_TYPES[kind].name} first seen at ${firstSeen[kind]}`);
    }
    // Time a step with the pool full
    while (spawnEnemy(RAT)) {}
    assert.equal(countEnemies(), MAX_ENEMIES);
    const t0 = performance.now();
    for (let i = 0; i < 120; i++) update(STEP);
    worst = (performance.now() - t0) / 120;
    assert.ok(worst < 4, `${worst.toFixed(2)} ms per step`);
  });
});

/**
 * A stand-in AudioContext that records what the synth does: buffers rendered, sources started and
 * the nodes they connect to. Lets the tests run the audio code under Node.
 */
class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.destination = { name: 'speakers' };
    this.started = [];
  }
  node(name) {
    const gain = {
      value: 1,
      setTargetAtTime(v) {
        this.value = v;
      },
    };
    return { name, gain, threshold: { value: 0 }, ratio: { value: 1 }, connect(to) { this.to = to; } };
  }
  createGain() {
    return this.node('gain');
  }
  createDynamicsCompressor() {
    return this.node('compressor');
  }
  createBuffer(channels, length) {
    const data = new Float32Array(length);
    return { length, getChannelData: () => data };
  }
  createBufferSource() {
    const ctx = this;
    return {
      buffer: null,
      connect(to) {
        this.to = to;
      },
      start(at) {
        ctx.started.push({ at, buffer: this.buffer, to: this.to });
      },
    };
  }
  resume() {}
}

/** Runs `fn` with the fake AudioContext installed and a fresh mixer, then removes both. */
function withFakeAudio(fn) {
  // Sounds are rate-limited on real time; let any limit left by earlier tests run out.
  const until = performance.now() + 60;
  while (performance.now() < until);
  globalThis.AudioContext = FakeAudioContext;
  audio.ctx = null;
  try {
    fn();
  } finally {
    delete globalThis.AudioContext;
    audio.ctx = audio.sfx = audio.music = null;
  }
}

describe('quiquiriqui: sound', () => {
  it('every sound goes through the effects bus into a compressor', () => {
    withFakeAudio(() => {
      sfxPeck();
      const ctx = audio.ctx;
      assert.equal(ctx.started.length, HIT_SOUNDS[0].length, 'the hit is not the chosen one');
      HIT_SOUNDS[0].forEach((recipe, i) => assert.equal(ctx.started[i].buffer.length, Math.floor(22050 * recipe.dur)));
      assert.equal(ctx.started[0].to, audio.sfx);
      assert.equal(audio.sfx.to.name, 'compressor');
      assert.equal(audio.music.to.name, 'compressor');
      assert.ok(ctx.started[0].buffer.getChannelData(0).some((v) => v !== 0), 'silent buffer');
    });
  });

  it('jingles stay in tune and in order; every predator has its own last sound', () => {
    withFakeAudio(() => {
      sfxLevelUp();
      const times = audio.ctx.started.map((s) => s.at);
      assert.deepEqual(times, [0, 0.08, 0.16, 0.24]);
      audio.ctx.started.length = 0;
      for (let kind = 0; kind < ENEMY_TYPES.length; kind++) sfxKill(kind);
      assert.ok(audio.ctx.started.length >= ENEMY_TYPES.length, `${audio.ctx.started.length} kill sounds`);
    });
  });
});

describe('quiquiriqui: music', () => {
  it('the score is whole: every part has a melody, a bass line and drums, in full bars', () => {
    for (const [name, part] of Object.entries(PARTS)) {
      const n = sectionLength(name);
      assert.equal(n % 8, 0, `${name} is not whole bars`);
      for (const voice of ['hum', 'bass', 'drums']) assert.equal(part[voice].length, n, `${name}.${voice}`);
      let melody = 0;
      for (let i = 0; i < n; i++) melody += notesAt(name, i).filter((note) => note.voice === 'hum').length;
      assert.ok(melody >= 4, `${name} has ${melody} melody notes`);
    }
  });

  it('the music follows the run: day, a boss, night, the dawn fanfare once; M turns it off', () => {
    withFakeAudio(() => {
      localStorage.removeItem('qq_mute');
      music.on = true;
      resetRun();
      start(); // the first sound (the cluck) opens the mixer
      const ctx = audio.ctx;
      const tick = (seconds) => {
        for (let i = 0; i < Math.round(seconds / STEP); i++) {
          ctx.currentTime += STEP;
          update(STEP);
        }
      };
      tick(0.5);
      assert.equal(music.mood, 'day');
      assert.ok(ctx.started.some((s) => s.to === audio.music), 'no music notes');
      assert.ok(audio.music.gain.value > 0);
      const boss = spawnBoss(FOX);
      boss.speed = 0;
      tick(2.5);
      assert.equal(music.mood, 'boss', 'a boss did not bring the chorus');
      clearAll();
      game.time = 500;
      tick(2.5);
      assert.equal(music.mood, 'night');
      tapKey('KeyM');
      assert.equal(music.on, false);
      assert.equal(localStorage.getItem('qq_mute'), '1');
      tick(0.1);
      assert.equal(audio.music.gain.value, 0, 'M did not silence the music');
      tapKey('KeyM');
      assert.equal(music.on, true);
      // Each dawn: the fanfare, then the day theme again
      game.time = RUN_LENGTH - 0.01;
      tick(0.1);
      assert.equal(game.day, 2, 'no dawn');
      tick(2);
      assert.equal(music.mood, 'dawn', 'no fanfare at dawn');
      tick(6);
      assert.equal(music.mood, 'day', 'the day theme did not come back');
    });
  });

  it('M on the title screen does not start a run', () => {
    resetRun();
    const on = music.on;
    tapKey('KeyM');
    update(STEP);
    assert.equal(game.started, false);
    assert.equal(music.on, !on);
    tapKey('KeyM');
  });
});

describe('quiquiriqui: text and layout', () => {
  it('every HUD string fits the 320 px canvas', () => {
    for (const [key, text] of Object.entries(HUD_STRINGS)) {
      assert.ok(HUD_SCALES[key], `no scale for ${key}`);
      assert.ok(textWidth(text, HUD_SCALES[key]) <= WIDTH - 16, `${key} is too wide`);
    }
    assert.ok(textWidth(gameOverLine(599, 9999, 99), 1) <= WIDTH - 16, 'game over line');
    const saved = { ...profile };
    Object.assign(profile, { hens: 1, hen: 0 });
    for (let p = 0; p <= MAX_PERIL; p++) {
      profile.peril = p;
      assert.ok(textWidth(perilLine(), 1) <= WIDTH - 16, `peril line: ${perilLine()}`);
      if (p) assert.ok(perilLine().includes(PERIL_RULES[p]), 'the rule is not on the title');
    }
    profile.peril = 0;
    for (let i = 0; i < HENS.length; i++) {
      game.hen = i;
      assert.ok(textWidth(henLine(), 1) <= WIDTH - 16, 'hen line');
      if (HENS[i].hint) assert.ok(textWidth(HENS[i].hint, 1) <= WIDTH - 16, 'unlock hint');
    }
    game.hen = 0;
    profile.eggs = 99999;
    assert.ok(textWidth(shopLine(), 1) <= WIDTH - 16, 'shop line');
    for (const upgrade of SHOP) {
      // Name and effect sit between the icon and the level pips
      for (const line of [upgrade.name, upgrade.text]) assert.ok(SHOP_ROW.text + textWidth(line, 1) <= SHOP_ROW.pips - 4, `shop: "${line}"`);
      assert.ok(iconSprites[upgrade.id], `no icon for the shop's ${upgrade.id}`);
    }
    // The dearest price ends left of the egg, and leaves the pips alone
    profile.shop = SHOP.map(() => SHOP_COSTS.length - 1);
    const priceLeft = SHOP_ROW.x + SHOP_ROW.w - 15 - textWidth(shopCost(0), 1);
    assert.ok(SHOP_ROW.pips + 6 * SHOP_COSTS.length + 4 <= priceLeft, 'the pips run into the price');
    // The whole shop fits the shortest screen
    assert.ok(shopRowY(SHOP.length) + 6 <= HEIGHT, 'BACK is off the screen');
    Object.assign(profile, saved);
  });

  it('every card name and description fits its card', () => {
    for (const boon of BOONS) {
      assert.ok(textWidth(boon.name, CARD_NAME_SCALE) <= CARD_W - 6, `${boon.id} name`);
      for (const line of cardText({ id: boon.id, level: 0, boon: true })) {
        assert.ok(textWidth(line, CARD_TEXT_SCALE) <= CARD_W - 6, `${boon.id}: "${line}"`);
      }
    }
    for (const item of ITEMS) {
      assert.ok(textWidth(item.name, CARD_NAME_SCALE) <= CARD_W - 6, `${item.id} name`);
      for (let level = 1; level <= MAX_ITEM_LEVEL; level++) {
        for (const line of cardText({ id: item.id, level })) {
          assert.ok(textWidth(line, CARD_TEXT_SCALE) <= CARD_W - 6, `${item.id}: "${line}"`);
        }
      }
      if (!item.weapon) continue;
      for (const key of Object.keys(item.lv)) assert.equal(item.lv[key].length, HATCH_LEVEL, `${item.id}.${key}`);
      // Its hatched self: a name and two lines that fit, and a partner passive that exists
      assert.ok(textWidth(item.hatch.name, CARD_NAME_SCALE) <= CARD_W - 6, `${item.hatch.name}`);
      for (const line of cardText({ id: item.id, level: HATCH_LEVEL, hatch: true })) {
        assert.ok(textWidth(line, CARD_TEXT_SCALE) <= CARD_W - 6, `${item.hatch.name}: "${line}"`);
      }
      assert.ok(ITEM_BY_ID[item.hatch.with] && !ITEM_BY_ID[item.hatch.with].weapon, `${item.id} hatches with a passive`);
      // Its gold hints: on its own card, and on its partner's while she owns it
      for (const hint of [`HATCH + ${ITEM_BY_ID[item.hatch.with].name}`, `HATCHES ${item.name}`]) {
        assert.ok(textWidth(hint, CARD_TEXT_SCALE) <= CARD_W - 6, `"${hint}"`);
      }
    }
    assert.equal(new Set(ITEMS.filter((item) => item.weapon).map((item) => item.hatch.name)).size, 7, 'hatch names repeat');
  });

  it('a phone held upright gets a taller view, and the menus and spawns follow it', () => {
    try {
      assert.equal(fitScreen(390, 844), MAX_HEIGHT);
      assert.equal(HEIGHT, MAX_HEIGHT);
      const card = cardRect(0, 3);
      assert.ok(card.y > 100 && card.y + card.h < HEIGHT - 40, `cards at y ${card.y}`);
      resetRun({ peaceful: false });
      start();
      // Newborns appear off-screen, or (above and below a tall view) at the farthest birth distance.
      let newborns = 0;
      for (let i = 0; i < 60; i++) {
        update(STEP);
        for (const e of enemies) {
          if (!e.alive || e.age > STEP * 1.5) continue;
          newborns++;
          const { sx, sy } = screenOffset(e.x, e.y);
          const off = Math.abs(sx) > WIDTH / 2 - 4 || Math.abs(sy) > HEIGHT / 2 - 4;
          assert.ok(off || Math.hypot(e.x - hen.x, e.y - hen.y) > SPAWN_MAX - 0.1, `born on screen at ${sx}, ${sy}, close by`);
        }
      }
      for (let i = 0; i < 300 && !newborns; i++) {
        update(STEP);
        newborns += enemies.filter((e) => e.alive && e.age <= STEP * 1.5).length;
      }
      assert.ok(newborns > 0, 'nobody was born');
      assert.ok(screenScale(390, 844) > 1.2 && screenScale(390, 844) < 1.25, 'the phone should fill its width');
      assert.equal(fitScreen(844, 390), MIN_HEIGHT);
      assert.equal(fitScreen(1024, 768), 240);
      assert.equal(fitScreen(1920, 1080), MIN_HEIGHT);
      assert.equal(screenScale(1920, 1080), 6);
    } finally {
      fitScreen(WIDTH, MIN_HEIGHT);
    }
  });

  it('the pixel font: every glyph is 5 rows of 3 pixels, and widths are exact', () => {
    for (const [ch, rows] of Object.entries(GLYPHS)) {
      assert.equal(rows.length, GLYPH_H, ch);
      for (const row of rows) assert.ok(row >= 0 && row < 1 << GLYPH_W, `${ch}: ${row}`);
    }
    assert.equal(textWidth('ABC', 2), (3 * 4 - 1) * 2);
    assert.equal(textWidth('', 3), 0);
  });

  it('every text the game can show has a glyph for each of its characters', () => {
    const saved = JSON.parse(JSON.stringify(profile));
    const texts = [...Object.values(HUD_STRINGS)];
    for (const item of [...ITEMS, ...BOONS]) texts.push(item.name, ...(item.text || []), ...(item.up || []), item.cost || '');
    for (const item of ITEMS) if (item.hatch) texts.push(item.hatch.name, `${item.hatch.name}!`, ...item.hatch.text, 'HATCH!');
    for (const item of ITEMS) if (item.hatch) texts.push(`HATCH + ${ITEM_BY_ID[item.hatch.with].name}`, `HATCHES ${item.name}`, 'READY TO HATCH!');
    for (const upgrade of SHOP) texts.push(upgrade.name, upgrade.text);
    for (const hen of HENS) texts.push(hen.name, `${hen.name}!`, hen.hint || '');
    for (game.hen = 0; game.hen < HENS.length; game.hen++) texts.push(henLine());
    game.hen = 0;
    for (const [level, eggs, hens, peril] of [[0, 0, 1, 0], [5, 99999, 7, 5]]) {
      Object.assign(profile, { eggs, hens, peril, shop: SHOP.map(() => level) });
      texts.push(shopLine(), perilLine(), henLine(), ...SHOP.map((_, i) => shopCost(i)));
    }
    Object.assign(profile, saved);
    texts.push(gameOverLine(3599.9, 98765, 123), 'BEST 12:34   +99 GOLDEN EGGS', ...PERIL_NAMES.map((name) => `${name} DAY 12  59:59`));
    texts.push('+250 HP', '+300', '-120', 'MISS', '850/1000', '0123456789', 'BOON', 'NEW!', 'LV 99', 'KILLS 9999', 'SHOP', 'B: BACK');
    for (let kind = 0; kind < ENEMY_TYPES.length; kind++) texts.push(bossName({ kind }));
    // Banners: the events and the rainbow elites, drawn at scale 3
    const banners = [...EVENTS, ...ENEMY_TYPES.map((type) => `RAINBOW ${type.name.toUpperCase()}!`)];
    for (const banner of banners) assert.ok(textWidth(banner, 3) <= WIDTH - 16, `${banner} is too wide`);
    texts.push(...banners, `+${ELITE_EGGS[0]} EGGS`, `+${ELITE_EGGS[1]} EGGS`);
    for (const text of texts) {
      for (const ch of text) assert.ok(GLYPHS[ch], `no glyph for "${ch}" in "${text}"`);
    }
  });

  it('her health reads as a number on a bar in the top bar, between the level and the clock', () => {
    start();
    assert.equal(healthText(), '1000/1000');
    hen.hp = 849.5;
    assert.equal(healthText(), '850/1000');
    // The widest it can get: a long run of THICK FEATHERS boons
    hen.hp = hen.maxHp = 99999;
    const { x, w } = HEALTH_BAR;
    assert.ok(textWidth(healthText(), 1) <= w - 6, `${healthText()} overflows the bar`);
    assert.ok(4 + textWidth('LV 999', 1) < x, 'the level runs into the bar');
    assert.ok(x + w < WIDTH / 2 - textWidth('NO MERCY DAY 12  59:59', 1) / 2, 'the bar runs into the clock');
    resetRun();
  });

  it('three cards fit side by side on screen', () => {
    const first = cardRect(0, 3);
    const last = cardRect(2, 3);
    assert.ok(first.x >= 4 && last.x + last.w <= WIDTH - 4);
    assert.ok(first.y + first.h <= HEIGHT - 4);
  });

  it('formats the clock as MM:SS', () => {
    assert.equal(formatClock(0), '00:00');
    assert.equal(formatClock(65.9), '01:05');
    assert.equal(formatClock(600), '10:00');
  });

  it('the XP curve: quick up to level 40 (about the first dawn), then steep up to 100 (about the third)', () => {
    assert.equal(xpToNext(1), 4);
    assert.equal(xpToNext(2), 6);
    let total = 0;
    const reach = {};
    for (let l = 1; l < 100; l++) {
      assert.ok(xpToNext(l + 1) > xpToNext(l));
      total += xpToNext(l);
      reach[l + 1] = total;
    }
    // Measured (--god, full shop, EGG): about 130 corn by 2:00, 2,000 by 10:00, 15,500 by 18:00, 86,000 by 30:00
    assert.ok(reach[10] > 100 && reach[10] < 160, `level 10 at ${reach[10]}`);
    assert.ok(reach[40] > 1800 && reach[40] < 2200, `level 40 at ${reach[40]}`);
    assert.ok(reach[70] > 13000 && reach[70] < 17000, `level 70 at ${reach[70]}`);
    assert.ok(reach[100] > 75000 && reach[100] < 90000, `level 100 at ${reach[100]}`);
  });
});
