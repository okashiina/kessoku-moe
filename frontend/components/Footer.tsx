import Link from 'next/link';

import { ChatIcon, StatusOnlineIcon } from '@heroicons/react/outline';

// Community links live in the anti-fragility SOP (Discord + public status page).
// TODO: replace the "#" placeholders with the real invite / status URLs.
const COMMUNITY_LINKS: {
  label: string;
  href: string;
  external?: boolean;
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
}[] = [
  { label: 'Discord', href: '#', external: true, icon: ChatIcon },
  { label: 'Status', href: '#', external: true, icon: StatusOnlineIcon },
];

const EXPLORE_LINKS = [
  { label: 'Home', href: '/home' },
  { label: 'Browse', href: '/browse' },
  { label: 'Cartoon', href: '/cartoon' },
  { label: 'Schedule', href: '/schedule' },
];

const POPULAR_GENRES = [
  'Action',
  'Romance',
  'Comedy',
  'Fantasy',
  'Slice of Life',
  'Sci-Fi',
  'Sports',
  'Music',
];

const FooterLink: React.FC<{ href: string; children: React.ReactNode }> = ({
  href,
  children,
}) => (
  <Link href={href} passHref>
    <a className="inline-flex min-h-[44px] items-center text-sm text-muted transition hover:text-fg">
      {children}
    </a>
  </Link>
);

const FooterHeading: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-faint">
    {children}
  </h2>
);

const Footer: React.FC<{}> = () => (
  <footer className="mt-20 border-t border-line bg-canvas">
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 lg:grid-cols-5">
        {/* Brand */}
        <div className="col-span-2 lg:col-span-2">
          <Link href="/home" passHref>
            <a
              className="inline-flex items-center transition active:scale-95"
              aria-label="kessoku moe home"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
              <img
                src="/kessoku-moe-stacked.svg"
                alt="kessoku moe"
                className="h-16 w-auto"
              />
            </a>
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
            Where your anime takes center stage. Free to watch, and we go easy
            on the ads.
          </p>
        </div>

        <nav aria-label="Explore">
          <FooterHeading>Explore</FooterHeading>
          <ul className="space-y-2.5">
            {EXPLORE_LINKS.map(({ label, href }) => (
              <li key={href}>
                <FooterLink href={href}>{label}</FooterLink>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Genres">
          <FooterHeading>Genres</FooterHeading>
          <ul className="space-y-2.5">
            {POPULAR_GENRES.map((genre) => (
              <li key={genre}>
                <FooterLink href={`/genre/${genre}`}>{genre}</FooterLink>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Community">
          <FooterHeading>Community</FooterHeading>
          <ul className="space-y-2.5">
            {COMMUNITY_LINKS.map(({ label, href, external, icon: Glyph }) => (
              <li key={label}>
                <a
                  href={href}
                  {...(external
                    ? { target: '_blank', rel: 'noreferrer noopener' }
                    : {})}
                  className="inline-flex min-h-[44px] items-center gap-2 text-sm text-muted transition hover:text-fg"
                >
                  <Glyph className="h-5 w-5" aria-hidden />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="mt-12 flex flex-col gap-2 border-t border-line pt-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
        <p>
          kessoku moe is a fan project. Metadata and artwork come from{' '}
          <a
            href="https://anilist.co"
            target="_blank"
            rel="noreferrer noopener"
            className="text-muted underline-offset-2 transition hover:text-fg hover:underline"
          >
            AniList
          </a>
          . Not affiliated with any official source.
        </p>
        <p className="text-faint">
          kessoku<span className="text-accent"> moe</span>
        </p>
      </div>
    </div>
  </footer>
);

export default Footer;
