// Build pipeline: esbuild → (Spanish: translate) → Terser → Roadroller → inline into the HTML
// shell → size + asset gate. Two pages come out of the same code: dist/index.html in Spanish
// (src/lang/es.json swaps every on-screen string of the bundle, before Terser folds any template,
// tools/translate.mjs) and dist/en/index.html in English. Each carries one language, so neither pays for the other.
// Dev-only tooling: none of this code ships to the browser.
//
// Usage:
//   node tools/build.mjs           full build (with Roadroller) → dist/index.html (es), dist/en/index.html (en)
//   node tools/build.mjs --fast    skip Roadroller, English only → dist/fast.html (size is informational only)
//   node tools/build.mjs --check   only run the gate on the existing pages
//
// The size gate runs before anything is written: a failed build never replaces a shipped page.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { translate } from './translate.mjs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const OUT_FILE = path.join(DIST, 'index.html');
const OUT_EN = path.join(DIST, 'en', 'index.html');
const LANG_ES = path.join(SRC, 'lang', 'es.json');
/** Unpacked Terser-only build, for checking that minified code still runs. Never shipped. */
const FAST_FILE = path.join(DIST, 'fast.html');

/** Hard limit from the Build & Play rules: 32 KB total download. */
const LIMIT = 32 * 1024;

/** Anything matching these in the shipped output would load or embed an external resource. */
const FORBIDDEN = [
  [/https?:\/\//i, 'absolute URL'],
  [/<img\b/i, '<img> tag'],
  [/<audio\b/i, '<audio> tag'],
  [/<video\b/i, '<video> tag'],
  [/<link\b/i, '<link> tag'],
  [/<iframe\b/i, '<iframe> tag'],
  [/\bsrc\s*=/i, 'src= attribute'],
  [/@font-face/i, '@font-face'],
  [/@import/i, 'CSS @import'],
  [/url\(/i, 'CSS url()'],
  [/data:(image|audio|video|font)/i, 'embedded media data URI'],
  [/\bfetch\s*\(/, 'fetch()'],
  [/XMLHttpRequest/, 'XMLHttpRequest'],
  [/\bimport\s*\(/, 'dynamic import()'],
];

const args = new Set(process.argv.slice(2));

/** Bundles src/main.js and its imports into a single IIFE script. */
async function bundle() {
  const esbuild = await import('esbuild');
  const result = await esbuild.build({
    entryPoints: [path.join(SRC, 'main.js')],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    write: false,
    legalComments: 'none',
  });
  return result.outputFiles[0].text;
}

/** Minifies with aggressive, size-oriented Terser settings. */
async function minify(code) {
  const { minify: terser } = await import('terser');
  const result = await terser(code, {
    ecma: 2020,
    toplevel: true,
    compress: { passes: 2, unsafe_arrows: true, unsafe_math: true, pure_getters: true },
    mangle: { toplevel: true },
    format: { comments: false },
  });
  return result.code;
}

/** Packs the script with Roadroller into a self-extracting script. */
async function pack(code) {
  const { Packer } = await import('roadroller');
  const packer = new Packer([{ data: code, type: 'js', action: 'eval' }], {});
  await packer.optimize();
  const { firstLine, secondLine } = packer.makeDecoder();
  return firstLine + secondLine;
}

/** Collapses whitespace in the HTML shell (safe for our tiny, hand-written shell). */
function minifyHtml(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Throws if any forbidden pattern appears in `text`. */
function auditAssets(text, label) {
  const hits = FORBIDDEN.filter(([re]) => re.test(text)).map(([, name]) => name);
  if (hits.length) throw new Error(`Asset audit failed in ${label}: ${hits.join(', ')}`);
}

/** Prints the size report for `label` and returns whether `html` fits the limit. Writes nothing. */
function sizeGate(html, label) {
  const raw = Buffer.byteLength(html);
  const gzip = gzipSync(html, { level: 9 }).length;
  const headroom = LIMIT - raw;
  const pct = ((raw / LIMIT) * 100).toFixed(1);
  console.log(`\n  ${label}`);
  console.log(`  raw      ${raw.toLocaleString()} B  (${pct}% of ${LIMIT.toLocaleString()} B)`);
  console.log(`  gzip     ${gzip.toLocaleString()} B  (reference only)`);
  console.log(`  headroom ${headroom.toLocaleString()} B\n`);
  return headroom >= 0;
}

async function main() {
  if (args.has('--check')) {
    for (const file of [OUT_FILE, OUT_EN]) {
      const html = await readFile(file, 'utf8');
      auditAssets(html.replace(/<script>[\s\S]*<\/script>/, ''), 'HTML shell');
      if (!sizeGate(html, path.relative(ROOT, file))) throw new Error('Over the 32 KB limit.');
    }
    return;
  }

  const fast = args.has('--fast');
  const t0 = performance.now();

  const bundled = await bundle();
  const minified = await minify(bundled);
  // Audit the readable-ish minified JS: Roadroller output is opaque to pattern matching.
  auditAssets(minified, 'minified JS');
  const shell = minifyHtml(await readFile(path.join(SRC, 'index.html'), 'utf8'));
  const scriptTag = /<script type="module" src="main\.js"><\/script>/;
  if (!scriptTag.test(shell)) throw new Error('Could not find the main.js <script> tag in src/index.html');
  auditAssets(shell.replace(scriptTag, ''), 'HTML shell');
  /** The page in `lang` with `script` inlined (a function replacement keeps `$` sequences as they are). */
  const page = (script, lang) => shell.replace('<html lang="en">', `<html lang="${lang}">`).replace(scriptTag, () => `<script>${script}</script>`);

  console.log(`  bundled  ${Buffer.byteLength(bundled).toLocaleString()} B`);
  console.log(`  terser   ${Buffer.byteLength(minified).toLocaleString()} B`);
  await mkdir(path.join(DIST, 'en'), { recursive: true });

  if (fast) {
    // Without Roadroller the output is not the shipped size, so the limit is not enforced here.
    const html = page(minified, 'en');
    console.log(`  built in ${((performance.now() - t0) / 1000).toFixed(1)} s (fast, no Roadroller, English only)`);
    const fits = sizeGate(html, 'dist/fast.html');
    await writeFile(FAST_FILE, html);
    if (!fits) console.log('  note: over 32 KB unpacked; only the Roadroller build (npm run build) is gated.\n');
    return;
  }

  // The Spanish page is the same code with its strings swapped (in the bundle: Terser would fold
  // some templates into new literals); every entry must find its string.
  const dict = JSON.parse(await readFile(LANG_ES, 'utf8'));
  const { code: translated, counts } = translate(bundled, dict);
  const unused = Object.keys(counts).filter((key) => !counts[key]);
  if (unused.length) throw new Error(`src/lang/es.json: no string in the code matches ${unused.map((key) => JSON.stringify(key)).join(', ')}`);
  const spanish = await minify(translated);
  auditAssets(spanish, 'minified JS (es)');

  const pages = [];
  for (const [lang, code, file] of [['es', spanish, OUT_FILE], ['en', minified, OUT_EN]]) {
    const packed = await pack(code);
    // Roadroller's decoder costs ~1 KB, so it only pays off on larger inputs: keep the smaller one.
    const used = Buffer.byteLength(packed) < Buffer.byteLength(code);
    console.log(`  roadroll ${Buffer.byteLength(packed).toLocaleString()} B  (${lang}, ${used ? 'used' : 'skipped, larger than Terser output'})`);
    pages.push({ file, html: page(used ? packed : code, lang) });
  }
  console.log(`  built in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

  // Gate both pages before writing either, so a failed build keeps the last good pages.
  let fits = true;
  for (const { file, html } of pages) fits = sizeGate(html, path.relative(ROOT, file).replace(/\\/g, '/')) && fits;
  if (!fits) throw new Error('Over the 32 KB limit. Nothing was written.');
  for (const { file, html } of pages) await writeFile(file, html);
}

main().catch((error) => {
  console.error(`\n  BUILD FAILED: ${error.message}\n`);
  process.exit(1);
});
