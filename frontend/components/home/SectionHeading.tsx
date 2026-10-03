import Link from 'next/link';

import { ArrowRightIcon } from '@heroicons/react/outline';

import styles from '@styles/Home.module.css';

const SectionHeading: React.FC<{ title: string; href?: string }> = ({
  title,
  href,
}) => (
  <div className={styles.sectionHeading}>
    <h2 className="min-w-0 truncate font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
      {title}
    </h2>
    {href && (
      <Link href={href} passHref>
        <a className="ml-auto inline-flex min-h-[44px] items-center gap-2.5 whitespace-nowrap text-[13px] font-bold text-accent">
          See all
          <ArrowRightIcon className="h-5 w-5" aria-hidden />
        </a>
      </Link>
    )}
  </div>
);

export default SectionHeading;
