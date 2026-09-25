import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import {
  PREF_PROMPT_VERSION,
  PREF_SYSTEM_PROMPT,
  mergePrefTags,
  normalizeRequestText,
  parseRequestByRules,
  sanitizePrefTags,
  type PrefTag,
} from '@/domain/preferences';

import { isPremiumFeatureEnabled } from '../entitlements';
import { hasLLM } from '../env';
import { callLLM } from './llm';

/**
 * 밀리에게 요청하기 — 글 → 태그.
 * 규칙 파서가 먼저(키 없이도 동작). 키가 있으면 새 요청마다 AI 를 한 번만 불러 정해진 어휘로 맞추고(모르는 값은 버림),
 * 규칙 결과와 합친다. 같은 글은 캐시(정규화 글 + 프롬프트 버전의 sha256)로 다시 부르지 않는다.
 * 요청은 5개까지만 저장하고 식단은 저장된 태그만 쓰므로, AI 비용은 "새로 적은 요청 1건당 1회"로 묶인다.
 */

interface KV {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

const CACHE_KEY = 'mealing.pref.cache';
const CACHE_MAX = 50;
const TIMEOUT = 8_000;

let storage: KV = AsyncStorage;
/** 테스트용 */
export function __setStorage(kv: KV) {
  storage = kv;
}

type CacheMap = Record<string, { at: number; tags: PrefTag[] }>;

async function readCache(): Promise<CacheMap> {
  try {
    const raw = await storage.getItem(CACHE_KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? (v as CacheMap) : {};
  } catch {
    return {};
  }
}

async function writeCache(key: string, tags: PrefTag[]): Promise<void> {
  try {
    const map = await readCache();
    map[key] = { at: Date.now(), tags };
    const keys = Object.keys(map);
    if (keys.length > CACHE_MAX) {
      keys
        .sort((a, b) => map[a].at - map[b].at)
        .slice(0, keys.length - CACHE_MAX)
        .forEach((k) => delete map[k]);
    }
    await storage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    // 캐시 실패는 기능을 막지 않는다
  }
}

/** 캐시 열쇠 — 공백·끝 문장부호 차이는 같은 글로 본다 */
function cacheKey(text: string): Promise<string> {
  const norm = normalizeRequestText(text).replace(/[\s.!?~]+$/g, '').replace(/\s+/g, ' ');
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${norm}|${PREF_PROMPT_VERSION}`);
}

function parseJSON(raw: string): unknown {
  const m = /\{[\s\S]*\}/.exec(raw);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export interface ParsedRequest {
  tags: PrefTag[];
  source: 'rules' | 'ai' | 'cache';
}

/** 요청 글 → 태그. 실패해도 규칙 결과를 돌려준다 (못 알아들었으면 tags 가 빈 배열) */
export async function parseRequest(text: string): Promise<ParsedRequest> {
  const body = normalizeRequestText(text);
  const rules = parseRequestByRules(body);
  if (!body) return { tags: [], source: 'rules' };
  if (!hasLLM() || !isPremiumFeatureEnabled('assistantRequests')) return { tags: rules, source: 'rules' };

  let key: string | undefined;
  try {
    key = await cacheKey(body);
    const hit = (await readCache())[key];
    if (hit) return { tags: mergePrefTags(sanitizePrefTags(hit.tags.map(flatten), body), rules), source: 'cache' };
  } catch {
    key = undefined;
  }
  try {
    const raw = await callLLM(
      [
        { role: 'system', content: PREF_SYSTEM_PROMPT },
        { role: 'user', content: body },
      ],
      { timeoutMs: TIMEOUT, maxTokens: 200, reasoningEffort: 'minimal' },
    );
    const ai = sanitizePrefTags(parseJSON(raw), body);
    if (key) await writeCache(key, ai);
    return { tags: mergePrefTags(ai, rules), source: ai.length ? 'ai' : 'rules' };
  } catch {
    return { tags: rules, source: 'rules' };
  }
}

/** 캐시에 둔 태그를 다시 검사할 수 있게 AI 모양(평평한 필드)으로 */
function flatten(t: PrefTag): Record<string, unknown> {
  return {
    slot: t.slot,
    kind: t.kind,
    strength: t.strength,
    group: t.target.type === 'group' ? t.target.group : null,
    attr: t.target.type === 'attr' ? t.target.attr : null,
    keyword: t.target.type === 'keyword' ? t.target.word : null,
    within: t.within ?? null,
  };
}
