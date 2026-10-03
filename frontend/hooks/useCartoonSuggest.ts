import { useEffect, useState } from 'react';

import type { CartoonSuggestion } from '@utility/cartoon';

const useCartoonSuggest = (term: string) => {
  const [state, setState] = useState<{
    results: CartoonSuggestion[];
    loading: boolean;
  }>({ results: [], loading: false });

  useEffect(() => {
    const query = term.trim();
    const controller = new AbortController();
    if (query.length < 2) {
      setState({ results: [], loading: false });
      return undefined;
    }
    setState({ results: [], loading: true });
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/cartoon/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error('Cartoon search unavailable');
        const data = await response.json();
        if (!controller.signal.aborted)
          setState({ results: data.results || [], loading: false });
      } catch {
        if (!controller.signal.aborted)
          setState({ results: [], loading: false });
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  return state;
};

export default useCartoonSuggest;
