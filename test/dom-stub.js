// Minimal browser surface so the simulation can boot under Node.
// Imported before any game module. Drawing is a no-op; tests never render.
// The one thing recorded is `canvas.clears`: how many times `clearRect` ran on that canvas.

function createContext(canvas) {
  const clearRect = () => {
    canvas.clears += 1;
  };
  const ctx = new Proxy(function nop() {}, {
    get(_target, prop) {
      if (prop === 'canvas') return canvas;
      if (prop === 'clearRect') return clearRect;
      return ctx;
    },
    apply() {
      return ctx;
    },
    set() {
      return true;
    },
  });
  return ctx;
}

function createCanvas() {
  const canvas = {
    width: 0,
    height: 0,
    clears: 0,
    style: {},
    addEventListener() {},
    getContext() {
      return createContext(canvas);
    },
  };
  return canvas;
}

const store = new Map();

globalThis.document = {
  getElementById() {
    return null;
  },
  createElement() {
    return createCanvas();
  },
};

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
};

globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.requestAnimationFrame = () => 0;
globalThis.innerWidth = 320;
globalThis.innerHeight = 180;
if (typeof globalThis.navigator === 'undefined') {
  globalThis.navigator = { getGamepads: () => [] };
}
