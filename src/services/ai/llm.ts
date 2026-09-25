import { env, type LLMProvider } from '../env';

/** 제공자 교체 가능한 LLM 호출. env 로 anthropic / openai(호환) 중 고른다 */
/** 사진 입력용 조각 — base64 는 data: 접두 없이 */
export type LLMContentPart = { type: 'text'; text: string } | { type: 'image'; base64: string; mediaType: 'image/jpeg' | 'image/png' };

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LLMContentPart[];
}

export interface LLMOptions {
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
  /** OpenAI 호환(Gemini) 생각 수준 — 비용·지연을 줄이려고 'minimal'. 지원 안 하면 빼고 한 번 더 보낸다 */
  reasoningEffort?: 'minimal' | 'low';
}

const textOf = (c: LLMMessage['content']): string => (typeof c === 'string' ? c : c.map((p) => (p.type === 'text' ? p.text : '')).join('\n'));

function toAnthropicContent(c: LLMMessage['content']) {
  if (typeof c === 'string') return c;
  return c.map((p) => (p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.base64 } }));
}

function toOpenAIContent(c: LLMMessage['content']) {
  if (typeof c === 'string') return c;
  return c.map((p) => (p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image_url', image_url: { url: `data:${p.mediaType};base64,${p.base64}` } }));
}

/** reasoning_effort 를 거절한 적이 있으면 이 실행 동안은 빼고 보낸다 */
let reasoningUnsupported = false;

class LLMHttpError extends Error {
  constructor(readonly status: number) {
    super(`LLM 요청 실패 (${status})`);
  }
}

export const DEFAULT_MODEL: Record<LLMProvider, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
};

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_BASE = 'https://api.openai.com/v1';

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new LLMHttpError(res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** 메시지를 보내고 첫 번째 텍스트 응답을 돌려준다. 키가 없거나 실패하면 throw */
export async function callLLM(messages: LLMMessage[], opts: LLMOptions = {}): Promise<string> {
  const apiKey = env.llmApiKey;
  if (!apiKey) throw new Error('LLM 키가 설정되지 않았어요');
  const provider = env.llmProvider;
  const model = env.llmModel ?? DEFAULT_MODEL[provider];
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxTokens = opts.maxTokens ?? 600;
  const temperature = opts.temperature ?? 0;

  if (provider === 'anthropic') {
    const system = messages.filter((m) => m.role === 'system').map((m) => textOf(m.content)).join('\n\n');
    const data = await postJson(
      ANTHROPIC_URL,
      {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      {
        model,
        max_tokens: maxTokens,
        temperature,
        ...(system ? { system } : {}),
        messages: messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: toAnthropicContent(m.content) })),
      },
      timeoutMs,
    );
    const text = (data?.content ?? []).find((c: any) => c?.type === 'text')?.text;
    if (typeof text !== 'string') throw new Error('LLM 응답 형식이 달라요');
    return text;
  }

  const base = (env.llmBaseUrl ?? OPENAI_BASE).replace(/\/+$/, '');
  const body = { model, max_tokens: maxTokens, temperature, messages: messages.map((m) => ({ role: m.role, content: toOpenAIContent(m.content) })) };
  const send = (withReasoning: boolean) =>
    postJson(`${base}/chat/completions`, { authorization: `Bearer ${apiKey}` }, withReasoning ? { ...body, reasoning_effort: opts.reasoningEffort } : body, timeoutMs);
  let data: any;
  if (opts.reasoningEffort && !reasoningUnsupported) {
    try {
      data = await send(true);
    } catch (e) {
      if (!(e instanceof LLMHttpError) || e.status !== 400) throw e;
      reasoningUnsupported = true;
      data = await send(false);
    }
  } else {
    data = await send(false);
  }
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('LLM 응답 형식이 달라요');
  return text;
}
