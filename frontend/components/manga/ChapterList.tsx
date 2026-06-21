import { useMemo, useState, useSyncExternalStore } from 'react';

import Link from 'next/link';

import { BookOpenIcon, CheckCircleIcon } from '@heroicons/react/solid';

import { getMangaEntry, subscribeMangaProgress } from '@utility/mangaProgress';

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
}

const ChapterList: React.FC<ChapterListProps> = ({
  anilistId,
  chaptersByLang,
  languages,
  defaultLang,
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
  const resuming = Boolean(entry?.chapterId && entry.lang === lang);

  let resumeHref: string | null = null;
  if (resuming) resumeHref = `/read/${entry?.chapterId}?al=${anilistId}`;
  else if (first) resumeHref = `/read/${first.id}?al=${anilistId}`;

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

      {/* Chapter rows */}
      {sorted.length > 0 ? (
        <ul className="divide-y divide-line/40 overflow-hidden rounded-2xl border border-line/40 bg-surface/30">
          {sorted.map((ch) => {
            const read = readSet.has(ch.chapterNum);
            return (
              <li key={ch.id}>
                <Link href={`/read/${ch.id}?al=${anilistId}`} passHref>
                  <a
                    className={`flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2 ${
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
    </div>
  );
};

export default ChapterList;
