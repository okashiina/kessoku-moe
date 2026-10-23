// Runs in the site's main frame only (embedded players never see it).
const { contextBridge, ipcRenderer } = require('electron');

// Lets the web app tell it is inside the desktop shell, e.g. to hide the
// "install as app" hint: `window.kessokuDesktop?.isDesktop`.
contextBridge.exposeInMainWorld('kessokuDesktop', {
  isDesktop: true,
  platform: process.platform,
});

// Report the page's own new-tab links so the main process can open them in
// the browser. Window opens without a matching report are dropped, which is
// what keeps embed pop-ups from escaping.
const reportLink = (event) => {
  const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!anchor) return;
  const opensNewTab =
    anchor.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1;
  if (opensNewTab) ipcRenderer.send('site:external-intent', anchor.href);
};

window.addEventListener('click', reportLink, true);
window.addEventListener('auxclick', reportLink, true);
