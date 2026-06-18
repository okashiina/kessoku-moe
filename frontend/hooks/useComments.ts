import { useCallback, useState } from 'react';

import useSWRInfinite from 'swr/infinite';

import useAniListAuth from '@hooks/useAniListAuth';
import { getToken } from '@utility/anilistAuth';
import {
  CommentNode,
  CommentsPage,
  CommentTarget,
} from '@utility/commentsTypes';

// Comments for one target (a show or a single episode). Reads are public and
// keyset-paginated (SWR Infinite, one page of top-level comments + their replies
// per request); writes attach the AniList bearer so the server resolves the
// author and marks `mine`. Every writer revalidates so the thread reflects the
// change. `unavailable` (503) means the comments DB isn't configured — the
// section hides entirely.

export interface CommentTargetInput {
  anilistId: number;
  targetType: CommentTarget;
  episode?: number;
}

export interface UseComments {
  comments: CommentNode[];
  loading: boolean;
  unavailable: boolean;
  hasMore: boolean;
  loadMore: () => void;
  posting: boolean;
  post: (body: string, parentId?: number) => Promise<boolean>;
  edit: (id: number, body: string) => Promise<boolean>;
  remove: (id: number) => Promise<boolean>;
  report: (id: number) => Promise<boolean>;
  isLoggedIn: boolean;
  login: () => void;
}

const buildUrl = (t: CommentTargetInput, cursor: string | null): string => {
  const p = new URLSearchParams();
  p.set('anilistId', String(t.anilistId));
  p.set('targetType', t.targetType);
  if (t.targetType === 'episode' && t.episode) {
    p.set('episode', String(t.episode));
  }
  if (cursor) p.set('cursor', cursor);
  return `/api/comments?${p.toString()}`;
};

const fetcher = async (url: string): Promise<CommentsPage> => {
  const token = getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<CommentsPage>;
};

const useComments = (target: CommentTargetInput): UseComments => {
  const { isLoggedIn, login } = useAniListAuth();
  const [posting, setPosting] = useState(false);

  const enabled =
    target.anilistId > 0 &&
    (target.targetType !== 'episode' || Boolean(target.episode));

  const getKey = (index: number, prev: CommentsPage | null): string | null => {
    if (!enabled) return null;
    if (index === 0) return buildUrl(target, null);
    if (!prev || !prev.nextCursor) return null;
    return buildUrl(target, prev.nextCursor);
  };

  const { data, error, size, setSize, mutate, isValidating } =
    useSWRInfinite<CommentsPage>(getKey, fetcher, {
      revalidateFirstPage: false,
      revalidateOnFocus: false,
    });

  const pages = data ?? [];
  const comments = pages.flatMap((p) => p.comments);
  const hasMore = Boolean(pages[pages.length - 1]?.nextCursor);
  const loading = (!data && !error) || isValidating;
  const unavailable = Boolean(error && error.message === '503');

  const write = useCallback(
    async (
      method: 'POST' | 'PATCH' | 'DELETE',
      url: string,
      payload?: unknown
    ): Promise<boolean> => {
      const token = getToken();
      setPosting(true);
      try {
        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: payload ? JSON.stringify(payload) : undefined,
        });
        if (!res.ok) return false;
        await mutate();
        return true;
      } catch {
        return false;
      } finally {
        setPosting(false);
      }
    },
    [mutate]
  );

  const post = useCallback(
    (body: string, parentId?: number) =>
      write('POST', '/api/comments', {
        anilistId: target.anilistId,
        targetType: target.targetType,
        ...(target.targetType === 'episode' && target.episode
          ? { episode: target.episode }
          : {}),
        ...(parentId ? { parentId } : {}),
        body,
      }),
    [write, target.anilistId, target.targetType, target.episode]
  );

  const edit = useCallback(
    (id: number, body: string) =>
      write('PATCH', `/api/comments/${id}`, { body }),
    [write]
  );
  const remove = useCallback(
    (id: number) => write('DELETE', `/api/comments/${id}`),
    [write]
  );
  const report = useCallback(
    (id: number) => write('POST', `/api/comments/${id}/report`),
    [write]
  );

  return {
    comments,
    loading,
    unavailable,
    hasMore,
    loadMore: () => setSize(size + 1),
    posting,
    post,
    edit,
    remove,
    report,
    isLoggedIn,
    login,
  };
};

export default useComments;
