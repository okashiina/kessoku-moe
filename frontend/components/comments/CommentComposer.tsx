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
        className="min-h-[4.5rem] w-full resize-y rounded-[5px] border border-[#66516a] bg-surface px-3.5 py-3 text-base leading-relaxed text-fg placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
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
              className="inline-flex min-h-[44px] items-center rounded-[5px] border border-[#66516a] px-4 text-sm font-bold text-[#bfb2c1] transition-colors hover:bg-[#332735] hover:text-[#f4ecef]"
            >
              Cancel
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            style={{ touchAction: 'manipulation' }}
            className="inline-flex min-h-[44px] items-center rounded-[5px] bg-accent px-5 text-sm font-bold text-accent-ink transition duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            {busy ? 'Posting…' : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommentComposer;
