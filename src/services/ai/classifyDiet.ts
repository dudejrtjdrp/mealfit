import * as Crypto from 'expo-crypto';
import { classifyDietByRules, defaultEvidence, DIET_TYPES, isDietType, normalizeDietText } from '../../domain/diet';
import type { DietClassification, Goal } from '../../domain/types';
import { hasLLM } from '../env';
import type { Repos } from '../repo/types';
import { callLLM } from './llm';

/** 프롬프트 버전 — 프롬프트를 바꾸면 올려서 캐시를 무효화한다 */
export const PROMPT_VERSION = 'v1';

const GOAL_LABEL: Record<Goal, string> = {
  lose: '체중 감량',
  maintain: '체중 유지',
  gain: '체중 증량',
  blood_sugar: '혈당 관리',
  cholesterol: '콜레스테롤 관리',
  slow_aging: '저속노화',
};

function systemPrompt(): string {
  const defs = Object.values(DIET_TYPES)
    .map((t) => `- ${t.type}: ${t.label} — ${t.description}`)
    .join('\n');
  return [
    '당신은 식사 습관 서술을 읽고 식단 유형 하나로 분류하는 도우미입니다.',
    '유형 정의:',
    defs,
    '',
    '규칙:',
    '- 반드시 JSON 한 개만 답합니다. 설명·코드블록 없이.',
    '- 형식: {"type":"<위 유형 id>","evidence":[{"title":"...","detail":"..."},{"title":"...","detail":"..."},{"title":"...","detail":"..."}]}',
    '- evidence 는 정확히 3개. title 은 15자 안팎 명사형, detail 은 "~해요"체 한 문장.',
    '- 서술에 근거해 쓰고, 비난·금지·위험 같은 표현은 쓰지 않습니다. 건강관리 관점의 따뜻한 말투로 씁니다.',
  ].join('\n');
}

export async function cacheKeyFor(text: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${normalizeDietText(text)}|${PROMPT_VERSION}`);
}

/** LLM 응답 문자열 → 분류 결과. 유효하지 않으면 null */
export function parseLLMResult(raw: string): Pick<DietClassification, 'type' | 'evidence'> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let data: any;
  try {
    data = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!isDietType(data?.type)) return null;
  const evidence = (Array.isArray(data.evidence) ? data.evidence : [])
    .filter((e: any) => typeof e?.title === 'string' && typeof e?.detail === 'string' && e.title.trim())
    .map((e: any) => ({ title: String(e.title).trim(), detail: String(e.detail).trim() }))
    .slice(0, 3);
  for (const d of defaultEvidence(data.type)) {
    if (evidence.length >= 3) break;
    if (!evidence.some((x: { title: string }) => x.title === d.title)) evidence.push(d);
  }
  return { type: data.type, evidence };
}

/**
 * B6 성향 분류 진입점: 캐시 → (키 있으면) LLM → 규칙 기반 폴백.
 * 같은 서술(normalizeDietText 기준)은 절대 AI를 다시 부르지 않는다.
 */
export async function classifyDiet(
  text: string,
  opts: { repos: Repos; primaryGoal?: Goal },
): Promise<DietClassification> {
  const fallback = () => classifyDietByRules(text, { primaryGoal: opts.primaryGoal });
  if (!normalizeDietText(text)) return fallback();

  let key: string | undefined;
  try {
    key = await cacheKeyFor(text);
    const cached = await opts.repos.aiCache.get(key);
    if (cached) return { ...cached, source: 'cache' };
  } catch {
    // 캐시를 못 쓰면 AI도 부르지 않는다 (재호출 방지 원칙)
    return fallback();
  }

  if (!hasLLM()) return fallback();

  try {
    const goal = opts.primaryGoal ? `\n(주 목적: ${GOAL_LABEL[opts.primaryGoal]})` : '';
    const raw = await callLLM(
      [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: `식사 습관 서술:\n"""${text.trim()}"""${goal}` },
      ],
      { timeoutMs: 10_000 },
    );
    const parsed = parseLLMResult(raw);
    if (!parsed) return fallback();
    const result: DietClassification = { ...parsed, source: 'ai' };
    try {
      await opts.repos.aiCache.set(key, result);
    } catch {
      // 캐시 저장 실패는 결과에 영향 없음
    }
    return result;
  } catch {
    return fallback();
  }
}
