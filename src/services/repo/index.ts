import type { Repos } from './types';

/** 설정에 따라 로컬 또는 Supabase 저장소를 돌려준다 (구현: 도메인 에이전트 → local, 이후 supabase) */
export function getRepos(): Repos {
  throw new Error('not implemented');
}
