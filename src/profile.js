// Progress kept between runs, in localStorage: the peril level (difficulty tier) and the hen
// chosen on the title screen, and the hens unlocked. Every peril is open from the start and the
// hardest comes first (players step down to an easier one if they like); the first dawn brings the
// speckled hen, a dawn at HEN or harder the black hen. Every run also earns golden eggs, spent in
// the shop on upgrades that last from run to run.

export const MAX_PERIL = 5;
/** Each peril level adds these shares to every predator: health and bite. The rules do the rest. */
export const PERIL = { hp: 0.15, bite: 0.15 };
/**
 * Peril levels add a rule each, and keep those below:
 * events come more often; elites twice as often; two bosses each time, and
 * predators bite only by hopping at her (they blink first: stepping away dodges); two cards to
 * choose from instead of three; and no mercy (a fuller meadow, faster predators). The title shows
 * the rule of the chosen level.
 */
export const MORE_EVENTS = 1;
export const ELITES_X2 = 2;
export const TWO_BOSSES = 3;
export const HOPS = 3;
export const TWO_CARDS = 4;
export const NO_MERCY = 5;
export const PERIL_RULES = ['', 'MORE EVENTS', 'ELITES X2', 'TWO BOSSES + HOPS', 'TWO CARDS', 'NO MERCY'];
/** Each peril level's name on the title screen, easiest first (the hardest is named after its rule). */
export const PERIL_NAMES = ['EGG', 'CHICK', 'HEN', 'ROOSTER', 'HAWK', 'NO MERCY'];

/** Peril at which a dawn brings the black hen. */
const BLACK_HEN_PERIL = 2;
/**
 * The hens to play: each starts with its own weapon (and wears its own feathers, sprites.js).
 * `hint` tells, on the title screen, how to unlock a locked one.
 */
export const HENS = [
  { name: 'WHITE HEN', start: 'egg' },
  { name: 'SPECKLED HEN', start: 'peck', hint: 'WIN A DAWN TO UNLOCK' },
  { name: 'BLACK HEN', start: 'darts', hint: `WIN A DAWN ON ${PERIL_NAMES[BLACK_HEN_PERIL]} OR HARDER` },
];

/** Permanent upgrades: each level adds `per` to a stat of every run (items.js sums them in). */
export const SHOP = [
  { id: 'hide', name: 'TOUGH HIDE', text: '+250 HEALTH', stat: 'maxHp', per: 250 },
  { id: 'legs', name: 'STRONG LEGS', text: '+4% SPEED', stat: 'speed', per: 0.04 },
  { id: 'eye', name: 'SHARP EYE', text: '+12% DAMAGE', stat: 'damage', per: 0.12 },
  { id: 'crop', name: 'BIG CROP', text: '+0.25 REACH', stat: 'magnet', per: 0.25 },
  { id: 'learner', name: 'QUICK LEARNER', text: '+8% XP', stat: 'xp', per: 0.08 },
];
/** Golden eggs for each next level of a shop upgrade (5 levels). */
export const SHOP_COSTS = [10, 20, 40, 80, 160];

/** `hens` is a bit mask of unlocked hens (bit i = HENS[i]); `shop` holds each upgrade's level. */
export const profile = { peril: MAX_PERIL, hen: 0, hens: 1, eggs: 0, shop: [0, 0, 0, 0, 0] };
const KEY = 'qq_profile';
const DEFAULTS = JSON.stringify(profile);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Reads the saved progress (anything missing or broken falls back to a fresh start). */
export function loadProfile() {
  Object.assign(profile, JSON.parse(DEFAULTS));
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {};
    // A save from when perils opened one by one starts again at the hardest (it keeps hens and eggs)
    if (saved.perilUnlocked != null) delete saved.peril, delete saved.perilUnlocked;
    Object.assign(profile, saved);
  } catch {
    // Storage blocked or unreadable: play with a fresh profile.
  }
  profile.peril = clamp(profile.peril | 0, 0, MAX_PERIL);
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

/**
 * The hen `step` (+1 / -1) away from hen `from`. Locked hens are included, so the title screen can
 * show them, but only an unlocked one becomes the saved choice.
 */
export function chooseHen(from, step) {
  const h = (from + step + HENS.length) % HENS.length;
  if (henUnlocked(h)) {
    profile.hen = h;
    saveProfile();
  }
  return h;
}

export function saveProfile() {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Storage can be blocked; progress then lasts for this visit only.
  }
}

/** Chooses peril `p` (every one is open). */
export function choosePeril(p) {
  profile.peril = clamp(p, 0, MAX_PERIL);
  saveProfile();
}

/** A dawn at peril `p`: unlocks the hens it earns. Returns what was unlocked, as screen lines. */
export function unlockAfterDawn(p) {
  const notes = [];
  for (const [i, needs] of [[1, 0], [2, BLACK_HEN_PERIL]]) {
    if (p >= needs && !henUnlocked(i)) {
      profile.hens |= 1 << i;
      notes.push(`${HENS[i].name}!`);
    }
  }
  saveProfile();
  return notes;
}
