import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { NextSeo } from 'next-seo';

import Header from '@components/Header';
import progressBar from '@components/Progress';
import { ANILIST_ENDPOINT, requestWithRetry } from '@utility/anilist';
import { base64SolidImage } from '@utility/image';
import { pickTitle, useTitleLang } from '@utility/titleLang';

// ---------------------------------------------------------------------------
// AniList GraphQL (fetched directly in getServerSideProps — no auth needed).
// ---------------------------------------------------------------------------

interface AniListMedia {
  id: number;
  title: { romaji: string | null; english: string | null };
  coverImage: {
    large: string | null;
    medium: string | null;
    color: string | null;
  };
  format: string | null;
  duration: number | null;
  meanScore: number | null;
  genres: string[] | null;
}

interface AiringSchedule {
  episode: number;
  airingAt: number;
  media: AniListMedia | null;
}

interface ScheduleData {
  Page: {
    airingSchedules: AiringSchedule[];
  };
}

const SCHEDULE_QUERY = /* GraphQL */ `
  query Schedule($airingAtGreater: Int, $airingAtLesser: Int) {
    Page(perPage: 50) {
      airingSchedules(
        airingAt_greater: $airingAtGreater
        airingAt_lesser: $airingAtLesser
        sort: TIME
      ) {
        episode
        airingAt
        media {
          id
          title {
            romaji
            english
          }
          coverImage {
            large
            medium
            color
          }
          format
          duration
          meanScore
          genres
        }
      }
    }
  }
`;

// Format a unix-seconds airing time into a clock string. Computed client-side
// in the component so it respects the viewer's locale/timezone.
const formatTime = (airingAt: number) =>
  new Date(airingAt * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

interface ScheduleProps {
  schedules: AiringSchedule[];
}

export const getServerSideProps: GetServerSideProps<
  ScheduleProps
> = async () => {
  const now = Math.floor(Date.now() / 1000);
  const weekFromNow = now + 7 * 24 * 60 * 60;

  let schedules: AiringSchedule[] = [];

  try {
    // graphql-request (not global fetch) so this works on the Node 16 runtime;
    // retry on AniList 429 so a transient rate-limit doesn't blank the schedule.
    const json = await requestWithRetry<ScheduleData>(
      ANILIST_ENDPOINT,
      SCHEDULE_QUERY,
      { airingAtGreater: now, airingAtLesser: weekFromNow }
    );

    if (json?.Page?.airingSchedules) {
      // Keep only entries that still have media attached.
      schedules = json.Page.airingSchedules.filter(
        (entry) => entry.media != null
      );
    }
  } catch {
    // Swallow network/parse errors — render the friendly empty state instead.
  }

  return {
    props: {
      schedules,
    },
  };
};

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

interface ScheduleRowProps {
  entry: AiringSchedule;
}

const ScheduleRow: React.FC<ScheduleRowProps> = ({ entry }) => {
  const lang = useTitleLang();
  const media = entry.media!;
  const title = pickTitle(media.title, lang) || 'Untitled';
  const cover = media.coverImage.large || media.coverImage.medium || '';

  return (
    <Link href={`/anime/${media.id}`} passHref>
      <a className="group flex items-center gap-3 rounded-2xl border border-line/40 bg-surface/40 p-2.5 ring-1 ring-line/20 backdrop-blur-sm transition duration-300 ease-out hover:-translate-y-0.5 hover:bg-surface-2 hover:shadow-lift hover:ring-accent/40">
        {/* Small fixed-size 2:3 thumbnail. We use an explicitly sized `relative`
            box (NOT the @tailwindcss/aspect-ratio plugin): inside a flex row the
            plugin's auto-absolute child stretches to the row height, so we lock
            width + height instead and let legacy `layout="fill"` fill it. */}
        <div className="relative h-[5.25rem] w-14 shrink-0 overflow-hidden rounded-xl bg-surface ring-1 ring-line/40 sm:h-24 sm:w-16">
          {cover && (
            <Image
              alt={`Cover for ${title}`}
              src={cover}
              layout="fill"
              objectFit="cover"
              objectPosition="center"
              className="transition duration-500 ease-out group-hover:scale-105"
              placeholder="blur"
              blurDataURL={`data:image/svg+xml;base64,${base64SolidImage(
                media.coverImage.color || '#1a1a2e'
              )}`}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-snug text-fg transition group-hover:text-accent">
            {title}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-faint">
            <span className="font-medium text-muted">Ep {entry.episode}</span>
            {media.format && (
              <>
                <span aria-hidden className="opacity-50">
                  •
                </span>
                <span>{media.format}</span>
              </>
            )}
          </div>
        </div>

        <span className="shrink-0 rounded-full border border-line/60 bg-canvas/50 px-2.5 py-1 text-xs font-semibold text-fg">
          {formatTime(entry.airingAt)}
        </span>
      </a>
    </Link>
  );
};

const Schedule = ({
  schedules,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  progressBar.finish();

  // Group entries into ordered day buckets starting from today, so the page
  // reads "today first" rather than always Sunday-first.
  const todayIndex = new Date().getDay();
  const dayOrder = Array.from(
    { length: 7 },
    (_, offset) => (todayIndex + offset) % 7
  );

  const buckets = new Map<number, AiringSchedule[]>();
  schedules.forEach((entry) => {
    const dayIndex = new Date(entry.airingAt * 1000).getDay();
    const list = buckets.get(dayIndex) ?? [];
    list.push(entry);
    buckets.set(dayIndex, list);
  });

  const orderedDays = dayOrder
    .map((dayIndex) => ({
      dayIndex,
      label: WEEKDAYS[dayIndex],
      entries: buckets.get(dayIndex) ?? [],
    }))
    .filter((day) => day.entries.length > 0);

  return (
    <>
      <NextSeo title="Airing schedule | kessoku moe" />

      <Header />

      <main className="mx-auto w-full max-w-screen-2xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <div className="mb-2 flex items-center gap-2.5">
          <span className="h-7 w-1 rounded-full bg-aurora" aria-hidden />
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
            Airing Schedule
          </h1>
        </div>
        <p className="mb-8 ml-3.5 text-sm text-muted">
          Episodes airing over the next 7 days.
        </p>

        {orderedDays.length > 0 ? (
          <div className="space-y-10">
            {orderedDays.map((day, i) => (
              <section key={day.dayIndex}>
                <div className="mb-4 flex items-center gap-2.5">
                  <span
                    className="h-5 w-1 rounded-full bg-aurora"
                    aria-hidden
                  />
                  <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
                    {i === 0 ? `${day.label} · Today` : day.label}
                  </h2>
                  <span className="text-sm text-faint">
                    {day.entries.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {day.entries.map((entry) => (
                    <ScheduleRow
                      key={`${entry.media!.id}-${entry.episode}-${
                        entry.airingAt
                      }`}
                      entry={entry}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-line/50 bg-surface/30 px-6 py-20 text-center">
            <p className="font-display text-lg font-bold text-fg">
              Nothing scheduled
            </p>
            <p className="mt-2 max-w-sm text-sm text-muted">
              No episodes are scheduled to air in the next 7 days. Check back
              soon.
            </p>
          </div>
        )}
      </main>
    </>
  );
};

export default Schedule;
