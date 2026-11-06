// Upgrades: every weapon and passive the hen can earn, the levels she owns (her "build"), the
// stats they add up to, and the three cards offered at each level-up. All names are our own.
// Each item is also something she visibly wears or carries (sprites.js, OUTFIT_LAYERS).
import { gameRand } from './rng.js';
import { profile, SHOP } from './profile.js';

export const MAX_ITEM_LEVEL = 5;
/**
 * A weapon at MAX_ITEM_LEVEL whose partner passive (`hatch.with`) she owns can hatch:
 * a HATCH! card at the next level-up, or a chest, takes it to this
 * level, the sixth value of its `lv` stats, and changes what it does (weapons.js).
 */
export const HATCH_LEVEL = 6;
/** Slots per kind: at most this many different weapons and passives. */
export const SLOTS = 6;

/**
 * Item table. Weapons list one value per level (1..5) for each stat they use:
 *   cd: seconds between volleys   n: shots per volley (Peck: targets; Chick Orbit: chicks;
 *   Thunder Comb: bolts)   dmg: damage per hit   r: Wing Gust radius (tiles)   spin: Chick Orbit
 *   turn rate (radians per second). The sixth value of each is the hatched weapon's.
 * `hatch` names what it hatches into and the passive it needs.
 * Passives add `per` to one entry of `stats` for each level owned (plain sums), and some `per2` to
 * a second one: a gain with a cost (light boots cost health, a heavy pot slows her).
 * `text` is the two-line card description of a new item; `up` the one-line text of each
 * level-up (index 0 is the text for level 2); `cost`, if any, is shown in red under either.
 */
export const ITEMS = [
  {
    id: 'egg',
    weapon: true,
    name: 'EGG TOSS',
    text: ['LOBS AN EGG AT', 'THE NEAREST FOE'],
    up: ['+1 EGG', 'THROWS FASTER', '+1 EGG', '+80 DAMAGE'],
    lv: { cd: [1.3, 1.3, 1, 1, 1, 0.9], n: [1, 2, 2, 3, 3, 3], dmg: [100, 100, 100, 100, 180, 270] },
    hatch: { with: 'shades', name: 'GOLDEN OMELETTE', text: ['EGGS BURST IN A', 'GOLDEN SPLASH'] },
  },
  {
    id: 'peck',
    weapon: true,
    name: 'PECK',
    text: ['JABS THE CLOSEST', 'FOE UP CLOSE'],
    up: ['PECKS FASTER', '+50 DAMAGE', 'PECKS FASTER', 'HITS 2 FOES'],
    lv: { cd: [0.9, 0.7, 0.7, 0.55, 0.55, 0.4], n: [1, 1, 1, 1, 2, 4], dmg: [140, 140, 190, 190, 190, 240] },
    hatch: { with: 'helmet', name: 'IRON BEAK', text: ['JABS 4 FOES AND', 'PIERCES ARMOR'] },
  },
  {
    id: 'darts',
    weapon: true,
    name: 'FEATHER DARTS',
    text: ['TAIL FEATHERS FLY', 'BEHIND HER'],
    up: ['+1 DART', '+30 DAMAGE', '+1 DART', 'FIRES FASTER'],
    lv: { cd: [1.4, 1.4, 1.4, 1.4, 1, 1], n: [3, 4, 4, 5, 5, 12], dmg: [60, 60, 90, 90, 90, 120] },
    hatch: { with: 'boots', name: 'QUILL STORM', text: ['DARTS FLY ALL', 'AROUND HER'] },
  },
  {
    id: 'corn',
    weapon: true,
    name: 'CORN SPRAY',
    text: ['A SPRAY OF KERNELS', 'AT A RANDOM FOE'],
    up: ['+1 KERNEL', '+30 DAMAGE', 'SPRAYS FASTER', '+2 KERNELS'],
    lv: { cd: [1.5, 1.5, 1.5, 1.2, 1.2, 1], n: [3, 4, 4, 4, 6, 8], dmg: [50, 50, 80, 80, 80, 100] },
    hatch: { with: 'basket', name: 'POPCORN', text: ['KERNELS BURST', 'WHERE THEY HIT'] },
  },
  {
    id: 'gust',
    weapon: true,
    name: 'WING GUST',
    text: ['A GUST OF WIND', 'PUSHES FOES AWAY'],
    up: ['WIDER GUST', 'GUSTS MORE OFTEN', '+40 DAMAGE', 'BIGGER AND FASTER'],
    lv: { cd: [2.2, 2.2, 1.8, 1.8, 1.5, 1], r: [1.6, 1.9, 1.9, 1.9, 2.4, 3.2], dmg: [60, 60, 60, 100, 120, 140] },
    hatch: { with: 'cape', name: 'WHIRLWIND', text: ['A HUGE GUST THAT', 'HEALS AS IT HITS'] },
  },
  {
    id: 'chicks',
    weapon: true,
    name: 'CHICK ORBIT',
    text: ['CHICKS CIRCLE HER', 'AND NIP FOES'],
    up: ['+1 CHICK', '+40 DAMAGE', 'ONE MORE, FASTER', '+1 CHICK'],
    lv: { n: [1, 2, 2, 3, 4, 6], dmg: [80, 80, 120, 120, 140, 210], spin: [2.6, 2.6, 2.6, 3.2, 3.2, 3.8] },
    hatch: { with: 'bandana', name: 'BROOD', text: ['SIX FIERCE CHICKS', 'GUARD HER'] },
  },
  {
    id: 'thunder',
    weapon: true,
    name: 'THUNDER COMB',
    text: ['LIGHTNING STRIKES', 'FOES ON SCREEN'],
    up: ['+80 DAMAGE', '+1 BOLT, FASTER', '+80 DAMAGE', '+1 BOLT, FASTER'],
    lv: { cd: [2.6, 2.6, 2.2, 2.2, 1.8, 1.2], n: [1, 1, 2, 2, 3, 5], dmg: [220, 300, 300, 380, 460, 460] },
    hatch: { with: 'helmet', name: 'STORM POT', text: ['FIVE BOLTS, EACH', 'JUMPS TO ANOTHER'] },
  },
  {
    // Light on her feet: faster, and frailer
    id: 'boots',
    name: 'RUNNING BOOTS',
    text: ['RUN 10% FASTER'],
    up: ['+10% SPEED'],
    cost: '-50 MAX HEALTH',
    stat: 'speed',
    per: 0.1,
    stat2: 'maxHp',
    per2: -50,
  },
  {
    id: 'basket',
    name: 'FEED BASKET',
    text: ['+0.6 CORN REACH', 'AND +8% XP'],
    up: ['+0.6 REACH, +8% XP'],
    stat: 'magnet',
    per: 0.6,
    stat2: 'xp',
    per2: 0.08,
  },
  {
    // A heavy pot: bites hurt less, and she runs slower
    id: 'helmet',
    name: 'POT HELMET',
    text: ['10% LESS DAMAGE'],
    up: ['-10% DAMAGE TAKEN'],
    cost: '-4% SPEED',
    stat: 'guard',
    per: 0.1,
    stat2: 'speed',
    per2: -0.04,
  },
  {
    id: 'shades',
    name: 'SUNGLASSES',
    text: ['LOOKING COOL:', '+15% DAMAGE'],
    up: ['+15% DAMAGE'],
    stat: 'damage',
    per: 0.15,
  },
  {
    id: 'cape',
    name: 'HERO CAPE',
    text: ['+250 MAX HEALTH', 'AND A QUICK HEAL'],
    up: ['+250 MAX HEALTH'],
    stat: 'maxHp',
    per: 250,
  },
  {
    id: 'bandana',
    name: 'LUCKY BANDANA',
    text: ['7% CHANCE TO', 'DODGE A BITE'],
    up: ['+7% DODGE'],
    stat: 'dodge',
    per: 0.07,
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
  { id: 'feathers', name: 'THICK FEATHERS', text: ['+100 MAX HEALTH', 'AND A HEAL'], stat: 'maxHp', per: 100 },
  { id: 'wings', name: 'QUICK WINGS', text: ['WEAPONS 5% FASTER', 'NO LIMIT'], stat: 'haste', per: 0.05 },
  { id: 'meal', name: 'WARM MEAL', text: ['HEALS 300 HEALTH', 'RIGHT NOW'] },
];

export const ITEM_BY_ID = Object.fromEntries([...ITEMS, ...BOONS].map((item) => [item.id, item]));

/**
 * Base stats before passives: speed multiplier, corn magnet radius (tiles), guard (the share of
 * every bite she shrugs off), damage multiplier, extra max health, dodge chance, haste (weapon
 * cooldowns are divided by it) and the XP multiplier. The shop's permanent upgrades are added on top.
 */
const BASE_STATS = { speed: 1, magnet: 3, guard: 0, damage: 1, maxHp: 0, dodge: 0, haste: 1, xp: 1 };
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
    if (item.stat2) stats[item.stat2] += item.per2 * build[id];
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
 * can level up, three different boons are offered instead ({ id, level: 0, boon: true }). A weapon
 * ready to hatch always comes first ({ id, level: HATCH_LEVEL, hatch: true }).
 */
export function rollCards(weaponsOnly) {
  const ready = hatchReady().map((id) => ({ id, level: HATCH_LEVEL, hatch: true }));
  return [...ready, ...rollItems(weaponsOnly)].slice(0, 3);
}

/** Weapons at their top level whose partner passive she owns. */
export function hatchReady() {
  return buildOrder.filter((id) => build[id] === MAX_ITEM_LEVEL && ITEM_BY_ID[id].hatch && build[ITEM_BY_ID[id].hatch.with]);
}

/** True if weapon `id` has hatched. */
export const hatched = (id) => build[id] === HATCH_LEVEL;

function rollItems(weaponsOnly) {
  const used = { true: 0, false: 0 };
  for (const id of buildOrder) used[!!ITEM_BY_ID[id].weapon]++;
  const pool = ITEMS.filter((item) => {
    const level = build[item.id] || 0;
    if (level >= MAX_ITEM_LEVEL) return false;
    if (!level && used[!!item.weapon] >= SLOTS) return false;
    return !weaponsOnly || item.weapon;
  });
  if (weaponsOnly && !pool.length) return rollItems(false);
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
  build[card.id] = card.hatch ? HATCH_LEVEL : Math.min(MAX_ITEM_LEVEL, build[card.id] + 1);
  recomputeStats();
}

/** The two description lines a card shows; an item with a cost shows it second (in red). */
export function cardText(card) {
  const item = ITEM_BY_ID[card.id];
  if (card.hatch) return item.hatch.text;
  const gain = card.boon || card.level === 1 ? item.text : [item.up[Math.min(card.level - 2, item.up.length - 1)], ''];
  return item.cost ? [gain[0], item.cost] : gain;
}

/**
 * The gold third line of a card, so hatching is never a secret: a weapon names the passive it
 * hatches with; a passive names the weapon she owns that it would hatch (the first not yet hatched).
 */
export function cardHint(card) {
  const item = ITEM_BY_ID[card.id];
  if (card.hatch || card.boon) return '';
  if (item.hatch) return `HATCH + ${ITEM_BY_ID[item.hatch.with].name}`;
  const id = buildOrder.find((w) => ITEM_BY_ID[w].hatch && ITEM_BY_ID[w].hatch.with === card.id && !hatched(w));
  return id ? `HATCHES ${ITEM_BY_ID[id].name}` : '';
}
