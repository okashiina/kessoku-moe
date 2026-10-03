import Image from 'next/image';
import Link from 'next/link';

import { AnimeInfoFragment } from '@animeflix/api/aniList';
import { XIcon } from '@heroicons/react/outline';

import { removeContinue, type ProgressEntry } from '@utility/progress';
import { useTitle } from '@utility/titleLang';

export interface ContinueWatchingCardProps {
  anime: AnimeInfoFragment;
  entry: ProgressEntry;
}

const ContinueWatchingCard: React.FC<ContinueWatchingCardProps> = ({
  anime,
  entry,
}) => {
  const title = useTitle(anime.title);
  const cover = anime.coverImage?.large || anime.coverImage?.medium;
  const progress =
    entry.dur > 0
      ? Math.min(100, Math.max(0, Math.round((entry.sec / entry.dur) * 100)))
      : null;
  const minutesLeft =
    entry.dur > 0 ? Math.max(0, Math.ceil((entry.dur - entry.sec) / 60)) : null;

  return (
    <article className="group relative w-[264px] shrink-0 snap-start overflow-hidden rounded-xl border border-line/50 bg-surface/70 transition-colors focus-within:border-accent/50 hover:border-accent/50 sm:w-[292px]">
      <Link href={`/watch/${anime.id}?episode=${entry.ep}`} passHref>
        <a
          className="flex min-h-[108px] gap-3 p-2.5 pr-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          aria-label={`Resume ${title}, episode ${entry.ep}`}
        >
          <div className="relative h-[88px] w-[62px] shrink-0 overflow-hidden rounded-md bg-canvas">
            {cover && (
              <Image
                src={cover}
                alt=""
                layout="fill"
                objectFit="cover"
                sizes="62px"
              />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <h3 className="text-sm font-semibold leading-snug text-fg line-clamp-2">
              {title}
            </h3>
            <p className="mt-1 text-xs text-faint">
              Episode {entry.ep}
              {minutesLeft !== null ? ` · ${minutesLeft} min left` : ''}
            </p>
            {progress !== null && (
              <div
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"
                role="progressbar"
                aria-label="Episode progress"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        </a>
      </Link>

      <button
        type="button"
        aria-label={`Remove ${title} from continue watching`}
        onClick={() => removeContinue(anime.id)}
        className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center rounded-full text-faint transition-colors hover:bg-canvas hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <XIcon className="h-4 w-4" aria-hidden />
      </button>
    </article>
  );
};

export default ContinueWatchingCard;
