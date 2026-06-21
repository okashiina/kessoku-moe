// Chapter reference encoding — lets one /read/[id] route and one pages API serve
// multiple providers. A ref is URL-path-safe (no colons), self-contained (carries
// the Weebcentral series id so resume links work without extra query params), and
// unambiguous because MangaDex chapter ids are UUIDs and Weebcentral ids are
// alphanumeric — neither contains an underscore, which we use as the separator.
//
//   MangaDex:    md_<chapterUuid>
//   Weebcentral: wc_<seriesId>_<chapterId>
//   Madara:      mh_<seriesSlug>_<chapterSlug>   (slugs are [a-z0-9-], no underscore)

export type MangaProvider = 'md' | 'wc' | 'mh';

export interface ChapterRef {
  provider: MangaProvider;
  chapterId: string;
  weebSeriesId?: string;
  madaraSlug?: string;
}

export function encodeRef(r: ChapterRef): string {
  if (r.provider === 'wc') return `wc_${r.weebSeriesId}_${r.chapterId}`;
  if (r.provider === 'mh') return `mh_${r.madaraSlug}_${r.chapterId}`;
  return `md_${r.chapterId}`;
}

export function decodeRef(ref: string): ChapterRef | null {
  const parts = ref.split('_');
  if (parts[0] === 'md' && parts[1]) {
    return { provider: 'md', chapterId: parts.slice(1).join('_') };
  }
  if (parts[0] === 'wc' && parts[1] && parts[2]) {
    return {
      provider: 'wc',
      weebSeriesId: parts[1],
      chapterId: parts.slice(2).join('_'),
    };
  }
  if (parts[0] === 'mh' && parts[1] && parts[2]) {
    return {
      provider: 'mh',
      madaraSlug: parts[1],
      chapterId: parts.slice(2).join('_'),
    };
  }
  return null;
}
