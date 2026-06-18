import { useState } from 'react';

import { COMMENT_MAX } from '@utility/commentsTypes';

interface CommentComposerProps {
  onSubmit: (body: string) => Promise<boolean>;
  placeholder?: string;
  initial?: string;
  submitLabel?: string;
  busy?: boolean;
  onCancel?: () => void;
}

// The write box. Plain text in, trimmed string out. Clears itself only when the
// parent's onSubmit resolves true (a real post landed), so a failed network
// call keeps the draft. Used for new top-level comments and, inline, for
// replies and edits.
const CommentComposer: React.FC<CommentComposerProps> = ({
  onSubmit,
  placeholder = 'Say something kind, or something true.',
  initial = '',
  submitLabel = 'Post',
  busy = false,
  onCancel,
}) => {
  const [body, setBody] = useState(initial);

  const trimmed = body.trim();
  const remaining = COMMENT_MAX - body.length;
  const overLimit = remaining < 0;
  const canSubmit = trimmed.length > 0 && !overLimit && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const ok = await onSubmit(trimmed);
    if (ok) setBody('');
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        rows={3}
        aria-label={submitLabel === 'Post' ? 'Write a comment' : submitLabel}
        className="min-h-[4.5rem] w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-3 text-base leading-relaxed text-fg placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />

      <div className="flex items-center justify-between gap-3">
        <span
          className={`text-xs tabular-nums ${
            overLimit ? 'text-accent' : 'text-faint'
          }`}
        >
          {remaining} left
        </span>

        <div className="flex items-center gap-2">
          {onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              style={{ touchAction: 'manipulation' }}
              className="inline-flex min-h-[44px] items-center rounded-full px-4 text-sm font-semibold text-muted transition-colors hover:text-fg"
            >
              Cancel
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex min-h-[44px] items-center rounded-full bg-aurora px-5 text-sm font-semibold text-accent-ink shadow-glow transition duration-200 hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            {busy ? 'Posting…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommentComposer;
