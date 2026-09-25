import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import {
  AI_MEAL_DAILY_LIMIT,
  AI_MEAL_PROMPT_VERSION,
  mealSystemPrompt,
  normalizeMealText,
  parseAIMealResult,
  parseMealTextByRules,
  quotaConsume,
  quotaLeft,
  type AIQuotaRecord,
  type ParsedMeal,
} from '@/domain/aiMeal';
import { toDateKey } from '@/domain/summary';

import { hasLLM } from '../env';
import { callLLM, type LLMContentPart } from './llm';

/**
 * AI 식사 기록 — 글(음성은 폰에서 글자로 바꾼 뒤 같은 길)·사진을 "음식 + 대략 양"으로 정리한다.
 * - 글: 캐시 → (키 있고 오늘 횟수 남음) AI → 실패·키 없음·횟수 소진이면 규칙 기반으로 나눈다
 * - 사진: AI 전용 (키·횟수가 없으면 글로 적어 달라고 안내)
 * 하루 횟수(AI_MEAL_DAILY_LIMIT)는 실제로 AI를 부를 때만 한 번씩 센다. 기기별(로컬) 기록.
 */

interface KV {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const QUOTA_KEY = 'mealing.aiMeal.quota';
const CACHE_KEY = 'mealing.aiMeal.cache';
const CACHE_MAX = 100;

let storage: KV = AsyncStorage;
/** 테스트용 */
export function __setStorage(kv: KV) {
  storage = kv;
}

async function readJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJSON(key: string, value: unknown): Promise<void> {
  try {
    await storage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 실패는 기능을 막지 않는다
  }
}

/** 오늘 남은 AI 정리 횟수 (키가 없으면 0) */
export async function aiMealQuotaLeft(now = new Date()): Promise<number> {
  if (!hasLLM()) return 0;
  return quotaLeft(await readJSON<AIQuotaRecord>(QUOTA_KEY), toDateKey(now));
}

async function consumeQuota(now: Date): Promise<boolean> {
  const today = toDateKey(now);
  const rec = await readJSON<AIQuotaRecord>(QUOTA_KEY);
  if (quotaLeft(rec, today) <= 0) return false;
  await writeJSON(QUOTA_KEY, quotaConsume(rec, today));
  return true;
}

type CacheMap = Record<string, { at: number; meal: Omit<ParsedMeal, 'source'> }>;

async function textKey(text: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${normalizeMealText(text)}|${AI_MEAL_PROMPT_VERSION}`);
}

async function cacheGet(key: string): Promise<Omit<ParsedMeal, 'source'> | null> {
  const map = await readJSON<CacheMap>(CACHE_KEY);
  return map?.[key]?.meal ?? null;
}

async function cacheSet(key: string, meal: Omit<ParsedMeal, 'source'>): Promise<void> {
  const map = (await readJSON<CacheMap>(CACHE_KEY)) ?? {};
  map[key] = { at: Date.now(), meal };
  const keys = Object.keys(map);
  if (keys.length > CACHE_MAX) {
    keys
      .sort((a, b) => map[a].at - map[b].at)
      .slice(0, keys.length - CACHE_MAX)
      .forEach((k) => delete map[k]);
  }
  await writeJSON(CACHE_KEY, map);
}

export type AnalyzeInput = { kind: 'text'; text: string } | { kind: 'photo'; base64: string; note?: string };

export type AnalyzeResult =
  | { ok: true; meal: ParsedMeal; quotaLeft: number }
  /** empty: 입력 없음 · nothing: 음식을 못 찾음 · photo-unavailable: 사진은 AI가 있어야 함(키 없음/횟수 소진) · failed: 사진 분석 실패 */
  | { ok: false; reason: 'empty' | 'nothing' | 'photo-unavailable' | 'failed'; quotaLeft: number };

const TEXT_TIMEOUT = 12_000;
const PHOTO_TIMEOUT = 25_000;

export async function analyzeMeal(input: AnalyzeInput, now = new Date()): Promise<AnalyzeResult> {
  const left = () => aiMealQuotaLeft(now);

  if (input.kind === 'text') {
    const text = input.text.trim();
    if (!normalizeMealText(text)) return { ok: false, reason: 'empty', quotaLeft: await left() };
    const rules = () => parseMealTextByRules(text);
    const done = async (meal: ParsedMeal): Promise<AnalyzeResult> =>
      meal.items.length ? { ok: true, meal, quotaLeft: await left() } : { ok: false, reason: 'nothing', quotaLeft: await left() };

    let key: string | undefined;
    try {
      key = await textKey(text);
      const cached = await cacheGet(key);
      if (cached) return done({ ...cached, source: 'cache' });
    } catch {
      key = undefined;
    }
    if (!hasLLM() || !(await consumeQuota(now))) return done(rules());
    try {
      const raw = await callLLM(
        [
          { role: 'system', content: mealSystemPrompt('text') },
          { role: 'user', content: text },
        ],
        { timeoutMs: TEXT_TIMEOUT, maxTokens: 700, reasoningEffort: 'minimal' },
      );
      const parsed = parseAIMealResult(raw);
      if (!parsed) return done(rules());
      // 규칙이 끼니를 잡았는데 AI 가 놓쳤으면 채운다
      const meal: ParsedMeal = { ...parsed, mealType: parsed.mealType ?? rules().mealType, source: 'ai' };
      if (!meal.mealType) delete meal.mealType;
      if (key && meal.items.length) await cacheSet(key, { items: meal.items, ...(meal.mealType ? { mealType: meal.mealType } : {}) });
      return done(meal);
    } catch {
      return done(rules());
    }
  }

  // 사진
  if (!input.base64) return { ok: false, reason: 'empty', quotaLeft: await left() };
  if (!hasLLM() || !(await consumeQuota(now))) return { ok: false, reason: 'photo-unavailable', quotaLeft: await left() };
  const parts: LLMContentPart[] = [{ type: 'image', base64: input.base64, mediaType: 'image/jpeg' }];
  const note = input.note?.trim();
  parts.push({ type: 'text', text: note ? `사용자 설명: ${note}` : '이 사진 속 음식을 정리해 주세요.' });
  try {
    const raw = await callLLM(
      [
        { role: 'system', content: mealSystemPrompt('photo') },
        { role: 'user', content: parts },
      ],
      { timeoutMs: PHOTO_TIMEOUT, maxTokens: 800, reasoningEffort: 'minimal' },
    );
    const parsed = parseAIMealResult(raw);
    if (!parsed) return { ok: false, reason: 'failed', quotaLeft: await left() };
    if (!parsed.items.length) return { ok: false, reason: 'nothing', quotaLeft: await left() };
    const mealType = parsed.mealType ?? (note ? parseMealTextByRules(note).mealType : undefined);
    return { ok: true, meal: { items: parsed.items, ...(mealType ? { mealType } : {}), source: 'ai' }, quotaLeft: await left() };
  } catch {
    return { ok: false, reason: 'failed', quotaLeft: await left() };
  }
}

export const AI_MEAL_LIMIT = AI_MEAL_DAILY_LIMIT;
