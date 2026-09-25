/**
 * 계정 전환 알림 — 로그인(다른 사용자로 바뀜)·로그아웃·탈퇴·이 기기 데이터 지우기.
 * 사용자별 메모리 캐시(기록 기간 캐시)·기기 데이터(즐겨찾기)를 가진 스토어가 구독해 비운다.
 * session 이 day·favorites 를 직접 import 하면 순환(day → profile → session)이 생겨 따로 둔 작은 모듈.
 */
export type AccountChange = 'signedIn' | 'signedOut';
type Listener = (change: AccountChange) => void | Promise<void>;

const listeners = new Set<Listener>();

export function onAccountChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 모든 구독자를 부르고 끝날 때까지 기다린다 (하나가 실패해도 나머지는 진행) */
export async function emitAccountChange(change: AccountChange): Promise<void> {
  await Promise.all(
    [...listeners].map(async (fn) => {
      try {
        await fn(change);
      } catch (e) {
        console.warn('[account] 계정 전환 처리 실패', e);
      }
    }),
  );
}
