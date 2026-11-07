// The Spanish page: src/lang/es.json translates every on-screen string at build time
// (tools/translate.mjs). These tests keep the dictionary complete, alive and fitting: every
// on-screen string in src/ has an entry, every entry matches a string in src/, every translation
// uses only glyphs the font has, and the translated lines fit where the English ones go.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import './dom-stub.js';
import { literalsOf, translate } from '../tools/translate.mjs';
import { GLYPHS } from '../src/font.js';
import { WIDTH } from '../src/screen.js';
import { textWidth, HUD_STRINGS, HUD_SCALES, CARD_W, CARD_NAME_SCALE, CARD_TEXT_SCALE, SHOP_ROW } from '../src/render.js';
import { ITEMS, BOONS, ITEM_BY_ID } from '../src/items.js';
import { BOSSES, ENEMY_TYPES } from '../src/enemies.js';
import { EVENTS } from '../src/events.js';
import { PERIL_NAMES, PERIL_RULES, HENS, SHOP } from '../src/profile.js';

const dict = JSON.parse(readFileSync(new URL('../src/lang/es.json', import.meta.url), 'utf8'));
/** On-screen strings that read the same in Spanish. */
const SAME = new Set(['QUIQUIRIQUI', 'MAX', 'ELITES X2']);
/** Source files with no on-screen text: the font's glyph data and the score. */
const SKIP = new Set(['font.js', 'music.js']);

/** Every string literal and template part in src/ (but the font and the music). */
function sourceStrings() {
  const dir = new URL('../src/', import.meta.url);
  const out = new Set();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.js') || SKIP.has(file)) continue;
    for (const { text } of literalsOf(readFileSync(new URL(file, dir), 'utf8'))) out.add(text);
  }
  return out;
}

/** Whether `text` is something the player reads: uppercase, with at least two capitals in a row. */
const onScreen = (text) => !/[a-z]/.test(text) && /[A-Z]{2}/.test(text);

/** The Spanish for an English on-screen string (the same string when it reads the same). */
const es = (text) => (SAME.has(text) ? text : dict[text]);

const fits = (text, scale, width, what) => assert.ok(textWidth(text, scale) <= width, `${what}: "${text}" is ${textWidth(text, scale)} px at x${scale}, over ${width}`);

describe('the Spanish page', () => {
  it('translates every on-screen string in src/', () => {
    const missing = [...sourceStrings()].filter((text) => onScreen(text) && !SAME.has(text) && !Object.hasOwn(dict, text));
    assert.deepEqual(missing, [], 'add these to src/lang/es.json');
  });

  it('has no stale entries: every key is a string in src/', () => {
    const strings = sourceStrings();
    const stale = Object.keys(dict).filter((key) => !strings.has(key));
    assert.deepEqual(stale, [], 'these keys match nothing in src/ any more');
  });

  it('uses only glyphs the font has (uppercase, Ñ, no accents)', () => {
    for (const [key, value] of Object.entries(dict)) {
      if (!onScreen(key)) continue; // a lowercase predator kind is shown through toUpperCase()
      for (const ch of value) assert.ok(GLYPHS[ch], `"${value}" uses "${ch}", which the font lacks`);
      assert.equal(value, value.toUpperCase(), `"${value}" is not uppercase`);
    }
    for (const type of ENEMY_TYPES) for (const ch of dict[type.name].toUpperCase()) assert.ok(GLYPHS[ch], `${type.name}: "${ch}"`);
  });

  it('fits the HUD, the cards, the banners, the title and the shop', () => {
    for (const [key, text] of Object.entries(HUD_STRINGS)) fits(es(text), HUD_SCALES[key], WIDTH - 8, `HUD ${key}`);
    for (const item of [...ITEMS, ...BOONS]) {
      fits(es(item.name), CARD_NAME_SCALE, CARD_W, `${item.id} name`);
      for (const line of [...item.text, ...(item.up || [])]) fits(es(line), CARD_TEXT_SCALE, CARD_W, `${item.id} card line`);
      if (item.hatch) {
        fits(es(item.hatch.name), CARD_NAME_SCALE, CARD_W, `${item.id} hatch name`);
        for (const line of item.hatch.text) fits(es(line), CARD_TEXT_SCALE, CARD_W, `${item.id} hatch line`);
        fits(dict['HATCH + '] + es(ITEM_BY_ID[item.hatch.with].name), CARD_TEXT_SCALE, CARD_W, `${item.id} hatch hint`);
        fits(dict['HATCHES '] + es(item.name), CARD_TEXT_SCALE, CARD_W, `${item.hatch.with} hatches hint`);
      }
    }
    const banners = [
      ...EVENTS.map(es),
      ...BOSSES.map((b) => `${es(b.name)}!`),
      es('MIDNIGHT RAGES!'),
      es('READY TO HATCH!'),
      ...ENEMY_TYPES.map((t) => `${dict['RAINBOW ']}${dict[t.name].toUpperCase()}!`),
      `${es(HENS[1].name)}! ${es(HENS[2].name)}!`,
    ];
    for (const banner of banners) fits(banner, 3, WIDTH - 16, 'banner');
    for (const hen of HENS) fits(`Q < ${es(hen.name)} > E${dict['  LOCKED']}`, 2, WIDTH - 16, 'title hen row');
    for (let p = 0; p < PERIL_NAMES.length; p++) {
      const rule = p && p < PERIL_NAMES.length - 1 ? `: ${es(PERIL_RULES[p])}` : '';
      fits(`Z < ${es(PERIL_NAMES[p])}${rule} > C`, 2, WIDTH - 16, 'title peril row');
    }
    fits(`${dict['B: SHOP   ']}99999${dict[' GOLDEN EGGS']}`, 2, WIDTH - 16, 'title shop row');
    fits(`${dict['WIN A DAWN ON ']}${es('HEN')}${dict[' OR HARDER']}`, 1, WIDTH - 16, 'black hen hint');
    for (const s of SHOP) fits(es(s.name), 1, SHOP_ROW.pips - SHOP_ROW.text - 4, `shop ${s.id}`);
    fits(`${es('NO MERCY')}${dict['DAY ']}12  59:59`, 1, 150, 'top bar');
  });

  it('the translator swaps whole literals and template parts, and nothing else', () => {
    const { code, counts } = translate(`a='MOVE TO START';b=\`DAY \${n}   \`;c='KeyD';d="MAX";e='PAUSED'//'MOVE TO START'\nf=\`\${x}!\``, dict);
    assert.equal(code, `a='MUEVETE PARA EMPEZAR';b=\`DIA \${n}   \`;c='KeyD';d="MAX";e='PAUSA'//'MOVE TO START'\nf=\`\${x}!\``);
    assert.equal(counts['MOVE TO START'], 1);
    assert.equal(counts['DAY '], 1);
    assert.equal(counts['PAUSED'], 1);
    assert.equal(counts['KILLS '], 0);
    assert.deepEqual(literalsOf("x='A'+`B${y}C`").map((l) => l.text), ['A', 'B', 'C']);
  });
});
