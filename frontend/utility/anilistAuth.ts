import { createStore } from './externalStore';

// AniList login via the OAuth **authorization code grant** (AniList does not
// support the implicit grant — `response_type=token` returns unsupported_grant_type).
// The browser only ever sees the short-lived `code`; a server route
// (`/api/auth/anilist`) exchanges it for the access token using the client secret
// (server-only env var, never bundled). The resulting token (valid ~1 year) is
// stored with the resolved viewer in localStorage and attached as a Bearer header
// on each sync request. Anonymous use is unaffected.

export interface AniListUser {
  id: number;
  name: string;
  avatar: string | null;
}

// The viewer's chosen score display format (AniList Settings > Lists). Score is
// stored internally as scoreRaw 0-100 and AniList renders it in this format, so
// the rating control mirrors it. Absent on legacy sessions → treat as POINT_10.
export type ScoreFormat =
  | 'POINT_100'
  | 'POINT_10_DECIMAL'
  | 'POINT_10'
  | 'POINT_5'
  | 'POINT_3';

export interface AniListSession {
  token: string;
  expiresAt: number; // ms epoch
  user: AniListUser;
  scoreFormat?: ScoreFormat | null;
}

const KEY = 'kessoku.anilist.token';
const AUTHORIZE = 'https://anilist.co/api/v2/oauth/authorize';

const store = createStore<AniListSession | null>(KEY, null);
export const subscribeAuth = store.subscribe;

/** Current session, or null if absent/expired. Pure (no side effects). */
export const getSession = (): AniListSession | null => {
  const s = store.get();
  if (!s) return null;
  if (s.expiresAt && s.expiresAt < Date.now()) return null;
  return s;
};

export const getToken = (): string | null => getSession()?.token ?? null;
export const isLoggedIn = (): boolean => getSession() !== null;

export const setSession = (session: AniListSession): void => store.set(session);
export const logout = (): void => store.set(null);

export const clientId = (): string =>
  process.env.NEXT_PUBLIC_ANILIST_CLIENT_ID || '';

const redirectUri = (): string =>
  typeof window === 'undefined'
    ? ''
    : `${window.location.origin}/auth/callback`;

/** Authorize URL for the authorization code grant (response_type=code). */
export const loginUrl = (): string => {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
  });
  return `${AUTHORIZE}?${params.toString()}`;
};

/** Kick off the login redirect (no-op if the client id isn't configured). */
export const login = (): void => {
  if (!clientId() || typeof window === 'undefined') return;
  window.location.href = loginUrl();
};

export const authHeader = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
});
