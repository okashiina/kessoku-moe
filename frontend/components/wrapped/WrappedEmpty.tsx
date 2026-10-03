import Link from 'next/link';

// Empty state for /wrapped: nothing read or watched yet. Brand voice (Kessoku
// Band, stage metaphor), English, no em dashes. Two clear next steps: the manga
// catalog and the anime home.
const WrappedEmpty: React.FC = () => (
  <div className="mx-auto flex max-w-md animate-rise flex-col items-start border-t border-[#463b49] pt-10 motion-reduce:animate-none motion-reduce:opacity-100">
    <h2 className="font-display text-2xl font-extrabold tracking-tight text-[#f4ecef] sm:text-3xl">
      Your set list is empty
    </h2>
    <p className="mt-3 text-sm leading-relaxed text-[#bfb2c1]">
      Read or watch enough chapters and episodes and this page will tally them
      into a recap.
    </p>
    <div className="mt-7 flex w-full flex-col gap-3 sm:flex-row">
      <Link href="/manga" passHref>
        <a className="inline-flex min-h-[44px] w-full items-center justify-center rounded-[5px] bg-[#f591ba] px-6 text-sm font-bold text-[#17141c] transition [touch-action:manipulation] active:scale-[0.98] motion-reduce:active:scale-100 sm:w-auto">
          Open the manga shelf
        </a>
      </Link>
      <Link href="/" passHref>
        <a className="inline-flex min-h-[44px] w-full items-center justify-center rounded-[5px] border border-[#463b49] px-6 text-sm font-bold text-[#f4ecef] transition [touch-action:manipulation] hover:text-[#f591ba] active:scale-[0.98] active:text-[#f591ba] motion-reduce:active:scale-100 sm:w-auto">
          Browse anime
        </a>
      </Link>
    </div>
  </div>
);

export default WrappedEmpty;
