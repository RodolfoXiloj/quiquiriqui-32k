// Browser playtest: a headless Chrome plays Quiquiriqui at 5x with real keyboard, mouse and touch
// events, checks the game state and the canvas pixels, and saves screenshots to
// test-output/playtest/. Dev-only (never shipped). Exits with code 1 if any check fails.
//
// Usage: npm run playtest   (builds dist/ first)   or   node tools/playtest.mjs
//
// The dev-server scenarios load /?autoplay&drive=cdp: tools/browser/autoplay.js speeds the game up
// and exposes window.__qq (snapshot and dev cheats), while this script sends the real input. The
// movement checks add &peaceful (no predators, no starting corn). Then come the predators, the
// cards (real key, click and tap), the game over and the watch-mode bot. The last scenario loads
// the shipped dist/index.html at 1x, where only the pixels can be checked.
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startDevServer } from './dev.mjs';
import { launchBrowser } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'test-output', 'playtest');
const DIST = path.join(ROOT, 'dist', 'index.html');
const SPEED = 5;
/** Headless --window-size is the outer size, so the viewport itself is pinned: 640x360 is exactly 2x. */
const VIEWPORT = { width: 640, height: 360, deviceScaleFactor: 1, mobile: false };

/** Key name and Windows virtual-key code for each key the scenarios press. */
const KEYS = {
  KeyD: ['d', 68],
  KeyA: ['a', 65],
  KeyW: ['w', 87],
  KeyS: ['s', 83],
  KeyX: ['x', 88],
  KeyM: ['m', 77],
  KeyE: ['e', 69],
  KeyQ: ['q', 81],
  KeyC: ['c', 67],
  KeyZ: ['z', 90],
  KeyB: ['b', 66],
  Space: [' ', 32],
  Digit1: ['1', 49],
  Digit2: ['2', 50],
  Digit3: ['3', 51],
};

/**
 * Runs in the page: counts the distinct colors on the game canvas, counts hen-feather pixels
 * (PALETTE[7], #f4f0e6) in a 48x48 box at the center, counts predator fur pixels anywhere (rat
 * #a7a3b8, fox #ee7a2c), bluish pixels (rain) and card-panel pixels (#2b2b44), measures the mean brightness (0-255), and
 * hashes the image to detect change.
 */
const CANVAS_STATS = `(() => {
  const c = document.getElementById('c');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const colors = new Set();
  let hen = 0;
  let fur = 0;
  let sky = 0;
  let panel = 0;
  let light = 0;
  let hash = 0;
  for (let i = 0; i < d.length; i += 4) {
    const rgb = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    colors.add(rgb);
    hash = (Math.imul(hash, 31) + rgb) | 0;
    const p = i / 4;
    const x = p % c.width;
    const y = (p / c.width) | 0;
    if (rgb === 0xf4f0e6 && Math.abs(x - c.width / 2) < 24 && Math.abs(y - c.height / 2) < 24) hen++;
    if (rgb === 0xa7a3b8 || rgb === 0xee7a2c) fur++;
    if (d[i + 2] > d[i + 1] + 10) sky++; // bluish (rain streaks, even half transparent; grass is green)
    if (rgb === 0x2b2b44) panel++; // card panels
    light += d[i] + d[i + 1] + d[i + 2];
  }
  return {
    colors: colors.size,
    henPixels: hen,
    furPixels: fur,
    skyPixels: sky,
    panelPixels: panel,
    light: light / (3 * c.width * c.height),
    hash,
    w: c.width,
    h: c.height,
  };
})()`;

/**
 * Runs in the page: counts outfit colors in the 48x48 box around the hen (the screen center):
 * pot grey #a7a3b8, bandana and dart blue #7fd4ff, cape and boot red #e0402f, gold #f7b733.
 */
const OUTFIT_STATS = `(() => {
  const c = document.getElementById('c');
  const d = c.getContext('2d').getImageData(c.width / 2 - 24, c.height / 2 - 24, 48, 48).data;
  const n = { grey: 0, blue: 0, red: 0, gold: 0 };
  for (let i = 0; i < d.length; i += 4) {
    const rgb = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    if (rgb === 0xa7a3b8) n.grey++;
    if (rgb === 0x7fd4ff) n.blue++;
    if (rgb === 0xe0402f) n.red++;
    if (rgb === 0xf7b733) n.gold++;
  }
  return n;
})()`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fmt = (n) => Number(n).toFixed(2);
const results = [];
const problems = [];
let current = '';

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(name, fn) {
  current = name;
  const t0 = performance.now();
  try {
    await fn();
    results.push({ name, ok: true, seconds: (performance.now() - t0) / 1000 });
  } catch (error) {
    results.push({ name, ok: false, error: error.message });
  }
}

/** Records every uncaught exception, console error and failed resource load. */
function watchForProblems(client) {
  client.on('Runtime.exceptionThrown', ({ exceptionDetails: d }) => {
    problems.push(`[${current}] exception: ${d.exception?.description || d.text}`);
  });
  client.on('Runtime.consoleAPICalled', ({ type, args }) => {
    if (type === 'error' || type === 'assert') {
      problems.push(`[${current}] console.${type}: ${args.map((a) => a.value ?? a.description).join(' ')}`);
    }
  });
  client.on('Log.entryAdded', ({ entry }) => {
    // Browsers ask for /favicon.ico on their own; the game has none on purpose (zero assets).
    if (entry.level === 'error' && !String(entry.url).endsWith('/favicon.ico')) {
      problems.push(`[${current}] ${entry.text} ${entry.url || ''}`.trim());
    }
  });
}

function pageHelpers(client) {
  async function evaluate(expression) {
    const r = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error(`page error: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    }
    return r.result.value;
  }

  async function waitFor(expression, timeoutMs = 8000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      try {
        if (await evaluate(expression)) return;
      } catch {
        // the page may be mid-navigation
      }
      await sleep(50);
    }
    throw new Error(`timed out waiting for: ${expression}`);
  }

  async function key(code, type) {
    const [name, vk] = KEYS[code];
    await client.send('Input.dispatchKeyEvent', { type, code, key: name, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  }

  return {
    evaluate,
    waitFor,
    async open(url, ready) {
      await client.send('Page.navigate', { url });
      await waitFor(`document.readyState === 'complete'`);
      if (ready) await waitFor(ready);
    },
    keyDown: (code) => key(code, 'keyDown'),
    keyUp: (code) => key(code, 'keyUp'),
    async tapKey(code, ms) {
      await key(code, 'keyDown');
      await sleep(ms);
      await key(code, 'keyUp');
    },
    mouse: (type, p) => client.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 }),
    touch: (type, points) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points }),
    snapshot: () => evaluate('window.__qq.snapshot()'),
    stats: () => evaluate(CANVAS_STATS),
    /** Page coordinates of canvas pixel (cx, cy), whatever the upscale factor. */
    toPage: (cx, cy) =>
      evaluate(`(() => {
        const c = document.getElementById('c');
        const r = c.getBoundingClientRect();
        return { x: r.left + (${cx} / c.width) * r.width, y: r.top + (${cy} / c.height) * r.height };
      })()`),
    async screenshot(name) {
      const { data } = await client.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(OUT, name), Buffer.from(data, 'base64'));
    },
  };
}

const ready = 'window.__qq && window.__qq.speed';

async function movementScenarios(page, client, base) {
  await check('1. boots on the title screen; meadow and hen are drawn', async () => {
    await page.open(`${base}/?autoplay&drive=cdp&peaceful&speed=${SPEED}`, ready);
    await sleep(300);
    const s = await page.snapshot();
    const st = await page.stats();
    await page.screenshot('01-title.png');
    expect(!s.started, 'the run started on its own');
    expect(st.w === 320 && st.h === 180, `canvas is ${st.w}x${st.h}`);
    expect(st.colors >= 8, `only ${st.colors} colors on screen`);
    expect(st.henPixels >= 20, `hen not visible at the center (${st.henPixels} px)`);
  });

  await check(`2. runs at ${SPEED}x; holding D walks screen-right`, async () => {
    const a = await page.snapshot();
    const t0 = performance.now();
    await page.keyDown('KeyD');
    await sleep(2000);
    const b = await page.snapshot();
    const real = (performance.now() - t0) / 1000;
    await page.screenshot('02-walk.png');
    await page.keyUp('KeyD');
    const ratio = b.time / real;
    expect(b.started, 'the first key press did not start the run');
    expect(ratio >= 4 && ratio <= 5.5, `the clock ran at ${fmt(ratio)}x instead of ~${SPEED}x`);
    expect(b.hen.isoX - a.hen.isoX > 50, `moved only ${fmt(b.hen.isoX - a.hen.isoX)} px right`);
    expect(Math.abs(b.hen.isoY - a.hen.isoY) < 0.01, `drifted ${fmt(b.hen.isoY - a.hen.isoY)} px vertically`);
    expect(b.hen.facing === 1, 'the hen is not facing right');
  });

  await check('3. A turns the hen left; W walks screen-up', async () => {
    await page.tapKey('KeyA', 300);
    const a = await page.snapshot();
    expect(a.hen.facing === -1, 'A did not turn the hen left');
    await page.tapKey('KeyW', 300);
    const b = await page.snapshot();
    expect(b.hen.isoY - a.hen.isoY < -10, `W moved ${fmt(b.hen.isoY - a.hen.isoY)} px vertically`);
    expect(Math.abs(b.hen.isoX - a.hen.isoX) < 0.01, `W drifted ${fmt(b.hen.isoX - a.hen.isoX)} px sideways`);
  });

  await check('4. holding the mouse right of center walks right; releasing stops', async () => {
    const p = await page.toPage(160 + 60, 90);
    const a = await page.snapshot();
    await page.mouse('mouseMoved', p);
    await page.mouse('mousePressed', p);
    await sleep(500);
    const b = await page.snapshot();
    await page.mouse('mouseReleased', p);
    await sleep(150);
    const c = await page.snapshot();
    expect(b.hen.isoX - a.hen.isoX > 20, `moved only ${fmt(b.hen.isoX - a.hen.isoX)} px right`);
    expect(Math.abs(b.hen.isoY - a.hen.isoY) < 1, `drifted ${fmt(b.hen.isoY - a.hen.isoY)} px vertically`);
    expect(!c.hen.moving, 'still walking after the mouse button was released');
  });

  await check('5. a touch drag opens the stick and walks right; lifting stops', async () => {
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    try {
      const start = await page.toPage(100, 120);
      const end = await page.toPage(130, 120);
      const a = await page.snapshot();
      await page.touch('touchStart', [{ x: start.x, y: start.y, id: 1 }]);
      await page.touch('touchMove', [{ x: end.x, y: end.y, id: 1 }]);
      await sleep(500);
      const b = await page.snapshot();
      await page.screenshot('03-touch.png');
      await page.touch('touchEnd', []);
      await sleep(150);
      const c = await page.snapshot();
      expect(b.hen.isoX - a.hen.isoX > 20, `moved only ${fmt(b.hen.isoX - a.hen.isoX)} px right`);
      expect(!c.hen.moving, 'still walking after the finger lifted');
    } finally {
      await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    }
  });

  await check('6. losing focus pauses the clock; a key resumes', async () => {
    await page.evaluate(`window.dispatchEvent(new Event('blur'))`);
    await sleep(100);
    const a = await page.snapshot();
    await sleep(600);
    const b = await page.snapshot();
    await page.screenshot('04-paused.png');
    expect(a.paused && b.paused, 'not paused after the window lost focus');
    expect(b.time === a.time, `the clock moved ${fmt(b.time - a.time)} s while paused`);
    await page.tapKey('KeyX', 50);
    await sleep(100);
    expect(!(await page.snapshot()).paused, 'a key press did not resume');
  });

}

/** Opens the cards with the dev cheat (unless they are open) and waits until they can be picked. */
async function openCards(page) {
  await page.evaluate('window.__qq.snapshot().cards.length || window.__qq.cheat.levelUp()');
  await page.waitFor('window.__qq.snapshot().cards.length > 0 && window.__qq.snapshot().cardLock <= 0');
  return page.snapshot();
}

/**
 * Waits until `condition` (a page expression) holds, playing on meanwhile: open cards get the real
 * key 1 and a chest screen gets Space, so the run never stays frozen while we wait.
 */
async function playUntil(page, condition, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await page.evaluate(condition)) return;
    const s = await page.snapshot();
    if (s.cards.length && s.cardLock <= 0) await page.tapKey('Digit1', 30);
    else if (s.reward.length && s.rewardLock <= 0) await page.tapKey('Space', 30);
    await sleep(60);
  }
  throw new Error(`timed out waiting for: ${condition}`);
}

/** Level of item `id` in a snapshot's build (0 if not owned). */
const levelOf = (snap, id) => (snap.build.find(([owned]) => owned === id) || [id, 0])[1];

async function playScenarios(page, client, base) {
  await check('7. predators close in, eggs fly and something dies', async () => {
    await page.open(`${base}/?autoplay&drive=cdp&speed=${SPEED}`, ready);
    await page.tapKey('KeyD', 150);
    await playUntil(page, 'window.__qq.snapshot().enemies >= 3', 10000);
    await playUntil(page, `!window.__qq.snapshot().cards.length && (${CANVAS_STATS}).furPixels > 20`, 10000);
    await page.screenshot('07-combat.png');
    await playUntil(page, 'window.__qq.snapshot().kills >= 1', 15000);
    const s = await page.snapshot();
    expect(s.hen.hp > 0, 'the hen fell while standing still for a few seconds');
  });

  await check('8. the cards freeze the run; the real key 1 picks one', async () => {
    const a = await openCards(page);
    await sleep(500);
    const b = await page.snapshot();
    await page.screenshot('08-levelup.png');
    expect(b.time === a.time, `the clock moved ${fmt(b.time - a.time)} s while choosing`);
    expect(b.cards.length >= 1, 'no cards on screen');
    const card = b.cards[0];
    await page.tapKey('Digit1', 50);
    await page.waitFor('window.__qq.snapshot().cards.length === 0', 3000);
    const c = await page.snapshot();
    expect(levelOf(c, card.id) === card.level, `${card.id} is level ${levelOf(c, card.id)}, expected ${card.level}`);
    await sleep(300);
    expect((await page.snapshot()).time > c.time, 'the run did not resume after the pick');
  });

  await check('9. a mouse click on a card picks it', async () => {
    const a = await openCards(page);
    const i = a.cards.length - 1;
    const card = a.cards[i];
    const c = await page.evaluate(`window.__qq.cardCenter(${i})`);
    const p = await page.toPage(c.x, c.y);
    await page.mouse('mouseMoved', p);
    await page.mouse('mousePressed', p);
    await page.mouse('mouseReleased', p);
    await page.waitFor('window.__qq.snapshot().cards.length === 0', 3000);
    const b = await page.snapshot();
    expect(levelOf(b, card.id) === card.level, `clicked ${card.id}, but it is level ${levelOf(b, card.id)}`);
  });

  await check('10. a tap on a card picks it', async () => {
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    try {
      const a = await openCards(page);
      const card = a.cards[0];
      const c = await page.evaluate('window.__qq.cardCenter(0)');
      const p = await page.toPage(c.x, c.y);
      await page.touch('touchStart', [{ x: p.x, y: p.y, id: 1 }]);
      await page.touch('touchEnd', []);
      await page.waitFor('window.__qq.snapshot().cards.length === 0', 3000);
      const b = await page.snapshot();
      expect(levelOf(b, card.id) === card.level, `tapped ${card.id}, but it is level ${levelOf(b, card.id)}`);
    } finally {
      await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    }
  });

  await check('11. falling shows the game over; a key goes back to the title', async () => {
    await page.evaluate('window.__qq.cheat.damage(9999)');
    await page.waitFor('window.__qq.snapshot().over', 3000);
    await sleep(700); // the overlay waits ~1.5 s of game time (0.3 s at 5x)
    await page.screenshot('09-gameover.png');
    await page.tapKey('Space', 50);
    await page.waitFor('!window.__qq.snapshot().started && !window.__qq.snapshot().over', 3000);
    const s = await page.snapshot();
    expect(s.best > 0, 'no best time was kept');
  });

  await check('12. ?autoplay alone: the bot plays a minute at 5x', async () => {
    await page.open(`${base}/?autoplay&speed=${SPEED}`, ready);
    await page.waitFor('window.__qq.record.maxTime >= 60', 20000);
    await page.screenshot('10-watch.png');
    const r = await page.evaluate('window.__qq.record');
    expect(r.maxLevel >= 3, `the bot only reached level ${r.maxLevel}`);
    expect(r.maxKills >= 20, `the bot only made ${r.maxKills} kills`);
  });
}

async function outfitScenarios(page, client, base) {
  await check('13. the hen wears what she earns: a dressed hen shows her outfit', async () => {
    await page.open(`${base}/?autoplay&drive=cdp&peaceful&speed=${SPEED}`, ready);
    await page.tapKey('KeyD', 100);
    await sleep(200);
    const bare = await page.evaluate(OUTFIT_STATS);
    await page.evaluate('window.__qq.cheat.giveAll(3)');
    await sleep(300);
    const dressed = await page.evaluate(OUTFIT_STATS);
    await page.screenshot('11-dressed.png');
    expect(dressed.grey >= 6 && bare.grey === 0, `pot grey: ${bare.grey} -> ${dressed.grey} px`);
    expect(dressed.blue >= 6 && bare.blue === 0, `blue: ${bare.blue} -> ${dressed.blue} px`);
    expect(dressed.red > bare.red + 10, `red: ${bare.red} -> ${dressed.red} px`);
    await page.evaluate('window.__qq.cheat.giveAll(5)');
    await sleep(300);
    const golden = await page.evaluate(OUTFIT_STATS);
    await page.screenshot('12-golden.png');
    expect(golden.gold > dressed.gold + 10, `gold: ${dressed.gold} -> ${golden.gold} px`);
  });

  await check('14. the wardrobe page shows every worn item', async () => {
    // The wardrobe is a tall page: grow the viewport for its screenshot, then put it back.
    await client.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 1260, deviceScaleFactor: 1, mobile: false });
    try {
      await page.open(`${base}/__dev/wardrobe.html`, 'window.__wardrobeReady === true');
      const rows = await page.evaluate('window.__wardrobeRows');
      await page.screenshot('13-wardrobe.png');
      expect(rows >= 11, `only ${rows} items in the wardrobe`);
    } finally {
      await client.send('Emulation.setDeviceMetricsOverride', VIEWPORT);
    }
  });
}

async function dayScenarios(page, base) {
  await check('15. the day turns: rain falls, then night comes', async () => {
    await page.open(`${base}/?autoplay&drive=cdp&peaceful&speed=${SPEED}`, ready);
    await page.tapKey('KeyD', 100);
    await sleep(300);
    const day = await page.stats();
    await page.evaluate('window.__qq.cheat.setTime(200)');
    await sleep(500);
    const rain = await page.stats();
    await page.screenshot('14-rain.png');
    await page.evaluate('window.__qq.cheat.setTime(500)');
    await sleep(500);
    const night = await page.stats();
    await page.screenshot('15-night.png');
    expect(rain.skyPixels > day.skyPixels + 60, `rain: ${day.skyPixels} -> ${rain.skyPixels} bluish px`);
    expect(night.light < day.light * 0.75, `night is not darker: ${fmt(day.light)} -> ${fmt(night.light)}`);
  });

  await check('16. ten minutes win at dawn; a key goes back to the title', async () => {
    await page.evaluate('window.__qq.cheat.setTime(598)');
    await page.waitFor('window.__qq.snapshot().won', 4000);
    await sleep(500);
    await page.screenshot('16-dawn.png');
    const s = await page.snapshot();
    expect(s.over && s.time === 600, `time ${s.time}`);
    await page.tapKey('Space', 50);
    await page.waitFor('!window.__qq.snapshot().started', 3000);
  });

  await check('17. a boss shows its bar; a chest opens the CHEST! screen', async () => {
    await page.open(`${base}/?autoplay&drive=cdp&peaceful&speed=${SPEED}`, ready);
    await page.tapKey('KeyD', 100);
    await page.evaluate(`window.__qq.cheat.boss('fox')`);
    await page.waitFor('window.__qq.snapshot().bosses === 1', 3000);
    await sleep(300);
    await page.screenshot('17-boss.png');
    await page.evaluate('window.__qq.cheat.prize(0)');
    await page.waitFor('window.__qq.snapshot().reward.length > 0', 3000);
    await sleep(200);
    await page.screenshot('18-chest.png');
    const s = await page.snapshot();
    expect(s.reward.length === 1 || s.reward.length === 3, `${s.reward.length} upgrades in the chest`);
    await page.waitFor('window.__qq.snapshot().rewardLock <= 0', 3000);
    await page.tapKey('Space', 50);
    await page.waitFor('window.__qq.snapshot().reward.length === 0', 3000);
  });

  await check('18. a broken crate leaves something behind', async () => {
    const a = await page.snapshot();
    await page.evaluate('window.__qq.cheat.crate()');
    await page.waitFor('window.__qq.snapshot().crates === 1', 2000);
    await page.waitFor('window.__qq.snapshot().crates === 0', 6000);
    await sleep(200);
    const b = await page.snapshot();
    const left = b.pickups.length > a.pickups.length || b.corn > a.corn || b.xp !== a.xp || b.level !== a.level || b.cards.length > 0;
    expect(left, 'the crate broke and left nothing');
  });
}

async function soundBoardScenario(page, base) {
  await check('20. the sound board loads, with a button per sound, and plays without errors', async () => {
    await page.open(`${base}/__dev/sounds.html`, 'window.__soundsReady === true');
    const buttons = await page.evaluate('window.__soundsButtons');
    expect(buttons >= 25, `only ${buttons} buttons`);
    // A real click first (a user gesture lets audio start), then every button once
    const first = await page.evaluate(`(() => { const r = document.querySelector('button').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await page.mouse('mousePressed', first);
    await page.mouse('mouseReleased', first);
    await page.evaluate(`document.querySelectorAll('button').forEach((b) => b.click())`);
    await sleep(600);
    await page.screenshot('20-sounds.png');
  });
}

async function musicScenario(page, base) {
  await check('19. the music waits for the first key, follows the run, and M turns it off and on', async () => {
    await page.open(`${base}/?autoplay&drive=cdp&peaceful&speed=${SPEED}`, ready);
    const before = await page.snapshot();
    expect(before.music.mood === null, `music before any key: ${before.music.mood}`);
    await page.tapKey('KeyD', 100);
    await page.waitFor(`window.__qq.snapshot().music.mood === 'day'`, 3000);
    await page.tapKey('KeyM', 50);
    await page.waitFor('window.__qq.snapshot().music.on === false', 2000);
    await page.tapKey('KeyM', 50);
    await page.waitFor('window.__qq.snapshot().music.on === true', 2000);
    expect((await page.snapshot()).started, 'the run stopped');
  });
}

async function progressScenarios(page, base) {
  await check('21. the title menu: E picks a hen, C a peril, B opens the shop and 1 buys', async () => {
    await page.open(`${base}/?autoplay&drive=cdp&peaceful&speed=${SPEED}`, ready);
    await page.evaluate('localStorage.removeItem("qq_profile"), window.__qq.cheat.unlockAll(), window.__qq.cheat.eggs(50)');
    await page.tapKey('KeyE', 50);
    await page.tapKey('KeyC', 50);
    await sleep(150);
    let s = await page.snapshot();
    expect(s.henChoice === 1 && s.peril === 1, `hen ${s.henChoice}, peril ${s.peril}`);
    await page.screenshot('21-title.png');
    await page.tapKey('KeyB', 50);
    await page.waitFor('window.__qq.snapshot().shopOpen', 2000);
    const eggs = s.profile.eggs;
    await page.tapKey('Digit1', 50);
    await page.waitFor('window.__qq.snapshot().profile.shop[0] === 1', 2000);
    await page.screenshot('22-shop.png');
    await page.tapKey('KeyB', 50);
    await page.waitFor('!window.__qq.snapshot().shopOpen', 2000);
    s = await page.snapshot();
    expect(!s.started, 'a menu key started the run');
    expect(s.profile.eggs === eggs - 10, `${eggs} eggs became ${s.profile.eggs}, not ${eggs - 10}`);
    // Leave the profile as it was for the scenarios that follow
    await page.evaluate('localStorage.removeItem("qq_profile")');
  });

  await check('22. at dawn, the real key 1 keeps going into day 2', async () => {
    await page.open(`${base}/?autoplay&drive=cdp&peaceful&speed=${SPEED}`, ready);
    await page.tapKey('KeyD', 100);
    await page.evaluate('window.__qq.cheat.setTime(598)');
    await page.waitFor('window.__qq.snapshot().dawnChoice', 4000);
    await sleep(500); // the choice waits ~1.5 s of game time
    await page.tapKey('Digit1', 50);
    await page.waitFor('window.__qq.snapshot().day === 2 && !window.__qq.snapshot().over', 3000);
    await sleep(300);
    await page.screenshot('23-day2.png');
    const s = await page.snapshot();
    expect(s.time > 600, `the clock is at ${s.time}`);
    await page.evaluate('localStorage.removeItem("qq_profile")');
  });

  await check('23. a locked hen is on show with a padlock; moving does not start the run', async () => {
    await page.open(`${base}/?autoplay&drive=cdp&peaceful&speed=${SPEED}`, ready);
    await page.evaluate('localStorage.removeItem("qq_profile")');
    await page.tapKey('KeyE', 50);
    await sleep(100);
    let s = await page.snapshot();
    expect(s.henChoice === 1 && s.profile.hen === 0, `hen on show ${s.henChoice}, chosen ${s.profile.hen}`);
    await page.tapKey('KeyD', 200);
    await sleep(150);
    await page.screenshot('24-locked-hen.png');
    s = await page.snapshot();
    expect(!s.started, 'a locked hen started the run');
    await page.tapKey('KeyQ', 50);
    await page.tapKey('KeyD', 100);
    await page.waitFor('window.__qq.snapshot().started', 2000);
  });

  await check('24. events and special predators: a hawk, a stampede, a frenzy, a rainbow elite', async () => {
    await page.open(`${base}/?autoplay&drive=cdp&peaceful&speed=${SPEED}`, ready);
    await page.tapKey('KeyD', 100);
    await page.evaluate("window.__qq.cheat.event('hawk')");
    let s = await page.snapshot();
    expect(s.banner === 'HAWK!' && s.hawkDives > 0, `banner "${s.banner}", ${s.hawkDives} dives`);
    await sleep(200);
    await page.screenshot('25-hawk.png');
    await page.waitFor('window.__qq.snapshot().hawkDives === 0', 6000);
    await page.evaluate("window.__qq.cheat.event('stampede'), window.__qq.cheat.event('frenzy'), window.__qq.cheat.elite('badger', true)");
    s = await page.snapshot();
    expect(s.enemies >= 31 && s.frenzy > 0 && s.elites.includes(2), `${s.enemies} predators, frenzy ${s.frenzy}, elites ${s.elites}`);
    await sleep(500);
    await page.screenshot('26-stampede.png');
    await page.evaluate('window.__qq.cheat.lineup()');
    await sleep(700);
    await page.screenshot('27-lineup.png');
    s = await page.snapshot();
    expect(s.shots > 0 || s.enemies > 0, 'the lineup is empty');
  });
}

async function mobileScenario(page, client, base) {
  await check('25. a phone held upright: the game fills it; taps start, steer and pick a card', async () => {
    await client.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    try {
      await page.open(`${base}/?autoplay&drive=cdp&peaceful&speed=${SPEED}`, ready);
      const size = await page.evaluate(`(() => {
        const c = document.getElementById('c');
        const r = c.getBoundingClientRect();
        return { w: c.width, h: c.height, cssW: r.width, cssH: r.height };
      })()`);
      expect(size.w === 320 && size.h > 400, `internal size ${size.w}x${size.h}`);
      expect(size.cssW >= 380, `the canvas is only ${fmt(size.cssW)} px wide on a 390 px screen`);
      const at = (fx, fy) => page.toPage(320 * fx, size.h * fy);
      const tap = await at(0.5, 0.75);
      await page.touch('touchStart', [{ x: tap.x, y: tap.y, id: 1 }]);
      await page.touch('touchEnd', []);
      await page.waitFor('window.__qq.snapshot().started', 3000);
      const a = await page.snapshot();
      const from = await at(0.35, 0.75);
      const to = await at(0.45, 0.75);
      await page.touch('touchStart', [{ x: from.x, y: from.y, id: 2 }]);
      await page.touch('touchMove', [{ x: to.x, y: to.y, id: 2 }]);
      await sleep(500);
      const b = await page.snapshot();
      await page.screenshot('19-mobile.png');
      await page.touch('touchEnd', []);
      expect(b.hen.isoX - a.hen.isoX > 20, `the stick moved her only ${fmt(b.hen.isoX - a.hen.isoX)} px right`);
      const cards = await openCards(page);
      const card = cards.cards[1];
      const c = await page.evaluate('window.__qq.cardCenter(1)');
      const p = await page.toPage(c.x, c.y);
      await page.touch('touchStart', [{ x: p.x, y: p.y, id: 3 }]);
      await page.touch('touchEnd', []);
      await page.waitFor('window.__qq.snapshot().cards.length === 0', 3000);
      const after = await page.snapshot();
      expect(levelOf(after, card.id) === card.level, `tapped ${card.id}, but it is level ${levelOf(after, card.id)}`);
    } finally {
      await client.send('Emulation.setTouchEmulationEnabled', { enabled: false });
      await client.send('Emulation.setDeviceMetricsOverride', VIEWPORT);
    }
  });
}

async function distScenario(page) {
  await check('26. the shipped dist/index.html draws, and walking scrolls the meadow', async () => {
    await access(DIST).catch(() => {
      throw new Error('dist/index.html is missing: run npm run build first');
    });
    await page.open(pathToFileURL(DIST).href, `!!document.getElementById('c')`);
    await sleep(500);
    const a = await page.stats();
    await page.screenshot('05-dist.png');
    expect(a.colors >= 8, `only ${a.colors} colors on screen`);
    expect(a.henPixels >= 20, `hen not visible at the center (${a.henPixels} px)`);
    await page.keyDown('KeyD');
    await sleep(1000);
    const b = await page.stats();
    await page.screenshot('06-dist-walk.png');
    await page.keyUp('KeyD');
    expect(b.hash !== a.hash, 'the canvas did not change while walking');
    // The starting corn often gives the first level-up within that second: then the cards cover her.
    expect(b.henPixels >= 20 || b.panelPixels > 2000, 'neither the hen at the center nor the level-up cards are on screen');
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const server = await startDevServer(0, '127.0.0.1');
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await launchBrowser();
    const { client } = browser;
    watchForProblems(client);
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Log.enable');
    await client.send('Emulation.setDeviceMetricsOverride', VIEWPORT);
    const page = pageHelpers(client);
    await movementScenarios(page, client, base);
    await playScenarios(page, client, base);
    await outfitScenarios(page, client, base);
    await dayScenarios(page, base);
    await musicScenario(page, base);
    await soundBoardScenario(page, base);
    await progressScenarios(page, base);
    await mobileScenario(page, client, base);
    await distScenario(page);
    results.push({
      name: '27. no exceptions, console errors or failed loads',
      ok: problems.length === 0,
      error: problems.slice(0, 5).join(' | '),
    });
  } finally {
    await browser?.close();
    server.close();
  }

  console.log(`\n  Quiquiriqui playtest · ${browser?.browser ?? 'browser'} · ${SPEED}x\n`);
  for (const r of results) {
    const detail = r.ok ? (r.seconds !== undefined ? `${fmt(r.seconds)} s` : '') : r.error;
    console.log(`  ${r.ok ? '✔' : '✖'} ${r.name.padEnd(68)} ${detail}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n  ${passed}/${results.length} passed · screenshots → ${path.relative(ROOT, OUT)}\n`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\n  PLAYTEST CRASHED: ${error.message}\n`);
  process.exit(1);
});
