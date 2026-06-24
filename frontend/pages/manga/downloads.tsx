import Link from 'next/link';

import { NextSeo } from 'next-seo';

import Header from '@components/Header';
import DownloadsManager from '@components/manga/DownloadsManager';
import progressBar from '@components/Progress';

// Offline downloads manager: one place to see every saved chapter, the approximate
// storage used, and delete chapters (one or all). Downloading itself happens in the
// reader; this is the management surface. Client-only state (localStorage + Cache
// Storage), so it renders an empty shell on the server.
const MangaDownloads: React.FC = () => {
  progressBar.finish();

  return (
    <>
      <NextSeo
        title="Downloads | kessoku moe"
        description="Manage your offline manga downloads."
        noindex
      />

      <Header />

      <main className="mx-auto w-full max-w-screen-md pb-20 pt-6">
        <div className="mb-6 flex flex-col gap-3 px-4 sm:px-6 lg:px-8">
          <Link href="/manga" passHref>
            <a className="inline-flex w-fit items-center text-sm font-medium text-muted transition [touch-action:manipulation] hover:text-fg">
              ← Back to manga
            </a>
          </Link>
          <div className="flex items-center gap-2.5">
            <span className="h-7 w-1 rounded-full bg-aurora" aria-hidden />
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              Downloads
            </h1>
          </div>
          <p className="text-sm text-muted">
            Chapters you saved for offline reading live here.
          </p>
        </div>

        <DownloadsManager />
      </main>
    </>
  );
};

export default MangaDownloads;
