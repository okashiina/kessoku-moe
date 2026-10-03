import FeaturedBanner from '@components/home/FeaturedBanner';
import { MediaBanner } from '@utility/anilist';
import { pickTitle, useTitleLang } from '@utility/titleLang';
import { stripHtml } from '@utility/utils';

export interface SpotlightProps {
  items: MediaBanner[];
}

const Spotlight: React.FC<SpotlightProps> = ({ items }) => {
  const lang = useTitleLang();
  return (
    <FeaturedBanner
      label="Featured anime"
      ctaLabel="Explore anime"
      items={items.map((item) => ({
        id: item.id,
        title: pickTitle(item.title, lang),
        cover: item.coverImage?.large || item.coverImage?.medium || undefined,
        backdrop: item.bannerImage || undefined,
        summary: stripHtml(item.description || '')
          .replace(/&[^;]+;/g, ' ')
          .trim(),
        meta: [
          item.format,
          item.startDate?.year,
          item.meanScore && `${item.meanScore}% score`,
        ]
          .filter(Boolean)
          .join(' · '),
        href: `/anime/${item.id}`,
      }))}
    />
  );
};

export default Spotlight;
