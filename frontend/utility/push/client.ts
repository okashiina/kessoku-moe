import { getToken } from '@utility/anilistAuth';

// Browser-side Web Push: a stable anonymous device id, permission, and subscribe
// / unsubscribe against the service worker. The VAPID public key is a
// NEXT_PUBLIC_* baked at build time. Everything degrades to a typed status when
// push isn't supported or the key is missing, so the UI never throws.

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const DEVICE_KEY = 'kessoku.push.device.v1';

export type PushStatus = 'unsupported' | 'denied' | 'default' | 'granted';

export const pushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export const pushConfigured = (): boolean => Boolean(VAPID);

// A stable per-browser id so a signed-out viewer's notify list has an owner.
export const getDeviceId = (): string => {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `d_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
};

const urlBase64ToUint8Array = (base64: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
};

export const pushStatus = (): PushStatus => {
  if (!pushSupported() || !pushConfigured()) return 'unsupported';
  return Notification.permission as PushStatus;
};

const post = async (path: string, body: unknown): Promise<Response> => {
  const token = getToken();
  return fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
};

// Ask permission (if needed), subscribe via the SW, register with the server.
// Returns the resulting status; 'granted' means a live subscription exists.
export const enablePush = async (): Promise<PushStatus> => {
  if (!pushSupported() || !pushConfigured()) return 'unsupported';
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm as PushStatus;

  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID),
    }));
  const json = sub.toJSON();
  const res = await post('/api/push/subscribe', {
    endpoint: sub.endpoint,
    keys: json.keys,
    deviceId: getDeviceId(),
    userAgent: navigator.userAgent,
  });
  // The browser subscribed, but the server must hold the row or no push can be
  // sent. Surface a failed registration instead of silently claiming success.
  if (!res.ok) throw new Error(`subscribe registration failed (${res.status})`);
  return 'granted';
};

export const disablePush = async (): Promise<void> => {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await post('/api/push/unsubscribe', { endpoint: sub.endpoint });
    await sub.unsubscribe();
  }
};
