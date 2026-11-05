// Procedural pixel-art sprites. Every pose is a pure shape function (x, y) -> palette index,
// rasterized at boot into offscreen canvases with an automatic 1 px ink outline and a
// pre-baked white hit-flash copy. No image assets or data URIs.
import { PALETTE } from './palette.js';

/** Palette indices the bare hen uses. A test checks every worn item at every tier too. */
export const HEN_PALETTE_INDICES = [7, 8, 9, 10];

/** Baked hen poses: { idle, stepA, stepB }, each { normal, flash, w, h, footY }. Drawn facing right. */
export const henSprites = {};
/** What the baked hen is wearing (`key`, see outfitKey) and how many times she was baked. */
export const henLook = { key: null, bakes: 0 };

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

/** Symmetric trapezoid between topY (half-width topW) and botY (half-width botW). */
export function inTaper(x, y, cx, topY, botY, topW, botW) {
  if (y < topY || y > botY) return false;
  const t = (y - topY) / Math.max(1, botY - topY);
  return Math.abs(x - cx) <= topW + (botW - topW) * t;
}

/**
 * Evaluates `shapeFn(x, y)` on the inner w x h grid (a 1 px border is kept free for the outline),
 * outlines every filled pixel with ink (index 0), and bakes a normal and a white-flash canvas.
 * A shape may return 0 for inner ink details (eyes); those do not grow an outline.
 * `footY` is the row that stands on the ground (the renderer anchors it there).
 */
export function bakeSprite(w, h, shapeFn, footY = h - 2) {
  const raw = new Int8Array(w * h).fill(-1);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) raw[y * w + x] = shapeFn(x, y);
  }

  const grid = new Int8Array(raw);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (raw[i] !== -1) continue;
      if (
        (x > 0 && raw[i - 1] > 0) ||
        (x < w - 1 && raw[i + 1] > 0) ||
        (y > 0 && raw[i - w] > 0) ||
        (y < h - 1 && raw[i + w] > 0)
      ) {
        grid[i] = 0;
      }
    }
  }

  const normal = makeCanvas(w, h);
  const flash = makeCanvas(w, h);
  const nctx = normal.getContext('2d');
  const fctx = flash.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = grid[y * w + x];
      if (c < 0) continue;
      nctx.fillStyle = PALETTE[c];
      nctx.fillRect(x, y, 1, 1);
      fctx.fillStyle = PALETTE[c === 0 ? 0 : 13];
      fctx.fillRect(x, y, 1, 1);
    }
  }
  return { normal, flash, w, h, footY };
}

// --- The hen and her outfit ----------------------------------------------------------------------
//
// The hen's sprite is 24x24: her body keeps its 18x18 design, moved by (HEN_OX, HEN_OY) to leave
// room for a pot on her head, a cape behind her and a basket on her back. Every worn item is a
// layer (bx, by, tier) -> palette index or -1, in the body's own coordinates. The tier is 1
// (levels 1-2), 2 (levels 3-4) or 3 (level 5, golden). Front layers cover the body, the body
// covers the cape, and items that reshape her (comb, beak, wing, tail, boots) live in the body.
// bakeSprite then wraps the whole outfit in one ink outline.

export const HEN_SIZE = 24;
const HEN_OX = 3;
const HEN_OY = 4;

const POSES = ['idle', 'stepA', 'stepB'];

/** Every item that changes how the hen looks. Egg Toss changes the egg, Chick Orbit brings chicks. */
export const WORN_ITEMS = ['thunder', 'helmet', 'shades', 'bandana', 'basket', 'corn', 'peck', 'gust', 'darts', 'boots', 'cape'];

/** Outfit tier for an item level: 0 (not owned), 1 (levels 1-2), 2 (3-4) or 3 (5). */
export function outfitTier(level) {
  return !level ? 0 : level >= 5 ? 3 : level >= 3 ? 2 : 1;
}

/** The outfit, { id: tier }, that a build ({ id: level }) puts on the hen. */
export function outfitOf(levels) {
  const outfit = {};
  for (const id of WORN_ITEMS) outfit[id] = outfitTier(levels[id]);
  return outfit;
}

/** A short string that changes exactly when the hen's look changes (her items and her feathers). */
export function outfitKey(outfit) {
  return WORN_ITEMS.map((id) => outfit[id] || 0).join('') + (outfit.hen || 0);
}

/** Feathers of each hen (profile.js HENS order): [body, shade, speckles or -1]. */
export const FEATHERS = [
  [7, 8, -1],
  [7, 8, 19],
  [17, 15, -1],
];

/** Thunder Comb: a zigzag bolt standing on her head, as [row, from x, to x] from the bottom up. */
const BOLT_ROWS = [
  [2, 11, 13],
  [1, 12, 13],
  [0, 11, 12],
  [-1, 12, 13],
  [-2, 12, 12],
];

/** Worn in front of the body; earlier layers cover later ones. */
const FRONT_LAYERS = [
  [
    'thunder',
    (x, y, t) => {
      const rows = t === 1 ? 3 : 5;
      for (let i = 0; i < rows; i++) {
        const [ry, x0, x1] = BOLT_ROWS[i];
        if (y === ry && x >= x0 && x <= x1) return i === rows - 1 || (t === 3 && x === x1) ? 13 : 10;
      }
      if (t === 3 && ((x === 10 && y === -1) || (x === 15 && y === 0))) return 13; // sparks
      return -1;
    },
  ],
  [
    'helmet',
    (x, y, t) => {
      const metal = t === 3 ? 10 : 16;
      const shade = t === 3 ? 19 : 17;
      if (y === 3 && x >= 9 && x <= 16) return shade; // rim
      if (y >= 0 && y <= 2 && x >= 10 && x <= 15) return x >= 14 ? shade : t === 3 && x === 11 && y === 1 ? 13 : metal;
      if (t >= 2 && ((y === -1 && x >= 12 && x <= 13) || (x === 9 && y === 1))) return shade; // knob and handle
      return -1;
    },
  ],
  [
    'shades',
    (x, y, t) => {
      if ((y === 4 || y === 5) && x >= 12 && x <= 15) return t >= 2 && x === 13 && y === 4 ? 13 : 0; // dark lenses, with a shine
      if (y === 4 && (x === 10 || x === 11)) return t === 3 ? 10 : 0; // arm
      if (y === 3 && x >= 12 && x <= 15 && t === 3) return 10; // gold frame
      return -1;
    },
  ],
  [
    'bandana',
    (x, y, t) => {
      if ((y === 7 || y === 8) && x >= 10 && x <= 13) return (x + y) % 3 === 0 ? (t === 3 ? 10 : 13) : 12;
      if (t >= 2 && ((y === 8 && x === 9) || (y === 9 && (x === 8 || x === 9)))) return 12; // knot tails
      return -1;
    },
  ],
  [
    'basket',
    (x, y, t) => {
      const top = t >= 2 ? 3 : 4;
      if (x < 5 || x > 9) return -1;
      if (y === top) return t === 3 ? (x % 2 ? 12 : 9) : 10; // corn heaped on top
      if (y > top && y <= 7) return t === 3 && y === 7 ? 10 : (x + y) % 2 ? 19 : 8; // straw weave
      if (t >= 2 && ((y === top - 1 && (x === 5 || x === 9)) || (y === top - 2 && x >= 6 && x <= 8))) return 19; // handle
      return -1;
    },
  ],
  [
    'corn',
    (x, y, t) => {
      // A bandolier of kernels across her body, thicker from tier 2, all gold at tier 3
      const d = x + y - 18;
      if (y < 8 || y > 13 || d < 0 || d > (t >= 2 ? 1 : 0)) return -1;
      if (t === 3) return (x + y) % 2 ? 10 : 13;
      return y % 2 ? 10 : 19;
    },
  ],
  [
    'boots',
    (x, y, t) => {
      // Boot cuffs at the bottom of her body (the boots themselves are her legs, see henBody)
      if (t >= 2 && y === 14 && (x === 6 || x === 7 || x === 9 || x === 10)) return t === 3 ? 10 : 13;
      return -1;
    },
  ],
];

/** Hero Cape, behind the body: longer from tier 2, gold-trimmed at tier 3. */
function capeLayer(x, y, t) {
  const ry = t >= 2 ? 5.6 : 4.8;
  if (y < 6 || !inEllipse(x, y, 5.2, 10.6, 5.4, ry)) return -1;
  return t === 3 && !inEllipse(x, y, 5.2, 10.6, 4.6, ry - 0.9) ? 10 : 9;
}

/** Wing ellipse per Wing Gust tier, plus how many columns of flight feathers show. */
const WINGS = [
  [7.5, 10, 3.2, 2, 0],
  [7.3, 9.8, 3.7, 2.3, 1.5],
  [7, 9.3, 4.3, 2.7, 2.5],
  [6.8, 8.8, 4.8, 3.1, 3],
];

/** The hen's body in profile, facing right (18x18 design), reshaped by the items she owns. */
function henBody(x, y, step, o) {
  const liftL = step === 'stepA' ? 1 : 0;
  const liftR = step === 'stepB' ? 1 : 0;
  // Comb: three red bumps on top of the head (Thunder Comb replaces it)
  if (!o.thunder && ((y === 1 && (x === 11 || x === 13)) || (y === 2 && x >= 11 && x <= 13))) return 9;
  // Beak: steel with Peck, longer from tier 2, polished at tier 3
  const beak = o.peck === 3 ? 13 : o.peck ? 16 : 10;
  if ((y === 5 && x === 15) || (y === 6 && (x === 15 || x === 16)) || (o.peck >= 2 && y === 6 && x === 17)) return beak;
  // Wattle under the beak
  if (x === 14 && (y === 7 || y === 8)) return 9;
  // Head with one ink eye
  if (inEllipse(x, y, 12.5, 5, 2.6, 2.4)) return x === 13 && y === 5 ? 0 : 7;
  // Tail feathers fanning up and back; Feather Darts tip them blue (gold at tier 3) and lengthen them
  const tip = o.darts === 3 ? 10 : o.darts ? 12 : 8;
  if (o.darts >= 2 ? inTaper(x, y, 3, 1, 9, 0.8, 3) : inTaper(x, y, 3.5, 3, 9, 0.6, 2.6)) return x <= 2 ? tip : 7;
  // Folded wing; Wing Gust makes it bigger with sky-blue flight feathers
  const wing = WINGS[o.gust || 0];
  if (inEllipse(x, y, wing[0], wing[1], wing[2], wing[3])) {
    if (o.gust && x <= wing[0] - wing[2] + wing[4]) return o.gust === 3 && x % 2 ? 13 : 12;
    return y <= 9 ? 7 : 8;
  }
  // Round body, shaded underneath
  if (inEllipse(x, y, 8.5, 10.5, 5.6, 4.2)) return y >= 13 ? 8 : 7;
  // Running Boots: chunky red boots on each leg, a white cuff from tier 2, gold heel wings at tier 3
  if (o.boots) {
    const left = (x === 6 || x === 7) && y >= 15 && y <= 16 - liftL;
    const right = (x === 9 || x === 10) && y >= 15 && y <= 16 - liftR;
    if (left || right) return 9;
    if (y === 16 && ((x === 8 && !liftL) || (x === 11 && !liftR))) return 9;
    if (o.boots === 3 && y === 15 && (x === 5 || x === 8)) return 10;
    return -1;
  }
  // Legs, each with a forward toe when planted
  if (x === 7 && y >= 15 && y <= 16 - liftL) return 10;
  if (x === 10 && y >= 15 && y <= 16 - liftR) return 10;
  if (y === 16 && ((x === 8 && !liftL) || (x === 11 && !liftR))) return 10;
  return -1;
}

/** The hen's 24x24 shape for one pose and outfit ({ id: tier }). */
export function henShape(step, outfit = {}) {
  return (x, y) => {
    const bx = x - HEN_OX;
    const by = y - HEN_OY;
    for (const [id, layer] of FRONT_LAYERS) {
      if (!outfit[id]) continue;
      const c = layer(bx, by, outfit[id]);
      if (c >= 0) return c;
    }
    const c = henBody(bx, by, step, outfit);
    if (c === 7 || c === 8) {
      // Her own feathers: white, speckled or black
      const [body, shade, speckle] = FEATHERS[outfit.hen || 0];
      if (c === 7 && speckle >= 0 && (bx * 7 + by * 3) % 5 === 0) return speckle;
      return c === 7 ? body : shade;
    }
    if (c >= 0 || !outfit.cape) return c;
    return capeLayer(bx, by, outfit.cape);
  };
}

/** Bakes the hen's poses wearing `outfit`. Called at boot and whenever her look changes. */
export function bakeHen(outfit = {}) {
  for (const step of POSES) {
    henSprites[step] = bakeSprite(HEN_SIZE, HEN_SIZE, henShape(step, outfit), 16 + HEN_OY);
  }
  henLook.key = outfitKey(outfit);
  henLook.bakes++;
}

// --- Predators ---------------------------------------------------------------------------------

/** Palette indices the predators use. None may overlap GROUND_PALETTE_INDICES (test). */
export const ENEMY_PALETTE_INDICES = [0, 8, 9, 10, 12, 13, 15, 16, 17, 18, 19];

/** The rat in profile, facing right (18x12): dark back, cream belly, a long curled tail. */
function ratShape(step) {
  const liftA = step === 'stepA' ? 1 : 0;
  const liftB = step === 'stepB' ? 1 : 0;
  return (px, y) => {
    const x = px - 2;
    if (x === 14 && y === 6) return 9; // nose
    if (inEllipse(x, y, 10.5, 3.3, 1.2, 1.1)) return 8; // ear
    if (inEllipse(x, y, 11.8, 5.8, 2.4, 2)) return x === 12 && y === 5 ? 0 : x === 13 && y === 5 ? 13 : 16; // head, eye and glint
    if (inEllipse(x, y, 7, 6.5, 4.6, 2.8)) return y <= 5 ? 17 : y >= 8 ? 8 : 16; // body
    if ((y === 7 && (x === 2 || x === 1)) || (y === 6 && x === 0) || (y >= 4 && y <= 5 && x === -1)) return 17; // tail
    if (y >= 9 && y <= 10 - liftA && x === 5) return 17; // legs
    if (y >= 9 && y <= 10 - liftB && x === 9) return 17;
    return -1;
  };
}

/** The fox in profile, facing right (20x15), with a white-tipped brush. */
function foxShape(step) {
  const liftA = step === 'stepA' ? 1 : 0;
  const liftB = step === 'stepB' ? 1 : 0;
  return (x, y) => {
    if (x === 18 && y === 6) return 0; // nose
    if (inTaper(x, y, 14, 1, 3, 0, 1)) return y === 1 ? 0 : 18; // ear with a dark tip
    if (inEllipse(x, y, 15.3, 5.5, 2.7, 2.2)) return x === 16 && y === 5 ? 0 : y >= 7 ? 13 : 18; // head
    if (x === 18 && y === 7) return 13; // snout
    if (inEllipse(x, y, 12.8, 9, 1.4, 1.6)) return 13; // chest
    if (inEllipse(x, y, 9.5, 8.5, 5, 2.9)) return y >= 10 ? 19 : 18; // body
    if (inEllipse(x, y, 3.8, 7, 3.1, 1.9)) return x <= 2 ? 13 : 18; // tail
    if (y >= 11 && y <= 12 - liftA && (x === 7 || x === 8)) return 0; // legs
    if (y >= 11 && y <= 12 - liftB && (x === 12 || x === 13)) return 0;
    return -1;
  };
}

/** The snake (18x10): a blue body with dark bands that slithers between poses. */
function snakeShape(step) {
  const phase = step === 'stepA' ? 1.6 : step === 'stepB' ? -1.6 : 0;
  const mid = (x) => 5 + Math.sin(x * 0.75 + phase) * 1.4;
  return (x, y) => {
    const hy = Math.round(mid(14));
    if (x === 17 && y === hy) return 9; // tongue
    if (inEllipse(x, y, 14.8, hy, 1.8, 1.4)) return x === 15 && y === hy - 1 ? 0 : 12; // head
    if (x >= 1 && x <= 13 && Math.abs(y - mid(x)) <= (x < 4 ? 0.6 : 1)) return x % 4 === 0 ? 15 : 12;
    return -1;
  };
}

/** The crow (14x12), flapping between poses; it flies, so it has no legs. */
function crowShape(step) {
  const wing = step === 'stepA' ? -1 : step === 'stepB' ? 1 : 0;
  return (x, y) => {
    if ((x === 12 || x === 13) && y === 5) return 10; // beak
    if (inEllipse(x, y, 10, 5, 2, 1.8)) return x === 10 && y === 4 ? 13 : 15; // head with a glint
    if (wing && inTaper(x, y, 6, wing < 0 ? 1 : 7, wing < 0 ? 5 : 10, wing < 0 ? 0.5 : 3, wing < 0 ? 3 : 0.5)) return 15;
    if (inEllipse(x, y, 6, 6.5, 4, 2.4)) return 15; // body
    if (x >= 1 && x <= 2 && y >= 6 && y <= 7) return 15; // tail
    return -1;
  };
}

/** The badger (20x13): grey, with a white face crossed by a dark stripe. */
function badgerShape(step) {
  const liftA = step === 'stepA' ? 1 : 0;
  const liftB = step === 'stepB' ? 1 : 0;
  return (x, y) => {
    if (x === 18 && y === 7) return 0; // nose
    if (inEllipse(x, y, 15.5, 6.8, 2.8, 2.3)) return y === 6 && x >= 14 ? 0 : 13; // face
    if (x === 14 && y === 4) return 16; // ear
    if (inEllipse(x, y, 9, 7.2, 6.3, 3.1)) return y <= 5 ? 16 : 17; // body
    if (x === 2 && y === 6) return 16; // tail
    if (y >= 10 && y <= 11 - liftA && (x === 5 || x === 6)) return 0; // legs
    if (y >= 10 && y <= 11 - liftB && (x === 11 || x === 12)) return 0;
    return -1;
  };
}

/** A wooden crate (14x14): planks with dark seams and a cross brace. */
function crateShape() {
  return (x, y) => {
    if (x < 2 || x > 11 || y < 2 || y > 11) return -1;
    if (x === 2 || x === 11 || y === 2 || y === 11 || x === y || x === 13 - y) return 19;
    return y % 3 === 0 ? 19 : 8;
  };
}

/** Baked predator poses, by enemy kind: [{ idle, stepA, stepB }, ...], facing right. */
export const enemySprites = [];

/** Prizes on the ground, by pickups.js kind: chest, magnet, bomb, food (a heart). */
export const pickupSprites = [];
const PICKUP_SHAPES = [
  [
    16,
    13,
    (x, y) => {
      if (x < 2 || x > 13 || y < 2 || y > 11) return -1;
      if (y === 6 || x === 2 || x === 13) return 10; // gold bands
      if ((x === 7 || x === 8) && y >= 6 && y <= 8) return 13; // lock
      return y < 6 ? 18 : 19;
    },
  ],
  [
    12,
    12,
    (x, y) => {
      const r = Math.hypot(x - 5.5, y - 4.5);
      if (y >= 4.5 && r >= 2 && r <= 4.3) return 9; // the U
      if (y < 4.5 && y >= 1 && ((x >= 1.5 && x <= 3) || (x >= 8 && x <= 9.5))) return y <= 2 ? 13 : 9; // arms with white tips
      return -1;
    },
  ],
  [
    12,
    13,
    (x, y) => {
      if (x === 8 && y <= 2) return 13; // spark
      if (x === 7 && y >= 2 && y <= 4) return 10; // fuse
      if (inEllipse(x, y, 5.5, 7.5, 4, 4)) return x <= 4 && y <= 6 ? 16 : 15;
      return -1;
    },
  ],
  [
    12,
    11,
    (x, y) => {
      // Two round lobes with a notch between them, tapering to a point
      if (y <= 2 && (x === 5 || x === 6)) return -1;
      const heart = inEllipse(x, y, 3.5, 3.5, 2.3, 2.2) || inEllipse(x, y, 7.5, 3.5, 2.3, 2.2) || inTaper(x, y, 5.5, 4, 9, 4.6, 0);
      if (!heart) return -1;
      return x === 3 && y === 3 ? 13 : 9;
    },
  ],
];

// --- Pickups, projectiles, companions and upgrade icons ------------------------------------------

/** Corn kernels by value tier: gold, sky blue, red. */
export const CORN_TIER_COLORS = [10, 12, 9];
export const cornSprites = [];
/** Egg Toss eggs by outfit tier: white, speckled, golden. */
export const eggSprites = [];
const EGG_LOOKS = [
  [7, 13, 8, -1],
  [7, 13, 8, 19],
  [10, 13, 19, -1],
];
/** A Chick Orbit chick (9x8), facing right. */
export let chickSprite = null;

/** 14x14 icons for the upgrade cards, the HUD and the shop, by item id (profile.js SHOP ids too). */
export const iconSprites = {};

/** Thunder Comb icon: a zigzag bolt, as [row, from x, to x]. */
const ICON_BOLT = [
  [1, 7, 10],
  [2, 6, 9],
  [3, 5, 8],
  [4, 4, 7],
  [5, 4, 10],
  [6, 6, 9],
  [7, 5, 8],
  [8, 4, 7],
  [9, 3, 6],
  [10, 3, 5],
  [11, 3, 4],
];

const ICON_SHAPES = {
  // Every boon shares one icon: a gold star
  boon: (x, y) => {
    const dx = x - 6.5;
    const dy = y - 6.8;
    const r = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx) + Math.PI / 2;
    const spike = 2.6 + 3 * Math.max(0, Math.cos(a * 5)) ** 2;
    return r <= spike ? (r < 1.6 ? 13 : 10) : -1;
  },
  egg: (x, y) => (inEllipse(x, y, 6.5, 7, 3.6, 4.6) ? (x <= 5 && y <= 5 ? 13 : x >= 8 && y >= 8 ? 8 : 7) : -1),
  peck: (x, y) => {
    if (x < 3 || x > 11 || Math.abs(y - 6.5) > (11.5 - x) / 2) return -1;
    return y === 7 && x >= 5 && x <= 10 ? 0 : 10;
  },
  darts: (x, y) => {
    const d = x + y - 13;
    if (d === 0 && x >= 2) return 8;
    return Math.abs(d) <= 2 && x >= 4 && x <= 11 ? (d < 0 ? 13 : 7) : -1;
  },
  corn: (x, y) => {
    if (inEllipse(x, y, 6.5, 6, 2.4, 4.6)) return (x + y) % 2 ? 10 : 19;
    if (y >= 7 && y <= 12 && Math.abs(x - 6.5) >= 2 && Math.abs(x - 6.5) <= 2 + (y - 7) * 0.5) return 3;
    return -1;
  },
  gust: (x, y) => {
    if ((y === 4 && x >= 2 && x <= 9) || (y === 7 && x >= 1 && x <= 10) || (y === 10 && x >= 3 && x <= 8)) return 13;
    if ((x === 10 && y === 3) || (x === 11 && y === 6) || (x === 9 && y === 9)) return 12;
    return -1;
  },
  chicks: (x, y) => {
    if (x === 12 && y === 6) return 18;
    if (inEllipse(x, y, 9, 5, 2.6, 2.4)) return x === 10 && y === 4 ? 0 : 10;
    if (inEllipse(x, y, 6, 8.5, 4, 3)) return y >= 10 ? 19 : 10;
    return -1;
  },
  thunder: (x, y) => {
    for (const [ry, x0, x1] of ICON_BOLT) if (y === ry && x >= x0 && x <= x1) return x === x0 ? 13 : 10;
    return -1;
  },
  boots: (x, y) => {
    if (y === 11 && x >= 3 && x <= 11) return 17;
    if ((x >= 3 && x <= 7 && y >= 2 && y <= 10) || (x >= 3 && x <= 11 && y >= 8 && y <= 10)) return y === 2 ? 13 : 9;
    return -1;
  },
  basket: (x, y) => {
    const r = Math.hypot(x - 6.5, y - 6);
    if (y < 6 && r >= 3.5 && r <= 4.6) return 6;
    if (y === 6 && x >= 3 && x <= 10) return 10;
    if (inTaper(x, y, 6.5, 7, 11, 5.5, 4)) return (x + y) % 2 ? 5 : 6;
    return -1;
  },
  helmet: (x, y) => {
    if (y === 3 && x >= 6 && x <= 7) return 17;
    if (y === 9 && x >= 1 && x <= 12) return 17;
    if (y <= 8 && inEllipse(x, y, 6.5, 8.5, 5, 4.6)) return x >= 9 ? 17 : 16;
    return -1;
  },
  shades: (x, y) => {
    if (y === 4 && x >= 1 && x <= 12) return 13;
    if (y >= 5 && y <= 7 && ((x >= 2 && x <= 5) || (x >= 8 && x <= 11))) return (x === 3 || x === 9) && y === 5 ? 13 : 0;
    return -1;
  },
  cape: (x, y) => {
    if (y === 2 && x >= 4 && x <= 9) return 10;
    return inTaper(x, y, 6.5, 3, 12, 2.5, 5.5) ? (x >= 9 ? 19 : 9) : -1;
  },
  bandana: (x, y) => {
    if (y === 3 && (x === 1 || x === 12)) return 12;
    return inTaper(x, y, 6.5, 3, 10, 5.5, 0) ? ((x + y) % 3 === 0 ? 13 : 12) : -1;
  },
  // The shop's permanent upgrades (profile.js SHOP), drawn apart from the items worn in a run.
  // Tough Hide: a red heart
  hide: (x, y) => {
    if (y <= 3 && (x === 6 || x === 7)) return -1;
    const heart = inEllipse(x, y, 4.5, 5, 2.8, 2.6) || inEllipse(x, y, 8.5, 5, 2.8, 2.6) || inTaper(x, y, 6.5, 5, 11, 5.6, 0);
    return heart ? (x === 4 && y === 4 ? 13 : 9) : -1;
  },
  // Strong Legs: a feathered thigh on a golden leg with three toes
  legs: (x, y) => {
    if (inEllipse(x, y, 6.5, 3.5, 4.6, 2.8)) return x >= 8 && y >= 4 ? 8 : 7;
    if (y <= 8) return x === 6 || x === 7 ? 10 : -1;
    if ((x === 6 || x === 7) && y <= 11) return 10; // middle toe
    const side = x + y;
    if (((side === 13 || side === 14) && x <= 5) || ((y - x === 0 || y - x === 1) && x >= 8)) return 10; // side toes
    return -1;
  },
  // Sharp Eye: a wide-open eye
  eye: (x, y) => {
    if (!inEllipse(x, y, 6.5, 6.5, 5.8, 3.6)) return -1;
    const r = Math.hypot(x - 6.5, y - 6.5);
    return r < 1.2 ? 0 : x === 5 && y === 5 ? 13 : r < 2.8 ? 12 : 13;
  },
  // Big Crop: a sack heaped with corn
  crop: (x, y) => {
    if (y <= 4) return inEllipse(x, y, 6.5, 4, 3.6, 2) ? ((x + y) % 2 ? 10 : 19) : -1;
    if (y === 5) return x >= 4 && x <= 9 ? 6 : -1;
    return inEllipse(x, y, 6.5, 8.5, 5, 3.8) ? (x >= 9 || y >= 11 ? 6 : 8) : -1;
  },
  // Quick Learner: a kernel and an arrow going up
  learner: (x, y) => {
    if (inEllipse(x, y, 4.5, 8, 2.6, 3.6)) return x === 4 && y === 6 ? 13 : 10;
    if ((x === 10 && y >= 3 && y <= 11) || (y >= 3 && y <= 5 && Math.abs(x - 10) <= y - 3)) return 12;
    return -1;
  },
};

/** Bakes the predators, the corn, the eggs, the chick and the upgrade icons. Call once at boot. */
export function bakeWorldSprites() {
  enemySprites.length = 0;
  for (const [shape, w, h] of [
    [ratShape, 18, 12],
    [foxShape, 20, 15],
    [snakeShape, 18, 10],
    [crowShape, 14, 12],
    [badgerShape, 20, 13],
    [crateShape, 14, 14],
  ]) {
    const set = {};
    for (const step of POSES) set[step] = bakeSprite(w, h, shape(step));
    enemySprites.push(set);
  }
  pickupSprites.length = 0;
  for (const [w, h, shape] of PICKUP_SHAPES) pickupSprites.push(bakeSprite(w, h, shape));
  cornSprites.length = 0;
  for (const color of CORN_TIER_COLORS) {
    cornSprites.push(bakeSprite(7, 8, (x, y) => (inEllipse(x, y, 3, 3.8, 1.8, 2.6) ? (x === 2 && y === 2 ? 13 : color) : -1)));
  }
  eggSprites.length = 0;
  for (const [base, shine, shade, speck] of EGG_LOOKS) {
    eggSprites.push(
      bakeSprite(8, 9, (x, y) => {
        if (!inEllipse(x, y, 3.5, 4.3, 2.4, 3.1)) return -1;
        if (x <= 2 && y <= 3) return shine;
        if (speck >= 0 && (x * 3 + y * 5) % 7 === 0) return speck;
        return x >= 5 && y >= 5 ? shade : base;
      })
    );
  }
  chickSprite = bakeSprite(9, 8, (x, y) => {
    if (x === 7 && y === 4) return 18; // beak
    if (inEllipse(x, y, 5.5, 3.2, 1.8, 1.7)) return x === 6 && y === 3 ? 0 : 10; // head
    if (inEllipse(x, y, 3.6, 4.8, 2.6, 1.9)) return x <= 3 && y === 4 ? 19 : 10; // body and wing
    return -1;
  });
  for (const [id, shape] of Object.entries(ICON_SHAPES)) iconSprites[id] = bakeSprite(14, 14, shape);
}
