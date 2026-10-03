import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';
const subscribe = (listener: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};
const getSnapshot = () => window.matchMedia(QUERY).matches;
const getServerSnapshot = () => false;

// Keep the server and first client render identical before reading preferences.
const useReducedMotion = () =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

export default useReducedMotion;
