// kessoku moe desktop: a native window around the hosted app.
//
// The BrowserWindow itself renders the local shell (renderer/shell.html): the
// custom titlebar, the splash and the offline screen. The site lives in a
// WebContentsView laid over the shell below the titlebar, hidden until its
// first page has loaded so the splash covers the cold start.
const path = require('node:path');
const {
  app,
  BrowserWindow,
  Menu,
  WebContentsView,
  clipboard,
  ipcMain,
  nativeTheme,
  session,
  shell,
} = require('electron');

const config = require('./config');
const updater = require('./updater');
const windowState = require('./window-state');

const { APP_ORIGIN, PROTOCOL, TITLEBAR_HEIGHT } = config;
const HOME = `${APP_ORIGIN}/home`;
const isMac = process.platform === 'darwin';
const MIN_SPLASH_MS = 900;
const ZOOM_STEP = 0.5;

app.setName('kessoku moe');
if (process.platform === 'win32') app.setAppUserModelId('moe.kessoku.desktop');
// Let "next episode" start without a click, like the installed PWA does.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// ---------------------------------------------------------------------------
// URL helpers

const parse = (raw) => {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
};

const isAppUrl = (raw) => parse(raw)?.origin === APP_ORIGIN;

const isInAppHost = (raw) => {
  const url = parse(raw);
  if (!url || url.protocol !== 'https:') return false;
  return config.IN_APP_HOSTS.some(
    (h) => url.hostname === h || url.hostname.endsWith(`.${h}`)
  );
};

const openExternal = (raw) => {
  const url = parse(raw);
  if (url && ['https:', 'http:', 'mailto:'].includes(url.protocol)) {
    shell.openExternal(url.href);
  }
};

/** Resolve a path ("/schedule") against the app origin, refusing other hosts. */
const appUrlFor = (p) => {
  const url = parse(new URL(p, APP_ORIGIN).href);
  return url && url.origin === APP_ORIGIN ? url.href : null;
};

/** kessoku-moe://anime/21 → <origin>/anime/21; --open=/schedule → <origin>/schedule */
const targetFromArgv = (argv) => {
  for (const arg of argv) {
    if (arg.startsWith(`${PROTOCOL}://`)) {
      const url = parse(arg);
      if (!url) continue;
      const p = `/${url.host}${url.pathname}`.replace(/\/+$/, '') || '/';
      return appUrlFor(`${p}${url.search}${url.hash}`);
    }
    if (arg.startsWith('--open=')) return appUrlFor(arg.slice('--open='.length));
  }
  return null;
};

// ---------------------------------------------------------------------------
// State shared with the titlebar

let win = null;
let site = null;
const launchedAt = Date.now();

const state = {
  platform: process.platform,
  status: 'splash', // splash | ready | offline
  reason: null, // offline | crashed
  retrying: false,
  loading: false,
  title: '',
  canGoBack: false,
  canGoForward: false,
  focused: true,
  fullscreen: false,
  update: null,
};
let lastFailedUrl = null;

const pushState = (patch = {}) => {
  Object.assign(state, patch);
  if (win && !win.isDestroyed()) win.webContents.send('shell:state', state);
};

const syncNav = () => {
  if (!site) return;
  const history = site.webContents.navigationHistory;
  pushState({
    canGoBack: history.canGoBack(),
    canGoForward: history.canGoForward(),
  });
};

const layout = () => {
  if (!win || !site) return;
  const [width, height] = win.getContentSize();
  const top = win.isFullScreen() ? 0 : TITLEBAR_HEIGHT;
  site.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
};

const reveal = () => {
  const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - launchedAt));
  setTimeout(() => {
    if (state.status === 'offline') return;
    site.setVisible(true);
    pushState({ status: 'ready', reason: null, retrying: false });
  }, wait);
};

const goOffline = (reason, url) => {
  lastFailedUrl = url || lastFailedUrl || HOME;
  site.setVisible(false);
  pushState({ status: 'offline', reason, retrying: false, loading: false });
};

// ---------------------------------------------------------------------------
// Actions (titlebar buttons, keyboard shortcuts, context menu)

const actions = {
  back: () => site.webContents.navigationHistory.goBack(),
  forward: () => site.webContents.navigationHistory.goForward(),
  reload: () => site.webContents.reload(),
  hardReload: () => site.webContents.reloadIgnoringCache(),
  home: () => site.webContents.loadURL(HOME),
  retry: () => {
    pushState({ retrying: true });
    site.webContents.loadURL(lastFailedUrl || HOME);
  },
  zoomIn: () => site.webContents.setZoomLevel(site.webContents.getZoomLevel() + ZOOM_STEP),
  zoomOut: () => site.webContents.setZoomLevel(site.webContents.getZoomLevel() - ZOOM_STEP),
  zoomReset: () => site.webContents.setZoomLevel(0),
  fullscreen: () => win.setFullScreen(!win.isFullScreen()),
  devtools: () => site.webContents.toggleDevTools(),
  installUpdate: () => updater.install(),
};

const shortcutFor = (input) => {
  if (input.type !== 'keyDown') return null;
  const mod = isMac ? input.meta : input.control;
  const key = input.key.toLowerCase();
  if (key === 'f5' || (mod && key === 'r')) return input.shift ? 'hardReload' : 'reload';
  if (key === 'f11' || (isMac && input.meta && input.control && key === 'f')) return 'fullscreen';
  if (input.alt && key === 'arrowleft') return 'back';
  if (input.alt && key === 'arrowright') return 'forward';
  if (input.alt && key === 'home') return 'home';
  if (mod && (key === '=' || key === '+')) return 'zoomIn';
  if (mod && key === '-') return 'zoomOut';
  if (mod && key === '0') return 'zoomReset';
  if (key === 'f12' || (mod && input.shift && key === 'i')) return 'devtools';
  return null;
};

const bindShortcuts = (contents) => {
  contents.on('before-input-event', (event, input) => {
    const name = shortcutFor(input);
    if (!name || !site) return;
    event.preventDefault();
    actions[name]();
  });
};

const showContextMenu = (params) => {
  const wc = site.webContents;
  const history = wc.navigationHistory;
  const items = [];
  if (params.linkURL) {
    if (isAppUrl(params.linkURL)) {
      items.push({ label: 'Open link', click: () => wc.loadURL(params.linkURL) });
    }
    items.push(
      { label: 'Open link in browser', click: () => openExternal(params.linkURL) },
      { label: 'Copy link', click: () => clipboard.writeText(params.linkURL) },
      { type: 'separator' }
    );
  }
  if (params.isEditable) {
    if (params.misspelledWord) {
      for (const suggestion of params.dictionarySuggestions.slice(0, 4)) {
        items.push({ label: suggestion, click: () => wc.replaceMisspelling(suggestion) });
      }
      if (params.dictionarySuggestions.length) items.push({ type: 'separator' });
    }
    items.push(
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { role: 'selectAll' },
      { type: 'separator' }
    );
  } else if (params.selectionText.trim()) {
    items.push({ role: 'copy' }, { type: 'separator' });
  }
  if (params.mediaType === 'image' && params.hasImageContents) {
    items.push(
      { label: 'Copy image', click: () => wc.copyImageAt(params.x, params.y) },
      { type: 'separator' }
    );
  }
  items.push(
    { label: 'Back', enabled: history.canGoBack(), click: actions.back },
    { label: 'Forward', enabled: history.canGoForward(), click: actions.forward },
    { label: 'Reload', click: actions.reload },
    { type: 'separator' },
    { label: 'Copy page link', click: () => clipboard.writeText(wc.getURL()) },
    { label: 'Open page in browser', click: () => openExternal(wc.getURL()) }
  );
  if (!app.isPackaged) {
    items.push(
      { type: 'separator' },
      { label: 'Inspect', click: () => wc.inspectElement(params.x, params.y) }
    );
  }
  Menu.buildFromTemplate(items).popup({ window: win });
};

// ---------------------------------------------------------------------------
// The site view

// Links the page itself (not an embedded player) asked to open in a new tab.
// The site preload reports clicks on target=_blank anchors; anything else that
// tries to pop a window, typically an embed's ad, is dropped.
const recentIntents = new Map();
ipcMain.on('site:external-intent', (event, raw) => {
  if (!site || event.sender !== site.webContents) return;
  if (typeof raw === 'string') recentIntents.set(raw, Date.now());
});
const consumeIntent = (url) => {
  const at = recentIntents.get(url);
  recentIntents.delete(url);
  return at !== undefined && Date.now() - at < 2000;
};

const createSiteView = (ses) => {
  site = new WebContentsView({
    webPreferences: {
      session: ses,
      preload: path.join(__dirname, 'preload-site.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      // Keep playback smooth while the window sits behind something else.
      backgroundThrottling: false,
      spellcheck: true,
    },
  });
  site.setBackgroundColor(config.BACKGROUND_COLOR);
  site.setVisible(false);

  const wc = site.webContents;
  bindShortcuts(wc);

  // Set when the current load failed, so its error page never counts as loaded.
  let failed = false;
  wc.on('did-start-loading', () => {
    failed = false;
    pushState({ loading: true });
  });
  wc.on('did-stop-loading', () => pushState({ loading: false }));
  wc.on('did-finish-load', () => {
    if (failed) return;
    lastFailedUrl = null;
    if (state.status === 'splash') {
      reveal();
    } else if (state.status === 'offline') {
      site.setVisible(true);
      pushState({ status: 'ready', reason: null, retrying: false });
    }
  });
  wc.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    // -3 is ERR_ABORTED: a navigation replaced by another, not a failure.
    if (!isMainFrame || code === -3) return;
    failed = true;
    goOffline('offline', url);
  });
  wc.on('render-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit') goOffline('crashed', wc.getURL());
  });
  wc.on('unresponsive', () => pushState({ loading: true }));
  wc.on('responsive', () => pushState({ loading: false }));
  wc.on('page-title-updated', (_e, title) => {
    pushState({ title });
    win.setTitle(title || 'kessoku moe');
  });
  wc.on('did-navigate', syncNav);
  wc.on('did-navigate-in-page', syncNav);

  // A player going fullscreen takes the whole window, titlebar included.
  wc.on('enter-html-full-screen', () => win.setFullScreen(true));
  wc.on('leave-html-full-screen', () => win.setFullScreen(false));

  wc.on('will-navigate', (event) => {
    const { url, isMainFrame, initiator } = event;
    if (!isMainFrame || isAppUrl(url) || isInAppHost(url)) return;
    event.preventDefault();
    // Only the page's own links leave for the browser. An embed rewriting
    // window.top is an ad redirect and goes nowhere.
    const fromPage = !initiator || initiator === wc.mainFrame;
    if (fromPage) openExternal(url);
  });

  wc.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url)) {
      wc.loadURL(url);
    } else if (consumeIntent(url)) {
      openExternal(url);
    }
    return { action: 'deny' };
  });

  wc.on('context-menu', (_e, params) => showContextMenu(params));
  return site;
};

// ---------------------------------------------------------------------------
// Session

const configureSession = () => {
  const ses = session.fromPartition('persist:kessoku');
  // Present as plain Chrome. Some embed sources refuse "Electron/" agents.
  const ua = ses
    .getUserAgent()
    .replace(/\s*Electron\/\S+/, '')
    .replace(/\s*kessoku[-\s]?moe(-desktop)?\/\S+/i, '');
  ses.setUserAgent(`${ua} KessokuMoeDesktop/${app.getVersion()}`);

  const allowed = new Set([
    'fullscreen',
    'notifications',
    'clipboard-sanitized-write',
    'media',
    'pointerLock',
    'idle-detection',
  ]);
  ses.setPermissionRequestHandler((_wc, permission, callback) =>
    callback(allowed.has(permission))
  );
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  return ses;
};

// ---------------------------------------------------------------------------
// Window

const createWindow = (startUrl) => {
  const saved = windowState.load();
  win = new BrowserWindow({
    x: saved.x,
    y: saved.y,
    width: saved.width,
    height: saved.height,
    minWidth: 940,
    minHeight: 600,
    show: false,
    title: 'kessoku moe',
    backgroundColor: config.BACKGROUND_COLOR,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    titleBarStyle: 'hidden',
    ...(isMac
      ? { trafficLightPosition: { x: 14, y: 13 } }
      : {
          titleBarOverlay: {
            color: config.CHROME_COLOR,
            symbolColor: config.SYMBOL_COLOR,
            height: TITLEBAR_HEIGHT,
          },
        }),
    webPreferences: {
      preload: path.join(__dirname, 'preload-shell.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  windowState.track(win);
  bindShortcuts(win.webContents);

  // The shell is a local file and never navigates anywhere.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.loadFile(path.join(__dirname, '..', 'renderer', 'shell.html'));
  win.once('ready-to-show', () => {
    if (saved.maximized) win.maximize();
    win.show();
  });
  win.webContents.on('did-finish-load', () => pushState());

  createSiteView(configureSession());
  win.contentView.addChildView(site);
  layout();

  win.on('resize', layout);
  win.on('focus', () => pushState({ focused: true }));
  win.on('blur', () => pushState({ focused: false }));
  win.on('enter-full-screen', () => {
    layout();
    pushState({ fullscreen: true });
  });
  win.on('leave-full-screen', () => {
    layout();
    pushState({ fullscreen: false });
  });
  // Mouse back/forward buttons on Windows.
  win.on('app-command', (_e, cmd) => {
    if (cmd === 'browser-backward') actions.back();
    if (cmd === 'browser-forward') actions.forward();
  });
  win.on('closed', () => {
    // Views don't take their page down with the window; close it explicitly.
    if (site && !site.webContents.isDestroyed()) site.webContents.close();
    win = null;
    site = null;
  });

  site.webContents.loadURL(startUrl || HOME);
};

ipcMain.on('shell:action', (event, name) => {
  if (!win || event.sender !== win.webContents) return;
  const allowed = ['back', 'forward', 'reload', 'home', 'retry', 'installUpdate'];
  if (allowed.includes(name)) actions[name]();
});

const focusWindow = () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
};

const setJumpList = () => {
  if (process.platform !== 'win32') return;
  const task = (title, description, route) => ({
    program: process.execPath,
    arguments: `--open=${route}`,
    iconPath: process.execPath,
    iconIndex: 0,
    title,
    description,
  });
  app.setUserTasks([
    task('Home', 'Open the home stage', '/home'),
    task('Airing schedule', 'See what airs next', '/schedule'),
    task('My list', 'Pick up where you left off', '/watchlist'),
    task('Manga', 'Open the manga shelf', '/manga'),
  ]);
};

// ---------------------------------------------------------------------------
// Lifecycle

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const target = targetFromArgv(argv);
    if (target && site) site.webContents.loadURL(target);
    focusWindow();
  });

  // macOS delivers deep links here instead of through argv.
  app.on('open-url', (event, raw) => {
    event.preventDefault();
    const target = targetFromArgv([raw]);
    if (target && site) site.webContents.loadURL(target);
    focusWindow();
  });

  app.whenReady().then(() => {
    nativeTheme.themeSource = 'dark';
    if (app.isPackaged) {
      app.setAsDefaultProtocolClient(PROTOCOL);
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
        path.resolve(process.argv[1] || '.'),
      ]);
    }
    // No menu bar on Windows/Linux; keep the standard one on macOS so the
    // usual Cmd shortcuts (copy, paste, quit, hide) keep working.
    Menu.setApplicationMenu(isMac ? Menu.buildFromTemplate([
      { role: 'appMenu' },
      { role: 'editMenu' },
      { role: 'windowMenu' },
    ]) : null);
    setJumpList();
    createWindow(targetFromArgv(process.argv));
    updater.start((update) => pushState({ update }));

    app.on('activate', () => {
      if (!win) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
}
