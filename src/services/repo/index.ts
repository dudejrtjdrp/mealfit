import { getAuthUserId } from '../authState';
import { hasSupabase } from '../env';
import { getSupabase } from '../supabase';
import { createLocalRepos } from './local';
import { createSupabaseRepos } from './supabase';
import type { Repos } from './types';

let cached: { key: string; repos: Repos } | undefined;

/**
 * 저장소 선택: Supabase 가 설정돼 있고(.env) 로그인 세션이 있으면 Supabase, 아니면 로컬(AsyncStorage).
 * 로그인 사용자가 바뀌면 새 인스턴스를 만든다.
 */
export function getRepos(): Repos {
  const userId = hasSupabase() ? getAuthUserId() : null;
  const client = userId ? getSupabase() : null;
  const key = client && userId ? `supabase:${userId}` : 'local';
  if (!cached || cached.key !== key) {
    cached = { key, repos: client && userId ? createSupabaseRepos(client, userId) : createLocalRepos() };
  }
  return cached.repos;
}

/** 테스트용: 싱글턴 초기화 */
export function resetReposForTest(): void {
  cached = undefined;
}

export type { Repos } from './types';
