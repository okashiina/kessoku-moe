import { GetServerSideProps, InferGetServerSidePropsType } from 'next';

import { studioPage } from '@animeflix/api';
import { AnimeInfoFragment, StudioPageQuery } from '@animeflix/api/aniList';
import { NextSeo } from 'next-seo';

import Card from '@components/anime/Card';
import Header from '@components/Header';
import progressBar from '@components/Progress';

type Studio = NonNullable<StudioPageQuery['Studio']>;

interface StudioProps {
  studio: { id: number; name: string };
  media: AnimeInfoFragment[];
}

export const getServerSideProps: GetServerSideProps<StudioProps> = async (
  context
) => {
  let { id } = context.params;

  id = typeof id === 'string' ? id : id.join(' ');

  const numericId = parseInt(id, 10);
  if (!Number.isFinite(numericId)) {
    return { notFound: true };
  }

  const data = await studioPage({ id: numericId, perPage: 30 });

  if (!data.Studio) {
    return { notFound: true };
  }

  const studio: Studio = data.Studio;

  // Keep only fully-shaped nodes — the poster Card reads title + coverImage,
  // and AniList can hand back a sparse node now and then.
  const media: AnimeInfoFragment[] = (studio.media?.nodes ?? []).filter(
    (node): node is AnimeInfoFragment =>
      Boolean(node && node.title && node.coverImage)
  );

  return {
    props: {
      studio: { id: studio.id, name: studio.name },
      media,
    },
  };
};

const StudioPage = ({
  studio,
  media,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  progressBar.finish();

  const hasMedia = media.length > 0;

  return (
    <>
      <NextSeo title={`${studio.name} | kessoku moe`} />

      <Header />

      <div className="studio-page">
        <main className="studio-main">
          <header className="studio-heading">
            <p className="studio-kicker">Studio</p>
            <h1>{studio.name}</h1>
            {hasMedia && (
              <p className="studio-description">
                {media.length} {media.length === 1 ? 'title' : 'titles'}
              </p>
            )}
          </header>

          {hasMedia ? (
            <div className="studio-grid">
              {media.map((anime) => (
                <Card key={anime.id} anime={anime} fluid />
              ))}
            </div>
          ) : (
            <div className="studio-empty">
              <h2>Nothing on the shelf</h2>
              <p>
                We could not find any titles for this studio. Try another name
                from a show&apos;s credits.
              </p>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .studio-page {
          background: #17141c;
          min-height: 100dvh;
        }
        .studio-main {
          max-width: 1440px;
          margin: auto;
          padding: 42px 5% 80px;
          color: #f4ecef;
        }
        .studio-heading {
          margin-bottom: 32px;
        }
        .studio-kicker {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.14em;
          color: #f591ba;
        }
        .studio-heading h1 {
          font-family: 'Nunito', sans-serif;
          font-size: clamp(38px, 4.5vw, 64px);
          font-weight: 800;
          letter-spacing: -0.05em;
          line-height: 1.1;
          color: #f4ecef;
          margin-top: 8px;
        }
        .studio-description {
          color: #bfb2c1;
          margin-top: 12px;
          font-size: 15px;
        }
        .studio-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 28px 22px;
          justify-items: stretch;
          align-items: start;
        }
        .studio-grid :global([class*='text-faint']) {
          color: #bfb2c1;
        }
        .studio-empty {
          min-height: 340px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 16px;
        }
        .studio-empty h2 {
          font-family: 'Nunito', sans-serif;
          font-size: 26px;
          font-weight: 800;
        }
        .studio-empty p {
          max-width: 420px;
          color: #bfb2c1;
          line-height: 1.7;
        }
        @media (min-width: 768px) {
          .studio-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (min-width: 1024px) {
          .studio-grid {
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }
        }
        @media (max-width: 639px) {
          .studio-main {
            padding: 30px 5% max(48px, env(safe-area-inset-bottom));
          }
          .studio-heading {
            margin-bottom: 24px;
          }
          .studio-heading h1 {
            font-size: 38px;
          }
          .studio-description {
            font-size: 14px;
          }
        }
      `}</style>
    </>
  );
};

export default StudioPage;
