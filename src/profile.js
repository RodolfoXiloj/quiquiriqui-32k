// Progress kept between runs, in localStorage: the peril levels (difficulty tiers) and the hens
// unlocked, and the ones chosen on the title screen. A dawn at the highest unlocked peril unlocks
// the next one; the first dawn brings the speckled hen, a dawn at peril 2 or more the black hen.
// Every run also earns golden eggs, spent in the shop on upgrades that last from run to run.

export const MAX_PERIL = 5;
/** Each peril level adds these shares: predator health, speed, numbers and bite damage. */
export const PERIL = { hp: 0.25, speed: 0.06, spawns: 0.2, bite: 0.1 };

/** The hens to play: each starts with its own weapon (and wears its own feathers, sprites.js). */
export const HENS = [
  { name: 'WHITE HEN', start: 'egg' },
  { name: 'SPECKLED HEN', start: 'peck' },
  { name: 'BLACK HEN', start: 'darts' },
];
/** Peril at which a dawn brings the black hen. */
const BLACK_HEN_PERIL = 2;

/** Permanent upgrades: each level adds `per` to a stat of every run (items.js sums them in). */
export const SHOP = [
  { id: 'hide', name: 'TOUGH HIDE', text: '+10 HEALTH', stat: 'maxHp', per: 10 },
  { id: 'legs', name: 'STRONG LEGS', text: '+3% SPEED', stat: 'speed', per: 0.03 },
  { id: 'eye', name: 'SHARP EYE', text: '+5% DAMAGE', stat: 'damage', per: 0.05 },
  { id: 'crop', name: 'BIG CROP', text: '+0.25 REACH', stat: 'magnet', per: 0.25 },
  { id: 'learner', name: 'QUICK LEARNER', text: '+5% XP', stat: 'xp', per: 0.05 },
];
/** Golden eggs for each next level of a shop upgrade (5 levels). */
export const SHOP_COSTS = [10, 20, 40, 80, 160];

/** `hens` is a bit mask of unlocked hens (bit i = HENS[i]); `shop` holds each upgrade's level. */
export const profile = { peril: 0, perilUnlocked: 0, hen: 0, hens: 1, eggs: 0, shop: [0, 0, 0, 0, 0] };
const KEY = 'qq_profile';
const DEFAULTS = JSON.stringify(profile);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Reads the saved progress (anything missing or broken falls back to a fresh start). */
export function loadProfile() {
  Object.assign(profile, JSON.parse(DEFAULTS));
  try {
    Object.assign(profile, JSON.parse(localStorage.getItem(KEY)) || {});
  } catch {
    // Storage blocked or unreadable: play with a fresh profile.
  }
  profile.perilUnlocked = clamp(profile.perilUnlocked | 0, 0, MAX_PERIL);
  profile.peril = clamp(profile.peril | 0, 0, profile.perilUnlocked);
  profile.hens = (profile.hens | 1) & ((1 << HENS.length) - 1);
  if (!(profile.hens & (1 << profile.hen))) profile.hen = 0;
  profile.eggs = Math.max(0, profile.eggs | 0);
  profile.shop = SHOP.map((_, i) => clamp((profile.shop && profile.shop[i]) | 0, 0, SHOP_COSTS.length));
}

/** Golden eggs a run earns: 1 per 30 s, 1 per 40 kills, 10 for a dawn, and 50% more per peril level. */
export function eggsEarned(seconds, kills, won, peril) {
  return Math.floor((Math.floor(seconds / 30) + Math.floor(kills / 40) + (won ? 10 : 0)) * (1 + 0.5 * peril));
}

export function bankEggs(n) {
  profile.eggs += n;
  saveProfile();
}

/** Buys the next level of shop upgrade `i`. Returns false if it is maxed or too dear. */
export function buyUpgrade(i) {
  const level = profile.shop[i];
  if (level >= SHOP_COSTS.length || profile.eggs < SHOP_COSTS[level]) return false;
  profile.eggs -= SHOP_COSTS[level];
  profile.shop[i]++;
  saveProfile();
  return true;
}

/** True if hen `i` is unlocked. */
export const henUnlocked = (i) => !!(profile.hens & (1 << i));

/** Steps the chosen hen by `step` (+1 / -1), skipping locked ones. */
export function chooseHen(step) {
  let h = profile.hen;
  do h = (h + step + HENS.length) % HENS.length;
  while (!henUnlocked(h));
  profile.hen = h;
  saveProfile();
}

export function saveProfile() {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Storage can be blocked; progress then lasts for this visit only.
  }
}

/** Chooses peril `p`, kept within what is unlocked. */
export function choosePeril(p) {
  profile.peril = clamp(p, 0, profile.perilUnlocked);
  saveProfile();
}

/** A dawn at peril `p`: unlocks what it earns. Returns what was unlocked, as screen lines. */
export function unlockAfterDawn(p) {
  const notes = [];
  if (p === profile.perilUnlocked && p < MAX_PERIL) {
    profile.perilUnlocked++;
    notes.push(`PERIL ${p + 1} UNLOCKED!`);
  }
  for (const [i, needs] of [[1, 0], [2, BLACK_HEN_PERIL]]) {
    if (p >= needs && !henUnlocked(i)) {
      profile.hens |= 1 << i;
      notes.push(`${HENS[i].name}!`);
    }
  }
  saveProfile();
  return notes;
}
