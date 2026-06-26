import type { NextApiRequest, NextApiResponse } from 'next';

import { ANILIST_ENDPOINT, requestWithRetry } from '@utility/anilist';
import {
  completeChat,
  type ProviderMessage,
} from '@utility/companion/provider';
import { checkCompanionRate, clientIp } from '@utility/companion/rateLimit';
import {
  recapEpisodes,
  seriesSynopsis,
  type RecapEpisode,
} from '@utility/companion/recap';

// Series-level "Catch me up" for anime detail pages. It uses local watched
// progress from the client as the spoiler boundary, grounds recent episodes via
// Kitsu/Jikan, then asks the companion for one concise recap.

const API_BASE = (
  process.env.COMPANION_API_BASE ||
  'https://generativelanguage.googleapis.com/v1beta/openai'
).replace(/\/$/, '');
const API_KEY = process.env.COMPANION_API_KEY || '';
const MODEL = process.env.COMPANION_MODEL || 'gemini-2.5-flash';

const clip = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max)}...` : s;

const stripHtml = (s: string | null | undefined): string =>
  (s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();

interface RecapBody {
  anilistId?: number | null;
  upToEpisode?: number | null;
}

interface AnimeDetail {
  Media: {
    id: number;
    title: {
      romaji: string | null;
      english: string | null;
      native: string | null;
    };
    description: string | null;
    genres: string[] | null;
    episodes: number | null;
    startDate: { year: number | null } | null;
  } | null;
}

const DETAIL_QUERY = /* GraphQL */ `
  query AnimeCatchUpDetail($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      title {
        romaji
        english
        native
      }
      description
      genres
      episodes
      startDate {
        year
      }
    }
  }
`;

const episodeLine = (ep: RecapEpisode): string => {
  const title = ep.title ? ` - ${ep.title}` : '';
  const synopsis = ep.synopsis ? `: ${ep.synopsis}` : '';
  return `Episode ${ep.number}${title}${synopsis}`;
};

const buildSystem = (
  title: string,
  detail: {
    description: string;
    genres: string[];
    year?: number;
    total?: number;
  },
  upToEpisode: number,
  grounded: RecapEpisode[],
  premise: string | null
): string => {
  const parts = [
    "You are kessoku's watch companion catching a viewer up before they press play. Dark, cute, a little rock. Warm and quick, like a friend doing a backstage recap, not a wiki entry. A few short paragraphs, no headings, no bullet lists, no em dashes.",
    `SERIES: ${title}. The viewer has watched up to episode ${upToEpisode}.`,
    `TASK: recap the story SO FAR, only up to episode ${upToEpisode}.`,
    `SPOILER LIMIT: never reveal, hint at, foreshadow, or tease anything after episode ${upToEpisode}. If you are unsure whether a beat has happened by then, leave it out.`,
    'HONESTY: use the episode grounding below when it exists. If there is not enough trusted grounding, say you can only set the scene instead of inventing plot beats.',
  ];
  if (premise) parts.push(`SERIES PREMISE: ${clip(premise, 800)}`);
  if (detail.description) {
    parts.push(
      `ANILIST DESCRIPTION (may describe the whole show, so do not use it for future spoilers): ${clip(
        detail.description,
        1000
      )}`
    );
  }
  if (detail.genres.length) parts.push(`GENRES: ${detail.genres.join(', ')}.`);
  if (detail.year) parts.push(`START YEAR: ${detail.year}.`);
  if (detail.total) parts.push(`LISTED EPISODES: ${detail.total}.`);
  if (grounded.length) {
    parts.push(
      `TRUSTED EPISODE GROUNDING:\n${grounded.map(episodeLine).join('\n')}`
    );
  }
  return parts.join('\n\n');
};

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  let gate: ReturnType<typeof checkCompanionRate> = { ok: true };
  try {
    gate = checkCompanionRate(clientIp(req));
  } catch {
    gate = { ok: true };
  }
  if (!gate.ok) {
    if (gate.retryAfter) res.setHeader('Retry-After', String(gate.retryAfter));
    res.status(429).json({
      error: 'rate_limited',
      reason: gate.reason,
      retryAfter: gate.retryAfter,
    });
    return;
  }

  if (!API_KEY) {
    res.status(200).json({
      recap: '',
      unavailable: true,
      message: 'The companion is offstage right now. Try again later.',
    });
    return;
  }

  const body = (req.body || {}) as RecapBody;
  const anilistId = Number(body.anilistId);
  if (!Number.isInteger(anilistId) || anilistId <= 0) {
    res.status(400).json({ error: 'bad_anilist_id' });
    return;
  }
  const rawEpisode = Number(body.upToEpisode);
  const upToEpisode =
    Number.isInteger(rawEpisode) && rawEpisode > 0 ? rawEpisode : 1;

  let detail: AnimeDetail['Media'] = null;
  try {
    const data = await requestWithRetry<AnimeDetail>(
      ANILIST_ENDPOINT,
      DETAIL_QUERY,
      { id: anilistId }
    );
    detail = data.Media;
  } catch {
    detail = null;
  }

  if (!detail) {
    res.status(200).json({
      recap: '',
      unavailable: true,
      message: "I couldn't find this title to recap. Try again later.",
    });
    return;
  }

  const title =
    detail.title.english ||
    detail.title.romaji ||
    detail.title.native ||
    'this anime';
  const year = detail.startDate?.year ?? undefined;

  const src = { title, year };
  const [grounded, premise] = await Promise.all([
    recapEpisodes(src, upToEpisode, 8).catch(() => []),
    seriesSynopsis(src).catch(() => null),
  ]);

  const messages: ProviderMessage[] = [
    {
      role: 'system',
      content: buildSystem(
        title,
        {
          description: stripHtml(detail.description),
          genres: (detail.genres || []).filter(Boolean),
          year,
          total: detail.episodes ?? undefined,
        },
        upToEpisode,
        grounded,
        premise
      ),
    },
    {
      role: 'user',
      content: `Catch me up on ${title}. I've watched up to episode ${upToEpisode}. Keep it spoiler-safe past there.`,
    },
  ];

  let result: Awaited<ReturnType<typeof completeChat>>;
  try {
    result = await completeChat({
      base: API_BASE,
      key: API_KEY,
      model: MODEL,
      messages,
      maxTokens: 650,
    });
  } catch {
    res.status(200).json({
      recap: '',
      unavailable: true,
      message: 'I lost the thread there. Give it another shot.',
    });
    return;
  }

  const recap = (result.content || '').trim();
  if (!recap) {
    res.status(200).json({
      recap: '',
      unavailable: true,
      message: result.rateLimited
        ? "That's the free companion quota for today. Catch you tomorrow."
        : 'I blanked on that one. Try again in a bit.',
    });
    return;
  }

  res.status(200).json({ recap, upToEpisode });
};

export default handler;
