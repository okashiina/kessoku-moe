import Link from 'next/link';

import CoverflowCarousel, {
  CoverflowSlide,
} from '@components/home/CoverflowCarousel';
import SectionHeading from '@components/home/SectionHeading';
import styles from '@styles/Home.module.css';
import { CartoonShow } from '@utility/cartoon';

const CATALOG = '/cartoon?view=browse';
const genreHref = (genre: string) =>
  `${CATALOG}&genre=${encodeURIComponent(genre)}`;

// TVMaze's weight represents current popularity; ratings break equal weights.
const byPopularity = (a: CartoonShow, b: CartoonShow) =>
  (b.weight || 0) - (a.weight || 0) ||
  (b.rating?.average || 0) - (a.rating?.average || 0);
const byRating = (a: CartoonShow, b: CartoonShow) =>
  (b.rating?.average || 0) - (a.rating?.average || 0) || byPopularity(a, b);

const slidesFor = (shows: CartoonShow[]): CoverflowSlide[] =>
  shows.map((show) => ({
    src: show.image?.medium || '',
    alt: show.name,
    title: show.name,
    subtitle: [
      show.premiered?.slice(0, 4),
      show.genres?.slice(0, 2).join(' / '),
    ]
      .filter(Boolean)
      .join(' · '),
    href: `/cartoon/${show.id}`,
  }));

const CompactCartoonRow: React.FC<{ show: CartoonShow }> = ({ show }) => (
  <Link href={`/cartoon/${show.id}`} passHref>
    <a className={`${styles.compactRow} group [touch-action:manipulation]`}>
      <span className={`${styles.compactThumb} bg-surface`}>
        {show.image?.medium && (
          // eslint-disable-next-line @next/next/no-img-element -- TVMaze serves resized cover thumbnails.
          <img
            src={show.image.medium}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        )}
      </span>
      <span className="min-w-0 truncate text-sm font-semibold text-fg transition group-hover:text-accent">
        {show.name}
      </span>
    </a>
  </Link>
);

const CartoonHomeSections: React.FC<{ shows: CartoonShow[] }> = ({ shows }) => {
  const popular = [...shows].sort(byPopularity);
  const trending = popular.slice(0, 6);
  const running = popular
    .filter((show) => show.status === 'Running')
    .slice(0, 16);
  const adventure = popular
    .filter((show) =>
      show.genres.some((genre) =>
        ['Adventure', 'Fantasy', 'Action'].includes(genre)
      )
    )
    .slice(0, 16);
  const classics = popular
    .filter((show) => show.premiered && show.premiered.slice(0, 4) <= '2005')
    .slice(0, 16);
  const topRated = [...shows]
    .filter((show) => show.rating?.average)
    .sort(byRating)
    .slice(0, 5);
  const genres = Array.from(
    new Set(shows.flatMap((show) => show.genres))
  ).sort();
  const wideGenres = ['Action', 'Adventure'].filter((genre) =>
    genres.includes(genre)
  );
  const chipGenres = genres.filter((genre) => !wideGenres.includes(genre));

  return (
    <>
      <section className={styles.section}>
        <SectionHeading title="Trending now" href={CATALOG} />
        <div className={styles.trendingList}>
          {trending.map((show, index) => (
            <Link key={show.id} href={`/cartoon/${show.id}`} passHref>
              <a
                className={`${styles.trendingRow} group [touch-action:manipulation]`}
              >
                <span className={styles.trendingRank}>{index + 1}</span>
                <span className={`${styles.trendingCover} block h-[84px]`}>
                  {show.image?.medium && (
                    // eslint-disable-next-line @next/next/no-img-element -- TVMaze serves resized cover thumbnails.
                    <img
                      src={show.image.medium}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                </span>
                <span className="min-w-0 truncate text-sm font-semibold text-fg transition group-hover:text-accent">
                  {show.name}
                </span>
              </a>
            </Link>
          ))}
        </div>
      </section>

      {running.length > 0 && (
        <section className={styles.section}>
          <SectionHeading title="Ongoing series" href={CATALOG} />
          <CoverflowCarousel
            slides={slidesFor(running)}
            ariaLabel="Ongoing cartoon series"
          />
        </section>
      )}
      {adventure.length > 0 && (
        <section className={styles.section}>
          <SectionHeading
            title="Adventure & fantasy"
            href={genreHref('Adventure')}
          />
          <CoverflowCarousel
            slides={slidesFor(adventure)}
            ariaLabel="Adventure and fantasy cartoons"
          />
        </section>
      )}
      {classics.length > 0 && (
        <section className={styles.section}>
          <SectionHeading title="Classic favorites" href={CATALOG} />
          <CoverflowCarousel
            slides={slidesFor(classics)}
            ariaLabel="Classic cartoons"
          />
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.splitColumns}>
          <div>
            <SectionHeading title="Popular" href={CATALOG} />
            <div className={styles.compactList}>
              {popular.slice(0, 5).map((show) => (
                <CompactCartoonRow key={show.id} show={show} />
              ))}
            </div>
          </div>
          {topRated.length > 0 && (
            <div>
              <SectionHeading title="All-time greats" href={CATALOG} />
              <div className={styles.compactList}>
                {topRated.map((show) => (
                  <CompactCartoonRow key={show.id} show={show} />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <SectionHeading title="Browse by genre" href={CATALOG} />
        <div className={styles.genreWideRow}>
          {wideGenres.map((genre) => (
            <Link key={genre} href={genreHref(genre)} passHref>
              <a className={`${styles.genreTile} [touch-action:manipulation]`}>
                {genre}
              </a>
            </Link>
          ))}
        </div>
        <div className={styles.genreChips}>
          {chipGenres.map((genre) => (
            <Link key={genre} href={genreHref(genre)} passHref>
              <a className="inline-flex min-h-[44px] items-center rounded-[5px] border border-[#5a495f] px-3.5 py-2 text-[13px] text-[#c9bdc8] transition [touch-action:manipulation] hover:text-fg">
                {genre}
              </a>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
};

export default CartoonHomeSections;
