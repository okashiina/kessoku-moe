import Image from 'next/image';
import Link from 'next/link';

import { AnimeBannerFragment, AnimeInfoFragment } from '@animeflix/api/aniList';
import { EpisodeInfoFragment } from '@animeflix/api/kitsu';
import { PlayIcon } from '@heroicons/react/solid';

export interface CardProps {
  anime: AnimeBannerFragment & AnimeInfoFragment;
  number: number;
  episode?: EpisodeInfoFragment | null;
}

const Card: React.FC<CardProps> = ({ anime, number, episode }) => {
  const title = episode ? episode.titles.canonical : `Episode ${number}`;

  return (
    <Link href={`/watch/${anime.id}?episode=${number}`} passHref>
      <a className="group block w-64 shrink-0 snap-start sm:w-72">
        {/* aspect-ratio plugin absolutely-positions the SINGLE direct child to fill,
            so the image + overlays all live inside this one wrapper. */}
        <div className="aspect-w-16 aspect-h-9 w-full">
          {/* No `relative` here: the aspect-ratio plugin already anchors this child
              with position:absolute. Adding `relative` collapses the box. */}
          <div className="overflow-hidden rounded-lg border border-line bg-surface transition duration-300 ease-out group-hover:-translate-y-0.5">
            <Image
              alt={`Thumbnail for ${title}`}
              src={
                (episode && episode.thumbnail?.original.url) ||
                anime.coverImage.large ||
                anime.coverImage.medium ||
                anime.bannerImage
              }
              layout="fill"
              objectFit="cover"
              objectPosition="center"
              className="transition duration-500 ease-out group-hover:scale-105"
            />

            <div className="from-canvas/85 via-canvas/15 pointer-events-none absolute inset-0 bg-gradient-to-t to-transparent" />

            <span className="bg-canvas/65 absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold text-fg backdrop-blur-sm">
              EP {number}
            </span>

            <span className="absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-canvas/80 text-fg backdrop-blur-sm">
                <PlayIcon className="ml-0.5 h-5 w-5" />
              </span>
            </span>
          </div>
        </div>

        <p className="mt-2.5 text-sm font-semibold leading-snug text-fg transition line-clamp-2 group-hover:text-accent">
          {title}
        </p>
      </a>
    </Link>
  );
};

export default Card;
