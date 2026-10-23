// Remembers the window's size, position and maximized state between launches.
const fs = require('node:fs');
const path = require('node:path');
const { app, screen } = require('electron');

const FILE = () => path.join(app.getPath('userData'), 'window-state.json');
const DEFAULTS = { width: 1360, height: 860, maximized: false };

const visibleOnSomeDisplay = (b) =>
  screen.getAllDisplays().some(({ workArea: a }) => {
    const overlapX = Math.min(b.x + b.width, a.x + a.width) - Math.max(b.x, a.x);
    const overlapY = Math.min(b.y + b.height, a.y + a.height) - Math.max(b.y, a.y);
    return overlapX >= 120 && overlapY >= 80;
  });

const load = () => {
  try {
    const s = JSON.parse(fs.readFileSync(FILE(), 'utf8'));
    const state = { ...DEFAULTS, ...s };
    // Drop the position if the monitor it was on is gone.
    if (
      typeof state.x !== 'number' ||
      typeof state.y !== 'number' ||
      !visibleOnSomeDisplay(state)
    ) {
      delete state.x;
      delete state.y;
    }
    return state;
  } catch {
    return { ...DEFAULTS };
  }
};

const track = (win) => {
  let timer = null;
  const save = () => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    const maximized = win.isMaximized();
    // Keep the restored bounds while maximized so un-maximizing lands right.
    const bounds = maximized ? win.getNormalBounds() : win.getBounds();
    try {
      fs.writeFileSync(FILE(), JSON.stringify({ ...bounds, maximized }));
    } catch {
      // Not worth interrupting anyone over.
    }
  };
  const debounced = () => {
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  };
  win.on('resize', debounced);
  win.on('move', debounced);
  win.on('close', save);
};

module.exports = { load, track };
