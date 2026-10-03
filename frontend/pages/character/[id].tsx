import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Image from 'next/image';

import { AnimeInfoFragment } from '@animeflix/api/aniList';
import { NextSeo } from 'next-seo';

import Card from '@components/anime/Card';
import Header from '@components/Header';
import progressBar from '@components/Progress';

// Character detail page — mirrors /staff/[id] and /studio/[id]. AniList has no
// generated SDK op for a single Character, and the frontend consumes
// @animeflix/api as a built dist (so adding one would need a codegen + rebuild),
// so this fetches AniList directly for the exact AnimeInfo fields Card needs.

const ANILIST_ENDPOINT = 'https://graphql.anilist.co/';

const CHARACTER_PAGE_QUERY = `
query CharacterPage($id: Int) {
  Character(id: $id) {
    id
    name { full native }
    image { large medium }
    description
    media(sort: [POPULARITY_DESC], perPage: 36) {
      edges {
        characterRole
        node {
          id
          idMal
          title { english romaji }
          coverImage { color medium large }
          bannerImage
          format
          episodes
          duration
          meanScore
          nextAiringEpisode { airingAt timeUntilAiring episode }
        }
      }
    }
  }
}`;

interface RawCharacter {
  id: number;
  name?: { full?: string | null; native?: string | null } | null;
  image?: { large?: string | null; medium?: string | null } | null;
  description?: string | null;
  media?: {
    edges?:
      | ({
          characterRole?: string | null;
          node?: AnimeInfoFragment | null;
        } | null)[]
      | null;
  } | null;
}

interface Appearance {
  node: AnimeInfoFragment;
  role: string | null;
}

interface CharacterProps {
  character: {
    id: number;
    full: string | null;
    native: string | null;
    image: string | null;
    bio: string | null;
  };
  appearances: Appearance[];
}

const titleCase = (s: string): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

// AniList bios mix HTML, markdown emphasis, and `~!spoiler!~` sections. Drop the
// spoiler-tagged bits entirely (this is a public page, no progress context) and
// flatten the rest to plain text.
const cleanBio = (raw: string): string =>
  raw
    .replace(/~!([\s\S]*?)!~/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/__|~~|\*\*|\*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const getServerSideProps: GetServerSideProps<CharacterProps> = async (
  context
) => {
  const raw = context.params?.id;
  const id = typeof raw === 'string' ? raw : (raw ?? []).join(' ');
  const numericId = parseInt(id, 10);
  if (!Number.isFinite(numericId)) {
    return { notFound: true };
  }

  let character: RawCharacter | null = null;
  try {
    const res = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        query: CHARACTER_PAGE_QUERY,
        variables: { id: numericId },
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as {
        data?: { Character?: RawCharacter | null } | null;
      };
      character = json.data?.Character ?? null;
    }
  } catch {
    character = null;
  }

  if (!character) {
    return { notFound: true };
  }

  const seen = new Set<number>();
  const appearances: Appearance[] = (character.media?.edges ?? [])
    .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge?.node))
    .map((edge) => ({
      node: edge.node as AnimeInfoFragment,
      role: edge.characterRole ? titleCase(edge.characterRole) : null,
    }))
    .filter((a) => Boolean(a.node.title && a.node.coverImage))
    .filter((a) => {
      if (seen.has(a.node.id)) return false;
      seen.add(a.node.id);
      return true;
    });

  const bioRaw = (character.description || '').trim();
  const bio = bioRaw ? cleanBio(bioRaw) : '';

  return {
    props: {
      character: {
        id: character.id,
        full: character.name?.full ?? null,
        native: character.name?.native ?? null,
        image: character.image?.large ?? character.image?.medium ?? null,
        bio: bio || null,
      },
      appearances,
    },
  };
};

const CharacterPage = ({
  character,
  appearances,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  progressBar.finish();

  const displayName = character.full ?? 'Character';
  const hasAppearances = appearances.length > 0;

  return (
    <>
      <NextSeo title={`${displayName} | kessoku moe`} />

      <Header />

      <div className="character-page">
        <main className="character-main">
          <header className="character-header">
            <div className="character-portrait">
              {character.image && (
                <Image
                  alt={displayName}
                  src={character.image}
                  layout="fill"
                  objectFit="cover"
                />
              )}
            </div>

            <div className="character-intro">
              <p className="character-kicker">Character</p>
              <h1>{displayName}</h1>
              {character.native && (
                <p className="character-native">{character.native}</p>
              )}
              {character.bio && (
                <p className="character-bio">{character.bio}</p>
              )}
            </div>
          </header>

          <h2 className="character-section-title">Appears in</h2>

          {hasAppearances ? (
            <div className="character-grid">
              {appearances.map((a) => (
                <div key={a.node.id} className="character-grid-item">
                  <Card anime={a.node} fluid />
                  {a.role && <p className="character-role">{a.role}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="character-empty">
              <h2>No appearances listed</h2>
              <p>We couldn&apos;t pull any anime for this character yet.</p>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .character-page {
          background: #17141c;
          min-height: 100dvh;
        }
        .character-main {
          max-width: 1440px;
          margin: auto;
          padding: 42px 5% 80px;
          color: #f4ecef;
        }
        .character-header {
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin-bottom: 32px;
        }
        .character-portrait {
          position: relative;
          width: 112px;
          height: 112px;
          flex-shrink: 0;
          overflow: hidden;
          border-radius: 8px;
          background: #28212d;
        }
        .character-kicker {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.14em;
          color: #f591ba;
        }
        .character-intro h1 {
          font-family: 'Nunito', sans-serif;
          font-size: clamp(32px, 4.5vw, 64px);
          font-weight: 800;
          letter-spacing: -0.05em;
          line-height: 1.1;
          color: #f4ecef;
          margin-top: 8px;
        }
        .character-native {
          color: #bfb2c1;
          margin-top: 8px;
          font-size: 15px;
        }
        .character-bio {
          max-width: 72ch;
          margin-top: 16px;
          font-size: 16px;
          line-height: 1.6;
          color: #f4ecef;
          white-space: pre-wrap;
        }
        .character-section-title {
          font-family: 'Nunito', sans-serif;
          font-size: 22px;
          font-weight: 800;
          letter-spacing: -0.035em;
          color: #f4ecef;
          margin-bottom: 24px;
        }
        .character-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 28px 22px;
          align-items: start;
        }
        .character-grid :global([class*='text-faint']) {
          color: #bfb2c1;
        }
        .character-role {
          margin-top: 6px;
          font-size: 12px;
          color: #bfb2c1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .character-empty {
          min-height: 340px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 16px;
        }
        .character-empty h2 {
          font-family: 'Nunito', sans-serif;
          font-size: 26px;
          font-weight: 800;
        }
        .character-empty p {
          max-width: 420px;
          color: #bfb2c1;
          line-height: 1.7;
        }
        @media (min-width: 640px) {
          .character-header {
            flex-direction: row;
            align-items: flex-start;
            gap: 24px;
          }
          .character-portrait {
            width: 128px;
            height: 128px;
          }
        }
        @media (min-width: 768px) {
          .character-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (min-width: 1024px) {
          .character-grid {
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }
        }
        @media (max-width: 639px) {
          .character-main {
            padding: 30px 5% max(48px, env(safe-area-inset-bottom));
          }
          .character-header {
            margin-bottom: 24px;
          }
        }
      `}</style>
    </>
  );
};

export default CharacterPage;
