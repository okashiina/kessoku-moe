import Image from 'next/image';
import Link from 'next/link';

import type { CardMedia } from '@utility/companion/types';
import { base64SolidImage } from '@utility/image';

// Shared primitives for the companion's inline entity cards. These render INSIDE
// the chat scroll, so they stay compact (rail is ~360px) and reuse the watch
// UI's Midnight-Aurora tokens. The card surface is standalone (it is not wrapped
// in the text bubble), so there is no nested-card.

export type LinkTarget = '_self' | '_blank';

// The fullscreen dock passes '_blank' so tapping through a card opens a new tab
// instead of unmounting the player mid-episode.
export const relFor = (target: LinkTarget): string | undefined =>
  target === '_blank' ? 'noreferrer' : undefined;

// Outer surface for one card. Not bordered like the bubble, so card-in-bubble
// never reads as a nested card.
export const CardShell: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <div className="max-w-[92%] overflow-hidden rounded-2xl border border-line/60 bg-surface/60 p-3">
    {children}
  </div>
);

// Circular portrait for a person (voice actor) or square-ish for a character.
export const Avatar: React.FC<{
  src?: string | null;
  alt: string;
  rounded?: 'full' | 'xl';
  size?: number;
}> = ({ src, alt, rounded = 'full', size = 44 }) => (
  <span
    className={`relative block shrink-0 overflow-hidden bg-surface-2 ring-1 ring-line/40 ${
      rounded === 'full' ? 'rounded-full' : 'rounded-xl'
    }`}
    style={{ height: size, width: size }}
  >
    {src && (
      <Image alt={alt} src={src} layout="fill" objectFit="cover" sizes="44px" />
    )}
  </span>
);

// One poster in a horizontal "other works" strip. Links to the title.
export const MiniPoster: React.FC<{
  media: CardMedia;
  target: LinkTarget;
}> = ({ media, target }) => (
  <Link
    href={media.type === 'MANGA' ? `/manga/${media.id}` : `/anime/${media.id}`}
    passHref
  >
    <a
      target={target}
      rel={relFor(target)}
      className="group block w-20 shrink-0 snap-start focus:outline-none"
      title={media.title}
    >
      <div className="aspect-w-2 aspect-h-3 w-full">
        <div className="overflow-hidden rounded-lg bg-surface ring-1 ring-line/40 transition group-hover:ring-accent/60 group-focus-visible:ring-accent">
          {media.cover && (
            <Image
              alt={media.title}
              src={media.cover}
              layout="fill"
              objectFit="cover"
              sizes="80px"
              placeholder="blur"
              blurDataURL={`data:image/svg+xml;base64,${base64SolidImage(
                media.color || '#1a1722'
              )}`}
            />
          )}
        </div>
      </div>
      <p className="mt-1 text-[10px] leading-tight text-muted transition line-clamp-2 group-hover:text-fg">
        {media.title}
      </p>
      {media.as && (
        <p className="text-[10px] leading-tight text-faint line-clamp-1">
          as {media.as}
        </p>
      )}
    </a>
  </Link>
);

// The horizontal, snap-scrolling rail of posters.
export const PosterRail: React.FC<{
  items: CardMedia[];
  target: LinkTarget;
  label: string;
}> = ({ items, target, label }) =>
  items.length ? (
    <ul
      aria-label={label}
      className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1"
    >
      {items.map((m) => (
        <li key={m.id}>
          <MiniPoster media={m} target={target} />
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-[11px] text-faint">Nothing else on record.</p>
  );
