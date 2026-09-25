/**
 * 밀리 탭 식단 — 주변 후보(홈 "지금 근처 추천"과 같은 collectCandidates) + 최근 기록 → domain/mealPlan.
 * 다시 짜기 횟수는 날짜별로 세션 동안만 기억한다 (앱을 다시 켜면 그날의 첫 식단).
 */
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';

import { getMenusByBrand } from '@/data';
import { buildMealPlan, daySeed, planSlots, type MealPlan, type RecentEaten } from '@/domain/mealPlan';
import { toDateKey } from '@/domain/summary';

import { useDay } from './day';
import { useJudgeContext, useMealSlot } from './judgeContext';
import { useNearby } from './nearby';
import { useProfile } from './profile';
import { collectCandidates } from './recommend';

/** 오늘·어제·그저께 */
const RECENT_LOAD_DAYS = 3;

export const useMealPlanReroll = create<{ date: string; count: number; reroll: () => void }>((set, get) => ({
  date: toDateKey(),
  count: 0,
  reroll: () => {
    const today = toDateKey();
    set({ date: today, count: get().date === today ? get().count + 1 : 1 });
  },
}));

export interface MealPlanView {
  plan: MealPlan | null;
  /** 최근 기록을 읽는 중 (식단은 그 전에도 오늘 기록만으로 보여준다) */
  recentLoading: boolean;
}

/** 화면용 — 후보·기록·시각(끼니 경계)이 바뀌면 다시 짠다. 목표량이 없으면 plan null */
export function useMealPlan(): MealPlanView {
  const targets = useProfile((s) => s.targets);
  const summary = useDay((s) => s.summary);
  const logsKey = useDay((s) => s.logs.length + ':' + (s.logs[s.logs.length - 1]?.id ?? ''));
  const stores = useNearby((s) => s.stores);
  const jctx = useJudgeContext();
  const slot = useMealSlot();
  const reroll = useMealPlanReroll();

  const [recent, setRecent] = useState<RecentEaten[] | null>(null);
  useEffect(() => {
    let alive = true;
    useDay
      .getState()
      .recentLogs(RECENT_LOAD_DAYS)
      .then((logs) => {
        if (alive) setRecent(logs.map((l) => ({ name: l.name, date: l.date, menuId: l.menuId, brandId: l.brandId, storeName: l.storeName })));
      })
      .catch(() => alive && setRecent([]));
    return () => {
      alive = false;
    };
  }, [logsKey]);

  const plan = useMemo(() => {
    const remaining = summary?.remaining ?? targets;
    if (!remaining) return null;
    const now = new Date();
    const todayLogs = summary?.logs ?? [];
    // 끼니별 적정량(남은 양 ÷ 남은 주 끼니 수)으로 판정 — 저녁 메뉴도 저녁 몫 기준으로 본다
    const { upcoming } = planSlots(remaining.kcal, now, todayLogs);
    const ctx = upcoming > 0 ? { ...jctx, now, mealSlotsLeft: upcoming } : { ...jctx, now };
    const candidates = stores.length ? collectCandidates(stores, getMenusByBrand, remaining, ctx) : [];
    const today = toDateKey(now);
    const count = reroll.date === today ? reroll.count : 0;
    // 오늘 기록은 day 스토어가 최신 — 최근 목록의 오늘 몫은 그걸로 바꾼다
    const recentLogs: RecentEaten[] = [...(recent ?? []).filter((r) => r.date !== today), ...todayLogs.map((l) => ({ name: l.name, date: l.date, menuId: l.menuId, brandId: l.brandId, storeName: l.storeName }))];
    return buildMealPlan({
      candidates,
      remainingKcal: remaining.kcal,
      now,
      todayLogs,
      recentLogs,
      seed: daySeed(now) + count,
      emphasis: targets?.emphasis,
    });
  }, [summary, targets, stores, jctx, slot, reroll.date, reroll.count, recent]); // eslint-disable-line react-hooks/exhaustive-deps

  return { plan, recentLoading: recent === null };
}
