import { useSyncExternalStore } from 'react';

import { createStore } from './externalStore';

// Viewer preference for how anime titles are shown: romaji (Latin-script
// Japanese, the app's long-standing default) or english. Persisted like the
// other prefs and read reactively so a toggle updates every card/heading live.
// Chosen in the avatar menu (AniListAuthButton). Internal uses — companion
// grounding, scrape/filler/Kitsu lookups, SEO <head> meta — deliberately do NOT
// use this; they stay on the stable romaji-first form.

export type TitleLang = 'romaji' | 'english';

const KEY = 'kessoku.titlelang.v1';
const fallback: TitleLang = 'romaji';

const store = createStore<TitleLang>(KEY, fallback);

export const getTitleLang = (): TitleLang => store.get();
export const setTitleLang = (lang: TitleLang): void => store.set(lang);

// `fallback` is a stable reference so getServerSnapshot never trips the
// "getSnapshot should be cached" loop during SSR.
export const useTitleLang = (): TitleLang =>
  useSyncExternalStore(store.subscribe, store.get, () => fallback);

// AniList hands back any of these, each nullable.
export interface AniTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
}

// Resolve a display title for the chosen language, falling back across the
// variants so a title is never blank.
export const pickTitle = (
  title: AniTitle | null | undefined,
  lang: TitleLang
): string => {
  if (!title) return '';
  return lang === 'english'
    ? title.english || title.romaji || title.native || ''
    : title.romaji || title.english || title.native || '';
};

// Convenience for the common component case: one reactive line.
export const useTitle = (title: AniTitle | null | undefined): string =>
  pickTitle(title, useTitleLang());
