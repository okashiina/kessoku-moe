import Image from 'next/image';
import Link from 'next/link';

import { AnimeInfoFragment } from '@animeflix/api/aniList';
import { PlayIcon, XIcon } from '@heroicons/react/solid';

import { base64SolidImage } from '@utility/image';
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
  const src =
    anime.bannerImage ||
    anime.coverImage?.large ||
    anime.coverImage?.medium ||
    '';

  const progress =
    entry.dur > 0
      ? Math.min(100, Math.max(0, (entry.sec / entry.dur) * 100))
      : 0;
  const minutesLeft =
    entry.dur > 0 ? Math.max(0, Math.round((entry.dur - entry.sec) / 60)) : 0;

  return (
    <Link href={`/watch/${anime.id}?episode=${entry.ep}`} passHref>
      <a className="group block w-64 shrink-0 snap-start sm:w-72">
        {/* 16:9 landscape. The aspect-ratio plugin absolutely-positions the
            SINGLE direct child to fill, so all overlays live inside it. */}
        <div className="aspect-w-16 aspect-h-9 w-full">
          <div className="overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-line/40 transition duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-lift group-hover:ring-2 group-hover:ring-accent/50">
            <Image
              alt={`Banner for ${title}`}
              src={src}
              layout="fill"
              objectFit="cover"
              objectPosition="center"
              className="transition duration-500 ease-out group-hover:scale-105"
              placeholder="blur"
              blurDataURL={`data:image/svg+xml;base64,${base64SolidImage(
                anime.coverImage?.color || '#1a1626'
              )}`}
            />

            <div className="from-canvas/85 pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t via-canvas/20 to-transparent" />

            <button
              type="button"
              aria-label={`Remove ${title} from continue watching`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeContinue(anime.id);
              }}
              className="bg-canvas/65 absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-fg opacity-0 backdrop-blur-sm transition duration-200 hover:bg-canvas hover:text-accent focus-visible:opacity-100 group-hover:opacity-100"
            >
              <XIcon className="h-4 w-4" />
            </button>

            <span className="absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-aurora text-accent-ink shadow-glow">
                <PlayIcon className="ml-0.5 h-6 w-6" />
              </span>
            </span>

            {entry.dur > 0 && (
              <div className="absolute inset-x-0 bottom-0 h-1 bg-fg/20">
                <div
                  className="h-full bg-aurora"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-2.5">
          <p className="text-sm font-semibold leading-snug text-fg transition line-clamp-1 group-hover:text-accent">
            {title}
          </p>
          <p className="mt-1 text-xs text-faint">
            Ep {entry.ep}
            {entry.dur > 0 ? ` · ${minutesLeft} min left` : ''}
          </p>
        </div>
      </a>
    </Link>
  );
};

export default ContinueWatchingCard;
