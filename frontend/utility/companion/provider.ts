import type { ToolCall } from './types';

// Server-only thin wrapper over any OpenAI-compatible chat endpoint (Gemini
// today, Groq as a base+model swap). Two shapes:
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

// Provider-specific compatibility gates. Gemini and native OpenAI GPT-5 models
// accept `reasoning_effort`; Groq would 400 on the extra field, so we gate on
// the provider/model combination.
const isGemini = (base: string): boolean => base.includes('generativelanguage');

const isOpenAI = (base: string): boolean => base.includes('api.openai.com');

// GPT-5 chat models reject `max_tokens` / `temperature` and want
// `max_completion_tokens` (+ optional reasoning_effort). Without this gate,
// companion + vibe-search 400 and silently fall back to empty results.
const isOpenAIReasoningModel = (base: string, model: string): boolean =>
  isOpenAI(base) && /^gpt-5(?:[.-]|$)/i.test(model);

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
