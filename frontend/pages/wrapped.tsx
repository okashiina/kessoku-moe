import { NextSeo } from 'next-seo';

import Header from '@components/Header';
import progressBar from '@components/Progress';
import { useWrappedStats } from '@components/wrapped/useWrappedStats';
import WrappedContent from '@components/wrapped/WrappedContent';
import WrappedEmpty from '@components/wrapped/WrappedEmpty';

// Reading & Watching Wrapped: a personal set list built entirely from local
// data (manga progress + list, anime progress + watchlist + status). No backend,
// no account needed. Client-only state, so the server renders an empty shell and
// the real numbers hydrate on the client (useWrappedStats returns the empty
// snapshot on the server).
const Wrapped: React.FC = () => {
  progressBar.finish();

  const stats = useWrappedStats();

  return (
    <>
      <NextSeo
        title="Your Wrapped | kessoku moe"
        description="Your reading and watching set list, built from what you've finished."
        noindex
      />

      <Header />

      <main className="mx-auto w-full max-w-screen-md bg-[#17141c] px-4 pb-20 pt-6 text-[#f4ecef] sm:px-6 lg:px-8">
        <header className="mb-10 animate-rise motion-reduce:animate-none motion-reduce:opacity-100">
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Your Wrapped
          </h1>
          <p className="mt-2 text-sm text-[#bfb2c1]">
            Every chapter and episode you finished, played back as one set.
          </p>
        </header>

        {/* Before hydration `ready` is false and `hasData` is false, so the
            empty state shows over SSR / first paint, then swaps in real numbers
            once the client reads localStorage. */}
        {stats.hasData ? <WrappedContent stats={stats} /> : <WrappedEmpty />}
      </main>
    </>
  );
};

export default Wrapped;
