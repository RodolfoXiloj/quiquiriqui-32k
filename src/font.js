// Our own pixel font, drawn by code (zero assets): 3x5 uppercase glyphs, 1 px apart, so text is as
// crisp as the sprites at any upscale. Each glyph is baked on first use, per color, into a tiny
// canvas with a 1 px ink outline all around (it reads on grass, snow or night alike), and then
// drawn with one drawImage per character, scaled by a whole number (1 body text, 2 headings,
// 3 titles).
//
// The data is one string: each glyph is its character followed by five octal digits, one per row
// from the top; in each digit, 4 is the left column, 2 the middle and 1 the right.
import { PALETTE } from './palette.js';

const DATA =
  ' 00000!22202.00002,00024:02020/11244+02720-00700%41241<12421>42124(24442)21112\'22000?71202' +
  '075557126227271747371317455711574717674757771122875757975717' +
  'A25755B65656C34443D65556E74647F74644G34553H55755I72227J11152K55655L44447M57755' +
  'N65555O25552P65644Q25563R65655S34216T72222U55557V55552W55775X55255Y55222Z71247';

export const GLYPH_W = 3;
export const GLYPH_H = 5;
/** Pixels from one character to the next (glyph plus a 1 px gap), before scaling. */
export const ADVANCE = 4;

/** Glyph rows by character: five numbers 0-7. */
export const GLYPHS = {};
for (let i = 0; i < DATA.length; i += 6) GLYPHS[DATA[i]] = [...DATA.slice(i + 1, i + 6)].map(Number);

/** True if pixel (x, y) of glyph `rows` is lit. */
const lit = (rows, x, y) => x >= 0 && x < GLYPH_W && y >= 0 && y < GLYPH_H && (rows[y] >> (GLYPH_W - 1 - x)) & 1;

const baked = new Map();

/** The glyph of `ch` in palette color `color`, outlined in ink, on a (3+2) x (5+2) canvas. */
function bakeGlyph(ch, color) {
  const key = ch + color;
  let canvas = baked.get(key);
  if (canvas) return canvas;
  canvas = document.createElement('canvas');
  canvas.width = GLYPH_W + 2;
  canvas.height = GLYPH_H + 2;
  const g = canvas.getContext('2d');
  const rows = GLYPHS[ch] || GLYPHS['?'];
  for (let y = -1; y <= GLYPH_H; y++) {
    for (let x = -1; x <= GLYPH_W; x++) {
      let fill = -1;
      if (lit(rows, x, y)) fill = color;
      else {
        for (let dy = -1; dy <= 1 && fill < 0; dy++) for (let dx = -1; dx <= 1; dx++) if (lit(rows, x + dx, y + dy)) fill = 0;
      }
      if (fill < 0) continue;
      g.fillStyle = PALETTE[fill];
      g.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  baked.set(key, canvas);
  return canvas;
}

/** Width in pixels of `text` at `scale` (without the outline). */
export function textWidth(text, scale = 1) {
  return text.length ? (text.length * ADVANCE - 1) * scale : 0;
}

/**
 * Draws `text` centered vertically on `y`, aligned on `x` ('center', 'left' or 'right'), in
 * palette color `color`, `scale` times the glyph size.
 */
export function drawPixelText(ctx, text, x, y, scale = 1, color = 13, align = 'center') {
  const w = textWidth(text, scale);
  let px = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  const py = Math.round(y - (GLYPH_H * scale) / 2);
  for (const ch of text) {
    if (ch !== ' ') ctx.drawImage(bakeGlyph(ch, color), px - scale, py - scale, (GLYPH_W + 2) * scale, (GLYPH_H + 2) * scale);
    px += ADVANCE * scale;
  }
}
