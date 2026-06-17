import { useEffect, useRef, useState } from 'react';

import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { useRouter } from 'next/router';

import { watchPage } from '@animeflix/api';
import {
  AnimeBannerFragment,
  AnimeInfoFragment,
  MediaType,
} from '@animeflix/api/aniList';
import { SparklesIcon, UserGroupIcon } from '@heroicons/react/outline';
import { NextSeo } from 'next-seo';

import RatingSelect from '@components/anime/RatingSelect';
import RelatedSection, {
  type RelationItem,
} from '@components/anime/RelatedSection';
import StatusSelect from '@components/anime/StatusSelect';
import Genre from '@components/Genre';
import Header from '@components/Header';
import progressBar from '@components/Progress';
import RecommendationCard from '@components/watch/Card';
import CompanionChat from '@components/watch/CompanionChat';
import CompanionFab from '@components/watch/CompanionFab';
import Episode from '@components/watch/Episode';
import FullscreenDock from '@components/watch/FullscreenDock';
import OverlayLayer from '@components/watch/OverlayLayer';
import RateShowPrompt from '@components/watch/RateShowPrompt';
import RoomUI from '@components/watch/RoomUI';
import SourcePlayer from '@components/watch/SourcePlayer';
import WatchControls from '@components/watch/WatchControls';
import { useSyncPlayer } from '@hooks/useSyncPlayer';
import { setAnime } from '@slices/anime';
import { setEpisode } from '@slices/episode';
import { setTotalEpisodes } from '@slices/gogoApi';
import { initialiseStore, useDispatch, useSelector } from '@store/store';
import { getResumeEpisode } from '@utility/progress';
import { useRoom } from '@utility/room';
import { useRoomUnread } from '@utility/roomChatStore';
import { convertToDate, convertToTime } from '@utility/time';
import { pickTitle, useTitleLang } from '@utility/titleLang';
import { arrayToString } from '@utility/utils';

interface WatchProps {
  anime: AnimeInfoFragment & AnimeBannerFragment;
  recommended: (AnimeInfoFragment & AnimeBannerFragment)[];
  related: RelationItem[];
}

// Read a co-watch room code off the URL once, at render time, before the
// episode-sync effect rewrites the URL (which would otherwise drop ?room=).
const readRoomParam = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    return new URLSearchParams(window.location.search).get('room') || undefined;
  } catch {
    return undefined;
  }
};

export const getServerSideProps: GetServerSideProps<WatchProps> = async (
  context
) => {
  const store = initialiseStore();

  const { id } = context.params;
  const { episode } = context.query;

  store.dispatch(setAnime(parseInt(arrayToString(id), 10)));

  if (episode) {
    store.dispatch(setEpisode(parseInt(arrayToString(episode), 10)));
  }

  const data = await watchPage({
    id: parseInt(arrayToString(id), 10),
    perPage: 20,
  });

  const recommended = data.recommended.recommendations.map(
    (anime) => anime.mediaRecommendation
  );

  // Related franchise entries (sequels / side stories / OVAs, ANIME nodes only)
  // so viewers can jump within a series without leaving the watch page.
  const related: RelationItem[] = (data.anime.relations?.edges ?? [])
    .filter(
      (e) => e && e.node && e.node.type === MediaType.Anime && e.relationType
    )
    .map((e) => ({
      relationType: e.relationType as string,
      node: e.node as AnimeInfoFragment,
    }));

  return {
    props: {
      anime: data.anime,
      recommended,
      related,
      initialReduxState: store.getState(),
    },
  };
};

const Watch = ({
  anime,
  recommended,
  related,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  // finish the progress bar
  progressBar.finish();

  const router = useRouter();

  const dispatch = useDispatch();
  const titleLang = useTitleLang();
  const [animeId, episode] = useSelector((store) => [
    store.anime.anime,
    store.episode.episode,
  ]);
  const routerRef = useRef(router);

  // Co-watch (Teleparty): captured render-time so the URL rewrite below keeps it.
  const [roomCode] = useState<string | undefined>(readRoomParam);
  // Run the playback-sync engine page-level so a room stays in lockstep no matter
  // which right-rail tab is showing.
  useSyncPlayer();

  useEffect(() => {
    // only run when the initial episode value was not supplied
    if (routerRef.current.query.episode) return;

    // resume from the saved progress entry (defaults to episode 1)
    dispatch(setEpisode(getResumeEpisode(animeId)));
  }, [animeId, dispatch]);

  // update the router url (preserve ?room= so an invite link stays shareable)
  useEffect(() => {
    routerRef.current.replace(
      {
        pathname: '/watch/[id]',
        query: {
          id: animeId,
          episode,
          ...(roomCode ? { room: roomCode } : {}),
        },
      },
      `/watch/${animeId}/?episode=${episode}${
        roomCode ? `&room=${roomCode}` : ''
      }`,
      {
        shallow: true,
      }
    );
  }, [animeId, episode, roomCode]);

  // total episode count comes from AniList: finished anime expose `episodes`,
  // while currently-airing ones expose the next airing episode instead.
  const totalEpisodes =
    anime.episodes ||
    (anime.nextAiringEpisode ? anime.nextAiringEpisode.episode - 1 : 0);

  useEffect(() => {
    dispatch(setTotalEpisodes(totalEpisodes));
  }, [dispatch, totalEpisodes]);

  // get data about next airing episode
  const { nextAiringEpisode } = anime;

  // Right rail switches between recommendations, the AI companion, and the
  // co-watch room.
  const [asideTab, setAsideTab] = useState<
    'recommended' | 'companion' | 'room'
  >('recommended');
  // Unread room chatter while the Together tab isn't the one showing — badges the tab.
  const roomUnread = useRoomUnread();

  // Follower lock: in a connected room with a known leader who isn't us, our
  // playback controls are driven by the leader, so the player locks them and
  // shows a calm indicator. The leader (and any solo / no-room viewer) is never
  // locked. The sync engine already ignores a follower's intent; this is the
  // matching UI lock so the controls don't *look* live when they aren't.
  const room = useRoom();
  const controlsLocked = Boolean(
    room.status === 'connected' &&
      room.leaderId &&
      room.selfId &&
      room.leaderId !== room.selfId
  );
  const leaderName =
    room.members.find((m) => m.clientId === room.leaderId)?.data.name ??
    'someone';
  // Land on the room tab when arriving through an invite link (post-hydration so
  // SSR markup stays consistent).
  useEffect(() => {
    if (roomCode) setAsideTab('room');
  }, [roomCode]);

  // Low-spoiler cast roster for the companion: names + role + JP voice actor
  // only, NO bios or arcs, capped to the top ~12. This lets it answer "who was
  // that again?" without inventing anything or leaking later-arc spoilers. We
  // also carry the AniList ids (character + VA) + images so the companion's
  // lookup tools resolve "who voices X" by id without a search, and so the
  // entity cards have faces. The watchPage query returns AnimeCast
  // (`anime.characters`/`anime.studios`), but the page prop type is
  // AnimeInfo & AnimeBanner, so read it through a narrow local cast.
  const cast = (
    anime as unknown as {
      characters?: {
        edges?:
          | ({
              role?: string | null;
              node?: {
                id?: number | null;
                name?: { full?: string | null } | null;
                image?: { medium?: string | null } | null;
              } | null;
              voiceActors?:
                | ({
                    id?: number | null;
                    name?: { full?: string | null } | null;
                    image?: { medium?: string | null } | null;
                  } | null)[]
                | null;
            } | null)[]
          | null;
      } | null;
      studios?: {
        edges?:
          | ({
              isMain?: boolean | null;
              node?: { id?: number | null; name?: string | null } | null;
            } | null)[]
          | null;
      } | null;
    }
  ).characters;

  const roster = (cast?.edges ?? [])
    .map((edge) => {
      const name = edge?.node?.name?.full;
      if (!name) return null;
      const va = edge?.voiceActors?.[0];
      const role = edge?.role ? edge.role.toLowerCase() : undefined;
      return {
        name,
        role,
        va: va?.name?.full || undefined,
        characterId: edge?.node?.id ?? undefined,
        vaId: va?.id ?? undefined,
        characterImage: edge?.node?.image?.medium ?? undefined,
        vaImage: va?.image?.medium ?? undefined,
      };
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .slice(0, 18);

  const studios = (
    (
      anime as unknown as {
        studios?: {
          edges?:
            | ({
                isMain?: boolean | null;
                node?: { id?: number | null; name?: string | null } | null;
              } | null)[]
            | null;
        } | null;
      }
    ).studios?.edges ?? []
  )
    .map((edge) =>
      edge?.node?.id && edge.node.name
        ? {
            id: edge.node.id,
            name: edge.node.name,
            isMain: Boolean(edge.isMain),
          }
        : null
    )
    .filter((s): s is NonNullable<typeof s> => Boolean(s));

  // Earlier parts the viewer watched to get here (prequel / parent story). Tells
  // the companion this is a continuation, so returning characters + prior-season
  // events are already-watched and safe to discuss (a sequel shouldn't make it
  // forget who the leads are).
  const prequels = related
    .filter((r) => r.relationType === 'PREQUEL' || r.relationType === 'PARENT')
    .map((r) => r.node.title.english || r.node.title.romaji)
    .filter((t): t is string => Boolean(t));

  // Seed the companion with what it is allowed to know about the show up front.
  // The synopsis is HTML-stripped here; the per-moment subtitle window is pulled
  // live from the player at send time (see CompanionChat / companionContext).
  const companionSeed = {
    title: anime.title.english || anime.title.romaji || '',
    synopsis: (anime.description || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    genres: anime.genres ?? [],
    format: anime.format || '',
    year: anime.startDate?.year ?? undefined,
    roster,
    studios,
    prequels,
  };

  return (
    <>
      <NextSeo
        title={`${
          anime.title.romaji || anime.title.english
        } | Episode ${episode}`}
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
              url: anime.coverImage.large || anime.coverImage.medium,
              alt: `Cover Image for ${
                anime.title.english || anime.title.romaji
              }`,
            },
          ],
        }}
      />

      <Header />

      <main className="mx-auto w-full max-w-screen-2xl px-4 pb-20 pt-4 sm:px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          {/* Player column */}
          <div className="min-w-0">
            <SourcePlayer
              titles={[anime.title.romaji, anime.title.english].filter(
                (t): t is string => Boolean(t)
              )}
              malId={anime.idMal}
              onNext={
                episode < totalEpisodes
                  ? () => dispatch(setEpisode(episode + 1))
                  : undefined
              }
              // Fullscreen "theater" dock: the companion AND the co-watch room,
              // tabbed. Shares the same animeId+episode thread and the same room
              // as the right-rail instances, so neither surface diverges.
              companionSlot={
                <FullscreenDock
                  seed={companionSeed}
                  animeId={animeId}
                  episode={episode}
                  total={totalEpisodes}
                  roomInitialCode={roomCode}
                />
              }
              // Danmaku + reaction floaties over the video (co-watch rooms).
              overlaySlot={<OverlayLayer />}
              // Follower lock: a non-leader in a connected room can't drive
              // playback, so the player locks the playback gestures + shows who
              // holds the remote. The leader / solo viewer sees no change.
              controlsLocked={controlsLocked}
              leaderName={leaderName}
            />

            <div className="mt-5">
              {anime.format !== 'MOVIE' && (
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                  Episode {episode}
                </p>
              )}
              <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
                <h1 className="font-display text-2xl font-bold leading-tight text-fg sm:text-3xl">
                  {pickTitle(anime.title, titleLang)}
                </h1>
                <div className="flex items-center gap-2">
                  <StatusSelect id={anime.id} />
                  <RatingSelect id={anime.id} />
                </div>
              </div>
            </div>

            {anime.genres?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {anime.genres.map((genre) => (
                  <Genre key={genre} genre={genre} />
                ))}
              </div>
            )}

            {nextAiringEpisode ? (
              <p className="mt-4 rounded-xl border border-line/60 bg-surface/40 p-3 text-sm text-muted">
                <span className="font-semibold text-fg">
                  Episode {nextAiringEpisode.episode}
                </span>{' '}
                airs {convertToDate(nextAiringEpisode.airingAt * 1000)}. New
                episodes air every{' '}
                {convertToTime(nextAiringEpisode.airingAt * 1000)}.
              </p>
            ) : null}

            <div className="mt-4">
              <WatchControls />
            </div>

            <Episode
              title={anime.title.romaji || anime.title.english}
              altTitle={anime.title.english}
            />

            <div className="mt-6">
              <h2 className="font-display text-lg font-bold text-fg">
                Synopsis
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted line-clamp-6 md:line-clamp-none">
                {anime.description?.replace(/<\w*\\?>/g, '')}
              </p>
            </div>

            {/* Related franchise entries — jump to sequels/OVAs without leaving
                the watch page. flush: the column already has its own padding. */}
            <RelatedSection items={related} flush />
          </div>

          {/* Right rail: recommendations or the AI watch companion */}
          <aside className="mt-10 lg:mt-0">
            <div className="mb-3 inline-flex rounded-full border border-line/60 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setAsideTab('recommended')}
                className={`rounded-full px-3 py-1 transition ${
                  asideTab === 'recommended'
                    ? 'bg-aurora text-accent-ink shadow-glow'
                    : 'text-muted hover:text-fg'
                }`}
              >
                Recommended
              </button>
              <button
                type="button"
                onClick={() => setAsideTab('companion')}
                className={`flex items-center gap-1 rounded-full px-3 py-1 transition ${
                  asideTab === 'companion'
                    ? 'bg-aurora text-accent-ink shadow-glow'
                    : 'text-muted hover:text-fg'
                }`}
              >
                <SparklesIcon className="h-3.5 w-3.5" />
                Companion
              </button>
              <button
                type="button"
                onClick={() => setAsideTab('room')}
                className={`relative flex items-center gap-1 rounded-full px-3 py-1 transition ${
                  asideTab === 'room'
                    ? 'bg-aurora text-accent-ink shadow-glow'
                    : 'text-muted hover:text-fg'
                }`}
              >
                <UserGroupIcon className="h-3.5 w-3.5" />
                Together
                {roomUnread > 0 && asideTab !== 'room' && (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-[1rem] animate-pulse place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-none text-accent-ink">
                    {roomUnread > 9 ? '9+' : roomUnread}
                  </span>
                )}
              </button>
            </div>

            {asideTab === 'recommended' && (
              <div className="space-y-2">
                {recommended.map((recommendation) => (
                  <RecommendationCard
                    anime={recommendation}
                    key={recommendation.id}
                  />
                ))}
              </div>
            )}
            {asideTab === 'companion' && (
              <CompanionChat
                seed={companionSeed}
                animeId={animeId}
                episode={episode}
                total={totalEpisodes}
              />
            )}
            {asideTab === 'room' && (
              <RoomUI
                initialCode={roomCode}
                companion={{
                  seed: companionSeed,
                  episode,
                  total: totalEpisodes,
                }}
              />
            )}
          </aside>
        </div>
      </main>

      {/* Mobile-only floating companion: the right rail above is hidden on
          phones, so this keeps the companion one tap away while watching. */}
      <CompanionFab
        seed={companionSeed}
        animeId={animeId}
        episode={episode}
        total={totalEpisodes}
      />

      {/* "Rate this show" nudge — fires when caught up / finished the finale,
          plus a rare mid-series nudge. Self-gating (skips if already rated). */}
      <RateShowPrompt
        animeId={animeId}
        episode={episode}
        totalEpisodes={totalEpisodes}
        title={pickTitle(anime.title, titleLang)}
      />
    </>
  );
};

export default Watch;
