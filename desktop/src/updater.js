// Background updates from GitHub Releases (see electron-builder.yml `publish`).
// Checks quietly, downloads in the background, then lets the titlebar offer a
// restart. Anything that goes wrong stays quiet: an update is never worth an
// error dialog.
const { app } = require('electron');

const SIX_HOURS = 6 * 60 * 60 * 1000;
let autoUpdater = null;

const start = (notify) => {
  if (!app.isPackaged || process.env.KESSOKU_NO_UPDATE) return;
  ({ autoUpdater } = require('electron-updater'));
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) =>
    notify({ state: 'ready', version: info.version })
  );
  autoUpdater.on('error', () => {});
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 8000);
  setInterval(check, SIX_HOURS);
};

const install = () => {
  // Silent reinstall, then relaunch into the new version.
  if (autoUpdater) autoUpdater.quitAndInstall(true, true);
};

module.exports = { start, install };
