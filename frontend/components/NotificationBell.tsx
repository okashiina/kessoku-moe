import { useCallback, useEffect, useRef, useState } from 'react';

import Link from 'next/link';

import { BellIcon } from '@heroicons/react/outline';

import useNotifications from '@hooks/useNotifications';
import type { NotificationItem } from '@utility/notificationsTypes';

// Relative time, kept terse for the dense dropdown: "now", "5m", "2h", "3d",
// then a short date once it's older than a week so old pings stay legible.
const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 45) return 'now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(then).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
};

interface NotificationBellProps {
  variant?: 'header' | 'account';
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

const NotificationBell: React.FC<NotificationBellProps> = ({
  variant = 'header',
  expanded,
  onExpandedChange,
}) => {
  const { items, unread, loading, markRead, markAllRead, isLoggedIn } =
    useNotifications();
  const [localOpen, setLocalOpen] = useState(false);
  const open = expanded ?? localOpen;
  const setOpen = useCallback(
    (value: boolean): void => {
      setLocalOpen(value);
      onExpandedChange?.(value);
    },
    [onExpandedChange]
  );
  const inline = variant === 'account';
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape and focus the panel when it opens, for keyboard users.
  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open || inline) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, inline, setOpen]);

  // The bell only exists for signed-in viewers.
  if (!isLoggedIn) return null;

  const badge = unread > 9 ? '9+' : String(unread);

  const onRowClick = (item: NotificationItem): void => {
    if (!item.read) markRead([item.id]).catch(() => {});
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={`Notifications, ${unread} unread`}
        aria-haspopup={inline ? undefined : 'dialog'}
        aria-expanded={open}
        style={{ touchAction: 'manipulation' }}
        className={
          inline
            ? 'relative flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-fg transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:bg-surface-2 motion-reduce:transition-none'
            : 'relative flex h-11 w-11 items-center justify-center rounded-full text-fg transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:bg-surface-2 motion-reduce:transition-none'
        }
      >
        <BellIcon
          className={inline ? 'h-5 w-5 shrink-0' : 'h-6 w-6'}
          aria-hidden="true"
        />
        {inline && <span>Notifications</span>}
        {unread > 0 && (
          <span
            aria-hidden="true"
            className={
              inline
                ? 'ml-auto rounded-full bg-accent px-2 py-1 text-xs font-bold text-accent-ink'
                : 'absolute right-1.5 top-1.5 flex min-w-[1.125rem] items-center justify-center rounded-full bg-accent px-1 text-[0.625rem] font-bold leading-none text-accent-ink'
            }
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Invisible backdrop catches outside clicks and taps. */}
          {!inline && (
            <button
              type="button"
              aria-label="Close notifications"
              tabIndex={-1}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
          )}

          <div
            ref={panelRef}
            role={inline ? 'region' : 'dialog'}
            aria-label="Notifications"
            tabIndex={-1}
            className={
              inline
                ? 'mb-2 rounded-xl border border-line bg-canvas-2 focus:outline-none'
                : 'absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-line bg-canvas-2 shadow-card focus:outline-none'
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-1">
              <span className="text-sm font-semibold text-fg">
                Notifications
              </span>
              <button
                type="button"
                onClick={() => {
                  markAllRead().catch(() => {});
                }}
                disabled={unread === 0}
                className="min-h-[44px] rounded-md px-2 text-xs font-medium text-accent transition-colors [touch-action:manipulation] hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:bg-surface-2 disabled:cursor-default disabled:text-muted disabled:hover:text-muted motion-reduce:transition-none"
              >
                Mark all read
              </button>
            </div>

            <div
              className={
                inline
                  ? ''
                  : 'max-h-[min(70dvh,28rem)] overflow-y-auto overscroll-contain'
              }
            >
              {items.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-muted">
                  {loading ? 'Tuning in...' : 'No notifications yet.'}
                </p>
              )}
              {items.length > 0 && (
                <ul>
                  {items.map((item) => (
                    <li key={item.id}>
                      <Link href={item.href} passHref>
                        <a
                          onClick={() => onRowClick(item)}
                          className="flex min-h-[44px] gap-3 border-b border-line/60 px-4 py-3 transition-colors last:border-b-0 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none motion-reduce:transition-none"
                        >
                          <span
                            aria-hidden="true"
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                              item.read ? 'bg-transparent' : 'bg-accent'
                            }`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-sm text-fg">
                                {item.type === 'manga_chapter' ? (
                                  <>
                                    <span className="font-semibold">
                                      New chapter
                                    </span>{' '}
                                    · {item.actorName}
                                  </>
                                ) : (
                                  <>
                                    <span className="font-semibold">
                                      {item.actorName}
                                    </span>{' '}
                                    replied to you
                                  </>
                                )}
                              </span>
                              <time
                                dateTime={item.createdAt}
                                className="shrink-0 text-xs text-muted"
                              >
                                {relativeTime(item.createdAt)}
                              </time>
                            </span>
                            <span className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted line-clamp-2">
                              {item.snippet}
                            </span>
                          </span>
                        </a>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;
