/// <reference lib="webworker" />

// Custom service worker for Web Push. next-pwa (v5) compiles this file and
// importScripts it into the generated public/sw.js. It runs in the
// ServiceWorkerGlobalScope, not as a normal module at runtime, but module
// syntax is fine because next-pwa bundles it with webpack.

declare const self: ServiceWorkerGlobalScope & typeof globalThis;

// Push payload contract sent by the server.
interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  icon?: string;
  badge?: string;
}

const DEFAULT_TITLE = 'kessoku moe';
const DEFAULT_BODY = 'You have a new notification.';
const DEFAULT_ICON = '/kessoku-moe-appicon.svg';
const DEFAULT_BADGE = '/kessoku-moe-icon.svg';

self.addEventListener('push', (event) => {
  let payload: Partial<PushPayload> = {};

  if (event.data) {
    try {
      payload = event.data.json() as PushPayload;
    } catch {
      // Fall back to plain text if the payload is not JSON.
      payload = { body: event.data.text() };
    }
  }

  const title = payload.title || DEFAULT_TITLE;
  const body = payload.body || DEFAULT_BODY;
  const url = payload.url || '/';
  const { tag } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: payload.icon || DEFAULT_ICON,
      badge: payload.badge || DEFAULT_BADGE,
      tag,
      data: { url },
      renotify: Boolean(tag),
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = (event.notification.data || {}) as { url?: string };
  const targetUrl = new URL(data.url || '/', self.location.origin);

  // Focus an already-open same-origin tab (navigating it to the target) or open
  // a new one. Promise chain, not async/await-in-loop, to satisfy the lint rules.
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        const match = windowClients.find(
          (client) => new URL(client.url).origin === targetUrl.origin
        );
        if (match) {
          return match.focus().then(() => {
            if ('navigate' in match) match.navigate(targetUrl.href);
          });
        }
        return self.clients.openWindow(targetUrl.href).then(() => undefined);
      })
  );
});

// Offline manga: serve downloaded chapter pages + page-list JSON from the
// `offline-manga-v1` cache when present, otherwise fall through to the network.
// The PAGE writes this cache (see frontend/utility/mangaDownloads.ts); the SW
// only reads. Scoped strictly to manga URLs — every other request is left for
// Workbox (we never call respondWith for those). Defensive: any error just
// falls back to the network.
self.addEventListener('fetch', (event) => {
  let pathname: string;
  try {
    pathname = new URL(event.request.url).pathname;
  } catch {
    return; // not a parseable URL — let Workbox handle it
  }

  const isManga =
    pathname === '/api/manga/image' ||
    (/^\/api\/manga\/chapter\/[^/]+\/pages$/.test(pathname) &&
      event.request.method === 'GET');
  if (!isManga) return; // not ours — Workbox handles it

  event.respondWith(
    (async () => {
      try {
        const cache = await caches.open('offline-manga-v1');
        const hit = await cache.match(event.request, { ignoreSearch: false });
        return hit || (await fetch(event.request));
      } catch {
        return fetch(event.request);
      }
    })()
  );
});

export {};
