import { createStore } from './externalStore';

// Reader display preferences, shared across all series (localStorage
// kessoku.readerPrefs.v1). Per-series reading direction is implied by the series
// (manhwa → webtoon), but the user's explicit choice here wins once they set it.

export type ReaderMode = 'rtl' | 'ltr' | 'vertical' | 'webtoon';
export type ReaderFit = 'width' | 'height' | 'original';

export interface ReaderPrefs {
  mode: ReaderMode | null; // null = follow the series default (paged vs webtoon)
  fit: ReaderFit;
  dataSaver: boolean;
}

const DEFAULT: ReaderPrefs = { mode: null, fit: 'width', dataSaver: false };

const store = createStore<ReaderPrefs>('kessoku.readerPrefs.v1', DEFAULT);
export const subscribeReaderPrefs = store.subscribe;
export const getReaderPrefs = (): ReaderPrefs => store.get();
export const READER_PREFS_DEFAULT = DEFAULT;

export function setReaderMode(mode: ReaderMode): void {
  store.update((p) => ({ ...p, mode }));
}
export function setReaderFit(fit: ReaderFit): void {
  store.update((p) => ({ ...p, fit }));
}
export function setDataSaver(dataSaver: boolean): void {
  store.update((p) => ({ ...p, dataSaver }));
}

export const MODE_LABEL: Record<ReaderMode, string> = {
  rtl: 'Paged ←',
  ltr: 'Paged →',
  vertical: 'Vertical',
  webtoon: 'Webtoon',
};
