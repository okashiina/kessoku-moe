import useComments from '@hooks/useComments';
import type { CommentTarget } from '@utility/commentsTypes';

import CommentComposer from './CommentComposer';
import CommentItem from './CommentItem';

interface CommentsSectionProps {
  anilistId: number;
  targetType: CommentTarget;
  episode?: number;
  title?: string;
}

// The mountable comments block. Owns nothing but the wiring: it reads the hook,
// hands the composer a post(), and maps top-level nodes to items. It stays
// padding-agnostic so both the already-padded watch column and the anime page
// can host it without doubling the gutter. When the DB feature is off the hook
// reports `unavailable` and we render nothing at all.
const CommentsSection: React.FC<CommentsSectionProps> = ({
  anilistId,
  targetType,
  episode,
  title,
}) => {
  const {
    comments,
    loading,
    unavailable,
    hasMore,
    loadMore,
    posting,
    post,
    edit,
    remove,
    report,
    isLoggedIn,
    login,
  } = useComments({ anilistId, targetType, episode });

  if (unavailable) return null;

  return (
    <section className="mt-10" aria-label={title ?? 'Comments'}>
      <div className="mb-3 flex items-center gap-2.5">
        <span className="h-5 w-1 shrink-0 rounded-full bg-aurora" aria-hidden />
        <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
          {title ?? 'Comments'}
        </h2>
      </div>

      <div className="mb-6">
        {isLoggedIn ? (
          <CommentComposer onSubmit={(body) => post(body)} busy={posting} />
        ) : (
          <button
            type="button"
            onClick={login}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex min-h-[44px] items-center rounded-full bg-aurora px-5 text-sm font-semibold text-accent-ink shadow-glow transition duration-200 hover:brightness-110 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            Sign in to comment
          </button>
        )}
      </div>

      {comments.length > 0 ? (
        <div className="space-y-6">
          {comments.map((node) => (
            <CommentItem
              key={node.id}
              node={node}
              isLoggedIn={isLoggedIn}
              onReply={(parentId, body) => post(body, parentId)}
              onEdit={edit}
              onRemove={remove}
              onReport={report}
            />
          ))}
        </div>
      ) : null}

      {comments.length === 0 && !loading ? (
        <p className="text-sm leading-relaxed text-muted">
          No comments yet. Start the conversation.
        </p>
      ) : null}

      {hasMore ? (
        <div className="mt-6">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex min-h-[44px] items-center rounded-full border border-line bg-surface px-5 text-sm font-semibold text-fg transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </section>
  );
};

export default CommentsSection;
