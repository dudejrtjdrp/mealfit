import type { DailyTargets, Judgement, MenuItem, Nutrients, Profile } from './types';

export interface JudgeContext {
  profile: Pick<Profile, 'primaryGoal' | 'secondaryGoals' | 'diet'>;
  /** groupId → 선택한 choice.label */
  selectedOptions?: Record<string, string>;
}

/** 옵션 선택을 반영한 최종 영양 */
export function applyOptions(_menu: MenuItem, _selected?: Record<string, string>): Nutrients {
  throw new Error('not implemented');
}

/** 메뉴 하나 판정 — 규칙·템플릿만, AI 없음 */
export function judgeMenu(_menu: MenuItem, _remaining: DailyTargets, _ctx: JudgeContext): Judgement {
  throw new Error('not implemented');
}

/** 매장 메뉴 순위 (score 내림차순, unknown은 맨 뒤) */
export function rankMenus(
  _menus: MenuItem[],
  _remaining: DailyTargets,
  _ctx: JudgeContext,
): { menu: MenuItem; judgement: Judgement }[] {
  throw new Error('not implemented');
}

/** 같은 매장 안에서 더 잘 맞는 대안 n개 */
export function suggestAlternatives(
  _menu: MenuItem,
  _candidates: MenuItem[],
  _remaining: DailyTargets,
  _ctx: JudgeContext,
  _n = 2,
): { menu: MenuItem; judgement: Judgement }[] {
  throw new Error('not implemented');
}
