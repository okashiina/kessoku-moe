import { useState } from 'react';

import type { CommentNode } from '@utility/commentsTypes';

import CommentComposer from './CommentComposer';

interface CommentItemProps {
  node: CommentNode;
  isLoggedIn: boolean;
  onReply: (parentId: number, body: string) => Promise<boolean>;
  onEdit: (id: number, body: string) => Promise<boolean>;
  onRemove: (id: number) => Promise<boolean>;
  onReport: (id: number) => Promise<boolean>;
}

// Compact relative time, no dependency. Falls back to a short date once a post
// is more than a week old, so "2h ago" never stretches into "732h ago".
const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

const initialOf = (name: string): string =>
  name.trim().charAt(0).toUpperCase() || '?';

const CommentItem: React.FC<CommentItemProps> = ({
  node,
  isLoggedIn,
  onReply,
  onEdit,
  onRemove,
  onReport,
}) => {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reported, setReported] = useState(false);

  const isTopLevel = node.parentId === null;
  const canReply = isLoggedIn && isTopLevel;
  const canReport = isLoggedIn && !node.mine && !node.deleted;

  const handleReply = async (body: string) => {
    const ok = await onReply(node.id, body);
    if (ok) setReplying(false);
    return ok;
  };

  const handleEdit = async (body: string) => {
    const ok = await onEdit(node.id, body);
    if (ok) setEditing(false);
    return ok;
  };

  const handleRemove = () => {
    // eslint-disable-next-line no-alert -- lightweight destructive guard; a modal is overkill here
    if (window.confirm('Delete this comment?')) {
      onRemove(node.id);
    }
  };

  const handleReport = async () => {
    const ok = await onReport(node.id);
    if (ok) setReported(true);
  };

  return (
    <article className="flex gap-3">
      {node.authorAvatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- external AniList avatar URL; next/image gives no win here
        <img
          src={node.authorAvatar}
          alt={`${node.authorName} avatar`}
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-line/50"
          loading="lazy"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-muted ring-1 ring-line/50"
        >
          {initialOf(node.authorName)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-fg">
            {node.authorName}
          </span>
          <time
            dateTime={node.createdAt}
            className="text-xs text-faint"
            title={new Date(node.createdAt).toLocaleString()}
          >
            {relativeTime(node.createdAt)}
          </time>
          {node.editedAt && !node.deleted ? (
            <span className="text-xs text-faint">edited</span>
          ) : null}
        </div>

        {node.deleted ? (
          <p className="mt-1 text-sm italic text-faint">[removed]</p>
        ) : (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
            {node.body}
          </p>
        )}

        {!node.deleted && (canReply || node.mine || canReport) ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5">
            {canReply ? (
              <button
                type="button"
                onClick={() => setReplying((open) => !open)}
                aria-label="Reply to comment"
                aria-expanded={replying}
                style={{ touchAction: 'manipulation' }}
                className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-xs font-semibold text-muted transition-colors hover:text-fg"
              >
                Reply
              </button>
            ) : null}

            {node.mine ? (
              <button
                type="button"
                onClick={() => setEditing((open) => !open)}
                aria-label="Edit your comment"
                aria-expanded={editing}
                style={{ touchAction: 'manipulation' }}
                className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-xs font-semibold text-muted transition-colors hover:text-fg"
              >
                Edit
              </button>
            ) : null}

            {node.mine ? (
              <button
                type="button"
                onClick={handleRemove}
                aria-label="Delete your comment"
                style={{ touchAction: 'manipulation' }}
                className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-xs font-semibold text-muted transition-colors hover:text-accent"
              >
                Delete
              </button>
            ) : null}

            {canReport ? (
              <button
                type="button"
                onClick={handleReport}
                disabled={reported}
                aria-label="Report comment"
                style={{ touchAction: 'manipulation' }}
                className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-xs font-semibold text-muted transition-colors hover:text-fg disabled:text-faint disabled:hover:text-faint"
              >
                {reported ? 'Reported' : 'Report'}
              </button>
            ) : null}
          </div>
        ) : null}

        {editing ? (
          <div className="mt-2">
            <CommentComposer
              onSubmit={handleEdit}
              initial={node.body}
              submitLabel="Save"
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : null}

        {replying ? (
          <div className="mt-2">
            <CommentComposer
              onSubmit={handleReply}
              placeholder="Write a reply…"
              submitLabel="Reply"
              onCancel={() => setReplying(false)}
            />
          </div>
        ) : null}

        {node.replies.length > 0 ? (
          <div className="mt-3 space-y-3 border-l border-line/50 pl-3 sm:pl-4">
            {node.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                node={reply}
                isLoggedIn={isLoggedIn}
                onReply={onReply}
                onEdit={onEdit}
                onRemove={onRemove}
                onReport={onReport}
              />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
};

export default CommentItem;
