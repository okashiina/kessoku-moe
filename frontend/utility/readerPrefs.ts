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
  autoScrollSpeed: number; // CSS pixels per second; auto-scroll itself is session-only
}

export const AUTO_SCROLL_SPEED_MIN = 20;
export const AUTO_SCROLL_SPEED_MAX = 180;
export const AUTO_SCROLL_SPEED_STEP = 10;

const DEFAULT: ReaderPrefs = {
  mode: null,
  fit: 'width',
  dataSaver: false,
  autoScrollSpeed: 60,
};

const READER_MODES: ReaderMode[] = ['rtl', 'ltr', 'vertical', 'webtoon'];
const READER_FITS: ReaderFit[] = ['width', 'height', 'original'];

function clampAutoScrollSpeed(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT.autoScrollSpeed;
  }
  return Math.min(
    AUTO_SCROLL_SPEED_MAX,
    Math.max(AUTO_SCROLL_SPEED_MIN, value)
  );
}

function parseReaderPrefs(raw: string): ReaderPrefs {
  const parsed = JSON.parse(raw) as Partial<ReaderPrefs> | null;
  return {
    mode:
      parsed?.mode != null && READER_MODES.includes(parsed.mode)
        ? parsed.mode
        : null,
    fit:
      parsed?.fit != null && READER_FITS.includes(parsed.fit)
        ? parsed.fit
        : DEFAULT.fit,
    dataSaver:
      typeof parsed?.dataSaver === 'boolean'
        ? parsed.dataSaver
        : DEFAULT.dataSaver,
    autoScrollSpeed: clampAutoScrollSpeed(parsed?.autoScrollSpeed),
  };
}

const store = createStore<ReaderPrefs>(
  'kessoku.readerPrefs.v1',
  DEFAULT,
  parseReaderPrefs
);
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
export function setAutoScrollSpeed(autoScrollSpeed: number): void {
  store.update((p) => ({
    ...p,
    autoScrollSpeed: clampAutoScrollSpeed(autoScrollSpeed),
  }));
}

export const MODE_LABEL: Record<ReaderMode, string> = {
  rtl: 'Paged ←',
  ltr: 'Paged →',
  vertical: 'Vertical',
  webtoon: 'Webtoon',
};
