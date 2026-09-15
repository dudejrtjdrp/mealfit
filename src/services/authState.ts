/**
 * 현재 Supabase 로그인 사용자 id (동기 조회용).
 * session 스토어가 로그인·로그아웃·토큰 갱신 때 갱신하고, getRepos() 가 이 값으로 저장소를 고른다.
 * (repo ↔ state 순환 import 를 피하려고 따로 둔 작은 모듈)
 */
let userId: string | null = null;

export const getAuthUserId = () => userId;
export function setAuthUserId(id: string | null): void {
  userId = id;
}
