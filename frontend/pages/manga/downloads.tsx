import Link from 'next/link';

import { NextSeo } from 'next-seo';

import Header from '@components/Header';
import DownloadsManager from '@components/manga/DownloadsManager';
import progressBar from '@components/Progress';

import styles from '../../styles/Browse.module.css';

// Offline downloads manager: one place to see every saved chapter, the approximate
// storage used, and delete chapters (one or all). Downloading itself happens in the
// reader; this is the management surface. Client-only state (localStorage + Cache
// Storage), so it renders an empty shell on the server.
const MangaDownloads: React.FC = () => {
  progressBar.finish();

  return (
    <div className={styles.page}>
      <NextSeo
        title="Downloads | kessoku moe"
        description="Manage your offline manga downloads."
        noindex
      />

      <Header />

      <main className={`${styles.main} max-w-screen-md`}>
        <Link href="/manga" passHref>
          <a className="inline-flex min-h-[44px] items-center text-[13px] font-bold text-accent [touch-action:manipulation]">
            ← Back to manga
          </a>
        </Link>

        <div className="mb-8 mt-2">
          <h1 className="font-display text-[clamp(32px,4vw,52px)] font-extrabold tracking-[-0.05em] text-fg">
            Downloads
          </h1>
          <p className="mt-3 text-[15px] text-[#bfb2c1]">
            Chapters you saved for offline reading live here.
          </p>
        </div>

        <DownloadsManager />
      </main>
    </div>
  );
};

export default MangaDownloads;
