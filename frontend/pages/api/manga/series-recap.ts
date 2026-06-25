import type { NextApiRequest, NextApiResponse } from 'next';

import {
  completeChat,
  type ProviderMessage,
} from '@utility/companion/provider';
import { fetchMangaDetail } from '@utility/manga';
import { checkMangaAi, clientIp } from '@utility/manga/aiGuard';

// Series-level "Catch me up": one spoiler-bounded recap of the story up to the
// chapter the reader last finished. Distinct from the per-chapter Reading
// Companion (this lives on the manga detail page, not the reader). Reuses the
// same Gemini provider, the same Rule 8 'chat' rate guard, and the same honesty
// rule — manga has no trusted per-chapter synopsis, so the model must admit when
// it does not actually know the beats instead of inventing an arc.

const API_BASE = (
  process.env.COMPANION_API_BASE ||
  'https://generativelanguage.googleapis.com/v1beta/openai'
).replace(/\/$/, '');
const API_KEY = process.env.COMPANION_API_KEY || '';
const MODEL = process.env.COMPANION_MODEL || 'gemini-2.5-flash';

const clip = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max)}…` : s;

interface RecapBody {
  anilistId?: number | null;
  upToChapter?: number | null;
}

const buildSystem = (
  title: string,
  detail: { description: string; genres: string[] },
  chapter: number
): string => {
  const upTo =
    chapter > 0 ? `chapter ${chapter}` : 'the very start (chapter 1)';
  const parts = [
    "You are kessoku's reading companion catching a reader up on a manga before they read on. Dark, cute, a little rock. Warm and quick, like a friend recapping the story across the table, not a wiki entry. A few short paragraphs, no headings, no bullet lists, no em dashes.",
    `SERIES: ${title}. The reader has read up to ${upTo}.`,
    `TASK: recap the story SO FAR, only up to ${upTo}.`,
    `SPOILER LIMIT: this is the whole point. Never reveal, hint at, foreshadow, or tease anything that happens after ${upTo}. If you are unsure whether a beat has landed by ${upTo}, leave it out. A spoiler here breaks the reader's trust.`,
    `HONESTY: manga has no trusted per-chapter synopsis here, so you may not know the beat-by-beat story up to this point. If you do not actually know what has happened by ${upTo}, say so plainly in a line or two instead of inventing arcs, events, or character moments. A confident wrong recap is worse than admitting you cannot trace it chapter by chapter. When you are unsure, you can still set the scene from the premise below without claiming specific events occurred.`,
  ];
  if (detail.description) {
    parts.push(
      `SERIES PREMISE (this may describe the whole series, so never use it to reveal anything past ${upTo}): ${clip(
        detail.description,
        1400
      )}`
    );
  }
  if (detail.genres.length) {
    parts.push(`GENRES: ${detail.genres.join(', ')}.`);
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

  // Rule 8: rate-limit BEFORE touching the model. Fail-open if the guard throws
  // so a guard bug never takes the feature down.
  let gate: ReturnType<typeof checkMangaAi> = { ok: true };
  try {
    gate = checkMangaAi(clientIp(req), 'chat');
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

  // No key configured -> graceful 200 the client can render as a friendly
  // "recap unavailable" empty state (never a 500).
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
  if (!Number.isFinite(anilistId) || anilistId <= 0) {
    res.status(400).json({ error: 'bad_anilist_id' });
    return;
  }
  const rawChapter = Number(body.upToChapter);
  const chapter =
    Number.isFinite(rawChapter) && rawChapter > 0 ? rawChapter : 1;

  const detail = await fetchMangaDetail(anilistId);
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
    'this manga';

  const messages: ProviderMessage[] = [
    {
      role: 'system',
      content: buildSystem(
        title,
        {
          description: (detail.description || '').trim(),
          genres: (detail.genres || []).filter(Boolean),
        },
        chapter
      ),
    },
    {
      role: 'user',
      content: `Catch me up on ${title}. I've read up to chapter ${chapter}. Keep it spoiler-safe past there.`,
    },
  ];

  let result: Awaited<ReturnType<typeof completeChat>>;
  try {
    result = await completeChat({
      base: API_BASE,
      key: API_KEY,
      model: MODEL,
      messages,
      maxTokens: 600,
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

  res.status(200).json({ recap, upToChapter: chapter });
};

export default handler;
