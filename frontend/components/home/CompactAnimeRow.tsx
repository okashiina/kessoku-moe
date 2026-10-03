import Image from 'next/image';
import Link from 'next/link';

import { AnimeInfoFragment } from '@animeflix/api/aniList';

import styles from '@styles/Home.module.css';
import { base64SolidImage } from '@utility/image';
import { useTitle } from '@utility/titleLang';

const CompactAnimeRow: React.FC<{ anime: AnimeInfoFragment }> = ({ anime }) => {
  const title = useTitle(anime.title);
  const cover = anime.coverImage?.large || anime.coverImage?.medium || '';

  return (
    <Link href={`/anime/${anime.id}`} passHref>
      <a className={`${styles.compactRow} group`}>
        <span className={`${styles.compactThumb} relative bg-surface`}>
          {cover && (
            <Image
              src={cover}
              alt=""
              layout="fill"
              objectFit="cover"
              placeholder="blur"
              blurDataURL={`data:image/svg+xml;base64,${base64SolidImage(
                anime.coverImage?.color || '#1a1626'
              )}`}
            />
          )}
        </span>
        <span className="min-w-0 truncate text-sm font-semibold text-fg transition group-hover:text-accent">
          {title}
        </span>
      </a>
    </Link>
  );
};

export default CompactAnimeRow;
