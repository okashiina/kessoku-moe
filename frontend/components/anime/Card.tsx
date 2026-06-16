import Image from 'next/image';
import Link from 'next/link';

import { AnimeInfoFragment } from '@animeflix/api/aniList';
import { PlayIcon } from '@heroicons/react/solid';

import WatchlistButton from '@components/anime/WatchlistButton';
import { base64SolidImage } from '@utility/image';
import { useTitle } from '@utility/titleLang';

export interface CardProps {
  anime: AnimeInfoFragment;
}

const Card: React.FC<CardProps> = ({ anime }) => {
  const title = useTitle(anime.title);

  return (
    <Link href={`/anime/${anime.id}`} passHref>
      <a className="group block w-36 shrink-0 snap-start sm:w-44">
        {/* aspect-ratio plugin absolutely-positions the SINGLE direct child to fill,
            so all overlays live inside this one wrapper. */}
        <div className="aspect-w-2 aspect-h-3 w-full">
          {/* No `relative` here: the aspect-ratio plugin forces this direct child to
              position:absolute (filling the box), which already anchors the overlays.
              Adding `relative` would override that and collapse the box to 0 height. */}
          <div className="overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-line/40 transition duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-lift group-hover:ring-2 group-hover:ring-accent/50">
            <Image
              alt={`Cover for ${title}`}
              src={anime.coverImage.large || anime.coverImage.medium}
              layout="fill"
              objectFit="cover"
              objectPosition="center"
              className="transition duration-500 ease-out group-hover:scale-105"
              placeholder="blur"
              blurDataURL={`data:image/svg+xml;base64,${base64SolidImage(
                anime.coverImage.color
              )}`}
            />

            <div className="from-canvas/85 pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t via-canvas/20 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />

            {anime.meanScore && (
              <span className="bg-canvas/65 absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold text-fg backdrop-blur-sm">
                {anime.meanScore}%
              </span>
            )}

            {/* Bookmark overlay, mirroring the score badge top-right. Lives inside
                the card's <a>; the button stops propagation so it won't navigate. */}
            <div className="pointer-events-auto absolute left-2 top-2 opacity-0 transition group-hover:opacity-100">
              <WatchlistButton id={anime.id} variant="icon" />
            </div>

            {/* Decorative play affordance. pointer-events-none so it doesn't
                cover the bookmark button below it (the whole card is the link). */}
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-aurora text-accent-ink shadow-glow">
                <PlayIcon className="ml-0.5 h-6 w-6" />
              </span>
            </span>
          </div>
        </div>

        <div className="mt-2.5">
          <p className="min-h-[2.5rem] text-sm font-semibold leading-snug text-fg transition line-clamp-2 group-hover:text-accent">
            {title}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-faint">
            {anime.format && <span>{anime.format}</span>}
            {anime.format && anime.duration && (
              <span aria-hidden className="opacity-50">
                •
              </span>
            )}
            {anime.duration && <span>{anime.duration} min</span>}
          </div>
        </div>
      </a>
    </Link>
  );
};

export default Card;
