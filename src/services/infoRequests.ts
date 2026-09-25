import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getAuthUserId } from './authState';
import type { KeyValueStorage } from './repo/local';
import { getSupabase } from './supabase';

/**
 * "이 매장 정보 요청하기" (D6 정보 없음).
 * Supabase 가 설정돼 있고 로그인했으면 info_requests 테이블에 넣고, 아니면(또는 실패하면) 이 기기에 쌓아 둔다.
 * 한 매장은 한 번만 — 로컬 기록으로 중복을 막고, 서버는 (user_id, request_key) 유니크로 한 번 더 막는다.
 * 테이블이 아직 없거나 네트워크가 끊겨도 사용자에게 오류를 드러내지 않는다(로컬로 폴백, 다음 요청 때 다시 올린다).
 */

export interface InfoRequestTarget {
  /** 화면에 보이는 매장/브랜드 이름 — "본죽 역삼점" */
  name: string;
  brandId?: string;
  /** 카카오 place id (목 매장이면 없음) */
  placeId?: string;
}

export interface InfoRequestEntry {
  key: string;
  name: string;
  brandId?: string;
  placeId?: string;
  createdAt: string;
  /** 서버에 올라갔는지 */
  synced: boolean;
}

export interface InfoRequestDeps {
  storage: KeyValueStorage;
  client: SupabaseClient | null;
  userId: string | null;
  now: () => Date;
}

export const INFO_REQUESTS_KEY = 'mealfit:info-requests';
export const INFO_REQUESTS_TABLE = 'info_requests';

const defaultDeps = (): InfoRequestDeps => ({ storage: AsyncStorage, client: getSupabase(), userId: getAuthUserId(), now: () => new Date() });

/** 같은 매장을 가리키는 키: 카카오 place id > 브랜드 > 이름 (목 매장·브랜드만 아는 경우) */
export function requestKey(t: InfoRequestTarget): string {
  if (t.placeId) return `place:${t.placeId}`;
  if (t.brandId) return `brand:${t.brandId}`;
  return `name:${t.name.trim().toLowerCase().replace(/\s+/g, '')}`;
}

async function readAll(storage: KeyValueStorage): Promise<InfoRequestEntry[]> {
  try {
    const raw = await storage.getItem(INFO_REQUESTS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as InfoRequestEntry[]) : [];
  } catch {
    return [];
  }
}

async function writeAll(storage: KeyValueStorage, list: InfoRequestEntry[]): Promise<void> {
  try {
    await storage.setItem(INFO_REQUESTS_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[infoRequests] 로컬 저장 실패', e);
  }
}

/** 서버에 한 건 올리기. 이미 있으면(유니크 위반) 올라간 것으로 본다. 실패는 false (던지지 않는다) */
async function pushOne(e: InfoRequestEntry, client: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { error } = await client.from(INFO_REQUESTS_TABLE).insert({
      user_id: userId,
      request_key: e.key,
      store_name: e.name,
      brand_id: e.brandId ?? null,
      kakao_place_id: e.placeId ?? null,
      created_at: e.createdAt,
    });
    if (!error) return true;
    if ((error as { code?: string }).code === '23505') return true;
    console.warn('[infoRequests] 서버 저장 실패 → 이 기기에 보관', error.message);
    return false;
  } catch (err) {
    console.warn('[infoRequests] 서버 저장 실패 → 이 기기에 보관', err);
    return false;
  }
}

/** 이미 요청한 매장인지 */
export async function hasRequestedInfo(t: InfoRequestTarget, deps: Partial<InfoRequestDeps> = {}): Promise<boolean> {
  const { storage } = { ...defaultDeps(), ...deps };
  const key = requestKey(t);
  return (await readAll(storage)).some((e) => e.key === key);
}

/**
 * 정보 요청 남기기. 이미 요청했으면 아무것도 하지 않고 already=true.
 * 로그인 상태면 서버에 올리고, 전에 못 올린(synced=false) 요청도 같이 다시 올려 본다.
 */
export async function requestStoreInfo(t: InfoRequestTarget, deps: Partial<InfoRequestDeps> = {}): Promise<{ already: boolean; synced: boolean }> {
  const d = { ...defaultDeps(), ...deps };
  const list = await readAll(d.storage);
  const key = requestKey(t);
  if (list.some((e) => e.key === key)) return { already: true, synced: list.find((e) => e.key === key)!.synced };

  const entry: InfoRequestEntry = { key, name: t.name, brandId: t.brandId, placeId: t.placeId, createdAt: d.now().toISOString(), synced: false };
  // 먼저 로컬에 남겨 중복 요청을 막는다 (서버 응답을 기다리는 사이 두 번 눌러도 한 번)
  const next = [...list, entry];
  await writeAll(d.storage, next);

  if (d.client && d.userId) {
    for (const e of next) {
      if (e.synced) continue;
      if (await pushOne(e, d.client, d.userId)) e.synced = true;
      else break; // 테이블이 없거나 오프라인이면 나머지도 실패할 테니 다음 기회에
    }
    await writeAll(d.storage, next);
  }
  return { already: false, synced: entry.synced };
}

/** 이 기기에 남은 요청 목록 (테스트·디버그용) */
export async function listInfoRequests(deps: Partial<InfoRequestDeps> = {}): Promise<InfoRequestEntry[]> {
  return readAll({ ...defaultDeps(), ...deps }.storage);
}
