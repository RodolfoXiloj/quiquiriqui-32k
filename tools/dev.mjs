// Minimal static dev server for src/ (unminified ES modules). Dev-only, no dependencies.
// Usage: node tools/dev.mjs [port]
//
// Open /?autoplay to watch the bot play at 5x (&speed=N to change it). With ?autoplay the server
// injects tools/browser/autoplay.js into the page; files under /__dev/ come from tools/browser/.
// tools/playtest.mjs imports startDevServer() to run the same server in-process.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(TOOLS, '..', 'src');
const BROWSER_TOOLS = path.join(TOOLS, 'browser');
const DEV_PREFIX = '/__dev/';
const AUTOPLAY_TAG = `<script type="module" src="${DEV_PREFIX}autoplay.js"></script>`;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/** Resolves `rel` inside `root`, or returns null if it would escape it. */
function inside(root, rel) {
  const file = path.join(root, rel);
  return file.startsWith(root + path.sep) ? file : null;
}

/** Starts the server and resolves with it once it is listening. Port 0 picks a free port. */
export function startDevServer(port = 8080, host) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const urlPath = decodeURIComponent(url.pathname);
    const file = urlPath.startsWith(DEV_PREFIX)
      ? inside(BROWSER_TOOLS, urlPath.slice(DEV_PREFIX.length))
      : inside(SRC, urlPath === '/' ? 'index.html' : urlPath);
    if (!file) {
      res.writeHead(403).end();
      return;
    }
    try {
      let body = await readFile(file);
      if (path.basename(file) === 'index.html' && url.searchParams.has('autoplay')) {
        body = body.toString('utf8').replace('</body>', `${AUTOPLAY_TAG}\n</body>`);
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

const runDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (runDirectly) {
  const wanted = process.argv[2] === undefined ? 8080 : Number(process.argv[2]);
  startDevServer(wanted)
    .then((server) => {
      const port = server.address().port;
      console.log(`  Quiquiriqui dev server  → http://localhost:${port}`);
      console.log(`  Watch the bot play at 5x → http://localhost:${port}/?autoplay   (&speed=N)`);
    })
    .catch((error) => {
      console.error(
        error.code === 'EADDRINUSE'
          ? `\n  Port ${wanted} is already in use (another npm run dev?). Stop it, or pick a port: npm run dev -- 8081\n`
          : `\n  Dev server failed: ${error.message}\n`
      );
      process.exit(1);
    });
}
