import { GetServerSideProps, InferGetServerSidePropsType } from 'next';

import { NextSeo } from 'next-seo';

import MangaReader, { ReaderSibling } from '@components/read/MangaReader';
import { defaultWebtoon, fetchMangaDetail } from '@utility/manga';
import { decodeRef, encodeRef } from '@utility/mangaRef';
import { nsfwFromCookie } from '@utility/nsfw';
import { getMadaraChapters } from '@utility/server/madara';
import {
  chapterGroupName,
  chapterMangaId,
  getChapter,
  getChapterFeed,
  getManga,
} from '@utility/server/mangadex';
import { getWeebChapters } from '@utility/server/weebcentral';

const num = (raw: string | null): number => {
  if (!raw) return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
};

interface ReadProps {
  chapterId: string;
  anilistId: number | null;
  seriesTitle: string;
  cover: string | null;
  chapterNum: number;
  chapterLabel: string;
  lang: string;
  group: string | null;
  siblings: ReaderSibling[];
  webtoonDefault: boolean;
}

export const getServerSideProps: GetServerSideProps<ReadProps> = async ({
  params,
  query,
  req,
}) => {
  const raw = typeof params?.id === 'string' ? params.id : '';
  const ref = decodeRef(raw);
  if (!ref) return { notFound: true };

  const nsfw = nsfwFromCookie(req.headers.cookie);
  const anilistId = Number(query.al);
  const hasAniList = Number.isFinite(anilistId) && anilistId > 0;

  // Series context from AniList (covers not blocked, consistent with catalog).
  let seriesTitle = '';
  let cover: string | null = null;
  let webtoonDefault = false;
  if (hasAniList) {
    const detail = await fetchMangaDetail(anilistId);
    if (detail) {
      seriesTitle =
        detail.title.english ||
        detail.title.romaji ||
        detail.title.native ||
        '';
      cover = detail.coverImage.large || detail.coverImage.medium || null;
      webtoonDefault = defaultWebtoon(detail.countryOfOrigin);
    }
  }

  let siblings: ReaderSibling[] = [];
  let lang = 'en';
  let chapterNum = 0;
  let chapterLabel = '';
  let group: string | null = null;

  if (ref.provider === 'wc') {
    // Weebcentral: all chapters one language (English); series id is in the ref.
    const chs = ref.weebSeriesId ? await getWeebChapters(ref.weebSeriesId) : [];
    siblings = chs.map((c) => ({
      id: encodeRef({
        provider: 'wc',
        weebSeriesId: ref.weebSeriesId,
        chapterId: c.id,
      }),
      num: c.num,
      label: c.label,
    }));
    const cur = chs.find((c) => c.id === ref.chapterId);
    chapterNum = cur?.num ?? 0;
    chapterLabel = cur?.label ?? 'Chapter';
    group = 'Weeb Central';
  } else if (ref.provider === 'mh') {
    // manhwatop (Madara): English; series slug in the ref.
    const chs = ref.madaraSlug ? await getMadaraChapters(ref.madaraSlug) : [];
    siblings = chs.map((c) => ({
      id: encodeRef({
        provider: 'mh',
        madaraSlug: ref.madaraSlug,
        chapterId: c.slug,
      }),
      num: c.num,
      label: c.label,
    }));
    const cur = chs.find((c) => c.slug === ref.chapterId);
    chapterNum = cur?.num ?? 0;
    chapterLabel = cur?.label ?? 'Chapter';
    group = 'manhwatop';
  } else {
    // MangaDex.
    const chapter = await getChapter(ref.chapterId);
    if (!chapter) return { notFound: true };
    lang = chapter.attributes.translatedLanguage;
    group = chapterGroupName(chapter);
    const mangaId = chapterMangaId(chapter);
    if (mangaId) {
      try {
        const feed = await getChapterFeed(mangaId, [lang], nsfw);
        const seen = new Map<number, ReaderSibling>();
        feed
          .filter((c) => !c.attributes.externalUrl)
          .forEach((c) => {
            const n = num(c.attributes.chapter);
            if (!seen.has(n)) {
              seen.set(n, {
                id: encodeRef({ provider: 'md', chapterId: c.id }),
                num: n,
                label: c.attributes.chapter
                  ? `Ch. ${c.attributes.chapter}`
                  : 'Oneshot',
              });
            }
          });
        siblings = Array.from(seen.values()).sort((a, b) => a.num - b.num);
      } catch {
        siblings = [];
      }
    }
    chapterNum = num(chapter.attributes.chapter);
    chapterLabel = chapter.attributes.chapter
      ? `Ch. ${chapter.attributes.chapter}`
      : 'Oneshot';

    if (!seriesTitle && mangaId) {
      const md = await getManga(mangaId);
      if (md) {
        const t = md.attributes.title;
        seriesTitle = t.en || t['ja-ro'] || Object.values(t)[0] || 'Manga';
        const ol = md.attributes.originalLanguage;
        webtoonDefault = ol === 'ko' || ol === 'zh' || ol === 'zh-hk';
      }
    }
  }

  // Prefer the matched sibling's number/label (cleaner).
  const current = siblings.find((s) => s.id === raw);
  if (current) {
    chapterNum = current.num;
    chapterLabel = current.label;
  }

  return {
    props: {
      chapterId: raw,
      anilistId: hasAniList ? anilistId : null,
      seriesTitle: seriesTitle || 'Manga',
      cover,
      chapterNum,
      chapterLabel,
      lang,
      group,
      siblings,
      webtoonDefault,
    },
  };
};

const ReadPage = (
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) => (
  <>
    <NextSeo
      title={`${props.seriesTitle} ${props.chapterLabel} | kessoku moe`}
      noindex
    />
    <MangaReader {...props} />
  </>
);

export default ReadPage;
