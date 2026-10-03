import Image from 'next/image';
import Link from 'next/link';

import { AnimeInfoFragment } from '@animeflix/api/aniList';

import WatchlistButton from '@components/anime/WatchlistButton';
import styles from '@styles/Home.module.css';
import { base64SolidImage } from '@utility/image';
import { useTitle } from '@utility/titleLang';

type CoverImage = AnimeInfoFragment['coverImage'] & {
  extraLarge?: string | null;
};

function coverSrc(cover: CoverImage | null | undefined): string {
  if (!cover) return '';
  return cover.extraLarge || cover.large || cover.medium || '';
}

export interface HomePosterProps {
  anime: AnimeInfoFragment;
  tilt?: 'left' | 'right' | 'none';
  featured?: boolean;
  /** Hide the pink title ticket (small thumbs). */
  hideTicket?: boolean;
  className?: string;
}

const tiltClass = (tilt: 'left' | 'right' | 'none') => {
  if (tilt === 'left') return styles.posterTiltLeft;
  if (tilt === 'right') return styles.posterTiltRight;
  return styles.posterTiltNone;
};

const HomePoster: React.FC<HomePosterProps> = ({
  anime,
  tilt = 'none',
  featured = false,
  hideTicket = false,
  className = '',
}) => {
  const title = useTitle(anime.title);
  const src = coverSrc(anime.coverImage);

  const frameClass = [
    styles.posterFrame,
    tiltClass(tilt),
    featured ? styles.posterFeatured : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={frameClass}>
      <div className={styles.posterBookmark}>
        <WatchlistButton id={anime.id} variant="icon" className="!h-11 !w-11" />
      </div>

      <div className={styles.posterShadow} aria-hidden />

      <Link href={`/anime/${anime.id}`} passHref>
        <a className={styles.posterLink}>
          <div className={styles.posterPrint}>
            <div className="aspect-w-2 aspect-h-3 w-full">
              <div className={styles.posterArt}>
                {src ? (
                  <Image
                    alt={`Cover for ${title}`}
                    src={src}
                    layout="fill"
                    objectFit="cover"
                    objectPosition="center"
                    sizes={
                      featured
                        ? '(max-width: 639px) 45vw, 220px'
                        : '(max-width: 639px) 36vw, 160px'
                    }
                    placeholder="blur"
                    blurDataURL={`data:image/svg+xml;base64,${base64SolidImage(
                      anime.coverImage?.color || '#1a1626'
                    )}`}
                  />
                ) : (
                  <span className={styles.posterFallback} />
                )}
              </div>
            </div>

            {!hideTicket && (
              <span className={styles.posterTicket}>{title}</span>
            )}
          </div>
        </a>
      </Link>
    </article>
  );
};

export { coverSrc };
export default HomePoster;
