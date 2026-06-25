import { useCallback, useState } from 'react';

import useSWRInfinite from 'swr/infinite';

import useAniListAuth from '@hooks/useAniListAuth';
import { getToken } from '@utility/anilistAuth';
import {
  CommentNode,
  CommentsPage,
  CommentSort,
  CommentTarget,
} from '@utility/commentsTypes';

// Comments for one target (a show or a single episode). Reads are public and
// keyset-paginated (SWR Infinite, one page of top-level comments + their replies
// per request); writes attach the AniList bearer so the server resolves the
// author and marks `mine`/`voted`. Posting/editing/reporting revalidate; voting
// patches the cache in place (no reload, no scroll jump). `unavailable` (503)
// means the comments DB isn't configured, so the section hides.

export interface CommentTargetInput {
  anilistId: number;
  targetType: CommentTarget;
  episode?: number; // absolute episode number, or chapter number for manga
}

// Episode- and manga_chapter-level both carry an `episode` value (the chapter
// number for manga); anime-level does not.
const carriesEpisode = (t: CommentTarget): boolean =>
  t === 'episode' || t === 'manga_chapter';

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
  vote: (id: number) => Promise<boolean>;
  unvote: (id: number) => Promise<boolean>;
  isLoggedIn: boolean;
  login: () => void;
}

const buildUrl = (
  t: CommentTargetInput,
  sort: CommentSort,
  cursor: string | null
): string => {
  const p = new URLSearchParams();
  p.set('anilistId', String(t.anilistId));
  p.set('targetType', t.targetType);
  if (carriesEpisode(t.targetType) && t.episode) {
    p.set('episode', String(t.episode));
  }
  p.set('sort', sort);
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

// Apply a vote result to one node (or its replies), in place in a cloned tree.
const patchNode = (
  node: CommentNode,
  id: number,
  voteCount: number,
  voted: boolean
): CommentNode => {
  if (node.id === id) return { ...node, voteCount, voted };
  if (node.replies.length === 0) return node;
  return {
    ...node,
    replies: node.replies.map((r) => patchNode(r, id, voteCount, voted)),
  };
};

const useComments = (
  target: CommentTargetInput,
  sort: CommentSort = 'new'
): UseComments => {
  const { isLoggedIn, login } = useAniListAuth();
  const [posting, setPosting] = useState(false);

  const enabled =
    target.anilistId > 0 &&
    (!carriesEpisode(target.targetType) || Boolean(target.episode));

  const getKey = (index: number, prev: CommentsPage | null): string | null => {
    if (!enabled) return null;
    if (index === 0) return buildUrl(target, sort, null);
    if (!prev || !prev.nextCursor) return null;
    return buildUrl(target, sort, prev.nextCursor);
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
        ...(carriesEpisode(target.targetType) && target.episode
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

  // Vote / unvote patch the cached tree in place from the server's authoritative
  // count, without a revalidation, so the list doesn't reload or jump.
  const setVote = useCallback(
    async (id: number, makeVoted: boolean): Promise<boolean> => {
      const token = getToken();
      try {
        const res = await fetch(`/api/comments/${id}/vote`, {
          method: makeVoted ? 'POST' : 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return false;
        const result = (await res.json()) as {
          voteCount: number;
          voted: boolean;
        };
        await mutate(
          (current) =>
            (current ?? []).map((pg) => ({
              ...pg,
              comments: pg.comments.map((c) =>
                patchNode(c, id, result.voteCount, result.voted)
              ),
            })),
          { revalidate: false }
        );
        return true;
      } catch {
        return false;
      }
    },
    [mutate]
  );

  const vote = useCallback((id: number) => setVote(id, true), [setVote]);
  const unvote = useCallback((id: number) => setVote(id, false), [setVote]);

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
    vote,
    unvote,
    isLoggedIn,
    login,
  };
};

export default useComments;
