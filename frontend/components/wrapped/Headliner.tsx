import Image from 'next/image';
import Link from 'next/link';

import type { Highlight } from './useWrappedStats';

// The "headliner" of the set: the series someone gave the most to. Manga
// progress caches a title + cover, so its card shows the real artwork. Anime
// progress stores only an id (no cached title), so that variant stays honest:
// it links into the detail page without inventing a name.
interface HeadlinerProps {
  highlight: Highlight;
}

const Headliner: React.FC<HeadlinerProps> = ({ highlight }) => {
  const href =
    highlight.kind === 'manga'
      ? `/manga/${highlight.id}`
      : `/anime/${highlight.id}`;
  const unit = highlight.kind === 'manga' ? 'chapters' : 'episodes';
  const verb = highlight.kind === 'manga' ? 'Most read' : 'Most watched';

  return (
    <Link href={href} passHref>
      <a className="group flex items-stretch gap-4 overflow-hidden rounded-2xl border border-line/50 bg-surface/40 p-4 transition [touch-action:manipulation] hover:border-accent/50 active:scale-[0.99] active:border-accent/50 motion-reduce:active:scale-100">
        <div
          style={{ aspectRatio: '2 / 3' }}
          className="relative w-20 shrink-0 overflow-hidden rounded-xl bg-canvas-2 ring-1 ring-line/40 sm:w-24"
        >
          {highlight.cover ? (
            <Image
              alt={highlight.title || verb}
              src={highlight.cover}
              layout="fill"
              objectFit="cover"
            />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center text-2xl text-faint"
              aria-hidden
            >
              ♪
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col justify-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-accent">
            {verb}
          </span>
          <p className="mt-1 font-display text-lg font-bold leading-snug text-fg line-clamp-2 group-hover:text-accent group-active:text-accent">
            {highlight.title || `Your top ${highlight.kind}`}
          </p>
          <p className="mt-1 text-sm text-muted">
            <span className="font-semibold tabular-nums text-fg">
              {highlight.count}
            </span>{' '}
            {unit} in
          </p>
        </div>
      </a>
    </Link>
  );
};

export default Headliner;
