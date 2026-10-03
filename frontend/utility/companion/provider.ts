import type { ToolCall } from './types';

// Server-only thin wrapper over any OpenAI-compatible chat endpoint (OpenAI by
// default, with Gemini/Groq still supported as a base+model swap). Two shapes:
//   completeChat — one non-streamed call; returns the text AND any tool_calls
//                  in one complete JSON. Tool decisions happen here because
//                  streamed tool_call argument shards are fragmented and chunk
//                  differently across Gemini-openai vs Groq.
//   streamChat   — one streamed call; async-yields text deltas for the typing
//                  effect. Used for the final synthesis pass only (no tools).
// Neither throws: on any upstream failure they log and degrade (empty result /
// no yields) so the route can fall back instead of 500-ing mid-stream.

export type ProviderRole = 'system' | 'user' | 'assistant';

// `content` is a string today; a multimodal array (vision) slots in later.
export interface ProviderMessage {
  role: ProviderRole;
  content: unknown;
}

interface OpenAiTool {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

interface BaseArgs {
  base: string;
  key: string;
  model: string;
  messages: ProviderMessage[];
  maxTokens?: number;
  temperature?: number;
  // Extra headers (OpenRouter referer/title for the uncensored path).
  extraHeaders?: Record<string, string>;
}

export interface CompanionProvider {
  name: string;
  base: string;
  key: string;
  model: string;
  extraHeaders?: Record<string, string>;
}

// Provider-specific compatibility gates. Gemini and native OpenAI GPT-5 models
// accept `reasoning_effort`; Groq would 400 on the extra field, so we gate on
// the provider/model combination.
const normalizeBase = (base: string): string => base.replace(/\/$/, '');

const isGemini = (base: string): boolean => base.includes('generativelanguage');

const isOpenAI = (base: string): boolean => base.includes('api.openai.com');

export const isVisionProvider = (base: string): boolean =>
  isGemini(base) || isOpenAI(base);

const isOpenAIReasoningModel = (base: string, model: string): boolean =>
  isOpenAI(base) && /^gpt-5(?:[.-]|$)/i.test(model);

/** Shape completion parameters for native OpenAI GPT-5 requests. */
const completionParams = (
  base: string,
  model: string,
  maxTokens: number,
  temperature: number | undefined
): Record<string, unknown> => {
  const reasoning = isOpenAIReasoningModel(base, model);
  return {
    ...(reasoning
      ? { max_completion_tokens: maxTokens, reasoning_effort: 'none' }
      : { max_tokens: maxTokens, temperature: temperature ?? 0.6 }),
    ...(isGemini(base) ? { reasoning_effort: 'none' } : {}),
  };
};

const safeJson = (s: string | undefined): Record<string, unknown> => {
  if (!s) return {};
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

const openRouterHeaders = (): Record<string, string> => ({
  'HTTP-Referer':
    process.env.COMPANION_OPENROUTER_REFERER ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://kessoku-moe.cc',
  'X-Title': process.env.COMPANION_OPENROUTER_TITLE || 'kessoku moe',
});

const addProvider = (
  providers: CompanionProvider[],
  provider: CompanionProvider | null
): void => {
  if (!provider?.key || !provider.base || !provider.model) return;
  const base = normalizeBase(provider.base);
  const key = `${base}:${provider.model}:${provider.key.slice(0, 8)}`;
  if (
    providers.some((p) => `${p.base}:${p.model}:${p.key.slice(0, 8)}` === key)
  )
    return;
  providers.push({ ...provider, base });
};

const parseFallbackJson = (): CompanionProvider[] => {
  const raw = process.env.COMPANION_FALLBACKS;
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value
      .map((p, i) => {
        if (!p || typeof p !== 'object') return null;
        const v = p as Record<string, unknown>;
        const base = typeof v.base === 'string' ? v.base : '';
        const key = typeof v.key === 'string' ? v.key : '';
        const model = typeof v.model === 'string' ? v.model : '';
        const name =
          typeof v.name === 'string' && v.name.trim()
            ? v.name
            : `fallback-${i + 1}`;
        return { name, base, key, model };
      })
      .filter(Boolean) as CompanionProvider[];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[companion] invalid COMPANION_FALLBACKS', err);
    return [];
  }
};

export const companionProviders = (): CompanionProvider[] => {
  const providers: CompanionProvider[] = [];
  const primaryBase = normalizeBase(
    process.env.COMPANION_API_BASE || 'https://api.openai.com/v1'
  );
  const primaryKey =
    process.env.COMPANION_API_KEY ||
    (isOpenAI(primaryBase) ? process.env.OPENAI_API_KEY || '' : '');
  addProvider(providers, {
    name: 'primary',
    base: primaryBase,
    key: primaryKey,
    model: process.env.COMPANION_MODEL || 'gpt-5.6-luna',
  });

  addProvider(providers, {
    name: 'fallback',
    base: process.env.COMPANION_FALLBACK_API_BASE || '',
    key: process.env.COMPANION_FALLBACK_API_KEY || '',
    model: process.env.COMPANION_FALLBACK_MODEL || '',
  });
  parseFallbackJson().forEach((p) => addProvider(providers, p));

  addProvider(providers, {
    name: 'openai',
    base: 'https://api.openai.com/v1',
    key: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
  });
  addProvider(providers, {
    name: 'gemini',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    key: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  });
  addProvider(providers, {
    name: 'groq',
    base: 'https://api.groq.com/openai/v1',
    key: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  });
  addProvider(providers, {
    name: 'openrouter',
    base: 'https://openrouter.ai/api/v1',
    key:
      process.env.OPENROUTER_API_KEY ||
      process.env.COMPANION_UNCENSORED_API_KEY ||
      '',
    model:
      process.env.OPENROUTER_MODEL ||
      process.env.COMPANION_UNCENSORED_MODEL ||
      'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
    extraHeaders: openRouterHeaders(),
  });

  return providers;
};

export const completeChat = async (
  args: BaseArgs & { tools?: OpenAiTool[]; toolChoice?: 'auto' | 'none' }
): Promise<{
  content: string;
  toolCalls: ToolCall[];
  rateLimited: boolean;
}> => {
  const { base, key, model, messages, tools, maxTokens, temperature } = args;
  const useTools = Boolean(tools && tools.length);
  try {
    const body = JSON.stringify({
      model,
      messages,
      ...completionParams(base, model, maxTokens ?? 512, temperature),
      ...(useTools ? { tools, tool_choice: args.toolChoice ?? 'auto' } : {}),
    });
    const doFetch = (): Promise<Response> =>
      fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          ...(args.extraHeaders || {}),
        },
        body,
      });

    let upstream = await doFetch();
    // Groq/Llama occasionally emit a malformed tool call (the function name with
    // its arguments mashed in) → a 400 "tool call validation failed". It's
    // non-deterministic, so one identical retry usually comes back clean.
    if (upstream.status === 400 && useTools) {
      upstream = await doFetch();
    }
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error(
        '[companion] complete',
        model,
        upstream.status,
        detail.slice(0, 200)
      );
      return {
        content: '',
        toolCalls: [],
        rateLimited: upstream.status === 429,
      };
    }
    const json = (await upstream.json()) as {
      choices?: {
        message?: {
          content?: string;
          tool_calls?: {
            id?: string;
            function?: { name?: string; arguments?: string };
          }[];
        };
      }[];
    };
    const msg = json.choices?.[0]?.message;
    const toolCalls: ToolCall[] = (msg?.tool_calls || [])
      .filter((tc) => tc.function?.name)
      .map((tc) => ({
        id: tc.id,
        name: tc.function!.name as string,
        args: safeJson(tc.function?.arguments),
      }));
    return {
      content: (msg?.content || '').trim(),
      toolCalls,
      rateLimited: false,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[companion] complete failed', model, err);
    return { content: '', toolCalls: [], rateLimited: false };
  }
};

export const completeChatWithFallback = async (
  args: Omit<BaseArgs, 'base' | 'key' | 'model' | 'extraHeaders'> & {
    providers: CompanionProvider[];
    tools?: OpenAiTool[];
    toolChoice?: 'auto' | 'none';
  }
): Promise<{
  content: string;
  toolCalls: ToolCall[];
  rateLimited: boolean;
}> => {
  let sawRateLimit = false;
  // Try providers in order, stopping as soon as one returns a usable answer.
  // eslint-disable-next-line no-restricted-syntax
  for (const provider of args.providers) {
    // eslint-disable-next-line no-await-in-loop
    const result = await completeChat({
      ...args,
      base: provider.base,
      key: provider.key,
      model: provider.model,
      extraHeaders: provider.extraHeaders,
    });
    sawRateLimit = sawRateLimit || result.rateLimited;
    if (result.content || result.toolCalls.length) {
      return { ...result, rateLimited: sawRateLimit || result.rateLimited };
    }
  }
  return { content: '', toolCalls: [], rateLimited: sawRateLimit };
};

// Async-iterate the text deltas of a streamed completion. Parses standard
// OpenAI SSE framing (`data: {choices:[{delta:{content}}]}` … `data: [DONE]`),
// tolerant of however the provider chunks bytes across reads.
export async function* streamChat(
  args: BaseArgs & { tools?: OpenAiTool[]; toolChoice?: 'auto' | 'none' }
): AsyncGenerator<string> {
  const { base, key, model, messages, tools, maxTokens, temperature } = args;
  // Pass tools with tool_choice:'none' on the synthesis pass: Groq 400s a
  // no-tools request if the model still tries to call one, so we keep the tools
  // declared but forbid calling them — the model can only stream text.
  const useTools = Boolean(tools && tools.length);
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        ...(args.extraHeaders || {}),
      },
      body: JSON.stringify({
        model,
        messages,
        ...completionParams(base, model, maxTokens ?? 400, temperature),
        stream: true,
        ...(useTools ? { tools, tool_choice: args.toolChoice ?? 'none' } : {}),
      }),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[companion] stream failed', model, err);
    return;
  }
  const { body } = upstream;
  if (!upstream.ok || !body) {
    const detail = await upstream.text().catch(() => '');
    // eslint-disable-next-line no-console
    console.error(
      '[companion] stream',
      model,
      upstream.status,
      detail.slice(0, 200)
    );
    return;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl = buf.indexOf('\n');
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      nl = buf.indexOf('\n');
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // partial/non-JSON keepalive line — ignore
        }
      }
    }
  }
}

export async function* streamChatWithFallback(
  args: Omit<BaseArgs, 'base' | 'key' | 'model' | 'extraHeaders'> & {
    providers: CompanionProvider[];
    tools?: OpenAiTool[];
    toolChoice?: 'auto' | 'none';
  }
): AsyncGenerator<string> {
  // Keep provider streams sequential so answers are never interleaved.
  // eslint-disable-next-line no-restricted-syntax
  for (const provider of args.providers) {
    let got = false;
    // eslint-disable-next-line no-restricted-syntax, no-await-in-loop
    for await (const delta of streamChat({
      ...args,
      base: provider.base,
      key: provider.key,
      model: provider.model,
      extraHeaders: provider.extraHeaders,
    })) {
      got = true;
      yield delta;
    }
    if (got) return;
  }
}
