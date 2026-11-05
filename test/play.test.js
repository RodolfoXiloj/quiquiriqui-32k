import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetRun,
  play,
  combatBot,
  update,
  STEP,
  player,
  enemies,
  altars,
  waveState,
  tapAttack,
  tapDash,
  holdKey,
} from './harness.js';
import { damagePlayer } from '../src/player.js';
import { popups } from '../src/pool.js';
import { arenaGrid, buildArena, rebakeFloorCanvas, scarCanvas, TILE_VOID } from '../src/bake.js';
import { startWave } from '../src/enemy.js';
import { input, releaseAllInput } from '../src/input.js';
import {
  WIDTH,
  HERO_PALETTE_INDICES,
  FLOOR_PALETTE_INDICES,
  HUD_STRINGS,
  estimateTextWidth,
} from '../src/render.js';

describe('quiquiriqui at 5x', () => {
  beforeEach(() => {
    resetRun();
  });

  it('boots wave 1 with five embers', () => {
    assert.equal(player.embers, 5);
    assert.equal(player.kneeling, true);
    assert.equal(waveState.wave, 1);
    assert.equal(waveState.score, 0);
    assert.equal(enemies.filter((e) => e.kind === 'husk').length, 2);
    assert.equal(enemies.filter((e) => e.kind === 'archer').length, 1);
  });

  it('wakes on the first attack', () => {
    tapAttack();
    update(STEP);
    assert.equal(player.kneeling, false);
  });

  it('a slash in range wounds a husk', () => {
    const husk = enemies.find((e) => e.kind === 'husk');
    const hp = husk.hp;
    player.kneeling = false;
    player.x = husk.x - 0.8;
    player.y = husk.y;
    player.dirX = 1;
    player.dirY = 0;
    tapAttack();
    update(STEP);
    assert.ok(husk.hp < hp);
  });

  it('the bot kills, then an altar grants its upgrade', () => {
    // 8 scenario seconds is 40s of gameplay. Altars appear after wave 2 falls with no upgrade.
    play(8, combatBot);
    assert.ok(waveState.score > 0);
    assert.ok(enemies.some((e) => e.dead) || waveState.wave > 1 || altars.length > 0);

    let guard = 0;
    while (altars.length < 3 && guard < 24 && !player.dead) {
      play(1, combatBot);
      guard += 1;
    }
    assert.equal(player.dead, false);
    assert.equal(altars.length, 3);

    const altar = altars[0];
    player.x = altar.x;
    player.y = altar.y + 0.4;
    player.dirX = 0;
    player.dirY = -1;
    player.slashTimer = 0;
    tapAttack();
    update(STEP);
    assert.equal(player.upgrade, altar.kind);
    assert.equal(altars.length, 0);
  });

  it('five hits claim the player, and an attack rises again at wave 1', () => {
    player.kneeling = false;
    waveState.score = 80;
    waveState.wave = 2;
    for (let i = 0; i < 5; i++) {
      player.iframes = 0;
      damagePlayer(1, player.x, player.y + 1);
    }
    assert.equal(player.dead, true);
    assert.equal(player.embers, 0);

    tapAttack();
    update(STEP);
    assert.equal(player.dead, false);
    assert.equal(waveState.wave, 1);
    assert.equal(waveState.score, 0);
    assert.equal(player.embers, 5);
  });

  it('shadow dash grants iframes', () => {
    player.kneeling = false;
    holdKey('KeyW', true);
    tapDash();
    update(STEP);
    assert.ok(player.iframes > 0);
    assert.ok(player.dashTimer > 0);
    holdKey('KeyW', false);
  });

  it('hero palette indices never overlap stone floor indices', () => {
    for (const idx of HERO_PALETTE_INDICES) {
      assert.equal(FLOOR_PALETTE_INDICES.includes(idx), false);
    }
  });

  it('on-screen HUD and prompt strings fit inside the 320 px canvas without clipping', () => {
    assert.ok(estimateTextWidth(HUD_STRINGS.title, 14) <= WIDTH - 24);
    assert.ok(estimateTextWidth(HUD_STRINGS.controls, 7) <= WIDTH - 24);
    assert.ok(estimateTextWidth(HUD_STRINGS.wakeVerb, 8) <= WIDTH - 24);
    assert.ok(estimateTextWidth(HUD_STRINGS.driftHint, 6) <= WIDTH - 24);
    assert.ok(estimateTextWidth(HUD_STRINGS.deathTitle, 12) <= WIDTH - 24);
    assert.ok(estimateTextWidth(HUD_STRINGS.deathVerb, 8) <= WIDTH - 24);
  });

  it('attacks leave a lingering slash smear and spawn combat callouts', () => {
    const husk = enemies.find((e) => e.kind === 'husk');
    player.kneeling = false;
    player.x = husk.x - 0.8;
    player.y = husk.y;
    player.dirX = 1;
    player.dirY = 0;
    tapAttack();
    update(STEP);
    assert.ok(player.slashSmear.timer > 0);
    assert.ok(popups.some((p) => p.alive && p.text.length > 0));

    player.iframes = 0;
    damagePlayer(1, husk.x, husk.y);
    assert.ok(player.hurtTimer > 0);
    assert.ok(popups.some((p) => p.alive && p.text === '-1 EMBER'));
  });

  it('battle scars survive a slab rebake and clear only for a fresh arena', () => {
    const clears = scarCanvas.clears;
    rebakeFloorCanvas();
    assert.equal(scarCanvas.clears, clears);
    buildArena(2026);
    assert.equal(scarCanvas.clears, clears + 1);
  });

  it('the Sovereign crumbles an edge slab in phase II without wiping the scars', () => {
    const countVoid = () => arenaGrid.flat().filter((t) => t === TILE_VOID).length;
    startWave(3);
    const sovereign = enemies.find((e) => e.kind === 'sovereign');
    sovereign.hp = sovereign.maxHp * 0.4;
    player.kneeling = false;
    const voids = countVoid();
    const clears = scarCanvas.clears;
    update(STEP);
    assert.equal(sovereign.phase2, true);
    assert.equal(countVoid(), voids + 1);
    assert.equal(scarCanvas.clears, clears);
  });

  it('a piercing shard wounds each foe it passes through exactly once', () => {
    // Clear lane along y = 5.5: the pillars stand at y = 3.5 and y = 7.5.
    const husk = enemies.find((e) => e.kind === 'husk');
    husk.x = husk.prevX = 5.5;
    husk.y = husk.prevY = 5.5;
    player.kneeling = false;
    player.x = player.prevX = 3.5;
    player.y = player.prevY = 5.5;
    player.dirX = 1;
    player.dirY = 0;
    player.drift = 100;
    input.driftTapped = true;
    for (let i = 0; i < 36; i++) update(STEP);
    assert.equal(player.drift, 55);
    assert.equal(husk.maxHp - husk.hp, 24);
  });

  it('the Twin Shadow dash blast kills a foe it drops to zero', () => {
    const husk = enemies.find((e) => e.kind === 'husk');
    husk.x = husk.prevX = 5.5;
    husk.y = husk.prevY = 5.5;
    husk.hp = 5;
    player.kneeling = false;
    player.upgrade = 'shadow';
    player.x = player.prevX = 4.8;
    player.y = player.prevY = 5.5;
    tapDash();
    update(STEP);
    assert.equal(husk.dead, true);
    assert.equal(waveState.score, 100);
  });

  it('losing window focus releases held keys', () => {
    holdKey('KeyW', true);
    update(STEP);
    assert.notEqual(input.moveX, 0);
    releaseAllInput();
    update(STEP);
    assert.equal(input.moveX, 0);
    assert.equal(input.moveY, 0);
  });
});
