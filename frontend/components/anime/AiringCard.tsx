import Image from 'next/image';
import Link from 'next/link';

import { ClockIcon } from '@heroicons/react/outline';

import { useCountdown } from '@hooks/useCountdown';
import { AiringEntry } from '@utility/anilist';
import { base64SolidImage } from '@utility/image';
import { useTitle } from '@utility/titleLang';

export interface AiringCardProps {
  entry: AiringEntry;
}

/** Poster card for an upcoming episode, with a live countdown to airing. */
const AiringCard: React.FC<AiringCardProps> = ({ entry }) => {
  const { media } = entry;
  const countdown = useCountdown(entry.airingAt);
  // Hook must run unconditionally — call it before the early return (pickTitle
  // tolerates a missing title and returns '').
  const title = useTitle(media?.title);

  if (!media) return null;

  const cover = media.coverImage.large || media.coverImage.medium || '';

  return (
    <Link href={`/anime/${media.id}`} passHref>
      <a className="group block w-40 shrink-0 snap-start sm:w-44">
        <div className="aspect-w-2 aspect-h-3 w-full">
          <div className="overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-line/40 transition duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-lift group-hover:ring-2 group-hover:ring-accent/50">
            {cover && (
              <Image
                alt={`Cover for ${title}`}
                src={cover}
                layout="fill"
                objectFit="cover"
                objectPosition="center"
                className="transition duration-500 ease-out group-hover:scale-105"
                placeholder="blur"
                blurDataURL={`data:image/svg+xml;base64,${base64SolidImage(
                  media.coverImage.color || '#1a1a2e'
                )}`}
              />
            )}

            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-canvas/70 px-2 py-0.5 text-[11px] font-semibold text-fg backdrop-blur-sm">
              <ClockIcon className="h-3 w-3 text-accent" aria-hidden />
              <span className="tabular-nums">{countdown.label}</span>
            </span>

            <div className="from-canvas/85 pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent p-2 pt-6">
              <p className="text-xs font-semibold text-fg">
                Ep {entry.episode}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-2.5 text-sm font-semibold leading-snug text-fg transition line-clamp-2 group-hover:text-accent">
          {title}
        </p>
      </a>
    </Link>
  );
};

export default AiringCard;
