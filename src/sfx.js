// Our own parametric WebAudio synthesizer (no third-party code). Each sound is rendered into a
// short AudioBuffer from a compact recipe: tone + low-passed noise + pitch slide + ring modulation.
// Everything goes through a small mixer: a sound-effects bus and a music bus (music.js) feed a
// compressor, so a screen full of hits stays clear instead of clipping.

const SAMPLE_RATE = 22050;
/** Every sound effect is pitched up or down by up to this share, so repeats never sound identical. */
const PITCH_SPREAD = 0.08;

/** The mixer, created lazily on the first sound (browsers only allow audio after a gesture). */
export const audio = { ctx: null, sfx: null, music: null };

/** Creates the AudioContext and the mixer once, resumes it if needed, and returns it (or null). */
export function ensureAudio() {
  if (!audio.ctx && typeof AudioContext !== 'undefined') {
    const ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    audio.sfx = ctx.createGain();
    audio.sfx.gain.value = 0.9;
    audio.sfx.connect(comp);
    audio.music = ctx.createGain();
    audio.music.gain.value = 0;
    audio.music.connect(comp);
    audio.ctx = ctx;
  }
  if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  return audio.ctx;
}

/**
 * Synthesizes one sound into a buffer.
 *   freq / endFreq: pitch slide in Hz      dur: seconds      noise: 0..1 noise mix
 *   vol: peak gain                          mod: ring-modulation Hz (0 = off)
 *   attack: share of the sound spent fading in (soft voices use more)
 */
export function renderTone(ctx, { freq = 220, endFreq = 80, dur = 0.14, noise = 0.2, vol = 0.28, mod = 0, attack = 0.06 }) {
  const length = Math.max(1, (SAMPLE_RATE * dur) | 0);
  const buffer = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = buffer.getChannelData(0);
  let phase = 0;
  let modPhase = 0;
  let low = 0;
  for (let i = 0; i < length; i++) {
    const t = i / length;
    // Fade in over `attack`, then a smooth quadratic decay
    const env = t < attack ? t / attack : ((1 - t) / (1 - attack)) ** 2;
    phase += ((freq + (endFreq - freq) * t) * Math.PI * 2) / SAMPLE_RATE;
    let s = Math.sin(phase) + 0.35 * Math.sin(phase * 2.01);
    if (mod > 0) {
      modPhase += (mod * Math.PI * 2) / SAMPLE_RATE;
      s *= Math.sin(modPhase);
    }
    if (noise > 0) {
      low = low * 0.72 + (Math.random() * 2 - 1) * 0.28;
      s = s * (1 - noise) + low * noise;
    }
    data[i] = s * env * vol;
  }
  return buffer;
}

/**
 * Plays one sound effect on the effects bus, `delay` seconds from now. Its pitch is varied a
 * little unless `exact` is set (jingles that must stay in tune).
 */
export function playTone(recipe) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const shift = recipe.exact ? 1 : 1 + (Math.random() * 2 - 1) * PITCH_SPREAD;
  const node = ctx.createBufferSource();
  node.buffer = renderTone(ctx, { ...recipe, freq: (recipe.freq ?? 220) * shift, endFreq: (recipe.endFreq ?? 80) * shift });
  node.connect(audio.sfx);
  node.start(ctx.currentTime + (recipe.delay || 0));
}

/** Each sound plays at most once per this many milliseconds, so a crowd of hits stays one hit. */
const MIN_GAP_MS = 45;
const lastPlayed = {};

/**
 * True if sound `name` may play now (and records that it did): at most once per `gap` ms. Uses
 * real time, so it holds at any game speed.
 */
function gate(name, gap = MIN_GAP_MS) {
  const now = performance.now();
  if (now - (lastPlayed[name] ?? -1e9) < gap) return false;
  lastPlayed[name] = now;
  return true;
}

/** Two quick, nasal "buk-BAK" notes. */
export function sfxCluck() {
  playTone({ freq: 620, endFreq: 430, dur: 0.06, noise: 0.15, vol: 0.22, mod: 45 });
  playTone({ freq: 760, endFreq: 390, dur: 0.1, noise: 0.15, vol: 0.26, mod: 45, delay: 0.08 });
}

/**
 * Candidate hit sounds, the most repeated sound in the game. tools/browser/sounds.html plays
 * them side by side; the game uses the first.
 */
export const HIT_SOUNDS = [
  // A, thud: a short low punch with a faint click on top
  [
    { freq: 240, endFreq: 70, dur: 0.07, noise: 0.12, vol: 0.2 },
    { freq: 2600, endFreq: 1800, dur: 0.012, noise: 0.9, vol: 0.05 },
  ],
  // B, tock: a hollow wooden knock
  [
    { freq: 820, endFreq: 760, dur: 0.035, noise: 0.03, vol: 0.12, attack: 0.02 },
    { freq: 1640, endFreq: 1500, dur: 0.02, noise: 0, vol: 0.04, attack: 0.02 },
  ],
  // C, pop: a short rising blip
  [{ freq: 420, endFreq: 980, dur: 0.04, noise: 0.05, vol: 0.11 }],
];
export const HIT_NAMES = ['A thud', 'B tock', 'C pop'];
/** A hit on a predator plays at most this often (ms): a crowd of hits stays one hit. */
const HIT_GAP_MS = 60;

/** Every hit on a predator. */
export function sfxPeck() {
  if (gate('hit', HIT_GAP_MS)) for (const recipe of HIT_SOUNDS[0]) playTone(recipe);
}

/** A bright blip for picking up corn. */
export function sfxPickup() {
  if (gate('pickup')) playTone({ freq: 880, endFreq: 1320, dur: 0.05, noise: 0, vol: 0.12 });
}

/**
 * The last sound of each predator kind (enemies.js order: rat, fox, snake, crow, badger, crate):
 * a squeak, a yelp, a hiss, a caw, a grunt and breaking wood.
 */
const KILL_VOICES = [
  [{ freq: 1800, endFreq: 2600, dur: 0.06, noise: 0.1, vol: 0.1 }],
  [{ freq: 950, endFreq: 520, dur: 0.12, noise: 0.15, vol: 0.14, mod: 30 }],
  [{ freq: 3000, endFreq: 2000, dur: 0.18, noise: 0.95, vol: 0.1 }],
  [{ freq: 520, endFreq: 380, dur: 0.14, noise: 0.4, vol: 0.14, mod: 90 }],
  [{ freq: 150, endFreq: 90, dur: 0.16, noise: 0.3, vol: 0.2, mod: 40 }],
  [
    { freq: 420, endFreq: 120, dur: 0.08, noise: 0.75, vol: 0.18 },
    { freq: 300, endFreq: 90, dur: 0.1, noise: 0.8, vol: 0.14, delay: 0.05 },
  ],
  // magpie: a dry "chak-chak"
  [
    { freq: 1300, endFreq: 900, dur: 0.05, noise: 0.45, vol: 0.12 },
    { freq: 1250, endFreq: 850, dur: 0.05, noise: 0.45, vol: 0.12, delay: 0.08 },
  ],
  // weasel: a thin squeal
  [{ freq: 1600, endFreq: 2300, dur: 0.1, noise: 0.2, vol: 0.11, mod: 60 }],
  // skunk: a long, low "pfff" as the stink cloud comes out
  [{ freq: 220, endFreq: 110, dur: 0.35, noise: 0.9, vol: 0.14 }],
];

/** An event begins: a two-tone farmyard alarm. */
export function sfxAlarm() {
  [880, 660, 880, 660].forEach((freq, i) => playTone({ freq, endFreq: freq, dur: 0.09, noise: 0.05, vol: 0.12, exact: true, delay: i * 0.11 }));
}

/** The hawk takes aim: a long, falling screech. */
export function sfxScreech() {
  playTone({ freq: 2600, endFreq: 1300, dur: 0.4, noise: 0.35, vol: 0.12, mod: 25 });
}

/** A weasel lunges: a rising swish. */
export function sfxLunge() {
  if (gate('lunge', 150)) playTone({ freq: 300, endFreq: 1100, dur: 0.12, noise: 0.55, vol: 0.1 });
}

/** A magpie throws a pebble: a short whoosh. */
export function sfxThrow() {
  if (gate('throw', 120)) playTone({ freq: 1500, endFreq: 500, dur: 0.09, noise: 0.6, vol: 0.09 });
}

/** A predator of `kind` goes down. */
export function sfxKill(kind) {
  if (gate('kill' + kind)) for (const recipe of KILL_VOICES[kind] || []) playTone(recipe);
}

/** A rising four-note fanfare when the cards open. */
export function sfxLevelUp() {
  [523, 659, 784, 1047].forEach((freq, i) => playTone({ freq, endFreq: freq * 1.01, dur: i === 3 ? 0.22 : 0.1, noise: 0, vol: 0.18, exact: true, delay: i * 0.08 }));
}

/** A chest opens: a shimmering arpeggio. */
export function sfxChest() {
  [784, 988, 1175, 1568, 1976].forEach((freq, i) => playTone({ freq, endFreq: freq, dur: 0.16, noise: 0, vol: 0.12, mod: 6, exact: true, delay: i * 0.06 }));
}

/** The magnet prize: a sweep upward. */
export function sfxMagnet() {
  playTone({ freq: 300, endFreq: 1400, dur: 0.4, noise: 0.1, vol: 0.16, mod: 20 });
}

/** Food: a happy little "nom nom". */
export function sfxFood() {
  playTone({ freq: 500, endFreq: 650, dur: 0.08, noise: 0.05, vol: 0.18 });
  playTone({ freq: 560, endFreq: 760, dur: 0.1, noise: 0.05, vol: 0.18, delay: 0.11 });
}

/** A squawk when something bites the hen. */
export function sfxHurt() {
  if (gate('hurt')) playTone({ freq: 980, endFreq: 520, dur: 0.16, noise: 0.35, vol: 0.26, mod: 70 });
}

/** A soft wet crack when an egg lands. */
export function sfxSplat() {
  if (gate('splat')) playTone({ freq: 300, endFreq: 120, dur: 0.08, noise: 0.7, vol: 0.15 });
}

/** A deep boom: a bomb, or a boss going down. */
export function sfxBoom() {
  if (gate('boom')) playTone({ freq: 160, endFreq: 40, dur: 0.5, noise: 0.8, vol: 0.34 });
}

/** A soft whoosh for Wing Gust. */
export function sfxGust() {
  if (gate('gust')) playTone({ freq: 220, endFreq: 90, dur: 0.22, noise: 0.85, vol: 0.18 });
}

/** A sharp crack for Thunder Comb. */
export function sfxThunder() {
  if (gate('thunder')) playTone({ freq: 1400, endFreq: 60, dur: 0.2, noise: 0.75, vol: 0.26, mod: 30 });
}

/** The rooster at dawn: "qui-qui-ri-QUI", four nasal notes rising to a long last one. */
export function sfxCrow() {
  const notes = [
    [700, 760, 0.1, 0],
    [780, 840, 0.1, 0.14],
    [880, 980, 0.12, 0.28],
    [1150, 620, 0.55, 0.45],
  ];
  for (const [freq, endFreq, dur, delay] of notes) playTone({ freq, endFreq, dur, noise: 0.12, vol: 0.26, mod: 55, delay, exact: true });
}

/** A falling squawk and a thud when the hen goes down. */
export function sfxDeath() {
  playTone({ freq: 900, endFreq: 200, dur: 0.45, noise: 0.3, vol: 0.32, mod: 60 });
  playTone({ freq: 140, endFreq: 50, dur: 0.25, noise: 0.6, vol: 0.3, delay: 0.4 });
}
