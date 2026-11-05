// Progress kept between runs, in localStorage: the peril levels (difficulty tiers) and the hens
// unlocked, and the ones chosen on the title screen. A dawn at the highest unlocked peril unlocks
// the next one; the first dawn brings the speckled hen, a dawn at peril 2 or more the black hen.

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

/** `hens` is a bit mask of unlocked hens (bit i = HENS[i]). */
export const profile = { peril: 0, perilUnlocked: 0, hen: 0, hens: 1 };
const KEY = 'qq_profile';
const DEFAULTS = { ...profile };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Reads the saved progress (anything missing or broken falls back to a fresh start). */
export function loadProfile() {
  Object.assign(profile, DEFAULTS);
  try {
    Object.assign(profile, JSON.parse(localStorage.getItem(KEY)) || {});
  } catch {
    // Storage blocked or unreadable: play with a fresh profile.
  }
  profile.perilUnlocked = clamp(profile.perilUnlocked | 0, 0, MAX_PERIL);
  profile.peril = clamp(profile.peril | 0, 0, profile.perilUnlocked);
  profile.hens = (profile.hens | 1) & ((1 << HENS.length) - 1);
  if (!(profile.hens & (1 << profile.hen))) profile.hen = 0;
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
