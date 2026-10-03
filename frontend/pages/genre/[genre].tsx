import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { useRouter } from 'next/router';

import { searchGenre } from '@animeflix/api';
import { AnimeInfoFragment } from '@animeflix/api/aniList';
import { NextSeo } from 'next-seo';

import Card from '@components/anime/Card';
import Header from '@components/Header';
import progressBar from '@components/Progress';

interface GenreProps {
  searchResults: AnimeInfoFragment[];
}

export const getServerSideProps: GetServerSideProps<GenreProps> = async (
  context
) => {
  let { genre } = context.params;

  genre = typeof genre === 'string' ? genre : genre.join('');

  const data = await searchGenre({
    genre,
    perPage: 25,
    page: 1,
  });

  return {
    props: {
      searchResults: data.Page.media,
    },
  };
};

const Genre = ({
  searchResults,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();
  const { genre } = router.query;

  progressBar.finish();

  const hasResults = searchResults.length > 0;
  const genreText = typeof genre === 'string' ? genre : '';

  return (
    <>
      <NextSeo title={`Animes for Genre ${genre} | Animeflix`} />

      <Header />

      <div className="genre-page">
        <main className="genre-main">
          <header className="genre-heading">
            <p className="genre-kicker">Genre</p>
            <h1>{genreText}</h1>
            {hasResults && (
              <p className="genre-description">
                {searchResults.length}{' '}
                {searchResults.length === 1 ? 'title' : 'titles'} found
              </p>
            )}
          </header>

          {hasResults ? (
            <div className="genre-grid">
              {searchResults.map((anime) => (
                <Card key={anime.id} anime={anime} fluid />
              ))}
            </div>
          ) : (
            <div className="genre-empty">
              <h2>Nothing in {genreText} yet</h2>
              <p>
                We could not find any titles for {genreText}. Try another genre
                from browse.
              </p>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .genre-page {
          background: #17141c;
          min-height: 100dvh;
        }
        .genre-main {
          max-width: 1440px;
          margin: auto;
          padding: 42px 5% 80px;
          color: #f4ecef;
        }
        .genre-heading {
          margin-bottom: 32px;
        }
        .genre-kicker {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.14em;
          color: #f591ba;
        }
        .genre-heading h1 {
          font-family: 'Nunito', sans-serif;
          font-size: clamp(38px, 4.5vw, 64px);
          font-weight: 800;
          letter-spacing: -0.05em;
          line-height: 1.1;
          color: #f4ecef;
          margin-top: 8px;
        }
        .genre-description {
          color: #bfb2c1;
          margin-top: 12px;
          font-size: 15px;
        }
        .genre-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 28px 22px;
          justify-items: stretch;
          align-items: start;
        }
        .genre-grid :global([class*='text-faint']) {
          color: #bfb2c1;
        }
        .genre-empty {
          min-height: 340px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 16px;
        }
        .genre-empty h2 {
          font-family: 'Nunito', sans-serif;
          font-size: 26px;
          font-weight: 800;
        }
        .genre-empty p {
          max-width: 420px;
          color: #bfb2c1;
          line-height: 1.7;
        }
        @media (min-width: 768px) {
          .genre-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (min-width: 1024px) {
          .genre-grid {
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }
        }
        @media (max-width: 639px) {
          .genre-main {
            padding: 30px 5% max(48px, env(safe-area-inset-bottom));
          }
          .genre-heading {
            margin-bottom: 24px;
          }
          .genre-heading h1 {
            font-size: 38px;
          }
        }
      `}</style>
    </>
  );
};

export default Genre;
