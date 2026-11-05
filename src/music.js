// Music: an original theme written for this game, played by our own synth (no samples, no
// third-party code). A soft humming voice carries a heroic melody over a galloping bass and a
// noise drum kit, at 140 BPM. The part follows the run: the day theme (verse, verse, chorus), the
// chorus alone while a boss is out, a sparse low version at night, and a short major fanfare at
// dawn. Notes are scheduled a little ahead on the AudioContext clock, so the beat stays steady
// whatever the frame rate or game speed.
//
// Note data is compact text: one character per eighth note. A letter is a pitch (a = the voice's
// base note, each letter one semitone higher), '-' holds the previous note, '.' is a rest.
// Drums use k (kick), s (snare) and h (hi-hat).
import { audio } from './sfx.js';

const BPM = 140;
/** Seconds per eighth note. */
export const EIGHTH = 60 / BPM / 2;
/** How far ahead (seconds) notes are scheduled. */
const LOOKAHEAD = 0.2;
const SAMPLE_RATE = 22050;

/** MIDI note of 'a' for each voice: the hum from E4, the bass from C3 (high enough for phones). */
const BASE = { hum: 64, bass: 48 };

/** Each part: bars of 8 eighths per voice. Day = verse, verse, chorus. */
export const PARTS = {
  verse: {
    hum: 'a-dfh---' + 'hfdfa---' + 'a-dfh-kh' + 'f-----..',
    bass: 'eqeqeqeq' + 'amamamam' + 'eqeqeqeq' + 'cocococo',
    drums: 'khshkksh' + 'khshkksh' + 'khshkksh' + 'khshksss',
  },
  chorus: {
    hum: 'p-omk-h-' + 'ikm---ki' + 'h-kmp---' + 'o---m---',
    bass: 'hthththt' + 'cocococo' + 'amamamam' + 'cocococo',
    drums: 'kkshkksh' + 'kkshkksh' + 'kkshkksh' + 'kkshsss.',
  },
  night: {
    hum: 'a---d---' + 'f---a---' + 'a---d---' + 'f-------',
    bass: 'e-------' + 'a-------' + 'e-------' + 'c-------',
    drums: 'k...h...' + 'k...h...' + 'k...h...' + 'k.......',
  },
  dawn: {
    hum: 'd-h-k-p-' + 't-------',
    bass: 'h-------' + 'h-------',
    drums: 'k.s.k.s.' + 'k-------',
  },
};
/** The order of sections in each mood. */
const SONGS = { day: ['verse', 'verse', 'chorus'], boss: ['chorus'], night: ['night'], dawn: ['dawn'] };

/** MIDI note to Hz. */
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/**
 * The notes that start on eighth `i` of section `name`: [{ voice, midi, eighths }] (drums use
 * midi 0 and the drum letter as voice). Pure, so the tests can read the score without audio.
 */
export function notesAt(name, i) {
  const part = PARTS[name];
  const out = [];
  for (const voice of ['hum', 'bass']) {
    const line = part[voice];
    const c = line[i % line.length];
    if (c < 'a' || c > 'z') continue;
    let eighths = 1;
    while (line[(i + eighths) % line.length] === '-' && eighths < line.length) eighths++;
    out.push({ voice, midi: BASE[voice] + c.charCodeAt(0) - 97, eighths });
  }
  const d = part.drums[i % part.drums.length];
  if (d === 'k' || d === 's' || d === 'h') out.push({ voice: d, midi: 0, eighths: 1 });
  return out;
}

/** Length of section `name` in eighths (its longest line). */
export function sectionLength(name) {
  const part = PARTS[name];
  return Math.max(part.hum.length, part.bass.length, part.drums.length);
}

// --- Voices: rendered once per note and kept ---------------------------------------------------

const cache = new Map();

/** Renders one note of `voice` (hum, bass, or drum k/s/h) lasting `seconds`. */
function renderNote(ctx, voice, midi, seconds) {
  const key = `${voice}${midi}:${seconds.toFixed(3)}`;
  if (cache.has(key)) return cache.get(key);
  const length = Math.max(1, (SAMPLE_RATE * seconds) | 0);
  const buffer = ctx.createBuffer(1, length, SAMPLE_RATE);
  const data = buffer.getChannelData(0);
  const f = hz(midi);
  let phase = 0;
  let low = 0;
  for (let i = 0; i < length; i++) {
    const t = i / SAMPLE_RATE;
    const u = i / length;
    let s = 0;
    if (voice === 'hum') {
      // A soft, closed-mouth "mmm": a round tone with a gentle vibrato that grows in
      phase += (f * (1 + 0.012 * Math.sin(t * 34) * Math.min(1, t * 3)) * Math.PI * 2) / SAMPLE_RATE;
      const env = Math.min(1, t / 0.06) * (u > 0.85 ? (1 - u) / 0.15 : 1);
      s = (Math.sin(phase) + 0.25 * Math.sin(phase * 2) + 0.08 * Math.sin(phase * 3)) * env * 0.16;
    } else if (voice === 'bass') {
      phase += (f * Math.PI * 2) / SAMPLE_RATE;
      const env = Math.min(1, t / 0.005) * (1 - u) ** 1.5;
      s = (Math.sin(phase) + 0.3 * Math.sin(phase * 3) + 0.12 * Math.sin(phase * 5)) * env * 0.2;
    } else if (voice === 'k') {
      // Kick: a fast pitch drop
      phase += ((150 * (1 - u) + 45) * Math.PI * 2) / SAMPLE_RATE;
      s = Math.sin(phase) * (1 - u) ** 2 * 0.5;
    } else {
      // Snare (long, darker) and hi-hat (short, brighter): shaped noise
      const n = Math.random() * 2 - 1;
      low = voice === 's' ? low * 0.5 + n * 0.5 : n - low * 0.7;
      s = low * (1 - u) ** (voice === 's' ? 2 : 4) * (voice === 's' ? 0.22 : 0.07);
    }
    data[i] = s;
  }
  cache.set(key, buffer);
  return buffer;
}

// --- The player -------------------------------------------------------------------------------

/** What is playing: `on` (the player's M toggle), the mood, and the scheduling cursor. */
export const music = { on: true, mood: null, section: 0, step: 0, next: 0, played: 0 };
const MUTE_KEY = 'qq_mute';

export function loadMusicSetting() {
  try {
    music.on = localStorage.getItem(MUTE_KEY) !== '1';
  } catch {
    music.on = true;
  }
}

/** The M key: music on or off (remembered). */
export function toggleMusic() {
  music.on = !music.on;
  try {
    localStorage.setItem(MUTE_KEY, music.on ? '0' : '1');
  } catch {
    // Storage can be blocked; the choice then lasts for this visit only.
  }
}

function startMood(mood) {
  music.mood = mood;
  music.section = 0;
  music.step = 0;
  music.played = 0;
}

/**
 * Called every step with the mood the run is in ('day', 'boss', 'night', 'dawn', or null for
 * silence) and how loud it should be (0..1, lower behind menus). Schedules the next notes.
 */
export function updateMusic(mood, level) {
  const ctx = audio.ctx;
  if (!ctx) return; // no sound yet (no gesture), or no audio at all
  audio.music.gain.setTargetAtTime(music.on && mood ? 0.55 * level : 0, ctx.currentTime, 0.15);
  if (!mood) {
    music.mood = null;
    return;
  }
  // Start (or catch up after the tab slept) on the next beat
  if (music.mood === null || music.next < ctx.currentTime - 0.1) {
    if (music.mood === null) startMood(mood);
    music.next = ctx.currentTime + 0.05;
  }
  while (music.next < ctx.currentTime + LOOKAHEAD) {
    // Moods change on a bar line
    if (music.step % 8 === 0 && mood !== music.mood) startMood(mood);
    const name = SONGS[music.mood][music.section % SONGS[music.mood].length];
    if (music.mood === 'dawn' && music.played >= sectionLength('dawn')) break; // the fanfare plays once
    for (const note of notesAt(name, music.step)) {
      const node = ctx.createBufferSource();
      node.buffer = renderNote(ctx, note.voice, note.midi, note.eighths * EIGHTH);
      node.connect(audio.music);
      node.start(music.next);
    }
    music.next += EIGHTH;
    music.played++;
    if (++music.step >= sectionLength(name)) {
      music.step = 0;
      music.section++;
    }
  }
}
