import { useSyncExternalStore } from 'react';

import Link from 'next/link';

import { XIcon } from '@heroicons/react/outline';

import SectionHeading from '@components/home/SectionHeading';
import styles from '@styles/Home.module.css';
import {
  CARTOON_CONTINUE_EMPTY,
  listCartoonContinue,
  removeCartoonContinue,
  subscribeCartoonProgress,
} from '@utility/cartoonProgress';

const CartoonContinueWatching = () => {
  const items = useSyncExternalStore(
    subscribeCartoonProgress,
    listCartoonContinue,
    () => CARTOON_CONTINUE_EMPTY
  );
  if (!items.length) return null;

  return (
    <section className={styles.section} aria-label="Continue watching">
      <SectionHeading title="Continue watching" />
      <div
        tabIndex={0}
        aria-label="Continue watching titles, scroll horizontally for more"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden pb-2 outline-none scrollbar-hide focus-visible:ring-2 focus-visible:ring-accent"
      >
        {items.map((item) => (
          <article
            key={item.id}
            className="group relative w-[264px] shrink-0 snap-start overflow-hidden rounded-xl border border-line/50 bg-surface/70 transition-colors focus-within:border-accent/50 hover:border-accent/50 sm:w-[292px]"
          >
            <Link
              href={`/cartoon/${item.id}?season=${item.season}&episode=${item.episode}`}
              passHref
            >
              <a
                className="flex min-h-[108px] gap-3 p-2.5 pr-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                aria-label={`Resume ${item.title}, season ${item.season}, episode ${item.episode}`}
              >
                <div className="relative h-[88px] w-[62px] shrink-0 overflow-hidden rounded-md bg-canvas">
                  {item.cover && (
                    // eslint-disable-next-line @next/next/no-img-element -- TVMaze CDN images are already resized.
                    <img
                      src={item.cover}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <h3 className="text-sm font-semibold leading-snug text-fg line-clamp-2">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-xs text-faint">
                    Season {item.season} · Episode {item.episode}
                  </p>
                </div>
              </a>
            </Link>
            <button
              type="button"
              aria-label={`Remove ${item.title} from continue watching`}
              onClick={() => removeCartoonContinue(item.id)}
              className="absolute right-0 top-0 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-faint transition-colors hover:bg-canvas hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <XIcon className="h-4 w-4" aria-hidden />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
};

export default CartoonContinueWatching;
