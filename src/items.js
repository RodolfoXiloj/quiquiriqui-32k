// Upgrades: every weapon and passive the hen can earn, the levels she owns (her "build"), the
// stats they add up to, and the three cards offered at each level-up. All names are our own.
// Each item is also something she visibly wears or carries (sprites.js, OUTFIT_LAYERS).
import { gameRand } from './rng.js';
import { profile, SHOP } from './profile.js';

export const MAX_ITEM_LEVEL = 5;
/** Slots per kind: at most this many different weapons and passives. */
export const SLOTS = 6;

/**
 * Item table. Weapons list one value per level (1..5) for each stat they use:
 *   cd: seconds between volleys   n: shots per volley (Peck: targets; Chick Orbit: chicks;
 *   Thunder Comb: bolts)   dmg: damage per hit   r: Wing Gust radius (tiles)   spin: Chick Orbit
 *   turn rate (radians per second)
 * Passives add `per` to one entry of `stats` for each level owned (plain sums).
 * `text` is the two-line card description of a new item; `up` the one-line text of each
 * level-up (index 0 is the text for level 2).
 */
export const ITEMS = [
  {
    id: 'egg',
    weapon: true,
    name: 'EGG TOSS',
    text: ['LOBS AN EGG AT', 'THE NEAREST FOE'],
    up: ['+1 EGG', 'THROWS FASTER', '+1 EGG', '+8 DAMAGE'],
    lv: { cd: [1.3, 1.3, 1, 1, 1], n: [1, 2, 2, 3, 3], dmg: [10, 10, 10, 10, 18] },
  },
  {
    id: 'peck',
    weapon: true,
    name: 'PECK',
    text: ['JABS THE CLOSEST', 'FOE UP CLOSE'],
    up: ['PECKS FASTER', '+5 DAMAGE', 'PECKS FASTER', 'HITS 2 FOES'],
    lv: { cd: [0.9, 0.7, 0.7, 0.55, 0.55], n: [1, 1, 1, 1, 2], dmg: [14, 14, 19, 19, 19] },
  },
  {
    id: 'darts',
    weapon: true,
    name: 'FEATHER DARTS',
    text: ['TAIL FEATHERS FLY', 'BEHIND HER'],
    up: ['+1 DART', '+3 DAMAGE', '+1 DART', 'FIRES FASTER'],
    lv: { cd: [1.4, 1.4, 1.4, 1.4, 1], n: [3, 4, 4, 5, 5], dmg: [6, 6, 9, 9, 9] },
  },
  {
    id: 'corn',
    weapon: true,
    name: 'CORN SPRAY',
    text: ['A SPRAY OF KERNELS', 'AT A RANDOM FOE'],
    up: ['+1 KERNEL', '+3 DAMAGE', 'SPRAYS FASTER', '+2 KERNELS'],
    lv: { cd: [1.5, 1.5, 1.5, 1.2, 1.2], n: [3, 4, 4, 4, 6], dmg: [5, 5, 8, 8, 8] },
  },
  {
    id: 'gust',
    weapon: true,
    name: 'WING GUST',
    text: ['A GUST OF WIND', 'PUSHES FOES AWAY'],
    up: ['WIDER GUST', 'GUSTS MORE OFTEN', '+4 DAMAGE', 'BIGGER AND FASTER'],
    lv: { cd: [2.2, 2.2, 1.8, 1.8, 1.5], r: [1.6, 1.9, 1.9, 1.9, 2.4], dmg: [6, 6, 6, 10, 12] },
  },
  {
    id: 'chicks',
    weapon: true,
    name: 'CHICK ORBIT',
    text: ['CHICKS CIRCLE HER', 'AND NIP FOES'],
    up: ['+1 CHICK', '+4 DAMAGE', 'ONE MORE, FASTER', '+1 CHICK'],
    lv: { n: [1, 2, 2, 3, 4], dmg: [8, 8, 12, 12, 14], spin: [2.6, 2.6, 2.6, 3.2, 3.2] },
  },
  {
    id: 'thunder',
    weapon: true,
    name: 'THUNDER COMB',
    text: ['LIGHTNING STRIKES', 'FOES ON SCREEN'],
    up: ['+8 DAMAGE', '+1 BOLT, FASTER', '+8 DAMAGE', '+1 BOLT, FASTER'],
    lv: { cd: [2.6, 2.6, 2.2, 2.2, 1.8], n: [1, 1, 2, 2, 3], dmg: [22, 30, 30, 38, 46] },
  },
  {
    id: 'boots',
    name: 'RUNNING BOOTS',
    text: ['RUN 8% FASTER', 'PER LEVEL'],
    up: ['+8% SPEED'],
    stat: 'speed',
    per: 0.08,
  },
  {
    id: 'basket',
    name: 'FEED BASKET',
    text: ['PULLS CORN IN', 'FROM FARTHER AWAY'],
    up: ['+0.6 CORN REACH'],
    stat: 'magnet',
    per: 0.6,
  },
  {
    id: 'helmet',
    name: 'POT HELMET',
    text: ['TAKE 1 LESS', 'DAMAGE PER BITE'],
    up: ['-1 DAMAGE TAKEN'],
    stat: 'armor',
    per: 1,
  },
  {
    id: 'shades',
    name: 'SUNGLASSES',
    text: ['LOOKING COOL:', '+10% DAMAGE'],
    up: ['+10% DAMAGE'],
    stat: 'damage',
    per: 0.1,
  },
  {
    id: 'cape',
    name: 'HERO CAPE',
    text: ['+20 MAX HEALTH', 'AND A QUICK HEAL'],
    up: ['+20 MAX HEALTH'],
    stat: 'maxHp',
    per: 20,
  },
  {
    id: 'bandana',
    name: 'LUCKY BANDANA',
    text: ['6% CHANCE TO', 'DODGE A BITE'],
    up: ['+6% DODGE'],
    stat: 'dodge',
    per: 0.06,
  },
];

/**
 * Boons: offered once nothing is left to upgrade, with no limit, so levels never run out. Each adds
 * `per` to a stat (or heals, see main.js); they are not worn and take no slot.
 */
export const BOONS = [
  { id: 'grit', name: 'GRIT', text: ['+6% DAMAGE', 'NO LIMIT'], stat: 'damage', per: 0.06 },
  { id: 'spring', name: 'SPRING STEP', text: ['+4% SPEED', 'NO LIMIT'], stat: 'speed', per: 0.04 },
  { id: 'appetite', name: 'BIG APPETITE', text: ['+0.3 CORN REACH', 'NO LIMIT'], stat: 'magnet', per: 0.3 },
  { id: 'feathers', name: 'THICK FEATHERS', text: ['+10 MAX HEALTH', 'AND A HEAL'], stat: 'maxHp', per: 10 },
  { id: 'wings', name: 'QUICK WINGS', text: ['WEAPONS 5% FASTER', 'NO LIMIT'], stat: 'haste', per: 0.05 },
  { id: 'meal', name: 'WARM MEAL', text: ['HEALS 30 HEALTH', 'RIGHT NOW'] },
];

export const ITEM_BY_ID = Object.fromEntries([...ITEMS, ...BOONS].map((item) => [item.id, item]));

/**
 * Base stats before passives: speed multiplier, corn magnet radius (tiles), flat armor, damage
 * multiplier, extra max health, dodge chance, haste (weapon cooldowns are divided by it) and the
 * XP multiplier. The shop's permanent upgrades are added on top.
 */
const BASE_STATS = { speed: 1, magnet: 3, armor: 0, damage: 1, maxHp: 0, dodge: 0, haste: 1, xp: 1 };
export const stats = { ...BASE_STATS };

/** Owned item levels by id, and the order they were taken in (for the HUD). */
export const build = {};
export const buildOrder = [];
/** Boons taken this run, by id. */
export const boons = {};

function recomputeStats() {
  Object.assign(stats, BASE_STATS);
  SHOP.forEach((upgrade, i) => (stats[upgrade.stat] += upgrade.per * profile.shop[i]));
  for (const id of buildOrder) {
    const item = ITEM_BY_ID[id];
    if (item.stat) stats[item.stat] += item.per * build[id];
  }
  for (const id of Object.keys(boons)) {
    const boon = ITEM_BY_ID[id];
    if (boon.stat) stats[boon.stat] += boon.per * boons[id];
  }
}

/** A new run starts with the hen's own weapon only (Egg Toss for the white hen). */
export function resetBuild(start = 'egg') {
  for (const id of Object.keys(build)) delete build[id];
  for (const id of Object.keys(boons)) delete boons[id];
  buildOrder.length = 0;
  applyCard({ id: start });
}

/** The value of weapon stat `key` at the level the hen owns. */
export function weaponStat(id, key) {
  return ITEM_BY_ID[id].lv[key][build[id] - 1];
}

/** Seconds between volleys of weapon `id`, with Quick Wings applied. */
export function weaponCooldown(id) {
  return weaponStat(id, 'cd') / stats.haste;
}

/** Damage per hit of weapon `id`, with Sunglasses applied. */
export function weaponDamage(id) {
  return Math.round(weaponStat(id, 'dmg') * stats.damage);
}

/**
 * Up to three different cards, shuffled from every item that can still level up and fits a free
 * slot. The first level-up offers weapons only, so a run always gets a second weapon early.
 * Each card is { id, level } where `level` is the level the item reaches if picked. Once nothing
 * can level up, three different boons are offered instead ({ id, level: 0, boon: true }).
 */
export function rollCards(weaponsOnly) {
  const used = { true: 0, false: 0 };
  for (const id of buildOrder) used[!!ITEM_BY_ID[id].weapon]++;
  const pool = ITEMS.filter((item) => {
    const level = build[item.id] || 0;
    if (level >= MAX_ITEM_LEVEL) return false;
    if (!level && used[!!item.weapon] >= SLOTS) return false;
    return !weaponsOnly || item.weapon;
  });
  if (weaponsOnly && !pool.length) return rollCards(false);
  if (!pool.length) return shuffle([...BOONS]).slice(0, 3).map((boon) => ({ id: boon.id, level: 0, boon: true }));
  return shuffle(pool)
    .slice(0, 3)
    .map((item) => ({ id: item.id, level: (build[item.id] || 0) + 1 }));
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(gameRand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Adds one level of the card's item to the build (or one more of a boon). */
export function applyCard(card) {
  if (card.boon) {
    boons[card.id] = (boons[card.id] || 0) + 1;
    recomputeStats();
    return;
  }
  if (!build[card.id]) {
    build[card.id] = 0;
    buildOrder.push(card.id);
  }
  build[card.id] = Math.min(MAX_ITEM_LEVEL, build[card.id] + 1);
  recomputeStats();
}

/** The two description lines a card shows. */
export function cardText(card) {
  const item = ITEM_BY_ID[card.id];
  if (card.boon || card.level === 1) return item.text;
  return [item.up[Math.min(card.level - 2, item.up.length - 1)], ''];
}
