// Shared, runtime-free types for the AI watch companion v2 (streaming + grounded
// tools + entity cards). Kept in its own module so BOTH the server route
// (pages/api/companion.ts, provider/tools/execute) and the client store
// (companionThread.ts, CompanionChat.tsx) can import them without the client
// pulling in the AniList SDK or the server pulling in the React store.

// --- Entity cards (the model emits a tool call → the server fetches REAL
// AniList identity data → the client renders one of these inline in the chat).
// Persisted inside a ThreadMessage, so cards survive a reload without re-fetching.

export interface CardMedia {
  id: number;
  title: string;
  cover: string | null;
  color?: string | null;
  type?: 'ANIME' | 'MANGA' | null;
  // For a voice actor's roles: the character they played in this title.
  as?: string | null;
}

export interface VoiceActorCard {
  kind: 'voiceActor';
  staffId: number;
  name: string;
  native?: string | null;
  image?: string | null;
  occupations?: string[];
  roles: CardMedia[];
}

export interface StudioCard {
  kind: 'studio';
  studioId: number;
  name: string;
  media: CardMedia[];
}

export interface CharacterCard {
  kind: 'character';
  characterId?: number | null;
  name: string;
  image?: string | null;
  // Generic role LABEL only (e.g. "main"), never a relationship/backstory.
  role?: string | null;
  vaId?: number | null;
  vaName?: string | null;
  vaImage?: string | null;
  // The other anime this character appears in (identity browse — "what else is
  // Gojo in"). Titles + posters only, never plot.
  media?: CardMedia[];
}

export type CompanionCard = VoiceActorCard | StudioCard | CharacterCard;

// --- SSE protocol (server → client), one JSON object per `data:` frame.
export type SseEvent =
  | { type: 'thinking'; label: string }
  | { type: 'card'; card: CompanionCard }
  | { type: 'text_delta'; text: string }
  | { type: 'error'; code: string }
  | { type: 'done' };

// --- Tool calling.
export interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

// Grounding context the route hands to the tool executor. The roster + studios
// carry AniList ids (threaded from the watch page) so a lookup resolves by id
// without a search round-trip; names are the fallback.
export interface CompanionRosterEntry {
  name: string;
  role?: string;
  va?: string;
  characterId?: number;
  vaId?: number;
  characterImage?: string;
  vaImage?: string;
}

export interface CompanionStudio {
  id: number;
  name: string;
  isMain?: boolean;
}

// Episode-recap grounding context (Kitsu). `episode` is the viewer's current
// episode — the spoiler ceiling: only episodes strictly before it may be
// recapped. `prequels` lets a sequel unlock the earlier series' premise.
export interface CompanionRecapContext {
  title: string;
  year?: number;
  episode?: number;
  total?: number;
  prequels?: string[];
}

export interface ToolContext {
  roster: CompanionRosterEntry[];
  studios: CompanionStudio[];
  recap?: CompanionRecapContext;
}

// What an executed tool returns: a terse string the MODEL sees (identity only,
// never plot/relationships) + a typed card the CLIENT renders (or null).
export interface ToolResult {
  resultForModel: string;
  card: CompanionCard | null;
}
