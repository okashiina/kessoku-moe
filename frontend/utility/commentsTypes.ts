// Shared comment shapes used by the API routes, the SWR hook, and the UI, so the
// three never drift. A "node" is a top-level comment with its (one level of)
// replies inlined. Soft-deleted or auto-hidden rows are kept for thread shape
// with `deleted: true` and a blanked body, so a reply never loses its parent.

// 'manga_chapter' reuses the per-target episode field as the chapter number.
export type CommentTarget = 'anime' | 'episode' | 'manga_chapter';

// Listing order: newest-first, or highest-voted-first ("Top").
export type CommentSort = 'new' | 'top';

export interface CommentNode {
  id: number;
  parentId: number | null;
  anilistUserId: number;
  authorName: string;
  authorAvatar: string | null;
  body: string; // '' when deleted/hidden
  createdAt: string; // ISO 8601
  editedAt: string | null;
  deleted: boolean; // soft-deleted or auto-hidden (body blanked)
  reportCount: number;
  voteCount: number; // upvotes
  voted: boolean; // the authed viewer has upvoted this
  mine: boolean; // the authed viewer is the author (drives edit/delete affordance)
  replies: CommentNode[]; // one level; always [] on a reply itself
}

export interface CommentsPage {
  comments: CommentNode[]; // top-level, newest-first
  nextCursor: string | null; // opaque keyset cursor, null at the end
}

// Body length is enforced in the API and again by a DB CHECK constraint.
export const COMMENT_MAX = 2000;
// A comment hidden once this many distinct users report it (still in the thread).
export const REPORT_HIDE_THRESHOLD = 5;
