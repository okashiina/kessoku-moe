import Image from 'next/image';
import Link from 'next/link';

import { BookOpenIcon } from '@heroicons/react/solid';

import { base64SolidImage } from '@utility/image';
import { MangaInfo, originLabel } from '@utility/manga';
import { useTitle } from '@utility/titleLang';

export interface MangaCardProps {
  manga: MangaInfo;
}

const MangaCard: React.FC<MangaCardProps> = ({ manga }) => {
  const title = useTitle(manga.title);
  const cover = manga.coverImage.large || manga.coverImage.medium;

  return (
    <Link href={`/manga/${manga.id}`} passHref>
      <a className="group block w-36 shrink-0 snap-start sm:w-44">
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
                  manga.coverImage.color
                )}`}
              />
            )}

            <div className="from-canvas/85 pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t via-canvas/20 to-transparent opacity-0 transition duration-300 group-hover:opacity-100" />

            {/* Origin tag (Manga / Manhwa / Manhua) top-left — the catalog's most
                useful at-a-glance signal, since the reader mode follows from it. */}
            <span className="bg-canvas/65 absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg backdrop-blur-sm">
              {originLabel(manga.countryOfOrigin)}
            </span>

            {manga.meanScore && (
              <span className="bg-canvas/65 absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold text-fg backdrop-blur-sm">
                {manga.meanScore}%
              </span>
            )}

            <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition duration-300 group-hover:opacity-100">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-aurora text-accent-ink shadow-glow">
                <BookOpenIcon className="h-6 w-6" />
              </span>
            </span>
          </div>
        </div>

        <div className="mt-2.5">
          <p className="min-h-[2.5rem] text-sm font-semibold leading-snug text-fg transition line-clamp-2 group-hover:text-accent">
            {title}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-faint">
            {manga.chapters ? (
              <span>{manga.chapters} ch</span>
            ) : (
              <span className="capitalize">
                {manga.status?.toLowerCase().replace(/_/g, ' ') ?? 'ongoing'}
              </span>
            )}
          </div>
        </div>
      </a>
    </Link>
  );
};

export default MangaCard;
