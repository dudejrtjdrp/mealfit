import type { DailyTargets, Profile } from './types';

export type TargetInput = Pick<
  Profile,
  'sex' | 'birthYear' | 'heightCm' | 'weightKg' | 'activity' | 'primaryGoal' | 'secondaryGoals' | 'diet'
>;

/** Mifflin-St Jeor × 활동계수 ± 목적 보정 → 오늘 목표량. (구현: 도메인 에이전트) */
export function computeTargets(_input: TargetInput, _today = new Date()): DailyTargets {
  throw new Error('not implemented');
}
