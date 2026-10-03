import Link from 'next/link';

import { ClockIcon } from '@heroicons/react/outline';

import { useCountdown } from '@hooks/useCountdown';
import { AiringEntry } from '@utility/anilist';
import { useTitle } from '@utility/titleLang';

export interface AiringCardProps {
  entry: AiringEntry;
}

/** Ticket-style row for an upcoming episode, with a live countdown. */
const AiringCard: React.FC<AiringCardProps> = ({ entry }) => {
  const { media } = entry;
  const countdown = useCountdown(entry.airingAt);
  const title = useTitle(media?.title);

  if (!media) return null;

  return (
    <Link href={`/anime/${media.id}`} passHref>
      <a className="group flex min-h-[44px] items-center gap-3 rounded-lg border border-[#463b49] px-3 py-2 transition hover:border-accent/50">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold tabular-nums text-fg">
          <ClockIcon className="h-4 w-4 text-accent" aria-hidden />
          {countdown.label}
        </span>
        <span className="shrink-0 text-xs font-semibold text-muted">
          Ep {entry.episode}
        </span>
        <span className="min-w-0 truncate text-sm font-semibold text-fg transition group-hover:text-accent">
          {title}
        </span>
      </a>
    </Link>
  );
};

export default AiringCard;
