/**
 * 프리미엄 기능 열림 여부 — 한 곳에서만 정한다.
 * 효님 결정(2026-09-26): 사진 AI 분석·밀리에게 요청하기(요청 반영 추천)는 나중에 프리미엄으로 묶는다.
 * 지금은 개발 중이라 DEV_UNLOCK_ALL = true 로 전부 열어 둔다. 결제·구독을 붙일 때 이 파일만 바꾸면 된다
 * (각 진입점은 이미 isPremiumFeatureEnabled 를 거친다 — 지금은 동작을 바꾸지 않는다).
 */
export type PremiumFeature =
  /** E4 사진으로 기록 (사진 AI 분석) */
  | 'aiPhoto'
  /** 밀리에게 요청하기 — 요청을 기억해 식단·추천에 반영 */
  | 'assistantRequests';

/** 개발 중에는 전부 연다. 출시 전 false 로 바꾸고 아래에 구독 여부를 붙인다 */
export const DEV_UNLOCK_ALL = true;

/** 프리미엄 예정 기능 목록 (마이 > 프리미엄 미리보기 화면에 보여 준다) */
export const PREMIUM_FEATURES: { id: PremiumFeature; title: string; desc: string }[] = [
  { id: 'aiPhoto', title: '사진으로 기록', desc: '음식 사진을 찍으면 밀리가 무엇을 얼마나 드셨는지 정리해요.' },
  { id: 'assistantRequests', title: '밀리에게 요청하기', desc: '"아침엔 샐러드 위주로"처럼 부탁하면 기억해 두고 식단에 반영해요.' },
];

/** 이 기능을 지금 쓸 수 있는지 */
export function isPremiumFeatureEnabled(_feature: PremiumFeature): boolean {
  if (DEV_UNLOCK_ALL) return true;
  // TODO(효님): 구독 상태를 붙이면 여기서 확인한다
  return false;
}
