import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Image from 'next/image';

import { staffPage } from '@animeflix/api';
import { AnimeInfoFragment, StaffPageQuery } from '@animeflix/api/aniList';
import { EmojiSadIcon } from '@heroicons/react/solid';
import { NextSeo } from 'next-seo';

import Header from '@components/Header';
import progressBar from '@components/Progress';
import RoleCard from '@components/staff/RoleCard';

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

      <main className="mx-auto w-full max-w-screen-2xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <header className="mb-10 flex animate-rise flex-col gap-5 sm:flex-row sm:items-center">
          <span className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-line/40 sm:h-32 sm:w-32">
            {staff.image && (
              <Image
                alt={displayName}
                src={staff.image}
                layout="fill"
                objectFit="cover"
              />
            )}
          </span>

          <div className="min-w-0">
            <p className="font-sans text-xs font-semibold uppercase tracking-[0.25em] text-accent">
              Voice actor
            </p>
            <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-fg sm:text-3xl lg:text-4xl">
              {displayName}
            </h1>
            {staff.native && (
              <p className="mt-1 text-base text-muted">{staff.native}</p>
            )}
            {staff.occupations.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {staff.occupations.map((occupation) => (
                  <span
                    key={occupation}
                    className="rounded-full border border-line/60 bg-surface px-3 py-1 text-xs font-medium capitalize text-muted"
                  >
                    {occupation}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>

        <div className="mb-6 flex items-center gap-2.5">
          <span className="h-5 w-1 rounded-full bg-aurora" aria-hidden />
          <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
            Roles
          </h2>
        </div>

        {hasRoles ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] justify-items-center gap-x-5 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
            {roles.map((role) => (
              <RoleCard
                key={`${role.characterId ?? role.characterName}:${
                  role.node.id
                }`}
                characterId={role.characterId}
                characterName={role.characterName}
                characterImage={role.characterImage}
                anime={role.node}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-line/60 bg-surface/40 px-6 py-16 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-faint">
              <EmojiSadIcon className="h-7 w-7" aria-hidden />
            </span>
            <h2 className="mt-5 font-display text-xl font-bold text-fg">
              No roles listed
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
              We couldn&apos;t pull any anime credits for this voice actor yet.
            </p>
          </div>
        )}
      </main>
    </>
  );
};

export default StaffPage;
