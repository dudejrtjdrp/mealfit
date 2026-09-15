import { createLocalRepos } from './local';
import type { Repos } from './types';

let repos: Repos | undefined;

/** 설정에 따라 로컬 또는 Supabase 저장소를 돌려준다 */
export function getRepos(): Repos {
  if (!repos) {
    // TODO(supabase): hasSupabase() 가 true 이면 여기서 createSupabaseRepos() 를 돌려준다.
    // 지금은 키가 있어도 항상 로컬(AsyncStorage) 저장소를 쓴다.
    repos = createLocalRepos();
  }
  return repos;
}

/** 테스트용: 싱글턴 초기화 */
export function resetReposForTest(): void {
  repos = undefined;
}

export type { Repos } from './types';
