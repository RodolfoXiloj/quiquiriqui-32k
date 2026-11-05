// Progress kept between runs, in localStorage: the peril levels (difficulty tiers) unlocked and
// the one chosen on the title screen. A dawn at the highest unlocked peril unlocks the next one.

export const MAX_PERIL = 5;
/** Each peril level adds these shares: predator health, speed, numbers and bite damage. */
export const PERIL = { hp: 0.25, speed: 0.06, spawns: 0.2, bite: 0.1 };

export const profile = { peril: 0, perilUnlocked: 0 };
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

/** A dawn at peril `p`: unlocks the next peril if `p` was the highest. Returns true if it did. */
export function unlockAfterDawn(p) {
  if (p !== profile.perilUnlocked || p >= MAX_PERIL) return false;
  profile.perilUnlocked++;
  saveProfile();
  return true;
}
