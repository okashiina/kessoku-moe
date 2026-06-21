import { useSyncExternalStore } from 'react';

import { useRouter } from 'next/router';

import { getNsfwClient, setNsfw, subscribeNsfw } from '@utility/nsfw';

// Adult-content toggle. Default off. Flipping it rewrites the cookie + reloads
// the route so SSR re-runs with the new gate (catalog + chapter resolution).
const NsfwToggle: React.FC = () => {
  const router = useRouter();
  const on = useSyncExternalStore(subscribeNsfw, getNsfwClient, () => false);

  const toggle = () => {
    setNsfw(!on);
    router.replace(router.asPath, undefined, { scroll: false });
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition [touch-action:manipulation] sm:text-sm ${
        on
          ? 'bg-accent/15 border-accent text-accent'
          : 'border-line/70 bg-surface/60 text-muted hover:border-accent/60 hover:text-fg'
      }`}
      title="Show mature (18+) titles"
    >
      <span
        className={`h-2 w-2 rounded-full ${on ? 'bg-accent' : 'bg-faint'}`}
        aria-hidden
      />
      18+ {on ? 'on' : 'off'}
    </button>
  );
};

export default NsfwToggle;
