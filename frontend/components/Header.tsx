import { useEffect, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/router';

import { MenuIcon, XIcon } from '@heroicons/react/outline';

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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the mobile menu on navigation and on Escape.
  useEffect(() => {
    const close = () => setMenuOpen(false);
    router.events.on('routeChangeStart', close);
    return () => router.events.off('routeChangeStart', close);
  }, [router.events]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const isActive = (href: string): boolean => router.pathname === href;

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-colors duration-300 ${
        scrolled || menuOpen
          ? 'border-b border-line/50 bg-canvas/80 backdrop-blur-md sm:backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="flex h-16 w-full items-center gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
        {/* Mobile menu toggle (the desktop nav below is hidden on phones). */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-nav"
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg transition [touch-action:manipulation] hover:bg-surface-2 active:scale-95 sm:hidden"
        >
          {menuOpen ? (
            <XIcon className="h-6 w-6" />
          ) : (
            <MenuIcon className="h-6 w-6" />
          )}
        </button>

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
                  isActive(href) ? 'text-fg' : 'text-muted hover:text-fg'
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

      {/* Mobile nav sheet */}
      {menuOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-x-0 bottom-0 top-16 z-40 cursor-default sm:hidden"
            onClick={() => setMenuOpen(false)}
          />
          <nav
            id="mobile-nav"
            className="absolute inset-x-0 top-full z-50 border-b border-line/50 bg-canvas/95 backdrop-blur-xl sm:hidden"
          >
            <ul className="px-3 py-2">
              {NAV_LINKS.map(({ label, href }) => (
                <li key={href}>
                  <Link href={href} passHref>
                    <a
                      onClick={() => setMenuOpen(false)}
                      aria-current={isActive(href) ? 'page' : undefined}
                      className={`flex min-h-[48px] items-center rounded-xl px-3 text-base font-medium transition [touch-action:manipulation] ${
                        isActive(href)
                          ? 'bg-aurora/15 text-accent'
                          : 'text-fg hover:bg-surface-2 active:bg-surface-2'
                      }`}
                    >
                      {label}
                    </a>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}
    </header>
  );
};

export default Header;
