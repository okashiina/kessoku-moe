import { useEffect } from 'react';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { AnimeBannerFragment } from '@animeflix/api/aniList';
import { ClockIcon, ThumbUpIcon } from '@heroicons/react/outline';
import { PlayIcon } from '@heroicons/react/solid';

import Icon from '@components/Icon';
import progressBar from '@components/Progress';
import { pickTitle, useTitleLang } from '@utility/titleLang';
import { stripHtml } from '@utility/utils';

export interface BannerProps {
  anime: AnimeBannerFragment;
}

const Banner: React.FC<BannerProps> = ({ anime }) => {
  const router = useRouter();
  const isHome = router.route === '/';

  // finish the progress bar if the banner image doesn't exist
  useEffect(() => {
    if (!anime.bannerImage) progressBar.finish();
  }, [anime.bannerImage]);

  const lang = useTitleLang();
  const title = pickTitle(anime.title, lang);
  const subtitle =
    lang === 'english' ? anime.title.romaji : anime.title.english;

  return (
    <section className="relative isolate w-full overflow-hidden">
      <div className="relative h-[58vh] min-h-[440px] w-full sm:h-[64vh] lg:h-[74vh] lg:min-h-[580px]">
        {anime.bannerImage && (
          <Image
            priority
            src={anime.bannerImage}
            alt={`Key art for ${title}`}
            layout="fill"
            objectFit="cover"
            objectPosition="center 25%"
            onLoadingComplete={progressBar.finish}
          />
        )}

        {/* Scrims to ink — legibility on bottom and left. */}
        <div className="via-[#17141c]/55 absolute inset-0 bg-gradient-to-t from-[#17141c] to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#17141c] via-[#17141c]/70 to-transparent" />

        <div className="absolute inset-0 z-10 flex flex-col justify-end px-4 pb-10 sm:px-6 sm:pb-14 lg:px-8 lg:pb-20">
          <div className="max-w-2xl">
            <p
              className="animate-rise font-sans text-xs font-semibold uppercase tracking-[0.25em] text-accent"
              style={{ animationDelay: '40ms' }}
            >
              {isHome ? 'Featured' : 'Now watching'}
            </p>

            <h1
              className="mt-2 animate-rise font-display text-3xl font-extrabold leading-[1.04] tracking-tight text-fg sm:text-5xl lg:text-6xl"
              style={{ animationDelay: '90ms' }}
            >
              {title}
            </h1>

            {subtitle && subtitle !== title && (
              <p
                className="mt-1.5 animate-rise text-sm text-muted line-clamp-1 sm:text-base"
                style={{ animationDelay: '150ms' }}
              >
                {subtitle}
              </p>
            )}

            <div
              className="mt-4 flex animate-rise flex-wrap items-center gap-x-4 gap-y-1 text-muted"
              style={{ animationDelay: '200ms' }}
            >
              {anime.format && <Icon icon={PlayIcon} text={anime.format} />}
              {anime.duration && (
                <Icon icon={ClockIcon} text={`${anime.duration} min`} />
              )}
              {anime.meanScore && (
                <Icon icon={ThumbUpIcon} text={`${anime.meanScore}%`} />
              )}
            </div>

            {anime.genres?.length > 0 && (
              <div
                className="mt-3 flex animate-rise flex-wrap gap-2"
                style={{ animationDelay: '250ms' }}
              >
                {anime.genres.slice(0, 4).map((genre) => (
                  <Link key={genre} href={`/genre/${genre}`} passHref>
                    <a className="inline-flex min-h-[44px] items-center rounded-[5px] border border-[#66516a] px-3.5 text-sm font-medium text-muted transition duration-200 hover:text-fg">
                      {genre}
                    </a>
                  </Link>
                ))}
              </div>
            )}

            {anime.description && (
              <p
                className="mt-4 hidden max-w-xl animate-rise text-sm leading-relaxed text-muted md:line-clamp-3 lg:block"
                style={{ animationDelay: '300ms' }}
              >
                {stripHtml(anime.description)}
              </p>
            )}

            <Link href={`/${isHome ? 'anime' : 'watch'}/${anime.id}`} passHref>
              <a
                className="mt-6 inline-flex min-h-[44px] animate-rise items-center gap-2 rounded-[5px] bg-accent px-6 py-2.5 text-sm font-bold text-accent-ink transition duration-200 ease-out hover:brightness-110 active:scale-95"
                style={{ animationDelay: '360ms' }}
              >
                <PlayIcon className="h-5 w-5" />
                {isHome ? 'View details' : 'Watch now'}
              </a>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Banner;
