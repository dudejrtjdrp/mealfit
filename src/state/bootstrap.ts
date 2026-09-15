import { useEffect } from 'react';

import type { JudgeContext } from '@/domain/judge';
import type { Profile } from '@/domain/types';

import { useDay, watchDayRollover } from './day';
import { useProfile } from './profile';
import { useSession } from './session';

let started = false;

/** 앱 시작 시 한 번: 세션·프로필 → 오늘 기록. 딥링크로 탭·상세에 바로 들어와도 데이터가 채워진다 */
export async function bootstrapApp(): Promise<void> {
  if (started) return;
  started = true;
  if (useSession.getState().status === 'loading') await useSession.getState().load();
  if (useProfile.getState().status === 'loading') await useProfile.getState().load();
  if (useDay.getState().status === 'idle') await useDay.getState().load();
}

export function useBootstrap() {
  useEffect(() => {
    void bootstrapApp();
    return watchDayRollover();
  }, []);
}

const DEFAULT_JUDGE_PROFILE: JudgeContext['profile'] = {
  primaryGoal: 'maintain',
  secondaryGoals: [],
  diet: { type: 'balanced', evidence: [], source: 'rule' },
};

/** 판정 컨텍스트용 프로필 (없으면 균형형·유지) */
export function judgeProfile(profile: Profile | null): JudgeContext['profile'] {
  return profile ? { primaryGoal: profile.primaryGoal, secondaryGoals: profile.secondaryGoals, diet: profile.diet } : DEFAULT_JUDGE_PROFILE;
}
