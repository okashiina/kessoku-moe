import Section from '@components/anime/Section';
import useRecommendations from '@hooks/useRecommendations';
import { useTitle } from '@utility/titleLang';

// The two personalized home rails, driven by ONE recommendations fetch (so they
// share a single AniList round-trip): an aggregate "Recommended for you" and a
// "Because you watched <most-recent title>". Each hides until it has titles, so a
// fresh/anonymous visitor sees nothing extra. Client-only (reads local taste).
const RecommendationRails: React.FC = () => {
  const { forYou, because } = useRecommendations();
  // Called unconditionally (hook rule); '' when there is no "because" rail.
  const becauseTitle = useTitle(because?.title);

  if (forYou.length === 0 && (!because || because.items.length === 0)) {
    return null;
  }

  return (
    <>
      {forYou.length > 0 && (
        <Section title="Recommended for you" animeList={forYou} />
      )}
      {because && because.items.length > 0 && becauseTitle && (
        <Section
          title={`Because you watched ${becauseTitle}`}
          animeList={because.items}
        />
      )}
    </>
  );
};

export default RecommendationRails;
