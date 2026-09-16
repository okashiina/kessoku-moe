import type { NextApiRequest, NextApiResponse } from 'next';

import { desc, eq } from 'drizzle-orm';

import { getDb, hasDb, schema } from '@utility/db/client';
import { resolveViewer } from '@utility/db/viewer';
import { checkWriteRate, clientIp } from '@utility/db/writeRate';

interface PositionBody {
  anilistId?: unknown;
  chapterId?: unknown;
  chapterNumber?: unknown;
  page?: unknown;
  pages?: unknown;
  progressBps?: unknown;
  total?: unknown;
  lang?: unknown;
  title?: unknown;
  cover?: unknown;
}

const MAX_COUNT = 1_000_000;
const CHAPTER_RE = /^\d{1,60}(?:\.\d{1,30})?$/;

const intIn = (value: unknown, min: number, max: number): number | null => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
};

const requiredText = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= max ? text : null;
};

const optionalText = (
  value: unknown,
  max: number
): string | null | undefined => {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'string' && value.length <= max ? value : undefined;
};

const serialize = (row: typeof schema.mangaReadingPositions.$inferSelect) => ({
  anilistId: row.anilistId,
  chapterId: row.chapterId,
  chapterNumber: row.chapterNumber,
  page: row.page,
  pages: row.pages,
  progressBps: row.progressBps,
  total: row.total,
  lang: row.lang,
  title: row.title,
  cover: row.cover,
  updatedAt: row.updatedAt.getTime(),
});

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!hasDb()) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }

  const viewer = await resolveViewer(req);
  if (!viewer) {
    res.status(401).json({ error: 'login_required' });
    return;
  }
  const db = getDb();
  if (!db) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }
  const { mangaReadingPositions } = schema;
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method === 'GET') {
    try {
      const rows = await db
        .select()
        .from(mangaReadingPositions)
        .where(eq(mangaReadingPositions.anilistUserId, viewer.id))
        .orderBy(desc(mangaReadingPositions.updatedAt));
      res.status(200).json({ positions: rows.map(serialize) });
    } catch {
      res.status(503).json({ error: 'db_unavailable' });
    }
    return;
  }

  let gate = { ok: true } as ReturnType<typeof checkWriteRate>;
  try {
    gate = checkWriteRate(clientIp(req), `manga-position:${viewer.id}`);
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

  const body = (req.body || {}) as PositionBody;
  const anilistId = intIn(body.anilistId, 1, 2_147_483_647);
  const chapterId = requiredText(body.chapterId, 512);
  const chapterNumber = requiredText(body.chapterNumber, 64);
  const page = intIn(body.page, 0, MAX_COUNT);
  const pages = intIn(body.pages, 0, MAX_COUNT);
  const progressBps = intIn(body.progressBps, 0, 10000);
  const total = intIn(body.total, 0, MAX_COUNT);
  const lang = requiredText(body.lang, 20);
  const title = requiredText(body.title, 500);
  const cover = optionalText(body.cover, 2048);
  if (
    anilistId === null ||
    !chapterId ||
    !chapterNumber ||
    !CHAPTER_RE.test(chapterNumber) ||
    page === null ||
    pages === null ||
    (pages > 0 && page >= pages) ||
    progressBps === null ||
    total === null ||
    !lang ||
    !title ||
    cover === undefined
  ) {
    res.status(400).json({ error: 'bad_input' });
    return;
  }

  try {
    const now = new Date();
    const [row] = await db
      .insert(mangaReadingPositions)
      .values({
        anilistUserId: viewer.id,
        anilistId,
        chapterId,
        chapterNumber,
        page,
        pages,
        progressBps,
        total,
        lang,
        title,
        cover,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          mangaReadingPositions.anilistUserId,
          mangaReadingPositions.anilistId,
        ],
        set: {
          chapterId,
          chapterNumber,
          page,
          pages,
          progressBps,
          total,
          lang,
          title,
          cover,
          updatedAt: now,
        },
      })
      .returning();
    res.status(200).json({ position: serialize(row) });
  } catch {
    res.status(503).json({ error: 'db_unavailable' });
  }
};

export default handler;
