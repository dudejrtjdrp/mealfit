import { env, type LLMProvider } from '../env';

/** 제공자 교체 가능한 LLM 호출. env 로 anthropic / openai(호환) 중 고른다 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMOptions {
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
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
    if (!res.ok) throw new Error(`LLM 요청 실패 (${res.status})`);
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
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
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
        messages: messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content })),
      },
      timeoutMs,
    );
    const text = (data?.content ?? []).find((c: any) => c?.type === 'text')?.text;
    if (typeof text !== 'string') throw new Error('LLM 응답 형식이 달라요');
    return text;
  }

  const base = (env.llmBaseUrl ?? OPENAI_BASE).replace(/\/+$/, '');
  const data = await postJson(
    `${base}/chat/completions`,
    { authorization: `Bearer ${apiKey}` },
    { model, max_tokens: maxTokens, temperature, messages },
    timeoutMs,
  );
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') throw new Error('LLM 응답 형식이 달라요');
  return text;
}
