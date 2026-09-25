import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import type { JudgeContext } from '@/domain/judge';
import { mealTypeAt } from '@/domain/mealBudget';
import type { MealLog, MealType, Profile } from '@/domain/types';

import { judgeProfile } from './bootstrap';
import { useDay } from './day';
import { useProfile } from './profile';

/** 판정 컨텍스트(프로필 + 오늘 먹은 끼니) — 순수 함수라 화면 밖에서도 쓴다 */
export function judgeContext(profile: Profile | null, logs?: readonly MealLog[] | null): JudgeContext {
  const eatenMeals = logs?.length ? Array.from(new Set(logs.map((l) => l.mealType))) : undefined;
  return { profile: judgeProfile(profile), eatenMeals };
}

/** 지금 끼니 — 끼니 경계(10:30·15:00·21:00)를 넘거나 앱으로 돌아오면 다시 계산하게 1분마다 확인 */
export function useMealSlot(): MealType {
  const [slot, setSlot] = useState<MealType>(() => mealTypeAt());
  useEffect(() => {
    const check = () => setSlot(mealTypeAt());
    const t = setInterval(check, 60 * 1000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, []);
  return slot;
}

/**
 * 화면용 판정 컨텍스트. 오늘 먹은 끼니를 넘겨 "점심을 먹은 뒤엔 저녁 기준"으로 판정하고,
 * 끼니 경계를 넘으면 새 객체를 돌려줘 useMemo 로 묶인 순위·판정이 다시 계산된다.
 */
export function useJudgeContext(): JudgeContext {
  const profile = useProfile((s) => s.profile);
  const logs = useDay((s) => s.summary?.logs);
  const slot = useMealSlot();
  // slot 은 판정에 직접 들어가지 않지만(판정은 호출 시각을 쓴다) 경계를 넘을 때 재계산을 일으키는 키다
  return useMemo(() => judgeContext(profile, logs), [profile, logs, slot]); // eslint-disable-line react-hooks/exhaustive-deps
}
