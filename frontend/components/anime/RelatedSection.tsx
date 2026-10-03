import React, { useRef } from 'react';

import { AnimeInfoFragment } from '@animeflix/api/aniList';

import AnimeCard from '@components/anime/Card';

export interface RelationItem {
  relationType: string;
  node: AnimeInfoFragment;
}

// Which AniList relation types we surface, their display label, and the order
// they read in (roughly franchise / watch order). Relations not listed here
// (ADAPTATION, SOURCE, CHARACTER, COMPILATION, ...) point at manga or source
// material rather than watchable anime, so they're dropped.
const RELATION_LABELS: Record<string, string> = {
  PREQUEL: 'Prequel',
  SEQUEL: 'Sequel',
  PARENT: 'Parent Story',
  SIDE_STORY: 'Side Story',
  SPIN_OFF: 'Spin-off',
  ALTERNATIVE: 'Alternative',
  SUMMARY: 'Summary',
  OTHER: 'Other',
};

const RELATION_ORDER = Object.keys(RELATION_LABELS);

export interface RelatedSectionProps {
  items: RelationItem[];
  /** Drop the section's own horizontal padding (for parents that already pad,
      e.g. the watch page column). Defaults to padded, as the detail page needs. */
  flush?: boolean;
}

const RelatedSection: React.FC<RelatedSectionProps> = ({
  items,
  flush = false,
}) => {
  const railRef = useRef<HTMLDivElement>(null);
  const pad = flush ? '' : 'px-4 sm:px-6 lg:px-8';

  // Keep only relations we label, de-dupe by id, then sort into reading order.
  const seen = new Set<number>();
  const related = items
    .filter((it) => RELATION_LABELS[it.relationType] && it.node)
    .filter((it) => {
      if (seen.has(it.node.id)) return false;
      seen.add(it.node.id);
      return true;
    })
    .sort(
      (a, b) =>
        RELATION_ORDER.indexOf(a.relationType) -
        RELATION_ORDER.indexOf(b.relationType)
    );

  if (related.length === 0) return null;

  return (
    <section className="mt-10">
      <h2
        className={`mb-3 font-display text-xl font-extrabold tracking-tight text-fg sm:text-2xl ${pad}`}
      >
        Related
      </h2>

      <div className="edge-fade-x">
        <div
          tabIndex={0}
          ref={railRef}
          onMouseEnter={() => railRef.current?.focus()}
          className={`flex snap-x gap-4 overflow-x-auto overflow-y-hidden scroll-smooth pb-3 outline-none scrollbar-hide ${pad}`}
        >
          {related.map(({ relationType, node }) => (
            <div key={node.id} className="relative shrink-0">
              {/* Relation chip sits top-left of the poster; the score badge in
                  Card lives top-right, so they never collide. */}
              <span className="bg-canvas/85 pointer-events-none absolute left-2 top-2 z-10 rounded-[5px] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent backdrop-blur-sm">
                {RELATION_LABELS[relationType]}
              </span>
              <AnimeCard anime={node} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default RelatedSection;
