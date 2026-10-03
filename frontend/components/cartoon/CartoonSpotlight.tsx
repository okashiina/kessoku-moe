import FeaturedBanner from '@components/home/FeaturedBanner';
import { CartoonShow } from '@utility/cartoon';
import { stripHtml } from '@utility/utils';

const FEATURED_NAMES = [
  'Adventure Time',
  'Avatar: The Last Airbender',
  'The Simpsons',
  'Regular Show',
  'Gravity Falls',
  'Ben 10',
];

export const pickCartoonSpotlights = (shows: CartoonShow[]): CartoonShow[] => {
  const picks = FEATURED_NAMES.map((name) =>
    shows.find((show) => show.name.toLowerCase() === name.toLowerCase())
  ).filter((show): show is CartoonShow => Boolean(show?.image?.original));
  const remaining = [...shows]
    .filter(
      (show) =>
        show.image?.original &&
        (show.rating?.average || 0) >= 7 &&
        !picks.some((pick) => pick.id === show.id)
    )
    .sort((a, b) => (b.rating?.average || 0) - (a.rating?.average || 0));
  return [...picks, ...remaining].slice(0, 5);
};

const CartoonSpotlight: React.FC<{ shows: CartoonShow[] }> = ({ shows }) => (
  <FeaturedBanner
    label="Cartoon spotlight"
    ctaLabel="Explore series"
    items={shows.map((show) => ({
      id: show.id,
      title: show.name,
      cover: show.image?.original,
      summary: stripHtml(
        show.summary ||
          'Discover the episodes, cast, and available streams for this series.'
      )
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'"),
      meta: [
        show.premiered?.slice(0, 4),
        show.genres?.slice(0, 2).join(' / '),
        show.rating?.average && `${show.rating.average}/10`,
      ]
        .filter(Boolean)
        .join(' · '),
      href: `/cartoon/${show.id}`,
    }))}
  />
);

export default CartoonSpotlight;
