import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { NextSeo } from 'next-seo';

import Header from '@components/Header';
import MangaBookmarkButton from '@components/manga/BookmarkButton';
import ChapterList, { ChapterLite } from '@components/manga/ChapterList';
import progressBar from '@components/Progress';
import {
  fetchMangaDetail,
  MangaDetail,
  mangaSearchTitles,
  originLabel,
  defaultWebtoon,
} from '@utility/manga';
import { encodeRef } from '@utility/mangaRef';
import { nsfwFromCookie } from '@utility/nsfw';
import { getMadaraChapters, searchMadara } from '@utility/server/madara';
import {
  chapterGroupName,
  getChapterFeed,
  MdChapter,
  resolveByAniList,
} from '@utility/server/mangadex';
import { getWeebChapters, searchWeeb } from '@utility/server/weebcentral';

const stripHtml = (s: string | null): string =>
  s
    ? s
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim()
    : '';

const chapterNum = (raw: string | null): number => {
  if (!raw) return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
};

const FETCH_LANGS = ['id', 'en', 'ja'];

// One chapter per (lang, number) from the MangaDex feed, preferring the version
// with the most pages, bucketed by language. Ids are encoded as provider refs.
const groupByLang = (chapters: MdChapter[]): Record<string, ChapterLite[]> => {
  const byLang: Record<string, Map<number, ChapterLite>> = {};
  chapters
    .filter((c) => !c.attributes.externalUrl)
    .forEach((c) => {
      const lang = c.attributes.translatedLanguage;
      const n = chapterNum(c.attributes.chapter);
      const lite: ChapterLite = {
        id: encodeRef({ provider: 'md', chapterId: c.id }),
        chapterNum: n,
        label: c.attributes.chapter ? `Ch. ${c.attributes.chapter}` : 'Oneshot',
        title: c.attributes.title || null,
        group: chapterGroupName(c),
        pages: c.attributes.pages ?? 0,
        volume: c.attributes.volume ?? null,
      };
      if (!byLang[lang]) byLang[lang] = new Map();
      const prev = byLang[lang].get(n);
      if (!prev || lite.pages > prev.pages) byLang[lang].set(n, lite);
    });
  return Object.fromEntries(
    Object.entries(byLang).map(([lang, map]) => [
      lang,
      Array.from(map.values()),
    ])
  );
};

interface DetailProps {
  detail: MangaDetail | null;
  chaptersByLang: Record<string, ChapterLite[]>;
  languages: string[];
  defaultLang: string;
  notFoundSource: boolean;
}

export const getServerSideProps: GetServerSideProps<DetailProps> = async ({
  params,
  req,
}) => {
  const id = Number(params?.id);
  if (!Number.isFinite(id)) return { notFound: true };
  const nsfw = nsfwFromCookie(req.headers.cookie);

  const detail = await fetchMangaDetail(id);
  if (!detail) return { notFound: true };

  const titles = mangaSearchTitles(detail);
  const langs = Array.from(
    new Set([...FETCH_LANGS, (detail.countryOfOrigin || '').toLowerCase()])
  ).filter(Boolean);

  // Cap any single provider so one slow source can't hang the whole page (worst
  // case was ~30s). Returns null on timeout, same as a failed lookup.
  const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
    Promise.race([
      p,
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), ms);
      }),
    ]);

  const resolveMd = async (): Promise<Record<string, ChapterLite[]> | null> => {
    try {
      const md = await resolveByAniList(id, titles, nsfw);
      if (!md) return null;
      return groupByLang(await getChapterFeed(md.id, langs, nsfw));
    } catch {
      return null;
    }
  };

  const resolveWeeb = async (): Promise<ChapterLite[] | null> => {
    try {
      const series = await searchWeeb(titles[0] ?? '', titles);
      if (!series) return null;
      const chs = await getWeebChapters(series.id);
      if (!chs.length) return null;
      return chs.map<ChapterLite>((c) => ({
        id: encodeRef({
          provider: 'wc',
          weebSeriesId: series.id,
          chapterId: c.id,
        }),
        chapterNum: c.num,
        label: c.label,
        title: null,
        group: 'Weeb Central',
        pages: 0,
        volume: null,
      }));
    } catch {
      return null;
    }
  };

  const resolveMadara = async (): Promise<ChapterLite[] | null> => {
    try {
      const series = await searchMadara(titles[0] ?? '', titles);
      if (!series) return null;
      const chs = await getMadaraChapters(series.slug);
      if (!chs.length) return null;
      return chs.map<ChapterLite>((c) => ({
        id: encodeRef({
          provider: 'mh',
          madaraSlug: series.slug,
          chapterId: c.slug,
        }),
        chapterNum: c.num,
        label: c.label,
        title: null,
        group: 'manhwatop',
        pages: 0,
        volume: null,
      }));
    } catch {
      return null;
    }
  };

  // MangaDex + Weebcentral first (the fast sources), each capped.
  const [mdChapters, weeb] = await Promise.all([
    withTimeout(resolveMd(), 12000),
    withTimeout(resolveWeeb(), 12000),
  ]);

  // manhwatop is the SLOW path (a residential relay round-trip) and only carries
  // licensed BL/adult the others lack. So only pay it when md + weeb produced no
  // English at all — every MangaDex/Weebcentral-covered title skips the relay.
  const hasEnglish =
    (mdChapters?.en?.length ?? 0) > 0 || (weeb?.length ?? 0) > 0;
  const madara = hasEnglish ? null : await withTimeout(resolveMadara(), 15000);

  const chaptersByLang: Record<string, ChapterLite[]> = {
    ...(mdChapters ?? {}),
  };

  // Merge the English-only providers, filling chapter numbers MangaDex is missing
  // (licensed/adult titles are sparse or empty there). Priority md > wc > mh: the
  // first provider that has a given chapter number wins.
  const enExtra = [...(weeb ?? []), ...(madara ?? [])];
  if (enExtra.length) {
    const byNum = new Map<number, ChapterLite>();
    (chaptersByLang.en ?? []).forEach((c) => byNum.set(c.chapterNum, c));
    enExtra.forEach((c) => {
      if (!byNum.has(c.chapterNum)) byNum.set(c.chapterNum, c);
    });
    chaptersByLang.en = Array.from(byNum.values()).sort(
      (a, b) => a.chapterNum - b.chapterNum
    );
  }

  const notFoundSource = Object.keys(chaptersByLang).length === 0;

  const available = Object.keys(chaptersByLang).sort(
    (a, b) =>
      (chaptersByLang[b]?.length ?? 0) - (chaptersByLang[a]?.length ?? 0)
  );
  const priority = ['id', 'en', 'ja'];
  const languages = [
    ...priority.filter((l) => available.includes(l)),
    ...available.filter((l) => !priority.includes(l)),
  ];
  const defaultLang = languages.find((l) => l === 'id') ?? languages[0] ?? 'en';

  return {
    props: { detail, chaptersByLang, languages, defaultLang, notFoundSource },
  };
};

const MangaDetailPage = ({
  detail,
  chaptersByLang,
  languages,
  defaultLang,
  notFoundSource,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  progressBar.finish();
  if (!detail) return null;

  const title =
    detail.title.english ||
    detail.title.romaji ||
    detail.title.native ||
    'Untitled';
  const cover = detail.coverImage.large || detail.coverImage.medium;
  const desc = stripHtml(detail.description);
  const webtoon = defaultWebtoon(detail.countryOfOrigin);

  return (
    <>
      <NextSeo
        title={`${title} | kessoku moe`}
        description={desc.slice(0, 160)}
      />
      <Header />

      <main className="pb-20">
        {/* Banner */}
        <div className="relative h-44 w-full overflow-hidden sm:h-64 lg:h-80">
          {detail.bannerImage ? (
            <Image
              alt=""
              src={detail.bannerImage}
              layout="fill"
              objectFit="cover"
              objectPosition="center"
              priority
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-surface to-canvas-2" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/60 to-canvas/10" />
        </div>

        <div className="mx-auto -mt-20 w-full max-w-screen-xl px-4 sm:-mt-24 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            {/* Cover (inline aspect-ratio: the core aspectRatio plugin is off, so
                aspect-[2/3] would collapse to 0 height) */}
            <div
              style={{ aspectRatio: '2 / 3' }}
              className="relative w-32 shrink-0 overflow-hidden rounded-2xl bg-surface shadow-lift ring-1 ring-line/40 sm:w-44"
            >
              {cover && (
                <Image
                  alt={title}
                  src={cover}
                  layout="fill"
                  objectFit="cover"
                />
              )}
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="bg-accent/15 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-accent">
                  {originLabel(detail.countryOfOrigin)}
                </span>
                {detail.status && (
                  <span className="rounded-full border border-line/60 px-2.5 py-0.5 text-xs font-medium capitalize text-muted">
                    {detail.status.toLowerCase().replace(/_/g, ' ')}
                  </span>
                )}
                {detail.meanScore && (
                  <span className="rounded-full border border-line/60 px-2.5 py-0.5 text-xs font-medium text-muted">
                    {detail.meanScore}%
                  </span>
                )}
                {detail.isAdult && (
                  <span className="rounded-full border border-accent/50 bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
                    18+
                  </span>
                )}
                {webtoon && (
                  <span className="rounded-full border border-line/60 px-2.5 py-0.5 text-xs font-medium text-muted">
                    Webtoon
                  </span>
                )}
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-4xl">
                {title}
              </h1>
              {detail.title.native && (
                <p className="mt-1 text-sm text-faint">{detail.title.native}</p>
              )}
              <div className="mt-4">
                <MangaBookmarkButton
                  id={detail.id}
                  title={title}
                  cover={cover}
                  country={detail.countryOfOrigin}
                />
              </div>
            </div>
          </div>

          {/* Genres */}
          {detail.genres && detail.genres.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {detail.genres.map((g) => (
                <Link
                  key={g}
                  href={`/manga?genre=${encodeURIComponent(g)}`}
                  passHref
                >
                  <a className="rounded-full border border-line/60 bg-surface/50 px-3 py-1 text-xs font-medium text-muted transition hover:border-accent/60 hover:text-fg">
                    {g}
                  </a>
                </Link>
              ))}
            </div>
          )}

          {/* Description */}
          {desc && (
            <p className="mt-6 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-muted">
              {desc}
            </p>
          )}

          {/* Chapters */}
          <div className="mt-10">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="h-6 w-1 rounded-full bg-aurora" aria-hidden />
              <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
                Chapters
              </h2>
            </div>

            {languages.length > 0 ? (
              <ChapterList
                anilistId={detail.id}
                chaptersByLang={chaptersByLang}
                languages={languages}
                defaultLang={defaultLang}
              />
            ) : (
              <div className="rounded-2xl border border-line/40 bg-surface/30 px-6 py-12 text-center">
                <p className="text-sm font-semibold text-fg">
                  No readable chapters found
                </p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                  {notFoundSource
                    ? "We couldn't match this title to a chapter source yet. It may be filed under a different title, or licensed and pulled from open sources."
                    : 'No chapters are available in these languages right now.'}
                </p>
              </div>
            )}

            <p className="mt-4 text-xs text-faint">
              Chapters via MangaDex, Weeb Central, and the scanlation groups
              credited above. Metadata via AniList.
            </p>
          </div>
        </div>
      </main>
    </>
  );
};

export default MangaDetailPage;
