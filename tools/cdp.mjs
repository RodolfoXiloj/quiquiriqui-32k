// Minimal Chrome DevTools Protocol client with no dependencies. Dev-only: tools/playtest.mjs uses
// it to drive a headless Chrome (or Edge). Needs Node 22+ for the global WebSocket.
import { spawn } from 'node:child_process';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const BROWSERS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function findBrowser() {
  for (const candidate of BROWSERS) {
    if (!candidate) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try the next one
    }
  }
  throw new Error('No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser.');
}

/** Chrome writes the port it picked for --remote-debugging-port=0 into DevToolsActivePort. */
async function waitForPort(profile, timeoutMs = 15000) {
  const file = path.join(profile, 'DevToolsActivePort');
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const port = Number((await readFile(file, 'utf8')).split('\n')[0]);
      if (port) return port;
    } catch {
      // not written yet
    }
    await sleep(100);
  }
  throw new Error('The browser did not open a DevTools port in time.');
}

/** Opens a CDP session over WebSocket: send(method, params) and on(event, handler). */
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    const listeners = new Map();
    let nextId = 1;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const call = pending.get(msg.id);
        pending.delete(msg.id);
        if (!call) return;
        if (msg.error) call.reject(new Error(`${call.method}: ${msg.error.message}`));
        else call.resolve(msg.result);
        return;
      }
      for (const handler of listeners.get(msg.method) || []) handler(msg.params);
    };
    ws.onerror = () => reject(new Error(`Could not connect to ${url}`));
    ws.onopen = () =>
      resolve({
        ws,
        send(method, params = {}) {
          const id = nextId++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej, method }));
        },
        on(method, handler) {
          if (!listeners.has(method)) listeners.set(method, []);
          listeners.get(method).push(handler);
        },
      });
  });
}

/**
 * Launches a headless browser with a throwaway profile and connects to its first page.
 * Returns { client, close }. Always call close(): it kills the browser and deletes the profile.
 */
export async function launchBrowser({ width = 640, height = 360 } = {}) {
  if (typeof WebSocket === 'undefined') {
    throw new Error(`The playtest needs Node 22+ (global WebSocket). This is Node ${process.version}.`);
  }
  const exe = await findBrowser();
  const profile = await mkdtemp(path.join(tmpdir(), 'quiquiriqui-playtest-'));
  const proc = spawn(
    exe,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      `--window-size=${width},${height}`,
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  const exited = new Promise((resolve) => proc.once('exit', resolve));

  try {
    const port = await waitForPort(profile);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    if (!page) throw new Error('The browser has no page target.');
    const client = await connect(page.webSocketDebuggerUrl);
    return {
      client,
      browser: path.basename(exe),
      async close() {
        client.ws.close();
        proc.kill();
        await Promise.race([exited, sleep(3000)]);
        await rm(profile, { recursive: true, force: true }).catch(() => {});
      },
    };
  } catch (error) {
    proc.kill();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
