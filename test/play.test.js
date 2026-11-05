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
  HEN_SIZE,
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
  HUD_SIZES,
  CARD_W,
  CARD_NAME_SIZE,
  CARD_TEXT_SIZE,
  estimateTextWidth,
  gameOverLine,
  cardRect,
  cardAt,
} from '../src/render.js';
import { WIDTH, HEIGHT, MIN_HEIGHT, MAX_HEIGHT, fitScreen, screenScale } from '../src/screen.js';
import { formatClock, xpToNext } from '../src/state.js';
import {
  RAT,
  FOX,
  SNAKE,
  CROW,
  BADGER,
  CRATE,
  ENEMY_TYPES,
  MAX_ENEMIES,
  BOSS_HP,
  BOSS_SIZE,
  BOSS_BITE,
  SPAWN_MAX,
  spawnEnemy,
  spawnBoss,
  hitEnemy,
  screenOffset,
  countEnemies,
} from '../src/enemies.js';
import { pickups, spawnPickup, CHEST, MAGNET, BOMB, FOOD } from '../src/pickups.js';
import { TIMELINE, CRATE_EVERY } from '../src/waves.js';
import { spawnCorn } from '../src/corn.js';
import { ITEMS, ITEM_BY_ID, MAX_ITEM_LEVEL, SLOTS, build, buildOrder, applyCard, rollCards, cardText, stats, weaponDamage } from '../src/items.js';
import { projectiles, chicks, KERNEL } from '../src/weapons.js';
import { damageHen, syncHenStats } from '../src/hen.js';
import { particles, popups, bolts } from '../src/pool.js';
import { weatherAt, RUN_LENGTH } from '../src/weather.js';

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

/** The hen's 24x24 shape as a flat array of palette indices, for one pose and outfit. */
function henGrid(outfit, step = 'idle') {
  const shape = henShape(step, outfit);
  const grid = [];
  for (let y = 1; y < HEN_SIZE - 1; y++) for (let x = 1; x < HEN_SIZE - 1; x++) grid.push(shape(x, y));
  return grid.join(',');
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
    const bites = (100 - hen.hp) / rat.dmg;
    assert.ok(Number.isInteger(bites) && bites >= 2 && bites <= 3, `${bites} bites in 1 s`);
    applyCard({ id: 'helmet' });
    applyCard({ id: 'helmet' });
    const before = hen.hp;
    damageHen(5, rat.x, rat.y);
    assert.equal(before - hen.hp, 3);
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
    assert.ok(drops >= 80 && drops < 100, `${drops} drops in 100 kills`);
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
      for (const c of cards) assert.ok(c.level <= MAX_ITEM_LEVEL);
      applyCard(cards[0]);
      const weapons = buildOrder.filter((id) => ITEM_BY_ID[id].weapon).length;
      assert.ok(weapons <= SLOTS, `${weapons} weapons`);
    }
    for (const id of buildOrder) assert.equal(build[id], MAX_ITEM_LEVEL, id);
    const weapons = ITEMS.filter((item) => item.weapon);
    assert.equal(buildOrder.filter((id) => ITEM_BY_ID[id].weapon).length, Math.min(SLOTS, weapons.length));
    assert.equal(rollCards(false).length, 0);
  });

  it('Sunglasses scale every weapon hit', () => {
    start();
    assert.equal(weaponDamage('egg'), 10);
    applyCard({ id: 'shades' });
    applyCard({ id: 'shades' });
    assert.equal(weaponDamage('egg'), 12);
  });

  it('Hero Cape raises max health and heals what it adds', () => {
    start();
    hen.hp = 50;
    applyCard({ id: 'cape' });
    syncHenStats();
    assert.equal(hen.maxHp, 120);
    assert.equal(hen.hp, 70);
  });

  it('Lucky Bandana dodges about 6% of bites per level', () => {
    start();
    for (let i = 0; i < 3; i++) applyCard({ id: 'bandana' });
    hen.hp = hen.maxHp = 1e6;
    let dodged = 0;
    for (let i = 0; i < 2000; i++) {
      const before = hen.hp;
      damageHen(5, hen.x + 1, hen.y);
      if (hen.hp === before) dodged++;
    }
    assert.ok(dodged / 2000 > 0.14 && dodged / 2000 < 0.22, `${dodged / 20}% dodged`);
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

  it('passives add up into the stats', () => {
    const speed = stats.speed;
    applyCard({ id: 'boots' });
    applyCard({ id: 'boots' });
    assert.ok(Math.abs(stats.speed - (speed + 0.16)) < 1e-9);
    applyCard({ id: 'basket' });
    assert.ok(stats.magnet > 2.2);
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

  it('no outfit ever uses a meadow color', () => {
    for (const tier of [1, 2, 3]) {
      const outfits = [Object.fromEntries(WORN_ITEMS.map((id) => [id, tier])), ...WORN_ITEMS.map((id) => ({ [id]: tier }))];
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
    hitEnemy(boss, boss.hp, hen.x, hen.y);
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
    // Bites freeze the action for a moment, so wait on the game clock, not on steps.
    while (game.time < CRATE_EVERY * 2 + 1) update(STEP);
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
    hen.hp = 50;
    spawnPickup(FOOD, hen.x, hen.y);
    steps(0.1);
    assert.equal(hen.hp, 80);
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

  it('surviving ten minutes wins at dawn: the predators run, the best time is kept, a key goes back', () => {
    localStorage.removeItem('qq_best');
    game.best = 0;
    start();
    const rat = sturdy(RAT, hen.x + 3, hen.y);
    game.time = RUN_LENGTH - 0.05;
    steps(0.2);
    assert.equal(game.won, true);
    assert.equal(game.over, true);
    assert.equal(game.time, RUN_LENGTH);
    assert.equal(localStorage.getItem('qq_best'), String(RUN_LENGTH));
    const away = () => Math.hypot(rat.x - hen.x, rat.y - hen.y);
    const d0 = away();
    steps(0.5);
    assert.ok(away() > d0, 'the rat did not run away');
    steps(1.5);
    tapKey('Space');
    assert.equal(game.started, false);
    assert.equal(game.won, false);
  });
});

describe('quiquiriqui at 5x: the bot and a long run', () => {
  it('the bot survives the first minute', () => {
    resetRun({ peaceful: false });
    playWithBot(20, { onFrame: () => game.over || game.time >= 60 });
    assert.equal(game.over, false, `the bot fell at ${formatClock(game.time)}`);
    assert.ok(game.time >= 59, `only ${game.time} s`);
    assert.ok(game.level >= 4, `level ${game.level}`);
    assert.ok(game.kills >= 30, `${game.kills} kills`);
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
        return game.over;
      },
    });
    assert.equal(game.won, true, `stopped at ${game.time}`);
    assert.equal(peak, MAX_ENEMIES, 'the horde never reached the cap');
    assert.equal(Object.keys(firstSeen).length, ENEMY_TYPES.length, `seen: ${JSON.stringify(firstSeen)}`);
    for (const [kind, from] of [[SNAKE, 180], [CROW, 300], [BADGER, 420]]) {
      assert.ok(firstSeen[kind] >= from && firstSeen[kind] < from + 20, `${ENEMY_TYPES[kind].name} first seen at ${firstSeen[kind]}`);
    }
    // Time a step with the full horde
    const t0 = performance.now();
    for (let i = 0; i < 120; i++) update(STEP);
    worst = (performance.now() - t0) / 120;
    assert.ok(worst < 4, `${worst.toFixed(2)} ms per step`);
  });
});

describe('quiquiriqui: text and layout', () => {
  it('every HUD string fits the 320 px canvas', () => {
    for (const [key, text] of Object.entries(HUD_STRINGS)) {
      assert.ok(HUD_SIZES[key], `no size for ${key}`);
      assert.ok(estimateTextWidth(text, HUD_SIZES[key]) <= WIDTH - 16, `${key} is too wide`);
    }
    assert.ok(estimateTextWidth(gameOverLine(599, 9999, 99), 7) <= WIDTH - 16, 'game over line');
  });

  it('every card name and description fits its card', () => {
    for (const item of ITEMS) {
      assert.ok(estimateTextWidth(item.name, CARD_NAME_SIZE) <= CARD_W - 6, `${item.id} name`);
      for (let level = 1; level <= MAX_ITEM_LEVEL; level++) {
        for (const line of cardText({ id: item.id, level })) {
          assert.ok(estimateTextWidth(line, CARD_TEXT_SIZE) <= CARD_W - 6, `${item.id}: "${line}"`);
        }
      }
      if (item.weapon) for (const key of Object.keys(item.lv)) assert.equal(item.lv[key].length, MAX_ITEM_LEVEL);
    }
  });

  it('a phone held upright gets a taller view, and the menus and spawns follow it', () => {
    try {
      assert.equal(fitScreen(390, 844), MAX_HEIGHT);
      assert.equal(HEIGHT, MAX_HEIGHT);
      const card = cardRect(0, 3);
      assert.ok(card.y > 100 && card.y + card.h < HEIGHT - 40, `cards at y ${card.y}`);
      resetRun({ peaceful: false });
      start();
      steps(3);
      const fresh = enemies.filter((e) => e.alive && e.age < 0.6);
      assert.ok(fresh.length > 0);
      for (const e of fresh) {
        const { sx, sy } = screenOffset(e.x, e.y);
        assert.ok(Math.abs(sx) > WIDTH / 2 - 4 || Math.abs(sy) > HEIGHT / 2 - 4, `spawned on screen at ${sx}, ${sy}`);
      }
      assert.ok(screenScale(390, 844) > 1.2 && screenScale(390, 844) < 1.25, 'the phone should fill its width');
      assert.equal(fitScreen(844, 390), MIN_HEIGHT);
      assert.equal(fitScreen(1024, 768), 240);
      assert.equal(fitScreen(1920, 1080), MIN_HEIGHT);
      assert.equal(screenScale(1920, 1080), 6);
    } finally {
      fitScreen(WIDTH, MIN_HEIGHT);
    }
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

  it('the XP curve grows, but slower than linear', () => {
    assert.equal(xpToNext(1), 4);
    for (let l = 1; l < 30; l++) assert.ok(xpToNext(l + 1) >= xpToNext(l));
    assert.ok(xpToNext(21) < 20 * xpToNext(2) / 2);
  });
});
