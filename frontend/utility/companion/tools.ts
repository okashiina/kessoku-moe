import type { ToolCall } from './types';

// OpenAI-compatible function schemas the companion may call to fetch REAL,
// verified identity facts instead of guessing. This is the structural fix for
// the ep-9 confabulation: the model literally cannot return a voice actor it
// hasn't fetched. Every tool returns IDENTITY ONLY (names, faces, other works)
// — nothing about THIS show's plot or relationships — so a tool result can
// never license a spoiler. Kept tiny and flat (single round, no chaining).

export interface CompanionToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

export const COMPANION_TOOLS: CompanionToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'lookup_voice_actor',
      description:
        'Get the real Japanese voice actor for a character in THIS show (or look up a named voice actor), plus the other anime they have voiced. Call this whenever the viewer asks who voices someone, or asks about a voice actor. Returns identity facts only — names and other roles, nothing about this show’s plot.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description:
              'A character in this show (e.g. the person the viewer is asking about) OR a voice actor’s name.',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lookup_studio',
      description:
        'Get an animation studio and the other anime it has produced. Call this when the viewer asks who made this show or about a studio’s other work. Omit the name to use this show’s main studio.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'A studio name. Omit to use this show’s studio.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'lookup_character',
      description:
        'Look up who a character is — their real name, generic role label, and Japanese voice actor — for ANY character in this series, INCLUDING iconic, returning, or off-screen ones that may not appear in the short cast list you were given (the list is partial). Call this whenever the viewer asks who someone is, names a character, or points one out, BEFORE you ever say you do not know them. Returns identity only — never a relationship, backstory, or anything not yet shown.',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'The character the viewer is asking about.',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_main_cast',
      description:
        'List the main cast of this show (character names + their voice actors). Call this if you need the authoritative cast list to answer a "who is in this" style question.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recap_episode',
      description:
        'Get a short factual recap of an EARLIER episode the viewer has already watched. Call this when they ask what happened before, to remind them, or when they refer back to a past episode. Omit the number for the episode right before the current one. Only returns episodes before where the viewer is now — never the current episode or a future one.',
      parameters: {
        type: 'object',
        properties: {
          episode: {
            type: 'integer',
            description:
              'Which past episode to recap. Omit for the one just before the current episode.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recap_story_so_far',
      description:
        'Get a brief "story so far": the last couple of episodes the viewer has watched, plus — if this show is a sequel — the earlier series\' premise. Call this for "what\'s happened so far" / "I forgot the plot" / "remind me where we are". Bounded and spoiler-safe: never reveals anything past where the viewer is.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
];

// Manga has no voice-actor/studio/episode-recap context. Keep its tool surface
// narrow so an identity question can only resolve a character or list the
// title's verified cast instead of wandering into anime-only lookups.
export const MANGA_COMPANION_TOOLS: CompanionToolSchema[] =
  COMPANION_TOOLS.filter(
    (tool) =>
      tool.function.name === 'lookup_character' ||
      tool.function.name === 'list_main_cast'
  );

// Short present-tense label for the "looking it up…" indicator while a tool runs.
export const labelForToolCall = (call: ToolCall): string => {
  const name = typeof call.args.name === 'string' ? call.args.name.trim() : '';
  switch (call.name) {
    case 'lookup_voice_actor':
      return name
        ? `looking up who voices ${name}…`
        : 'looking up the voice actor…';
    case 'lookup_studio':
      return name ? `looking up ${name}…` : 'looking up the studio…';
    case 'lookup_character':
      return name ? `checking who ${name} is…` : 'checking the cast…';
    case 'list_main_cast':
      return 'pulling up the cast…';
    case 'recap_episode': {
      const ep = call.args.episode;
      return typeof ep === 'number'
        ? `remembering episode ${ep}…`
        : 'remembering last episode…';
    }
    case 'recap_story_so_far':
      return 'catching up on the story so far…';
    default:
      return 'looking it up…';
  }
};
