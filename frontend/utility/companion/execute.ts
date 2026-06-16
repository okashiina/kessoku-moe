import {
  searchStaff,
  searchStudios,
  staffPage,
  studioPage,
} from '@animeflix/api';

import {
  recapEpisode,
  recapEpisodes,
  seriesSynopsis,
  type RecapSource,
} from './recap';
import type {
  CardMedia,
  CharacterCard,
  CompanionRosterEntry,
  StudioCard,
  ToolCall,
  ToolContext,
  ToolResult,
  VoiceActorCard,
} from './types';

// Server-side tool execution for the companion. Wired to the SAME AniList SDK
// ops the /staff/[id] and /studio/[id] pages already use. The spoiler-inert
// WHITELIST is enforced HERE, shaping cards field-by-field from the SDK
// response: descriptions/bios are never read, so a prompt-injected arg cannot
// surface one. Cards (and the terse model-facing string) carry IDENTITY ONLY.

const ROLE_CAP = 16; // cap roles/media per card to bound localStorage + tokens

const norm = (s: string): string => s.trim().toLowerCase();

// Loose, defensive shapes — AniList can hand back sparse nodes.
interface MediaNode {
  id: number;
  title?: { romaji?: string | null; english?: string | null } | null;
  coverImage?: {
    large?: string | null;
    medium?: string | null;
    color?: string | null;
  } | null;
}

const mediaTitle = (n: MediaNode): string =>
  n.title?.romaji || n.title?.english || '';

const toCardMedia = (
  node: MediaNode | null | undefined,
  as?: string | null
): CardMedia | null => {
  if (!node || !node.title || !node.coverImage) return null;
  const cover = node.coverImage.large || node.coverImage.medium || null;
  if (!cover) return null;
  return {
    id: node.id,
    title: mediaTitle(node),
    cover,
    color: node.coverImage.color ?? null,
    as: as ?? null,
  };
};

// Loose fuzzy match used to resolve a name against the roster: exact, or either
// side contains the other (handles "Frieren" vs "Frieren the Slayer").
const looseMatch = (a: string, b: string): boolean => {
  const x = norm(a);
  const y = norm(b);
  return x === y || x.includes(y) || y.includes(x);
};

const findRosterByName = (
  roster: CompanionRosterEntry[],
  name: string
): CompanionRosterEntry | undefined =>
  roster.find((r) => r.name && looseMatch(r.name, name)) ||
  roster.find((r) => r.va && looseMatch(r.va, name));

const buildVoiceActorCard = (staff: {
  id: number;
  name?: { full?: string | null; native?: string | null } | null;
  image?: { large?: string | null; medium?: string | null } | null;
  primaryOccupations?: (string | null)[] | null;
  characterMedia?: {
    edges?:
      | ({
          characters?:
            | ({ name?: { full?: string | null } | null } | null)[]
            | null;
          node?: MediaNode | null;
        } | null)[]
      | null;
  } | null;
}): VoiceActorCard => {
  const seen = new Set<number>();
  const roles: CardMedia[] = (staff.characterMedia?.edges ?? [])
    .map((edge) => {
      const character =
        edge?.characters?.find((c) => c && c.name?.full)?.name?.full ?? null;
      return toCardMedia(edge?.node, character);
    })
    .filter((m): m is CardMedia => Boolean(m))
    .filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    })
    .slice(0, ROLE_CAP);

  return {
    kind: 'voiceActor',
    staffId: staff.id,
    name: staff.name?.full ?? 'Voice actor',
    native: staff.name?.native ?? null,
    image: staff.image?.large ?? staff.image?.medium ?? null,
    occupations: (staff.primaryOccupations ?? []).filter((o): o is string =>
      Boolean(o)
    ),
    roles,
  };
};

const lookupVoiceActor = async (
  name: string,
  ctx: ToolContext
): Promise<ToolResult> => {
  const match = findRosterByName(ctx.roster, name);
  let staffId = match?.vaId;

  // No id on the roster → resolve the name (character's VA or the actor) via search.
  if (!staffId) {
    const keyword = match?.va || name;
    const sr = await searchStaff({ keyword, perPage: 1, page: 1 });
    staffId = sr.Page?.staff?.find((s) => s && s.id)?.id;
  }
  if (!staffId) {
    return {
      resultForModel: `No verified voice actor on record for "${name}". Say you are not sure rather than guess a name.`,
      card: null,
    };
  }

  const data = await staffPage({ id: staffId, perPage: 24 });
  if (!data.Staff) {
    return {
      resultForModel: `No verified voice actor on record for "${name}". Say you are not sure rather than guess.`,
      card: null,
    };
  }

  const card = buildVoiceActorCard(data.Staff);
  const top = card.roles
    .slice(0, 8)
    .map((r) => `${r.title}${r.as ? ` as ${r.as}` : ''}`)
    .join('; ');
  const resultForModel = `${card.name}${
    card.native ? ` (${card.native})` : ''
  } — Japanese voice actor. Other roles: ${top || 'none on record'}.`;
  return { resultForModel, card };
};

const lookupStudio = async (
  name: string | undefined,
  ctx: ToolContext
): Promise<ToolResult> => {
  const studios = ctx.studios || [];
  const target = name
    ? studios.find((s) => looseMatch(s.name, name))
    : studios.find((s) => s.isMain) || studios[0];

  let studioId = target?.id;
  let studioName = target?.name || name || 'Studio';
  let media: CardMedia[] = [];

  if (studioId) {
    const data = await studioPage({ id: studioId, perPage: 24 });
    if (data.Studio) {
      studioName = data.Studio.name;
      media = (data.Studio.media?.nodes ?? [])
        .map((n) => toCardMedia(n))
        .filter((m): m is CardMedia => Boolean(m))
        .slice(0, ROLE_CAP);
    }
  } else if (name) {
    const sr = await searchStudios({ keyword: name, perPage: 1, page: 1 });
    const s = sr.Page?.studios?.find((x) => x && x.id);
    if (s) {
      studioId = s.id;
      studioName = s.name;
      media = (s.media?.nodes ?? [])
        .map((n) => toCardMedia(n))
        .filter((m): m is CardMedia => Boolean(m))
        .slice(0, ROLE_CAP);
    }
  }

  if (!studioId) {
    return {
      resultForModel: `No verified studio on record for "${
        name ?? 'this show'
      }". Say you are not sure rather than guess.`,
      card: null,
    };
  }

  const card: StudioCard = {
    kind: 'studio',
    studioId,
    name: studioName,
    media,
  };
  const top = media
    .slice(0, 8)
    .map((m) => m.title)
    .join('; ');
  return {
    resultForModel: `${studioName} — animation studio. Other works: ${
      top || 'none on record'
    }.`,
    card,
  };
};

// AniList GraphQL — global character search. The companion must be able to
// identify ANY character of the series the viewer is watching, including iconic
// or returning ones that a given AniList entry's short cast list leaves out
// (e.g. "who is Gojo" while watching a later JJK part). lookupVoiceActor already
// falls back to a global staff search; characters had no equivalent, so a name
// off the roster dead-ended in a forced refusal. This raw request — identity
// fields ONLY (name, image, the canonical Japanese voice actor; never a bio or
// `description`) — closes that gap without a codegen round, mirroring how
// provider.ts talks to its endpoint directly.
const ANILIST_ENDPOINT = 'https://graphql.anilist.co/';

// Shared selection. NOTE: AniList's Character root rejects an explicit `id: null`
// (it reads it as "find id null" → Not Found), so we can't declare both $id and
// $search in one query and pass null for the unused one. Two queries, one field
// set, pick by whether we have an id.
const CHARACTER_FIELDS = `
    id
    name { full native }
    image { large medium }
    media(perPage: 16, sort: [POPULARITY_DESC]) {
      edges {
        characterRole
        node {
          id
          title { romaji english }
          coverImage { large medium color }
        }
        voiceActors(language: JAPANESE) {
          id
          name { full native }
          image { large medium }
        }
      }
    }`;

const CHARACTER_BY_ID = `query CompanionCharacterById($id: Int) {
  Character(id: $id) {${CHARACTER_FIELDS}
  }
}`;

const CHARACTER_BY_SEARCH = `query CompanionCharacterBySearch($search: String) {
  Character(search: $search) {${CHARACTER_FIELDS}
  }
}`;

interface AniListCharacter {
  id: number;
  name?: { full?: string | null; native?: string | null } | null;
  image?: { large?: string | null; medium?: string | null } | null;
  media?: {
    edges?:
      | ({
          characterRole?: string | null;
          node?: MediaNode | null;
          voiceActors?:
            | ({
                id: number;
                name?: { full?: string | null; native?: string | null } | null;
                image?: {
                  large?: string | null;
                  medium?: string | null;
                } | null;
              } | null)[]
            | null;
        } | null)[]
      | null;
  } | null;
}

// One AniList Character — by id (precise, for a roster hit) or by name (global
// search fallback). Returns identity + the media the character appears in.
const fetchCharacter = async (vars: {
  id?: number | null;
  name?: string;
}): Promise<AniListCharacter | null> => {
  const byId = typeof vars.id === 'number' && vars.id > 0;
  const payload = byId
    ? { query: CHARACTER_BY_ID, variables: { id: vars.id } }
    : { query: CHARACTER_BY_SEARCH, variables: { search: vars.name } };
  const res = await fetch(ANILIST_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as {
    data?: { Character?: AniListCharacter | null } | null;
  };
  return json.data?.Character ?? null;
};

const titleCase = (s: string): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

const lookupCharacter = async (
  name: string,
  ctx: ToolContext
): Promise<ToolResult> => {
  // Roster match gives the correct IN-SHOW role label + character art for this
  // entry; AniList fills the VA and the "appears in" rail. A name off this
  // entry's (often partial) cast list still resolves globally by search, so an
  // established character the viewer names never dead-ends in a refusal.
  const r = findRosterByName(ctx.roster, name);
  const hit = await fetchCharacter(
    r?.characterId ? { id: r.characterId } : { name }
  );

  if (!hit && !r) {
    return {
      resultForModel: `No character on record matching "${name}". Say you are not sure who they mean rather than invent a name.`,
      card: null,
    };
  }

  const full = r?.name || hit?.name?.full || name;
  const native = hit?.name?.native || null;
  const edges = (hit?.media?.edges ?? []).filter(
    (e): e is NonNullable<typeof e> => Boolean(e)
  );
  const top = edges[0] ?? null;
  const series = top?.node?.title?.english || top?.node?.title?.romaji || '';
  // VA: roster first; else the first edge that actually lists one (the most
  // popular media sometimes omits the cast).
  const edgeVa =
    edges
      .flatMap((e) => e.voiceActors ?? [])
      .find((v) => v && v.id && v.name?.full) ?? null;
  const role =
    r?.role || (top?.characterRole ? titleCase(top.characterRole) : null);

  // "Appears in" rail — the other anime this character shows up in. Identity
  // browse only (titles + posters), deduped + capped. Never plot.
  const seen = new Set<number>();
  const media: CardMedia[] = edges
    .map((e) => toCardMedia(e.node))
    .filter((m): m is CardMedia => Boolean(m))
    .filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    })
    .slice(0, ROLE_CAP);

  const card: CharacterCard = {
    kind: 'character',
    characterId: hit?.id ?? r?.characterId ?? null,
    name: full,
    image: r?.characterImage || hit?.image?.large || hit?.image?.medium || null,
    role,
    vaId: edgeVa?.id ?? r?.vaId ?? null,
    vaName: edgeVa?.name?.full ?? r?.va ?? null,
    vaImage:
      edgeVa?.image?.large || edgeVa?.image?.medium || r?.vaImage || null,
    media,
  };

  const appears = media
    .slice(0, 6)
    .map((m) => m.title)
    .filter(Boolean)
    .join('; ');
  const resultForModel = `${full}${native ? ` (${native})` : ''} — character${
    series ? ` from ${series}` : ''
  }${card.vaName ? `, voiced by ${card.vaName}` : ''}.${
    appears ? ` Appears in (identity only, not plot): ${appears}.` : ''
  } (Verified via AniList; state identity only — no plot, no relationships.)`;
  return { resultForModel, card };
};

const listMainCast = (ctx: ToolContext): ToolResult => {
  const lines = ctx.roster
    .slice(0, 12)
    .map((r) => `${r.name}${r.va ? ` (VA: ${r.va})` : ''}`);
  return {
    resultForModel: lines.length
      ? `Main cast: ${lines.join('; ')}.`
      : 'No cast list available for this title.',
    card: null,
  };
};

// --- Episode recap (Kitsu). The viewer's current episode is the spoiler
// ceiling: only episodes strictly before it are ever fetched, so a recap can
// never leak the current or a future episode. Every call is bounded (one episode,
// or the last two + a single prequel premise) and the results are cached.
const recapSourceFrom = (ctx: ToolContext): RecapSource | null => {
  const rc = ctx.recap;
  return rc?.title ? { title: rc.title, year: rc.year } : null;
};

const currentEpisode = (ctx: ToolContext): number => {
  const ep = ctx.recap?.episode;
  return typeof ep === 'number' && ep > 0 ? ep : 1;
};

const runRecapEpisode = async (
  call: ToolCall,
  ctx: ToolContext
): Promise<ToolResult> => {
  const src = recapSourceFrom(ctx);
  if (!src) {
    return {
      resultForModel: 'No episode data on record for this title.',
      card: null,
    };
  }
  const current = currentEpisode(ctx);
  const ceiling = current - 1; // strictly before the current episode
  if (ceiling < 1) {
    const prequel = ctx.recap?.prequels?.[0];
    return {
      resultForModel: prequel
        ? `This is episode 1 of ${src.title}, so nothing earlier happened in it. If they mean the earlier series, use recap_story_so_far (prequel: ${prequel}).`
        : 'This is the first episode — there is no earlier episode to recap yet.',
      card: null,
    };
  }
  const raw =
    typeof call.args.episode === 'number'
      ? Math.floor(call.args.episode)
      : ceiling;
  const asked = Math.min(Math.max(1, raw), ceiling); // clamp into [1, current-1]
  const ep = await recapEpisode(src, asked);
  if (!ep) {
    return {
      resultForModel: `No recap on record for episode ${asked} of ${src.title}. Tell the viewer you don't have that recap and ask what they remember; do NOT guess the arc or what happened from general knowledge of the show.`,
      card: null,
    };
  }
  if (!ep.synopsis) {
    // Title-only (typical for fresh long-runner episodes): give the model the
    // real title to anchor on, but forbid inventing what happened beyond it.
    return {
      resultForModel: `Episode ${ep.number} of ${src.title}${
        ep.title ? ` is titled "${ep.title}"` : ' has no title on record'
      }, but I have no written synopsis for it. You may reference the title only; do NOT describe what happened or guess the arc from general knowledge — say you don't have the details and ask what they remember.`,
      card: null,
    };
  }
  return {
    resultForModel: `Episode ${ep.number}${
      ep.title ? ` ("${ep.title}")` : ''
    } recap (already watched — fine to discuss; do NOT mention anything past episode ${current}): ${
      ep.synopsis
    }`,
    card: null,
  };
};

const runRecapStorySoFar = async (ctx: ToolContext): Promise<ToolResult> => {
  const src = recapSourceFrom(ctx);
  if (!src) {
    return {
      resultForModel: 'No episode data on record for this title.',
      card: null,
    };
  }
  const current = currentEpisode(ctx);
  const ceiling = current - 1;
  const parts: string[] = [];

  // Sequel → unlock the earlier series at the premise level (one fetch), not by
  // enumerating its episodes.
  const prequel = ctx.recap?.prequels?.[0];
  if (prequel) {
    const pre = await seriesSynopsis({ title: prequel });
    parts.push(
      pre
        ? `Earlier series — ${prequel}: ${pre}`
        : `Earlier series the viewer has already watched: ${ctx.recap?.prequels?.join(
            '; '
          )}.`
    );
  }

  // The last couple of watched episodes of THIS entry (bounded to two fetches).
  if (ceiling >= 1) {
    const eps = await recapEpisodes(src, ceiling, 2);
    eps.forEach((e) =>
      parts.push(
        e.synopsis
          ? `Episode ${e.number}${e.title ? ` ("${e.title}")` : ''}: ${
              e.synopsis
            }`
          : `Episode ${e.number}${
              e.title ? ` is titled "${e.title}"` : ''
            } (no synopsis on record — reference the title only, do NOT invent what happened)`
      )
    );
  }

  if (!parts.length) {
    return {
      resultForModel: `The viewer is at the very start (episode ${current}); there is nothing to recap beyond the premise you already have.`,
      card: null,
    };
  }
  return {
    resultForModel: `Story so far (already-watched only; do NOT mention anything past episode ${current}):\n${parts.join(
      '\n'
    )}`,
    card: null,
  };
};

export const executeCompanionTool = async (
  call: ToolCall,
  ctx: ToolContext
): Promise<ToolResult> => {
  const name = typeof call.args.name === 'string' ? call.args.name.trim() : '';
  try {
    switch (call.name) {
      case 'lookup_voice_actor':
        return name
          ? await lookupVoiceActor(name, ctx)
          : { resultForModel: 'No name given to look up.', card: null };
      case 'lookup_studio':
        return await lookupStudio(name || undefined, ctx);
      case 'lookup_character':
        return name
          ? await lookupCharacter(name, ctx)
          : { resultForModel: 'No name given to look up.', card: null };
      case 'list_main_cast':
        return listMainCast(ctx);
      case 'recap_episode':
        return await runRecapEpisode(call, ctx);
      case 'recap_story_so_far':
        return await runRecapStorySoFar(ctx);
      default:
        return {
          resultForModel: `Unknown tool "${call.name}".`,
          card: null,
        };
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[companion] tool failed', call.name, err);
    return {
      resultForModel: `(lookup for "${name}" failed — say you are not sure rather than guess.)`,
      card: null,
    };
  }
};
