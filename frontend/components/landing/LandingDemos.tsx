import { useState } from 'react';

import Image from 'next/image';

import {
  BadgeCheckIcon,
  ChatAlt2Icon,
  CheckCircleIcon,
} from '@heroicons/react/outline';

import styles from './LandingDemos.module.css';

const TONES = [
  {
    id: 'hyped',
    reply:
      "OHHH the white-haired one?? That's Frieren, an absolute powerhouse and instantly iconic. You are so gonna love her, that is ALL I'm saying.",
  },
  {
    id: 'thoughtful',
    reply:
      "That's Frieren. Time moves differently for her, so watch how she holds people at arm's length. You've only just met her. I'll leave it there.",
  },
  {
    id: 'soft',
    reply:
      "That's Frieren. She carries this quiet, faraway sadness, like she's always half a step outside the moment. You'll feel it more as the story goes.",
  },
  {
    id: 'off the rails',
    reply:
      "The silver-haired menace? That's Frieren. Struts around like she pays rent in everyone's head. Iconic behavior. I'll zip it before I spoil anything.",
  },
];

export function CompanionDemo() {
  const [tone, setTone] = useState('thoughtful');
  const active = TONES.find((item) => item.id === tone) || TONES[1];

  return (
    <div className={styles.chat}>
      <div className={styles.heading}>
        <span className={styles.avatar}>
          <ChatAlt2Icon aria-hidden />
        </span>
        <strong>your seat-mate</strong>
        <span className={styles.safe}>
          <CheckCircleIcon aria-hidden /> spoiler-safe
        </span>
      </div>
      <p className={styles.question}>
        wait, who was the white-haired elf again?
      </p>
      <p className={styles.reply} aria-live="polite" aria-atomic="true">
        {active.reply}
      </p>
      <fieldset className={styles.tones}>
        <legend>Pick your companion&apos;s tone</legend>
        <div>
          {TONES.map(({ id }) => (
            <button
              key={id}
              type="button"
              aria-pressed={tone === id}
              onClick={() => setTone(id)}
            >
              {id}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export function SyncDemo({ cover }: { cover: string }) {
  return (
    <div className={styles.list}>
      <div className={styles.heading}>
        <BadgeCheckIcon aria-hidden />
        <strong>In sync with AniList</strong>
      </div>
      <div className={styles.entry}>
        <span className={styles.cover}>
          {cover && (
            <Image
              src={cover}
              alt=""
              layout="fill"
              objectFit="cover"
              sizes="52px"
            />
          )}
        </span>
        <div>
          <h3>Frieren: Beyond Journey&apos;s End</h3>
          <p>
            <span className={styles.status}>Watching</span> Episode 7 / 28
          </p>
        </div>
      </div>
      <div
        className={styles.progress}
        role="progressbar"
        aria-label="Example episode progress"
        aria-valuemin={0}
        aria-valuemax={28}
        aria-valuenow={7}
      >
        <span />
      </div>
      <p className={styles.confirmation}>
        <CheckCircleIcon aria-hidden /> Counts itself as you watch.
      </p>
    </div>
  );
}
