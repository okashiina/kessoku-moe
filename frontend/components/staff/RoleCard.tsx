import Image from 'next/image';
import Link from 'next/link';

import { AnimeInfoFragment } from '@animeflix/api/aniList';

import { base64SolidImage } from '@utility/image';
import { useTitle } from '@utility/titleLang';

export interface RoleCardProps {
  characterId: number | null;
  characterName: string;
  characterImage: string | null;
  anime: AnimeInfoFragment;
}

// A voice-actor role: the CHARACTER is the subject (hero portrait), with the
// show it's from shown as a small cover chip pinned in the corner so the pairing
// reads at a glance. Two SEPARATE links (never nested <a>): the portrait + name
// go to the character, the "in <show>" line goes to the anime.
const RoleCard: React.FC<RoleCardProps> = ({
  characterId,
  characterName,
  characterImage,
  anime,
}) => {
  const animeTitle = useTitle(anime.title);
  const tint = anime.coverImage.color || '#1a1a2e';
  const cover = anime.coverImage.medium || anime.coverImage.large;
  const characterHref = characterId
    ? `/character/${characterId}`
    : `/anime/${anime.id}`;

  return (
    <div className="w-36 sm:w-44">
      <Link href={characterHref} passHref>
        <a className="group block" aria-label={characterName}>
          {/* paddingTop 150% reserves a 2:3 box independent of the aspect-ratio
              plugin, so portrait + chip + overlays can be absolute siblings. */}
          <div
            className="relative w-full overflow-hidden rounded-2xl bg-surface-2 shadow-card ring-1 ring-line/40 transition duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-lift group-hover:ring-2 group-hover:ring-accent/50"
            style={{ paddingTop: '150%' }}
          >
            {characterImage ? (
              <Image
                alt={characterName}
                src={characterImage}
                layout="fill"
                objectFit="cover"
                objectPosition="top"
                className="transition duration-500 ease-out group-hover:scale-105"
                placeholder="blur"
                blurDataURL={`data:image/svg+xml;base64,${base64SolidImage(
                  tint
                )}`}
              />
            ) : (
              <span className="absolute inset-0 grid place-items-center font-display text-4xl font-bold text-faint">
                {characterName.charAt(0).toUpperCase()}
              </span>
            )}

            {/* legibility veil behind the show chip */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-canvas/80 to-transparent" />

            {anime.meanScore && (
              <span className="bg-canvas/65 absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold text-fg backdrop-blur-sm">
                {anime.meanScore}%
              </span>
            )}

            {/* show cover chip — the pairing cue (decorative; the real show link
                is the "in <title>" line below). */}
            {cover && (
              <span className="absolute bottom-2 right-2 block w-9 overflow-hidden rounded-md shadow-lift ring-2 ring-canvas/80 sm:w-10">
                <span
                  className="relative block w-full"
                  style={{ paddingTop: '150%' }}
                >
                  <Image alt="" src={cover} layout="fill" objectFit="cover" />
                </span>
              </span>
            )}
          </div>

          <p className="mt-2 truncate text-sm font-semibold text-fg transition group-hover:text-accent">
            {characterName}
          </p>
        </a>
      </Link>

      <Link href={`/anime/${anime.id}`} passHref>
        <a className="mt-0.5 block truncate text-xs text-faint transition hover:text-accent">
          in <span className="text-muted">{animeTitle}</span>
        </a>
      </Link>
    </div>
  );
};

export default RoleCard;
