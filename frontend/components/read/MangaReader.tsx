import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import Link from 'next/link';
import { useRouter } from 'next/router';

import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CogIcon,
  PhotographIcon,
} from '@heroicons/react/solid';

import { markChapterRead, saveMangaPosition } from '@utility/mangaProgress';
import {
  getReaderPrefs,
  MODE_LABEL,
  READER_PREFS_DEFAULT,
  ReaderMode,
  setDataSaver,
  setReaderFit,
  setReaderMode,
  subscribeReaderPrefs,
} from '@utility/readerPrefs';

export interface ReaderSibling {
  id: string;
  num: number;
  label: string;
}

export interface MangaReaderProps {
  chapterId: string;
  anilistId: number | null;
  seriesTitle: string;
  cover: string | null;
  chapterNum: number;
  chapterLabel: string;
  lang: string;
  group: string | null;
  siblings: ReaderSibling[]; // ascending by chapter number
  webtoonDefault: boolean;
}

interface PagesResponse {
  pages: string[];
  pagesDataSaver: string[];
}

const MangaReader: React.FC<MangaReaderProps> = ({
  chapterId,
  anilistId,
  seriesTitle,
  cover,
  chapterNum,
  chapterLabel,
  lang,
  group,
  siblings,
  webtoonDefault,
}) => {
  const router = useRouter();
  const prefs = useSyncExternalStore(
    subscribeReaderPrefs,
    getReaderPrefs,
    () => READER_PREFS_DEFAULT
  );

  const mode: ReaderMode = prefs.mode ?? (webtoonDefault ? 'webtoon' : 'rtl');
  const continuous = mode === 'webtoon' || mode === 'vertical';

  const [data, setData] = useState<PagesResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  );
  const [page, setPage] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  const pages = useMemo(() => {
    if (!data) return [];
    return prefs.dataSaver ? data.pagesDataSaver : data.pages;
  }, [data, prefs.dataSaver]);

  const idx = siblings.findIndex((s) => s.id === chapterId);
  const prevChapter = idx > 0 ? siblings[idx - 1] : null;
  const nextChapter =
    idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;

  // Warm the NEXT chapter's first images so turning the page feels instant.
  // Best-effort, client-only, no server change. Guarded to fire once per
  // next-chapter id (no refetch loop). SSR-safe (runs in useEffect only).
  const prefetchedRef = useRef<string | null>(null);
  const nearEnd = continuous
    ? // ponytail: webtoon/vertical has no cheap "near bottom" signal at this
      // point, so prefetch on mount once pages are ready — good enough.
      status === 'ready'
    : pages.length > 0 && page >= pages.length - 2;
  useEffect(() => {
    const nextId = nextChapter?.id;
    let cancelled = false;
    if (nextId && nearEnd && prefetchedRef.current !== nextId) {
      prefetchedRef.current = nextId;
      fetch(`/api/manga/chapter/${nextId}/pages`)
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((j: PagesResponse) => {
          if (cancelled) return;
          const list = prefs.dataSaver ? j.pagesDataSaver : j.pages;
          // ponytail: warm only the first 3 images, not the whole chapter.
          (list || []).slice(0, 3).forEach((src) => {
            const img = new Image();
            img.src = src;
          });
        })
        .catch(() => {
          // Best-effort: allow a later retry for this id if the fetch failed.
          if (prefetchedRef.current === nextId) prefetchedRef.current = null;
        });
    }
    return () => {
      cancelled = true;
    };
  }, [nextChapter?.id, nearEnd, prefs.dataSaver]);

  // Fetch page list on chapter change.
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    setData(null);
    setPage(0);
    fetch(`/api/manga/chapter/${chapterId}/pages`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: PagesResponse) => {
        if (!alive) return;
        setData(j);
        setStatus('ready');
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, [chapterId]);

  // Persist progress (chapter open + page moves). Only when we know the series.
  const persist = useCallback(
    (p: number, total: number) => {
      if (anilistId == null) return;
      saveMangaPosition(anilistId, {
        ch: chapterNum,
        chapterId,
        page: p,
        pages: total,
        total: siblings.length,
        lang,
        title: seriesTitle,
        cover,
      });
    },
    [
      anilistId,
      chapterNum,
      chapterId,
      siblings.length,
      lang,
      seriesTitle,
      cover,
    ]
  );

  useEffect(() => {
    if (status === 'ready' && pages.length) persist(0, pages.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, pages.length]);

  const markDone = useCallback(() => {
    if (anilistId != null) markChapterRead(anilistId, chapterNum);
  }, [anilistId, chapterNum]);

  const goChapter = (s: ReaderSibling | null) => {
    if (!s) return;
    const al = anilistId != null ? `?al=${anilistId}` : '';
    router.push(`/read/${s.id}${al}`);
  };

  // ---- Paged navigation ----
  const setPagePersist = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(pages.length - 1, next));
      setPage(clamped);
      persist(clamped, pages.length);
      if (clamped === pages.length - 1) markDone();
    },
    [pages.length, persist, markDone]
  );

  const advance = useCallback(
    (dir: 1 | -1) => {
      if (dir === 1) {
        if (page >= pages.length - 1) {
          markDone();
          goChapter(nextChapter);
        } else setPagePersist(page + 1);
      } else if (page <= 0) {
        goChapter(prevChapter);
      } else setPagePersist(page - 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [page, pages.length, nextChapter, prevChapter, setPagePersist, markDone]
  );

  // Escape closes the settings sheet.
  useEffect(() => {
    if (!showSettings) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSettings(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSettings]);

  // Keyboard (paged only).
  useEffect(() => {
    if (continuous) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') advance(mode === 'rtl' ? -1 : 1);
      else if (e.key === 'ArrowLeft') advance(mode === 'rtl' ? 1 : -1);
      else if (e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        advance(1);
      } else if (e.key === 'ArrowUp') advance(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [continuous, mode, advance]);

  // Continuous: track which page is in view + mark read at the bottom.
  useEffect(() => {
    if (!continuous || status !== 'ready') return undefined;
    const el = scrollRef.current;
    if (!el) return undefined;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const imgs = el.querySelectorAll('[data-page]');
        const mid = el.scrollTop + el.clientHeight / 2;
        let current = 0;
        imgs.forEach((img) => {
          const node = img as HTMLElement;
          if (node.offsetTop <= mid) current = Number(node.dataset.page);
        });
        setPage(current);
        persist(current, pages.length);
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) markDone();
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [continuous, status, pages.length, persist, markDone]);

  // Fit classes for paged images.
  const FIT_CLASS: Record<typeof prefs.fit, string> = {
    height: 'max-h-full w-auto',
    original: 'max-w-none',
    width: 'w-auto max-w-full sm:max-w-3xl',
  };
  const fitClass = FIT_CLASS[prefs.fit];

  const detailHref = anilistId != null ? `/manga/${anilistId}` : '/manga';

  return (
    <div className="fixed inset-0 z-[60] flex h-[100dvh] flex-col bg-black text-white [touch-action:manipulation]">
      {/* Top chrome */}
      <header
        className={`absolute inset-x-0 top-0 z-30 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-3 py-2 transition-opacity duration-300 motion-reduce:transition-none ${
          chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        <Link href={detailHref} passHref>
          <a
            aria-label="Back to series"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/90 transition [touch-action:manipulation] hover:bg-white/10"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </a>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{seriesTitle}</p>
          <p className="truncate text-xs text-white/60">
            {chapterLabel}
            {group ? ` · ${group}` : ''} · {lang.toUpperCase()}
          </p>
        </div>
        <button
          type="button"
          aria-label="Reader settings"
          onClick={() => setShowSettings((v) => !v)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/90 transition [touch-action:manipulation] hover:bg-white/10"
        >
          <CogIcon className="h-5 w-5" />
        </button>
      </header>

      {/* Settings sheet */}
      {showSettings && (
        <>
          {/* tap-outside scrim (also gives Android back something to close) */}
          <button
            type="button"
            aria-label="Close settings"
            onClick={() => setShowSettings(false)}
            className="absolute inset-0 z-30 bg-black/40"
          />
          <div
            className="absolute inset-x-0 top-12 z-40 mx-auto w-[calc(100%-1.5rem)] max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-zinc-900/95 p-4 shadow-xl backdrop-blur"
            style={{
              top: 'max(3rem, calc(env(safe-area-inset-top) + 2.75rem))',
              maxHeight: '80svh',
              paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
            }}
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
              Reading mode
            </p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {(Object.keys(MODE_LABEL) as ReaderMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setReaderMode(m)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    mode === m
                      ? 'bg-accent text-accent-ink'
                      : 'bg-white/5 text-white/80 hover:bg-white/10'
                  }`}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>

            {!continuous && (
              <>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/50">
                  Fit
                </p>
                <div className="mb-4 grid grid-cols-3 gap-2">
                  {(['width', 'height', 'original'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setReaderFit(f)}
                      className={`rounded-lg px-3 py-2 text-sm font-medium capitalize transition ${
                        prefs.fit === f
                          ? 'bg-accent text-accent-ink'
                          : 'bg-white/5 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </>
            )}

            <label className="flex min-h-[44px] items-center justify-between rounded-lg bg-white/5 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm text-white/80">
                <PhotographIcon className="h-4 w-4" /> Data saver
              </span>
              <input
                type="checkbox"
                checked={prefs.dataSaver}
                onChange={(e) => setDataSaver(e.target.checked)}
                className="h-5 w-5 accent-pink-500"
              />
            </label>
          </div>
        </>
      )}

      {/* Body */}
      {status === 'loading' && (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80 motion-reduce:animate-none" />
        </div>
      )}

      {status === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm text-white/70">
            Couldn&apos;t load this chapter&apos;s pages. The source may be
            temporarily unavailable.
          </p>
          <Link href={detailHref} passHref>
            <a className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold transition hover:bg-white/20">
              Back to chapters
            </a>
          </Link>
        </div>
      )}

      {status === 'ready' && continuous && (
        <div
          ref={scrollRef}
          onClick={() => setChromeVisible((v) => !v)}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        >
          <div
            className={`mx-auto flex w-full max-w-3xl flex-col items-center ${
              mode === 'vertical' ? 'gap-2 py-2' : 'gap-0'
            }`}
          >
            {pages.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                data-page={i}
                src={src}
                alt={`Page ${i + 1}`}
                loading={i < 2 ? 'eager' : 'lazy'}
                draggable={false}
                className="block w-full select-none [-webkit-touch-callout:none] [-webkit-user-drag:none]"
              />
            ))}
          </div>
          {/* End-of-chapter footer */}
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="text-sm text-white/60">End of {chapterLabel}</p>
            {nextChapter ? (
              <button
                type="button"
                onClick={() => goChapter(nextChapter)}
                className="rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-accent-ink"
              >
                Next: {nextChapter.label}
              </button>
            ) : (
              <Link href={detailHref} passHref>
                <a className="rounded-full bg-white/10 px-6 py-2.5 text-sm font-semibold">
                  Back to chapters
                </a>
              </Link>
            )}
          </div>
        </div>
      )}

      {status === 'ready' && !continuous && pages.length > 0 && (
        <div className="relative flex flex-1 items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pages[page]}
            alt={`Page ${page + 1}`}
            draggable={false}
            className={`max-h-full select-none object-contain [-webkit-touch-callout:none] [-webkit-user-drag:none] ${fitClass}`}
          />
          {/* Preload neighbours */}
          {[page + 1, page + 2].map((p) =>
            pages[p] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p} src={pages[p]} alt="" className="hidden" />
            ) : null
          )}

          {/* Tap zones (rtl: left=next, right=prev) */}
          <button
            type="button"
            aria-label={mode === 'rtl' ? 'Next page' : 'Previous page'}
            onClick={() => advance(mode === 'rtl' ? 1 : -1)}
            className="absolute inset-y-0 left-0 w-1/3 select-none [touch-action:manipulation]"
          />
          <button
            type="button"
            aria-label="Toggle controls"
            onClick={() => setChromeVisible((v) => !v)}
            className="absolute inset-y-0 left-1/3 w-1/3 select-none [touch-action:manipulation]"
          />
          <button
            type="button"
            aria-label={mode === 'rtl' ? 'Previous page' : 'Next page'}
            onClick={() => advance(mode === 'rtl' ? -1 : 1)}
            className="absolute inset-y-0 right-0 w-1/3 select-none [touch-action:manipulation]"
          />
        </div>
      )}

      {/* Bottom chrome (paged: counter + chapter nav) */}
      {status === 'ready' && (
        <footer
          className={`absolute inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 transition-opacity duration-300 motion-reduce:transition-none ${
            chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            disabled={!prevChapter}
            onClick={() => goChapter(prevChapter)}
            className="flex min-h-[44px] items-center gap-1 rounded-full bg-white/10 px-4 py-2.5 text-sm font-medium transition [touch-action:manipulation] hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronLeftIcon className="h-4 w-4" /> Prev
          </button>
          <span className="text-xs font-medium text-white/70">
            {continuous ? chapterLabel : `${page + 1} / ${pages.length || '…'}`}
          </span>
          <button
            type="button"
            disabled={!nextChapter}
            onClick={() => goChapter(nextChapter)}
            className="flex min-h-[44px] items-center gap-1 rounded-full bg-white/10 px-4 py-2.5 text-sm font-medium transition [touch-action:manipulation] hover:bg-white/20 disabled:opacity-30"
          >
            Next <ChevronRightIcon className="h-4 w-4" />
          </button>
        </footer>
      )}
    </div>
  );
};

export default MangaReader;
