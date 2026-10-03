import { ReactNode } from 'react';

import { RevealItem, RevealStagger } from '@components/motion/Reveal';

export interface PosterRowProps {
  children: ReactNode;
  className?: string;
}

/** Horizontal poster row with staggered scroll-settle motion. */
const PosterRow: React.FC<PosterRowProps> = ({ children, className = '' }) => (
  <RevealStagger className={className} stagger={0.07}>
    {children}
  </RevealStagger>
);

export const PosterRowItem: React.FC<{
  children: ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <RevealItem className={className}>{children}</RevealItem>
);

export default PosterRow;
