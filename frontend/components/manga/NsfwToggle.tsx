import { useSyncExternalStore } from 'react';

import { useRouter } from 'next/router';

import { getNsfwClient, setNsfw, subscribeNsfw } from '@utility/nsfw';

import styles from '../../styles/Browse.module.css';

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
    <div className={styles.genres}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={toggle}
        title="Show mature (18+) titles"
      >
        18+ {on ? 'on' : 'off'}
      </button>
    </div>
  );
};

export default NsfwToggle;
