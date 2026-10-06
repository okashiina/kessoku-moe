import { useEffect, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/router';

import {
  BookOpenIcon,
  BookmarkIcon,
  FilmIcon,
  HomeIcon,
  SearchIcon,
} from '@heroicons/react/outline';

import styles from '@styles/MobileDock.module.css';

const TABS = [
  { label: 'Home', href: '/home', icon: HomeIcon },
  { label: 'Browse', href: '/browse', icon: SearchIcon },
  { label: 'Manga', href: '/manga', icon: BookOpenIcon },
  { label: 'Cartoon', href: '/cartoon', icon: FilmIcon },
  { label: 'My List', href: '/watchlist', icon: BookmarkIcon },
];

const MobileDock: React.FC = () => {
  const router = useRouter();
  const { pathname } = router;
  const [keyboardInset, setKeyboardInset] = useState(0);
  const visible =
    pathname !== '/' &&
    !pathname.startsWith('/watch/') &&
    !pathname.startsWith('/read/') &&
    pathname !== '/cartoon/[id]';

  useEffect(() => {
    document.body.dataset.mobileDock = String(visible);
    return () => {
      delete document.body.dataset.mobileDock;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const viewport = window.visualViewport;
    const update = () => {
      const focused = document.activeElement;
      const editing =
        focused instanceof HTMLElement &&
        (focused.matches('input, textarea, select') ||
          focused.isContentEditable);
      const inset =
        viewport && editing && viewport.scale === 1
          ? Math.max(
              0,
              window.innerHeight - viewport.height - viewport.offsetTop
            )
          : 0;
      setKeyboardInset(inset);
      document.documentElement.style.setProperty(
        '--mobile-visible-height',
        `${viewport?.height || window.innerHeight}px`
      );
    };
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      document.documentElement.style.removeProperty('--mobile-visible-height');
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <>
      <div className={styles.spacer} aria-hidden="true" />
      <nav
        className={styles.dock}
        aria-label="Mobile navigation"
        style={{ bottom: keyboardInset > 0 ? keyboardInset + 10 : undefined }}
      >
        <div className={styles.glass}>
          {TABS.map(({ label, href, icon: Icon }) => {
            const active =
              pathname === href ||
              (href === '/manga' && pathname.startsWith('/manga/')) ||
              (href === '/browse' &&
                [
                  '/search',
                  '/anime/[id]',
                  '/genre/[genre]',
                  '/studio/[id]',
                  '/staff/[id]',
                  '/character/[id]',
                ].includes(pathname));
            return (
              <Link key={href} href={href} passHref>
                <a
                  className={`${styles.tab} ${active ? styles.tabActive : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className={styles.icon} aria-hidden="true" />
                  <span>{label}</span>
                </a>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default MobileDock;
