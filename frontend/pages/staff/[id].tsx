import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { staffPage } from '@animeflix/api';
import { AnimeInfoFragment, StaffPageQuery } from '@animeflix/api/aniList';
import { NextSeo } from 'next-seo';

import Header from '@components/Header';
import progressBar from '@components/Progress';
import { base64SolidImage } from '@utility/image';
import { useTitle } from '@utility/titleLang';

type Staff = NonNullable<StaffPageQuery['Staff']>;

interface RoleItem {
  node: AnimeInfoFragment;
  characterId: number | null;
  characterName: string;
  characterImage: string | null;
}

// AniList serves character art at .../character/medium/...; the same asset lives
// at /large/ at a sharper resolution that suits a hero portrait. The "default"
// placeholder has no real art, so treat it as no image (the card shows initials).
const upscaleCharacter = (url?: string | null): string | null => {
  if (!url || url.includes('default')) return null;
  return url.replace('/character/medium/', '/character/large/');
};

interface StaffProps {
  staff: {
    id: number;
    full: string | null;
    native: string | null;
    image: string | null;
    occupations: string[];
  };
  roles: RoleItem[];
}

export const getServerSideProps: GetServerSideProps<StaffProps> = async (
  context
) => {
  let { id } = context.params;

  id = typeof id === 'string' ? id : id.join(' ');

  const numericId = parseInt(id, 10);
  if (!Number.isFinite(numericId)) {
    return { notFound: true };
  }

  const data = await staffPage({ id: numericId, perPage: 30 });

  if (!data.Staff) {
    return { notFound: true };
  }

  const staff: Staff = data.Staff;

  // The character is the subject here, so de-dupe per character-in-show
  // (a VA voicing two characters in one show gets two cards; the same character
  // across seasons stays separate, one card per season). Keep only fully-shaped
  // media + a named character so each card has a hero and a chip.
  const seen = new Set<string>();
  const roles: RoleItem[] = (staff.characterMedia?.edges ?? [])
    .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge))
    .map((edge) => {
      const { node } = edge;
      const character = edge.characters?.find((c) => c && c.name?.full) ?? null;
      return {
        node,
        characterId: character?.id ?? null,
        characterName: character?.name?.full ?? null,
        characterImage: upscaleCharacter(character?.image?.medium),
      };
    })
    .filter(
      (item): item is RoleItem =>
        Boolean(item.node && item.node.title && item.node.coverImage) &&
        Boolean(item.characterName)
    )
    .filter((item) => {
      const key = `${item.characterId ?? item.characterName}:${item.node.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    props: {
      staff: {
        id: staff.id,
        full: staff.name?.full ?? null,
        native: staff.name?.native ?? null,
        image: staff.image?.large ?? staff.image?.medium ?? null,
        occupations: (staff.primaryOccupations ?? []).filter((o): o is string =>
          Boolean(o)
        ),
      },
      roles,
    },
  };
};

interface RoleCreditProps {
  role: RoleItem;
}

const RoleCredit = ({ role }: RoleCreditProps) => {
  const animeTitle = useTitle(role.node.title);
  const tint = role.node.coverImage.color || '#1a1a2e';
  const cover = role.node.coverImage.medium || role.node.coverImage.large;
  const thumb = role.characterImage || cover;
  const characterHref = role.characterId
    ? `/character/${role.characterId}`
    : `/anime/${role.node.id}`;

  return (
    <article className="staff-credit">
      <Link href={characterHref} passHref>
        <a className="staff-credit-primary" aria-label={role.characterName}>
          <span className="staff-credit-thumb">
            {thumb ? (
              <Image
                alt=""
                src={thumb}
                layout="fill"
                objectFit="cover"
                objectPosition="top"
                placeholder="blur"
                blurDataURL={`data:image/svg+xml;base64,${base64SolidImage(
                  tint
                )}`}
              />
            ) : (
              <span className="staff-credit-initial" aria-hidden>
                {role.characterName.charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          <span className="staff-credit-name">{role.characterName}</span>
        </a>
      </Link>
      <Link href={`/anime/${role.node.id}`} passHref>
        <a className="staff-credit-show">
          in <span>{animeTitle}</span>
        </a>
      </Link>
    </article>
  );
};

const StaffPage = ({
  staff,
  roles,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  progressBar.finish();

  const hasRoles = roles.length > 0;
  const displayName = staff.full ?? 'Voice actor';

  return (
    <>
      <NextSeo title={`${displayName} | kessoku moe`} />

      <Header />

      <div className="staff-page">
        <main className="staff-main">
          <header className="staff-heading">
            <span className="staff-photo">
              {staff.image && (
                <Image
                  alt={displayName}
                  src={staff.image}
                  layout="fill"
                  objectFit="cover"
                />
              )}
            </span>

            <div className="staff-intro">
              <p className="staff-kicker">Staff</p>
              <h1>{displayName}</h1>
              {staff.native && <p className="staff-native">{staff.native}</p>}
              {staff.occupations.length > 0 && (
                <div className="staff-occupations">
                  {staff.occupations.map((occupation) => (
                    <span key={occupation} className="staff-occupation">
                      {occupation}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </header>

          <div className="staff-section">
            <h2>Roles</h2>
          </div>

          {hasRoles ? (
            <div className="staff-grid">
              {roles.map((role) => (
                <RoleCredit
                  key={`${role.characterId ?? role.characterName}:${
                    role.node.id
                  }`}
                  role={role}
                />
              ))}
            </div>
          ) : (
            <div className="staff-empty">
              <h2>No roles listed</h2>
              <p>
                We couldn&apos;t pull any anime credits for this voice actor
                yet.
              </p>
            </div>
          )}
        </main>
      </div>

      <style jsx>{`
        .staff-page {
          background: #17141c;
          min-height: 100dvh;
        }
        .staff-main {
          max-width: 1440px;
          margin: auto;
          padding: 42px 5% 80px;
          color: #f4ecef;
        }
        .staff-main h1,
        .staff-main h2 {
          font-family: 'Nunito', sans-serif;
        }
        .staff-main a {
          touch-action: manipulation;
        }
        .staff-heading {
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin-bottom: 32px;
        }
        .staff-photo {
          position: relative;
          width: 128px;
          height: 128px;
          flex-shrink: 0;
          overflow: hidden;
          border-radius: 8px;
          background: #28212d;
        }
        .staff-intro {
          min-width: 0;
        }
        .staff-kicker {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.14em;
          color: #f591ba;
          text-transform: uppercase;
        }
        .staff-heading h1 {
          font-family: 'Nunito', sans-serif;
          font-size: clamp(32px, 4.5vw, 64px);
          font-weight: 800;
          letter-spacing: -0.05em;
          line-height: 1.1;
          color: #f4ecef;
          margin-top: 8px;
        }
        .staff-native {
          color: #bfb2c1;
          margin-top: 8px;
          font-size: 15px;
        }
        .staff-occupations {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }
        .staff-occupation {
          padding: 8px 14px;
          border: 1px solid #5a495f;
          border-radius: 5px;
          font-size: 13px;
          color: #c9bdc8;
          text-transform: capitalize;
        }
        .staff-section {
          margin-bottom: 24px;
        }
        .staff-section h2 {
          font-size: 18px;
          font-weight: 800;
          color: #f4ecef;
        }
        .staff-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 28px 22px;
          align-items: start;
        }
        .staff-grid :global(.staff-credit) {
          min-height: 44px;
          border-radius: 8px;
          border: 1px solid #463b49;
          background: #28212d;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .staff-grid :global(.staff-credit-primary) {
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: 44px;
          padding: 10px 12px;
          color: #f4ecef;
          text-decoration: none;
          transition: background 0.2s;
        }
        .staff-grid :global(.staff-credit-primary:hover) {
          background: #332735;
        }
        .staff-grid :global(.staff-credit-primary:hover .staff-credit-name) {
          color: #f591ba;
        }
        .staff-grid :global(.staff-credit-thumb) {
          position: relative;
          width: 44px;
          height: 44px;
          flex-shrink: 0;
          overflow: hidden;
          border-radius: 8px;
          background: #17141c;
        }
        .staff-grid :global(.staff-credit-initial) {
          display: grid;
          place-items: center;
          width: 100%;
          height: 100%;
          font-family: 'Nunito', sans-serif;
          font-size: 18px;
          font-weight: 800;
          color: #66516a;
        }
        .staff-grid :global(.staff-credit-name) {
          font-size: 14px;
          font-weight: 700;
          line-height: 1.3;
          transition: color 0.2s;
        }
        .staff-grid :global(.staff-credit-show) {
          display: block;
          padding: 0 12px 10px 68px;
          font-size: 12px;
          color: #bfb2c1;
          text-decoration: none;
          transition: color 0.2s;
        }
        .staff-grid :global(.staff-credit-show span) {
          color: #c9bdc8;
        }
        .staff-grid :global(.staff-credit-show:hover) {
          color: #f591ba;
        }
        .staff-grid :global(.staff-credit-show:hover span) {
          color: #f591ba;
        }
        .staff-empty {
          min-height: 340px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          gap: 16px;
        }
        .staff-empty h2 {
          font-family: 'Nunito', sans-serif;
          font-size: 26px;
          font-weight: 800;
        }
        .staff-empty p {
          max-width: 420px;
          color: #bfb2c1;
          line-height: 1.7;
        }
        @media (min-width: 640px) {
          .staff-heading {
            flex-direction: row;
            align-items: center;
            gap: 24px;
          }
        }
        @media (min-width: 768px) {
          .staff-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (min-width: 1024px) {
          .staff-grid {
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }
        }
        @media (max-width: 639px) {
          .staff-main {
            padding: 30px 5% max(48px, env(safe-area-inset-bottom));
          }
          .staff-heading {
            margin-bottom: 24px;
          }
          .staff-heading h1 {
            font-size: 32px;
          }
        }
      `}</style>
    </>
  );
};

export default StaffPage;
