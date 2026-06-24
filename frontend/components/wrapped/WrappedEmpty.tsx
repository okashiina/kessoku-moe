import Link from 'next/link';

// Empty state for /wrapped: nothing read or watched yet. Brand voice (Kessoku
// Band, stage metaphor), English, no em dashes. Two clear next steps: the manga
// catalog and the anime home.
const WrappedEmpty: React.FC = () => (
  <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-line/50 bg-surface/30 px-6 py-16 text-center">
    <span
      className="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-full bg-aurora text-2xl shadow-glow"
      aria-hidden
    >
      ♪
    </span>
    <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
      Your set list is empty
    </h2>
    <p className="mt-3 text-sm leading-relaxed text-muted">
      Read a chapter or watch an episode and this page fills in. Every title you
      finish becomes a track on your set.
    </p>
    <div className="mt-7 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
      <Link href="/manga" passHref>
        <a className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-aurora px-6 text-sm font-semibold text-accent-ink shadow-glow transition [touch-action:manipulation] active:scale-95 motion-reduce:active:scale-100">
          Open the manga shelf
        </a>
      </Link>
      <Link href="/" passHref>
        <a className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-surface px-6 text-sm font-semibold text-fg ring-1 ring-line/60 transition [touch-action:manipulation] hover:text-accent active:scale-95 active:text-accent motion-reduce:active:scale-100">
          Browse anime
        </a>
      </Link>
    </div>
  </div>
);

export default WrappedEmpty;
