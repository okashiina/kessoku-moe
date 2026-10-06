import { useState } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import { ArrowRightIcon } from '@heroicons/react/solid';
import { motion } from 'framer-motion';

import useReducedMotion from '@hooks/useReducedMotion';
import type { MediaInfo } from '@utility/anilist';
import { useTitle } from '@utility/titleLang';

import styles from './Lineup.module.css';

export interface LineupProps {
  picks: MediaInfo[];
}

const Headliner = ({ items }: { items: MediaInfo[] }) => {
  const [selected, setSelected] = useState(0);
  const reduced = useReducedMotion();
  const anime = items[selected] || items[0];
  const title = useTitle(anime?.title);

  if (!anime) return null;

  const coverSrc =
    anime.coverImage.extraLarge ||
    anime.coverImage.large ||
    anime.coverImage.medium ||
    '';

  const coverImage = (
    <Image
      src={coverSrc}
      alt={`Cover for ${title}`}
      layout="fill"
      objectFit="cover"
      sizes="(max-width: 700px) 40vw, 360px"
    />
  );

  return (
    <div className={styles.headliner}>
      <Link href={`/anime/${anime.id}`}>
        <a className={styles.headlinerArt} aria-label={`Watch ${title}`}>
          {reduced ? (
            coverImage
          ) : (
            <motion.div
              key={selected}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25 }}
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
              }}
            >
              {coverImage}
            </motion.div>
          )}
          <span className={styles.ticketLabel}>YOUR NEXT HEADLINER</span>
        </a>
      </Link>
      <div className={styles.headlinerInfo}>
        <p className={styles.kicker}>ON THE LINEUP</p>
        <div aria-live="polite" aria-atomic="true">
          <h3 id="headliner-title">
            {title.split('×').map((part, index) => (
              <span key={`${index}-${part}`}>
                {index > 0 && (
                  <>
                    <wbr />×<wbr />
                  </>
                )}
                {part}
              </span>
            ))}
          </h3>
          <p className={styles.meta}>
            {[
              anime.format,
              anime.episodes ? `${anime.episodes} episodes` : null,
              anime.meanScore ? `${anime.meanScore}% AniList score` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Link href={`/anime/${anime.id}`}>
          <a className={styles.textLink}>
            Meet your next watch <ArrowRightIcon aria-hidden />
          </a>
        </Link>
        <div className={styles.picker} aria-label="Choose a headliner">
          {items.map((item, i) => (
            <button
              type="button"
              key={item.id}
              aria-label={`Feature ${item.title.english || item.title.romaji}`}
              aria-pressed={selected === i}
              onClick={() => setSelected(i)}
            >
              <Image
                src={item.coverImage.medium || item.coverImage.large || ''}
                alt=""
                layout="fill"
                objectFit="cover"
                sizes="72px"
              />
            </button>
          ))}
        </div>
        <p className={styles.note}>
          Different poster. Different kind of night.
        </p>
      </div>
    </div>
  );
};

export default function Lineup({ picks }: LineupProps) {
  if (picks.length === 0) return null;

  return (
    <section className={styles.lineup} data-sc-act="flow">
      <div className={styles.lineupHeading}>
        <p className={styles.kicker}>THE POSTER WALL</p>
        <h2>
          Tonight could
          <br />
          go anywhere.
        </h2>
        <p>Pick a cover. Give something a chance.</p>
      </div>
      <Headliner items={picks} />
    </section>
  );
}
