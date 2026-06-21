import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import Link from 'next/link';

import {
  BookOpenIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/solid';

import {
  getMangaEntry,
  markChaptersRead,
  subscribeMangaProgress,
  unmarkChapterRead,
  unmarkChaptersFrom,
} from '@utility/mangaProgress';

export interface ChapterLite {
  id: string;
  chapterNum: number;
  label: string; // "Ch. 12.5" or "Oneshot"
  title: string | null;
  group: string | null;
  pages: number;
  volume: string | null;
}

const LANG_LABEL: Record<string, string> = {
  id: 'Indonesia',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  'zh-hk': '中文',
  zh: '中文',
};

const langLabel = (l: string): string => LANG_LABEL[l] ?? l.toUpperCase();

export interface ChapterListProps {
  anilistId: number;
  chaptersByLang: Record<string, ChapterLite[]>;
  languages: string[];
  defaultLang: string;
  title: string;
  cover: string | null;
}

const ChapterList: React.FC<ChapterListProps> = ({
  anilistId,
  chaptersByLang,
  languages,
  defaultLang,
  title,
  cover,
}) => {
  // Resume entry (client store) drives the CTA + read markers.
  const entry = useSyncExternalStore(
    subscribeMangaProgress,
    () => getMangaEntry(anilistId),
    () => undefined
  );

  const [lang, setLang] = useState(
    entry?.lang && languages.includes(entry.lang) ? entry.lang : defaultLang
  );
  const [asc, setAsc] = useState(false);

  const ascending = useMemo(
    () =>
      (chaptersByLang[lang] ?? [])
        .slice()
        .sort((a, b) => a.chapterNum - b.chapterNum),
    [chaptersByLang, lang]
  );
  const sorted = useMemo(
    () => (asc ? ascending : ascending.slice().reverse()),
    [ascending, asc]
  );

  const first = ascending[0] ?? null;
  const readSet = new Set(entry?.read ?? []);
  const readCount = ascending.filter((c) => readSet.has(c.chapterNum)).length;
  const resuming = Boolean(entry?.chapterId && entry.lang === lang);

  let resumeHref: string | null = null;
  if (resuming) resumeHref = `/read/${entry?.chapterId}?al=${anilistId}`;
  else if (first) resumeHref = `/read/${first.id}?al=${anilistId}`;

  // Carried into the store so a mark-from-the-list entry is complete in the
  // Continue rail (cover + title) without the reader having been opened.
  const info = { total: ascending.length, lang, title, cover };

  // ---- mark/unmark context menu (long-press / right-click a chapter) --------
  const [menu, setMenu] = useState<{
    ch: ChapterLite;
    x: number;
    y: number;
  } | null>(null);
  const closeMenu = () => setMenu(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menu) return undefined;
    firstItemRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  const openMenu = (ch: ChapterLite, x: number, y: number) => {
    // Clamp on-screen. Panel is w-60 (240px) and up to ~210px tall with all 3
    // items; the reserves keep an 8px side gutter and clear the iOS home
    // indicator at the bottom.
    const cx = Math.min(Math.max(8, x), window.innerWidth - 248);
    const cy = Math.min(Math.max(8, y), window.innerHeight - 240);
    setMenu({ ch, x: cx, y: cy });
  };

  // ~500ms press-and-hold opens the menu (touch twin of right-click). A pending
  // click after a long-press is eaten so holding a row doesn't also navigate.
  const pressTimer = useRef<ReturnType<typeof setTimeout>>();
  const pressPoint = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const suppressClick = useRef(false);
  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = undefined;
    }
  };
  useEffect(() => clearPress, []);

  const toggleRead = (ch: ChapterLite) => {
    if (readSet.has(ch.chapterNum)) unmarkChapterRead(anilistId, ch.chapterNum);
    else markChaptersRead(anilistId, [ch.chapterNum], info);
  };
  const markUpTo = (ch: ChapterLite) =>
    markChaptersRead(
      anilistId,
      ascending
        .filter((c) => c.chapterNum <= ch.chapterNum)
        .map((c) => c.chapterNum),
      info
    );

  const menuCh = menu?.ch;
  const menuRead = menuCh ? readSet.has(menuCh.chapterNum) : false;
  const canMarkUpTo =
    !!menuCh &&
    ascending.some(
      (c) => c.chapterNum <= menuCh.chapterNum && !readSet.has(c.chapterNum)
    );
  const canUnmarkFrom =
    !!menuCh &&
    ascending.some(
      (c) => c.chapterNum >= menuCh.chapterNum && readSet.has(c.chapterNum)
    );

  return (
    <div>
      {/* Primary CTA + language switch */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {resumeHref && (
          <Link href={resumeHref} passHref>
            <a className="inline-flex items-center gap-2 rounded-full bg-aurora px-5 py-2.5 text-sm font-semibold text-accent-ink shadow-glow transition hover:brightness-110">
              <BookOpenIcon className="h-5 w-5" />
              {resuming ? `Continue · Ch. ${entry?.ch}` : 'Start reading'}
            </a>
          </Link>
        )}
        {readCount > 0 && (
          <span className="text-sm font-medium text-muted">
            {readCount} / {ascending.length} read
          </span>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Language tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {languages.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={l === lang}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition [touch-action:manipulation] sm:text-sm ${
                l === lang
                  ? 'border-accent bg-accent text-accent-ink shadow-glow'
                  : 'border-line/70 bg-surface/60 text-muted hover:border-accent/60 hover:text-fg'
              }`}
            >
              {langLabel(l)}
              <span className="ml-1.5 opacity-60">
                {chaptersByLang[l]?.length ?? 0}
              </span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setAsc((v) => !v)}
          className="rounded-full border border-line/70 bg-surface/60 px-3 py-1.5 text-xs font-medium text-muted transition [touch-action:manipulation] hover:border-accent/60 hover:text-fg"
        >
          {asc ? 'Oldest first' : 'Newest first'}
        </button>
      </div>

      {sorted.length > 0 && (
        <p className="mb-2 text-xs text-muted">
          Long-press or right-click a chapter to mark it read.
        </p>
      )}

      {/* Chapter rows */}
      {sorted.length > 0 ? (
        <ul className="divide-y divide-line/40 overflow-hidden rounded-2xl border border-line/40 bg-surface/30">
          {sorted.map((ch) => {
            const read = readSet.has(ch.chapterNum);
            const startPress = (e: React.PointerEvent) => {
              clearPress();
              suppressClick.current = false;
              pressPoint.current = { x: e.clientX, y: e.clientY };
              pressTimer.current = setTimeout(() => {
                clearPress();
                suppressClick.current = true;
                openMenu(ch, pressPoint.current.x, pressPoint.current.y);
              }, 500);
            };
            return (
              <li key={ch.id}>
                <Link href={`/read/${ch.id}?al=${anilistId}`} passHref>
                  <a
                    onClick={(e) => {
                      if (suppressClick.current) {
                        suppressClick.current = false;
                        e.preventDefault();
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openMenu(ch, e.clientX, e.clientY);
                    }}
                    onPointerDown={startPress}
                    onPointerUp={clearPress}
                    onPointerLeave={clearPress}
                    onPointerCancel={clearPress}
                    onPointerMove={(e) => {
                      if (!pressTimer.current) return;
                      const dx = e.clientX - pressPoint.current.x;
                      const dy = e.clientY - pressPoint.current.y;
                      if (dx * dx + dy * dy > 100) clearPress();
                    }}
                    style={{
                      WebkitTouchCallout: 'none',
                      WebkitUserSelect: 'none',
                      touchAction: 'manipulation',
                    }}
                    className={`flex min-h-[44px] select-none items-center gap-3 px-4 py-3 transition hover:bg-surface-2 ${
                      read ? 'text-muted' : 'text-fg'
                    }`}
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                      {read ? (
                        <CheckCircleIcon className="h-5 w-5 text-accent/70" />
                      ) : (
                        <BookOpenIcon className="h-4 w-4 text-faint" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {ch.label}
                        {ch.title ? (
                          <span className="font-normal text-muted">
                            {' · '}
                            {ch.title}
                          </span>
                        ) : null}
                      </span>
                      {ch.group && (
                        <span className="mt-0.5 block truncate text-xs text-faint">
                          {ch.group}
                        </span>
                      )}
                    </span>
                    {ch.pages > 0 && (
                      <span className="shrink-0 text-xs text-faint">
                        {ch.pages}p
                      </span>
                    )}
                  </a>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-line/40 bg-surface/30 px-6 py-12 text-center text-sm text-muted">
          No chapters in {langLabel(lang)} yet. Try another language.
        </div>
      )}

      {menu && menuCh && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden
            onPointerDown={closeMenu}
            onWheel={closeMenu}
            onTouchMove={closeMenu}
            onContextMenu={(e) => {
              e.preventDefault();
              closeMenu();
            }}
          />
          <div
            role="menu"
            aria-label={`${menuCh.label} read controls`}
            className="fixed z-50 w-60 rounded-xl border border-line/70 bg-canvas-2 p-1.5 shadow-card"
            style={{ left: menu.x, top: menu.y }}
          >
            <p className="px-2.5 pb-1 pt-1 text-xs font-semibold text-faint">
              {menuCh.label}
            </p>
            <button
              ref={firstItemRef}
              type="button"
              role="menuitem"
              onClick={() => {
                toggleRead(menuCh);
                closeMenu();
              }}
              className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted transition hover:bg-fg/5 hover:text-fg active:bg-fg/10"
            >
              <CheckCircleIcon
                className={`h-4 w-4 shrink-0 ${
                  menuRead ? 'text-accent' : 'text-faint'
                }`}
                aria-hidden
              />
              {menuRead ? 'Unmark read' : 'Mark read'}
            </button>
            {canMarkUpTo && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  markUpTo(menuCh);
                  closeMenu();
                }}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted transition hover:bg-fg/5 hover:text-fg active:bg-fg/10"
              >
                <CheckCircleIcon
                  className="h-4 w-4 shrink-0 text-faint"
                  aria-hidden
                />
                Mark all up to here
              </button>
            )}
            {canUnmarkFrom && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  unmarkChaptersFrom(anilistId, menuCh.chapterNum);
                  closeMenu();
                }}
                className="flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted transition hover:bg-fg/5 hover:text-fg active:bg-fg/10"
              >
                <XCircleIcon
                  className="h-4 w-4 shrink-0 text-faint"
                  aria-hidden
                />
                <span className="flex flex-col">
                  <span>Unmark from here</span>
                  <span className="text-xs text-muted">
                    Clears this chapter and newer
                  </span>
                </span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ChapterList;
