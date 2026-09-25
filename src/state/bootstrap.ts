import { useEffect } from 'react';

import type { JudgeContext } from '@/domain/judge';
import type { Profile } from '@/domain/types';
import { getRepos } from '@/services/repo';
import { createLocalRepos } from '@/services/repo/local';

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

/**
 * 로그인 직후: 저장소가 바뀌었으니(로컬 → 계정) 프로필·오늘 기록을 다시 읽어 화면을 서버 데이터로 바꾼다.
 * 서버에 프로필이 있으면 그게 우선(재방문). 없는데 옮기기가 실패했다면 이 기기의 프로필을 이어 써서
 * 방금 끝낸 온보딩을 잃지 않는다 (기록은 다음 로그인 때 다시 옮긴다).
 */
export async function reloadAfterLogin(): Promise<Profile | null> {
  let profile = await useProfile.getState().load();
  if (!profile?.onboardingDone && getRepos().backend === 'supabase') {
    const local = await createLocalRepos()
      .profile.get()
      .catch(() => null);
    if (local?.onboardingDone) profile = await useProfile.getState().adoptProfile(local);
  }
  await useDay.getState().load();
  return profile;
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
