// Our own parametric WebAudio synthesizer (no third-party code). Each sound is rendered into a
// short AudioBuffer from a compact recipe: tone + low-passed noise + pitch slide + ring modulation.

let audioCtx = null;
const SAMPLE_RATE = 22050;

/** Creates the AudioContext lazily (browsers only allow it after a user gesture) and resumes it. */
function ensureCtx() {
  if (!audioCtx && typeof AudioContext !== 'undefined') audioCtx = new AudioContext();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/**
 * Synthesizes and plays one sound.
 *   freq / endFreq: pitch slide in Hz      dur: seconds      noise: 0..1 noise mix
 *   vol: peak gain                          mod: ring-modulation Hz (0 = off)
 *   delay: seconds to wait before playing (for little sequences such as a cluck)
 */
export function playTone({ freq = 220, endFreq = 80, dur = 0.14, noise = 0.2, vol = 0.28, mod = 0, delay = 0 }) {
  const ctx = ensureCtx();
  if (!ctx) return;

  const length = Math.max(1, (SAMPLE_RATE * dur) | 0);
  const buffer = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = buffer.getChannelData(0);
  let phase = 0;
  let modPhase = 0;
  let low = 0;
  for (let i = 0; i < length; i++) {
    const t = i / length;
    // Fast attack (first 6%), then a smooth quadratic decay
    const env = t < 0.06 ? t / 0.06 : (1 - t) * (1 - t);
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

  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.connect(ctx.destination);
  node.start(ctx.currentTime + delay);
}

/** Each sound plays at most once per this many milliseconds, so a crowd of hits stays one hit. */
const MIN_GAP_MS = 45;
const lastPlayed = {};

/** True if sound `name` may play now (and records that it did). Uses real time, so it holds at any game speed. */
function gate(name) {
  const now = performance.now();
  if (now - (lastPlayed[name] ?? -1e9) < MIN_GAP_MS) return false;
  lastPlayed[name] = now;
  return true;
}

/** Two quick, nasal "buk-BAK" notes. */
export function sfxCluck() {
  playTone({ freq: 620, endFreq: 430, dur: 0.06, noise: 0.15, vol: 0.22, mod: 45 });
  playTone({ freq: 760, endFreq: 390, dur: 0.1, noise: 0.15, vol: 0.26, mod: 45, delay: 0.08 });
}

/** A dry beak tap: every hit on a predator. */
export function sfxPeck() {
  if (gate('peck')) playTone({ freq: 900, endFreq: 300, dur: 0.05, noise: 0.5, vol: 0.2 });
}

/** A bright blip for picking up corn. */
export function sfxPickup() {
  if (gate('pickup')) playTone({ freq: 880, endFreq: 1320, dur: 0.05, noise: 0, vol: 0.14 });
}

/** A rising three-note fanfare. */
export function sfxLevelUp() {
  playTone({ freq: 520, endFreq: 540, dur: 0.1, noise: 0, vol: 0.2 });
  playTone({ freq: 660, endFreq: 680, dur: 0.1, noise: 0, vol: 0.2, delay: 0.1 });
  playTone({ freq: 880, endFreq: 900, dur: 0.18, noise: 0, vol: 0.22, delay: 0.2 });
}

/** A squawk when something bites the hen. */
export function sfxHurt() {
  if (gate('hurt')) playTone({ freq: 980, endFreq: 520, dur: 0.16, noise: 0.35, vol: 0.3, mod: 70 });
}

/** A soft wet crack when an egg lands. */
export function sfxSplat() {
  if (gate('splat')) playTone({ freq: 300, endFreq: 120, dur: 0.08, noise: 0.7, vol: 0.18 });
}

/** A soft whoosh for Wing Gust. */
export function sfxGust() {
  if (gate('gust')) playTone({ freq: 220, endFreq: 90, dur: 0.22, noise: 0.85, vol: 0.2 });
}

/** A sharp crack for Thunder Comb. */
export function sfxThunder() {
  if (gate('thunder')) playTone({ freq: 1400, endFreq: 60, dur: 0.2, noise: 0.75, vol: 0.28, mod: 30 });
}

/** The rooster at dawn: "qui-qui-ri-QUI", four nasal notes rising to a long last one. */
export function sfxCrow() {
  const notes = [
    [700, 760, 0.1, 0],
    [780, 840, 0.1, 0.14],
    [880, 980, 0.12, 0.28],
    [1150, 620, 0.55, 0.45],
  ];
  for (const [freq, endFreq, dur, delay] of notes) playTone({ freq, endFreq, dur, noise: 0.12, vol: 0.26, mod: 55, delay });
}

/** A falling squawk and a thud when the hen goes down. */
export function sfxDeath() {
  playTone({ freq: 900, endFreq: 200, dur: 0.45, noise: 0.3, vol: 0.32, mod: 60 });
  playTone({ freq: 140, endFreq: 50, dur: 0.25, noise: 0.6, vol: 0.3, delay: 0.4 });
}
