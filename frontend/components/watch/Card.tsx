import React from 'react';

import Image from 'next/image';
import Link from 'next/link';

import { AnimeBannerFragment, AnimeInfoFragment } from '@animeflix/api/aniList';

import { base64SolidImage } from '@utility/image';
import { useTitle } from '@utility/titleLang';

export interface CardProps {
  anime: AnimeInfoFragment & AnimeBannerFragment;
}

const Card: React.FC<CardProps> = ({ anime }) => {
  const title = useTitle(anime.title);

  return (
    <Link href={`/watch/${anime.id}`} passHref>
      <a className="group flex items-start gap-3 rounded-xl p-2 transition duration-200 hover:bg-surface/60">
        {/* Explicitly sized 2:3 thumbnail (96x64). We deliberately do NOT use the
            @tailwindcss/aspect-ratio plugin here: its padding-bottom:150% resolves
            against the containing block's width (the wide ~360px sidebar), not this
            64px box, so it would balloon to ~540px tall inside the flex row. */}
        <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-surface ring-1 ring-line/40">
          <Image
            alt={`Cover for ${title}`}
            src={anime.coverImage.large || anime.coverImage.medium}
            layout="fill"
            objectFit="cover"
            className="transition duration-500 ease-out group-hover:scale-110"
            placeholder="blur"
            blurDataURL={`data:image/svg+xml;base64,${base64SolidImage(
              anime.coverImage.color
            )}`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug text-fg transition line-clamp-2 group-hover:text-accent">
            {title}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-faint">
            {anime.format && <span>{anime.format}</span>}
            {anime.meanScore && (
              <>
                <span aria-hidden className="opacity-50">
                  •
                </span>
                <span>{anime.meanScore}%</span>
              </>
            )}
          </div>
          {anime.description && (
            <p className="mt-1 text-xs leading-relaxed text-muted line-clamp-2">
              {anime.description.replace(/<\w*\\?>/g, '')}
            </p>
          )}
        </div>
      </a>
    </Link>
  );
};

export default Card;
