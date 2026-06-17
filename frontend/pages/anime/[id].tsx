import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { animePage, getKitsuEpisodes } from '@animeflix/api';
import {
  AnimeBannerFragment,
  AnimeCastFragment,
  AnimeInfoFragment,
  MediaStatus,
  MediaType,
} from '@animeflix/api/aniList';
import { EpisodesListFragment } from '@animeflix/api/kitsu';
import { ClockIcon } from '@heroicons/react/outline';
import { EmojiSadIcon } from '@heroicons/react/solid';
import { NextSeo } from 'next-seo';

import Banner from '@components/anime/Banner';
import EpisodeSection from '@components/anime/EpisodeSection';
import RatingSelect from '@components/anime/RatingSelect';
import RelatedSection, {
  type RelationItem,
} from '@components/anime/RelatedSection';
import Section from '@components/anime/Section';
import StatusSelect from '@components/anime/StatusSelect';
import Header from '@components/Header';

interface AnimeProps {
  anime: AnimeInfoFragment & AnimeBannerFragment & AnimeCastFragment;
  recommended: AnimeInfoFragment[];
  related: RelationItem[];
  episodes: EpisodesListFragment;
  status: MediaStatus | null;
  startDate: { year: number | null; month: number | null; day: number | null };
}

export const getServerSideProps: GetServerSideProps<AnimeProps> = async (
  context
) => {
  let { id } = context.params;

  id = typeof id === 'string' ? id : id.join(' ');

  const data = await animePage({
    id: parseInt(id, 10),
    perPage: 12,
  });

  if (!data.Media) {
    return {
      notFound: true,
    };
  }

  let episodes: EpisodesListFragment = {
    episodeCount: 0,
    episodes: null,
  };

  // dont fetch episodes if the anime hasn't released
  if (data.Media.status !== MediaStatus.NotYetReleased) {
    // fetch episode list
    const { title, startDate, season } = data.Media;
    const english = getKitsuEpisodes(title.english, season, startDate.year);
    const romaji = getKitsuEpisodes(title.romaji, season, startDate.year);
    episodes = await Promise.all([english, romaji]).then((r) => {
      return r[0].episodeCount > 0 ? r[0] : r[1];
    });

    // Kitsu lag fallback: Kitsu often trails AniList for currently-airing
    // titles — it may not list the show at all, or miss its newest episodes.
    // AniList always knows how many have aired (nextAiringEpisode.episode - 1,
    // or the final `episodes` total once finished), so take the larger count
    // and keep whatever rich nodes Kitsu does have. A bare numbered entry is
    // still fully playable: the watch page resolves sources by AniList id +
    // episode number, not by Kitsu metadata.
    const aired = data.Media.nextAiringEpisode
      ? data.Media.nextAiringEpisode.episode - 1
      : data.Media.episodes ?? 0;
    if (aired > (episodes.episodeCount ?? 0)) {
      episodes = {
        episodeCount: aired,
        episodes: episodes.episodes ?? { nodes: [] },
      };
    }
  }

  // Related franchise entries (sequels, side stories, OVAs, ...). Keep only
  // ANIME nodes — relations also point at the source manga/novel, which isn't
  // watchable here. RelatedSection handles labelling, de-duping and ordering.
  const related: RelationItem[] = (data.Media.relations?.edges ?? [])
    .filter(
      (e) => e && e.node && e.node.type === MediaType.Anime && e.relationType
    )
    .map((e) => ({
      relationType: e.relationType as string,
      node: e.node as AnimeInfoFragment,
    }));

  return {
    props: {
      anime: data.Media,
      recommended: data.recommended.recommendations.map(
        (r) => r.mediaRecommendation
      ),
      related,
      episodes,
      status: data.Media.status ?? null,
      startDate: {
        year: data.Media.startDate?.year ?? null,
        month: data.Media.startDate?.month ?? null,
        day: data.Media.startDate?.day ?? null,
      },
    },
  };
};

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="mt-10 px-4 sm:px-6 lg:px-8">
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-line/60 bg-surface/40 px-6 py-12 text-center">
      <EmojiSadIcon className="h-10 w-10 text-faint" aria-hidden />
      <p className="font-display text-lg font-semibold text-fg sm:text-xl">
        {message}
      </p>
    </div>
  </div>
);

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// Premiere date, formatted in UTC for deterministic SSR/CSR output.
const premiereLabel = (
  airingAt: number | null,
  startDate: { year: number | null; month: number | null; day: number | null }
): string | null => {
  if (airingAt) {
    const d = new Date(airingAt * 1000);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  if (startDate.year) {
    const { year, month, day } = startDate;
    if (month && day) return `${day} ${MONTHS[month - 1]} ${year}`;
    if (month) return `${MONTHS[month - 1]} ${year}`;
    return `${year}`;
  }
  return null;
};

const ComingSoon: React.FC<{ label: string | null }> = ({ label }) => (
  <div className="mt-10 px-4 sm:px-6 lg:px-8">
    <div className="flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-line/60 bg-surface/40 px-6 py-12 text-center">
      <ClockIcon className="h-10 w-10 text-accent" aria-hidden />
      <p className="font-display text-lg font-semibold text-fg sm:text-xl">
        Not aired yet
      </p>
      {label ? (
        <p className="text-sm text-muted">
          Premieres <span className="font-semibold text-fg">{label}</span>
        </p>
      ) : (
        <p className="text-sm text-muted">
          This title hasn&apos;t started airing.
        </p>
      )}
    </div>
  </div>
);

// Studio chips under the key art. Main studios (the ones who actually animated
// the show) lead; we keep a couple of others so the credit reads honestly.
const StudioRow: React.FC<{
  studios: AnimeCastFragment['studios'];
}> = ({ studios }) => {
  const edges = (studios?.edges ?? []).filter((e): e is NonNullable<typeof e> =>
    Boolean(e && e.node)
  );

  if (edges.length === 0) return null;

  // Main animators first, then the rest, capped so the row stays a credit not a
  // wall. De-dupe by id in case AniList lists a studio twice.
  const seen = new Set<number>();
  const ordered = edges
    .slice()
    .sort((a, b) => Number(b.isMain) - Number(a.isMain))
    .filter((e) => {
      const { node } = e;
      if (!node || seen.has(node.id)) return false;
      seen.add(node.id);
      return true;
    })
    .slice(0, 5);

  return (
    <section className="mt-10 px-4 sm:px-6 lg:px-8">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="h-5 w-1 rounded-full bg-aurora" aria-hidden />
        <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
          Studio
        </h2>
      </div>

      <div className="flex flex-wrap gap-2">
        {ordered.map((edge) => (
          <Link key={edge.node.id} href={`/studio/${edge.node.id}`} passHref>
            <a className="group inline-flex items-center gap-2 rounded-full border border-line/60 bg-surface px-3.5 py-1.5 text-sm font-medium text-muted transition duration-200 hover:border-accent/60 hover:bg-surface-2 hover:text-fg">
              <span className="font-display text-fg group-hover:text-accent">
                {edge.node.name}
              </span>
              {edge.isMain && (
                <span className="rounded-full bg-aurora px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-ink">
                  Main
                </span>
              )}
            </a>
          </Link>
        ))}
      </div>
    </section>
  );
};

// Cast rail: character on the left, the title's Japanese VA on the right.
// Tapping the VA opens their page so you can chase the rest of their roles.
const CastSection: React.FC<{
  characters: AnimeCastFragment['characters'];
}> = ({ characters }) => {
  const edges = (characters?.edges ?? [])
    .filter((e): e is NonNullable<typeof e> => Boolean(e && e.node))
    .slice(0, 12);

  if (edges.length === 0) return null;

  return (
    <section className="mt-10 px-4 sm:px-6 lg:px-8">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="h-5 w-1 rounded-full bg-aurora" aria-hidden />
        <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
          Cast
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {edges.map((edge) => {
          const character = edge.node;
          const va = (edge.voiceActors ?? []).find((v) => v && v.id) ?? null;
          const role = edge.role
            ? edge.role.charAt(0) + edge.role.slice(1).toLowerCase()
            : null;

          return (
            <div
              key={character.id}
              className="flex items-stretch justify-between gap-3 rounded-2xl border border-line/60 bg-surface p-2.5"
            >
              {/* Character side — opens the character's page (bio + where they
                  appear), mirroring the VA link on the right. */}
              <Link href={`/character/${character.id}`} passHref>
                <a className="group flex min-w-0 items-center gap-3">
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line/40 transition group-hover:ring-accent/50">
                    {character.image?.medium && (
                      <Image
                        alt={character.name?.full ?? 'Character'}
                        src={character.image.medium}
                        layout="fill"
                        objectFit="cover"
                      />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg transition group-hover:text-accent">
                      {character.name?.full ?? 'Unknown'}
                    </p>
                    {role && <p className="text-xs text-faint">{role}</p>}
                  </div>
                </a>
              </Link>

              {/* Voice actor side (Japanese) */}
              {va ? (
                <Link href={`/staff/${va.id}`} passHref>
                  <a className="group flex min-w-0 items-center gap-3 text-right">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-muted transition group-hover:text-accent">
                        {va.name?.full ?? 'Voice actor'}
                      </p>
                      <p className="text-xs text-faint">Japanese</p>
                    </div>
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line/40 transition group-hover:ring-accent/50">
                      {va.image?.medium && (
                        <Image
                          alt={va.name?.full ?? 'Voice actor'}
                          src={va.image.medium}
                          layout="fill"
                          objectFit="cover"
                        />
                      )}
                    </span>
                  </a>
                </Link>
              ) : (
                <div className="flex items-center pr-1 text-xs text-faint">
                  No VA listed
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

const Anime = ({
  anime,
  recommended,
  related,
  episodes,
  status,
  startDate,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  return (
    <>
      <NextSeo
        title={`${anime.title.romaji || anime.title.english} | Animeflix`}
        description={anime.description}
        openGraph={{
          images: [
            {
              type: 'large',
              url: anime.bannerImage,
              alt: `Banner Image for ${
                anime.title.english || anime.title.romaji
              }`,
            },
            {
              type: 'small',
              url: anime.coverImage.large || anime.coverImage.medium,
              alt: `Cover Image for ${
                anime.title.english || anime.title.romaji
              }`,
            },
          ],
        }}
      />

      <Header />
      <Banner anime={anime} />

      {/* Action row under the key art — Watch lives in the banner CTA, so this
          surfaces the list-status picker alongside it. */}
      <div className="mx-auto mt-6 flex w-full max-w-screen-2xl flex-wrap gap-3 px-4 sm:px-6 lg:px-8">
        <StatusSelect id={anime.id} />
        <RatingSelect id={anime.id} />
      </div>

      <main className="mx-auto w-full max-w-screen-2xl pb-20">
        {/* Don't show episode section if format is movie */}
        {anime.format !== 'MOVIE' && episodes.episodeCount > 0 && (
          <EpisodeSection anime={anime} episodes={episodes} />
        )}

        {anime.format !== 'MOVIE' &&
          episodes.episodeCount === 0 &&
          (status === MediaStatus.NotYetReleased ? (
            <ComingSoon
              label={premiereLabel(
                anime.nextAiringEpisode?.airingAt ?? null,
                startDate
              )}
            />
          ) : (
            <EmptyState message="No episodes found" />
          ))}

        <RelatedSection items={related} />

        <StudioRow studios={anime.studios} />

        <CastSection characters={anime.characters} />

        {recommended.length > 0 ? (
          <Section animeList={recommended} title="Recommended" />
        ) : (
          <EmptyState message="No recommendations found" />
        )}
      </main>
    </>
  );
};

export default Anime;
