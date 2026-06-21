import { useEffect, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/router';

import AniListAuthButton from '@components/AniListAuthButton';
import NotificationBell from '@components/NotificationBell';
import RoomJoinLauncher from '@components/RoomJoinLauncher';
import SearchAutosuggest from '@components/SearchAutosuggest';

const NAV_LINKS = [
  { label: 'Home', href: '/home' },
  { label: 'Browse', href: '/browse' },
  { label: 'Manga', href: '/manga' },
  { label: 'Schedule', href: '/schedule' },
  { label: 'My List', href: '/watchlist' },
];

const Header: React.FC<{}> = () => {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-colors duration-300 ${
        scrolled
          ? 'border-b border-line/50 bg-canvas/80 backdrop-blur-md sm:backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="flex h-16 w-full items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/home" passHref>
          <a
            className="flex items-center gap-2 transition active:scale-95"
            aria-label="kessoku moe home"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo; next/image adds no value for an inline icon and complicates SVG handling */}
            <img
              src="/kessoku-moe-icon.svg"
              alt="kessoku moe"
              className="h-8 w-8"
            />
            <span className="hidden font-display text-lg font-bold lowercase tracking-tight text-fg sm:block">
              kessoku<span className="text-accent"> moe</span>
            </span>
          </a>
        </Link>

        <nav className="ml-2 hidden items-center gap-5 sm:flex">
          {NAV_LINKS.map(({ label, href }) => (
            <Link key={href} href={href} passHref>
              <a
                className={`text-sm font-medium transition ${
                  router.pathname === href
                    ? 'text-fg'
                    : 'text-muted hover:text-fg'
                }`}
              >
                {label}
              </a>
            </Link>
          ))}
        </nav>

        <SearchAutosuggest />
        <RoomJoinLauncher />
        <NotificationBell />
        <AniListAuthButton />
      </div>
    </header>
  );
};

export default Header;
