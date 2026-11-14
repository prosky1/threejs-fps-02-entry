// Keyboard + mouse + pointer lock. Look deltas accumulate between frames and are
// consumed once per render so sensitivity never depends on frame rate.
export function createInput(element, onLockChange) {
  const keys = new Set();
  const look = { x: 0, y: 0 };
  const state = { keys, firing: false, ads: false, locked: false };
  const pressed = new Set(); // keys pressed since last consume (edge triggers)

  function onKeyDown(e) {
    if (e.code === 'Tab') e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onMouseMove(e) {
    if (state.locked) {
      look.x += e.movementX;
      look.y += e.movementY;
    }
  }
  function onMouseDown(e) {
    if (!state.locked) return;
    if (e.button === 0) state.firing = true;
    if (e.button === 2) state.ads = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) state.firing = false;
    if (e.button === 2) state.ads = false;
  }
  function onLock() {
    state.locked = document.pointerLockElement === element;
    if (!state.locked) {
      state.firing = false;
      state.ads = false;
      keys.clear();
    }
    onLockChange(state.locked);
  }
  function onContextMenu(e) { e.preventDefault(); }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);
  element.addEventListener('contextmenu', onContextMenu);

  return {
    state,
    requestLock() { element.requestPointerLock(); },
    releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); },
    takeLook() {
      const out = { x: look.x, y: look.y };
      look.x = 0;
      look.y = 0;
      return out;
    },
    // Edge-triggered keys since the last call (buy, reload, grenade, interact).
    takePressed() {
      const out = [...pressed];
      pressed.clear();
      return out;
    },
  };
}
