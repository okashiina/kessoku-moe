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
      <a className="group block min-h-[44px] transition [touch-action:manipulation] motion-reduce:transition-none">
        <div
          style={{ aspectRatio: '2 / 3' }}
          className="relative w-full max-w-[220px] overflow-hidden rounded-[8px] bg-[#221c26] shadow-[12px_24px_40px_#100b1377] transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none"
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
              className="flex h-full w-full items-end bg-[#221c26] p-3"
              aria-hidden
            >
              <span className="h-1 w-8 rounded-full bg-[#463b49]" />
            </span>
          )}
          <span className="absolute bottom-3 left-0 bg-[#f591ba] px-3 py-1.5 text-[12px] font-extrabold uppercase tracking-[0.12em] text-[#17141c]">
            {verb}
          </span>
        </div>
        <h3 className="mt-4 font-display text-xl font-extrabold leading-snug tracking-tight text-[#f4ecef] line-clamp-2 group-hover:text-[#f591ba] group-active:text-[#f591ba] sm:text-2xl">
          {highlight.title || `Your top ${highlight.kind}`}
        </h3>
        <p className="mt-2 text-sm text-[#bfb2c1]">
          <span className="font-bold tabular-nums text-[#f4ecef]">
            {highlight.count}
          </span>{' '}
          {unit} in
        </p>
      </a>
    </Link>
  );
};

export default Headliner;
