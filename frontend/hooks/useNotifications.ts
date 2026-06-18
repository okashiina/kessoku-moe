import useSWR from 'swr';

import useAniListAuth from '@hooks/useAniListAuth';
import { getToken } from '@utility/anilistAuth';
import type {
  NotificationItem,
  NotificationsResponse,
} from '@utility/notificationsTypes';

// In-app notifications inbox. SWR-keyed only when the viewer is signed in, so
// logged-out visitors never hit the endpoint. Polls once a minute and on focus
// to keep the bell's unread count honest without a websocket.

const fetcher = async (url: string): Promise<NotificationsResponse> => {
  const token = getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<NotificationsResponse>;
};

export interface UseNotifications {
  items: NotificationItem[];
  unread: number;
  loading: boolean;
  markRead: (ids?: number[]) => Promise<void>;
  markAllRead: () => Promise<void>;
  isLoggedIn: boolean;
  login: () => void;
}

const useNotifications = (): UseNotifications => {
  const { isLoggedIn, login } = useAniListAuth();
  const key = isLoggedIn ? '/api/notifications' : null;
  const { data, error, mutate } = useSWR<NotificationsResponse>(key, fetcher, {
    revalidateOnFocus: true,
    refreshInterval: 60000,
  });

  const markRead = async (ids?: number[]): Promise<void> => {
    if (!isLoggedIn) return;
    const token = getToken();
    const res = await fetch('/api/notifications/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(ids && ids.length > 0 ? { ids } : {}),
    });
    if (!res.ok) return;
    await mutate();
  };

  const markAllRead = (): Promise<void> => markRead();

  return {
    items: data?.items ?? [],
    unread: data?.unread ?? 0,
    loading: Boolean(key) && !data && !error,
    markRead,
    markAllRead,
    isLoggedIn,
    login,
  };
};

export default useNotifications;
