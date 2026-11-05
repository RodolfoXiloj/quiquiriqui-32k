// Build pipeline: esbuild → Terser → Roadroller → inline into the HTML shell → size + asset gate.
// Dev-only tooling: none of this code ships to the browser.
//
// Usage:
//   node tools/build.mjs           full build (with Roadroller) → dist/index.html
//   node tools/build.mjs --fast    skip Roadroller → dist/fast.html (size is informational only)
//   node tools/build.mjs --check   only run the gate on an existing dist/index.html
//
// The size gate runs before anything is written: a failed build never replaces dist/index.html.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const OUT_FILE = path.join(DIST, 'index.html');
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
    const html = await readFile(OUT_FILE, 'utf8');
    auditAssets(html.replace(/<script>[\s\S]*<\/script>/, ''), 'HTML shell');
    if (!sizeGate(html, 'dist/index.html')) throw new Error('Over the 32 KB limit.');
    return;
  }

  const fast = args.has('--fast');
  const t0 = performance.now();

  const bundled = await bundle();
  const minified = await minify(bundled);
  // Audit the readable-ish minified JS: Roadroller output is opaque to pattern matching.
  auditAssets(minified, 'minified JS');
  const packed = fast ? null : await pack(minified);
  // Roadroller's decoder costs ~1 KB, so it only pays off on larger inputs: keep the smaller one.
  const script = packed && Buffer.byteLength(packed) < Buffer.byteLength(minified) ? packed : minified;

  const shell = minifyHtml(await readFile(path.join(SRC, 'index.html'), 'utf8'));
  const scriptTag = /<script type="module" src="main\.js"><\/script>/;
  if (!scriptTag.test(shell)) throw new Error('Could not find the main.js <script> tag in src/index.html');
  auditAssets(shell.replace(scriptTag, ''), 'HTML shell');
  // Use a function replacement so `$` sequences in the script are not interpreted.
  const html = shell.replace(scriptTag, () => `<script>${script}</script>`);

  console.log(`  bundled  ${Buffer.byteLength(bundled).toLocaleString()} B`);
  console.log(`  terser   ${Buffer.byteLength(minified).toLocaleString()} B`);
  if (packed) {
    const used = script === packed ? 'used' : 'skipped, larger than Terser output';
    console.log(`  roadroll ${Buffer.byteLength(packed).toLocaleString()} B  (${used})`);
  }
  console.log(`  built in ${((performance.now() - t0) / 1000).toFixed(1)} s${fast ? ' (fast, no Roadroller)' : ''}`);

  await mkdir(DIST, { recursive: true });

  if (fast) {
    // Without Roadroller the output is not the shipped size, so the limit is not enforced here.
    const fits = sizeGate(html, 'dist/fast.html');
    await writeFile(FAST_FILE, html);
    if (!fits) console.log('  note: over 32 KB unpacked; only the Roadroller build (npm run build) is gated.\n');
    return;
  }

  // Gate before writing so a failed build keeps the last good dist/index.html.
  if (!sizeGate(html, 'dist/index.html')) throw new Error('Over the 32 KB limit. dist/index.html was not updated.');
  await writeFile(OUT_FILE, html);
}

main().catch((error) => {
  console.error(`\n  BUILD FAILED: ${error.message}\n`);
  process.exit(1);
});
