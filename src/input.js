// Movement-only input: keyboard, mouse (hold a button and steer from the screen
// center), a floating touch stick that opens wherever the thumb lands, and a gamepad stick.
// Everything is read as a screen-space direction and converted to a world direction, so
// "up" always walks up the screen. Menus read two more things: the keys pressed since the last
// step (`input.pressed`, for 1/2/3) and the last click or tap (`input.tap`, for the cards).
import { screenToWorld } from './iso.js';
import { WIDTH, HEIGHT } from './screen.js';

/** Radius (px) of the touch stick; dragging further just keeps full speed. */
export const STICK_RADIUS = 20;
/** Mouse and touch offsets shorter than this (px) are ignored. */
const DEAD_ZONE = 4;

const keys = new Set();
/** Keys that only work menus: M music, Z/C peril, Q/E hen, B shop, Escape. */
export const MENU_KEYS = ['KeyM', 'KeyZ', 'KeyC', 'KeyQ', 'KeyE', 'KeyB', 'Escape'];
/** Keys pressed since the last step; copied into input.pressed by updateInput. */
const freshKeys = new Set();
/** Click or tap since the last step, in canvas pixels; copied into input.tap. */
let freshTap = null;

export const input = {
  /** Normalized world-space movement direction, or 0, 0 when idle. */
  moveX: 0,
  moveY: 0,
  /** Horizontal screen direction of the last movement (-1, 0, 1), used to face the hen. */
  screenX: 0,
  /** Set by any key, click, touch or movement; consumers clear it. */
  anyAction: false,
  /** Key codes pressed during the last step (each press shows up exactly once). */
  pressed: new Set(),
  /** { x, y } of a click or tap during the last step, in canvas pixels, or null. */
  tap: null,
  /** Mouse steering: active while a mouse button is held. Coordinates are canvas pixels. */
  mouseHeld: false,
  mouseX: 0,
  mouseY: 0,
  /** Floating touch stick, drawn by the renderer while active. */
  stick: { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 },
};

/** Holds or releases a key without a DOM event (tests). The game never calls this. */
export function holdKey(code, down) {
  if (down && !keys.has(code)) freshKeys.add(code);
  if (down) keys.add(code);
  else keys.delete(code);
}

/** Clicks or taps canvas point (x, y) without a DOM event (tests). The game never calls this. */
export function tapAt(x, y) {
  freshTap = { x, y };
  input.anyAction = true;
}

/**
 * Lets go of the mouse button (after a click picks a card or a menu row, the held button must not
 * steer her). The touch stick stays with its finger: a thumb held on it through the cards keeps
 * her walking the same way once they close, and lifting it ends it (touchend).
 */
export function releasePointer() {
  input.mouseHeld = false;
}

/**
 * Drops every held key, the mouse button and the touch stick. Runs when the window loses focus:
 * the browser never sends the matching key-up, so the hen would otherwise keep walking.
 */
export function releaseAllInput() {
  keys.clear();
  freshKeys.clear();
  freshTap = null;
  input.pressed.clear();
  input.tap = null;
  releasePointer();
  input.stick.active = false;
  input.stick.dx = 0;
  input.stick.dy = 0;
  input.anyAction = false;
}

export function initInput(canvas) {
  addEventListener('keydown', (e) => {
    if (!e.repeat) freshKeys.add(e.code);
    keys.add(e.code);
    // Menu keys (music, peril, hen, shop) do their own thing: they never start a run or close a screen.
    if (!MENU_KEYS.includes(e.code)) input.anyAction = true;
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));

  /** Converts a client position to canvas pixels. */
  function toCanvas(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * WIDTH,
      y: ((clientY - rect.top) / rect.height) * HEIGHT,
    };
  }

  canvas.addEventListener('mousedown', (e) => {
    const p = toCanvas(e.clientX, e.clientY);
    input.mouseHeld = true;
    input.mouseX = p.x;
    input.mouseY = p.y;
    input.anyAction = true;
    freshTap = p;
  });
  addEventListener('mousemove', (e) => {
    const p = toCanvas(e.clientX, e.clientY);
    input.mouseX = p.x;
    input.mouseY = p.y;
  });
  addEventListener('mouseup', () => {
    input.mouseHeld = false;
  });
  addEventListener('contextmenu', (e) => e.preventDefault());

  addEventListener(
    'touchstart',
    (e) => {
      input.anyAction = true;
      const t = e.changedTouches[0];
      if (t) freshTap = toCanvas(t.clientX, t.clientY);
      if (!input.stick.active && t) {
        const p = toCanvas(t.clientX, t.clientY);
        Object.assign(input.stick, { active: true, id: t.identifier, ox: p.x, oy: p.y, dx: 0, dy: 0 });
      }
      e.preventDefault();
    },
    { passive: false }
  );
  addEventListener(
    'touchmove',
    (e) => {
      for (const t of e.changedTouches) {
        if (!input.stick.active || t.identifier !== input.stick.id) continue;
        const p = toCanvas(t.clientX, t.clientY);
        const dx = p.x - input.stick.ox;
        const dy = p.y - input.stick.oy;
        const len = Math.hypot(dx, dy) || 1;
        const r = Math.min(len, STICK_RADIUS);
        input.stick.dx = (dx / len) * r;
        input.stick.dy = (dy / len) * r;
      }
      e.preventDefault();
    },
    { passive: false }
  );
  function endTouch(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === input.stick.id) {
        input.stick.active = false;
        input.stick.dx = 0;
        input.stick.dy = 0;
      }
    }
  }
  addEventListener('touchend', endTouch);
  addEventListener('touchcancel', endTouch);
}

/** Reads every device into one screen-space direction, then converts it to world space. */
export function updateInput() {
  input.pressed.clear();
  for (const code of freshKeys) input.pressed.add(code);
  freshKeys.clear();
  input.tap = freshTap;
  freshTap = null;

  let sx = 0;
  let sy = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) sx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) sx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) sy -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) sy += 1;

  if (input.mouseHeld) {
    const dx = input.mouseX - WIDTH / 2;
    const dy = input.mouseY - HEIGHT / 2;
    if (Math.hypot(dx, dy) > DEAD_ZONE) {
      sx += dx;
      sy += dy;
    }
  }

  if (input.stick.active && Math.hypot(input.stick.dx, input.stick.dy) > DEAD_ZONE) {
    sx += input.stick.dx;
    sy += input.stick.dy;
  }

  const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : null;
  const pad = pads && pads[0];
  if (pad && Math.hypot(pad.axes[0] || 0, pad.axes[1] || 0) > 0.2) {
    sx += pad.axes[0];
    sy += pad.axes[1];
  }

  if (sx === 0 && sy === 0) {
    input.moveX = 0;
    input.moveY = 0;
    return;
  }
  input.anyAction = true;
  input.screenX = Math.sign(sx);
  const w = screenToWorld(sx, sy);
  const len = Math.hypot(w.x, w.y) || 1;
  input.moveX = w.x / len;
  input.moveY = w.y / len;
}
