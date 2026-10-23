// Where the desktop shell points. The app is a native frame around the hosted
// kessoku moe site: the catalog, AniList OAuth and the companion all need the
// server, so the window loads the deployed origin rather than a bundled copy.
//
// KESSOKU_URL overrides it for local work (`npm run dev` targets :3000).
const DEFAULT_URL = 'https://kessoku-moe.cc';

const normalize = (raw) => {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
};

const APP_ORIGIN = normalize(process.env.KESSOKU_URL || '') || DEFAULT_URL;

module.exports = {
  APP_ORIGIN,
  // Deep links: kessoku-moe://anime/21 opens <origin>/anime/21.
  PROTOCOL: 'kessoku-moe',
  // Hosts the main frame may navigate to without leaving the app. AniList is
  // here because sign-in redirects through its authorize page and back.
  IN_APP_HOSTS: ['anilist.co'],
  TITLEBAR_HEIGHT: 40,
  // The titlebar colour, shared with the native caption buttons on Windows.
  CHROME_COLOR: '#120f16',
  SYMBOL_COLOR: '#f4ecef',
  BACKGROUND_COLOR: '#17141c',
};
