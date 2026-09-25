/**
 * 밀리 탭 식단 — 주변 후보(홈 "지금 근처 추천"과 같은 collectCandidates) + 최근 기록 → domain/mealPlan.
 * 다시 짜기 횟수·끼니별로 넘겨 고른 메뉴는 날짜별로 세션 동안만 기억한다 (앱을 다시 켜면 그날의 첫 식단).
 */
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';

import { getMenusByBrand, menusForStore } from '@/data';
import { buildMealPlan, cyclePicks, daySeed, planSlots, tomorrowMeals, tomorrowMorning, tomorrowPreviewCount, type MealPlan, type PlanMeal, type PlanPicks, type RecentEaten } from '@/domain/mealPlan';
import type { MealType } from '@/domain/types';
import { toDateKey } from '@/domain/summary';

import { useDay } from './day';
import { useJudgeContext, useMealSlot } from './judgeContext';
import { useNearby } from './nearby';
import { ensurePreferencesLoaded, usePreferenceTags } from './preferences';
import { useProfile } from './profile';
import { collectCandidates } from './recommend';

/** 오늘·어제·그저께 */
const RECENT_LOAD_DAYS = 3;

interface MealPlanChoice {
  /** 이 선택이 어느 날 것인지 — 날이 바뀌면 처음부터 */
  date: string;
  /** "다른 조합 보기" 누른 횟수 (seed 에 더한다) */
  count: number;
  /** 끼니별로 넘겨 고른 메뉴 (menu.id) — 다른 조합 보기를 누르면 비운다 */
  picks: PlanPicks;
  reroll: () => void;
  /** 한 끼만 옆 후보로 — 지금 보이는 식단을 넘겨 받아 나머지 끼니는 고정한다 */
  cycle: (plan: MealPlan, mealType: MealType, dir: 1 | -1) => void;
}

/** 밀리 식단 선택 상태 — 날짜별로 세션 동안만 기억한다 (앱을 다시 켜면 그날의 첫 식단) */
export const useMealPlanReroll = create<MealPlanChoice>((set, get) => ({
  date: toDateKey(),
  count: 0,
  picks: {},
  reroll: () => {
    const today = toDateKey();
    set({ date: today, count: get().date === today ? get().count + 1 : 1, picks: {} });
  },
  cycle: (plan, mealType, dir) => {
    const today = toDateKey();
    const count = get().date === today ? get().count : 0;
    set({ date: today, count, picks: cyclePicks(plan, mealType, dir) });
  },
}));

export interface MealPlanView {
  plan: MealPlan | null;
  /** 최근 기록을 읽는 중 (식단은 그 전에도 오늘 기록만으로 보여준다) */
  recentLoading: boolean;
  /** 내일 식단 미리 보기 — 오늘 짤 끼니가 두 끼면 아침만, 한 끼 이하(또는 오늘은 충분)면 세 끼 (화면 빈 곳을 채운다) */
  tomorrow: PlanMeal[];
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
  // 밀리에게 한 요청 — 태그만 식단에 넘긴다 (AI 는 요청을 적을 때 한 번뿐, 여기선 부르지 않는다)
  const requests = usePreferenceTags();
  useEffect(ensurePreferencesLoaded, []);

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
    const candidates = stores.length ? collectCandidates(stores, getMenusByBrand, remaining, ctx, menusForStore) : [];
    const today = toDateKey(now);
    const sameDay = reroll.date === today;
    const count = sameDay ? reroll.count : 0;
    // 오늘 기록은 day 스토어가 최신 — 최근 목록의 오늘 몫은 그걸로 바꾼다
    const recentLogs: RecentEaten[] = [...(recent ?? []).filter((r) => r.date !== today), ...todayLogs.map((l) => ({ name: l.name, date: l.date, menuId: l.menuId, brandId: l.brandId, storeName: l.storeName }))];
    return buildMealPlan({
      candidates,
      remainingKcal: remaining.kcal,
      now,
      todayLogs,
      recentLogs,
      seed: daySeed(now) + count,
      picks: sameDay ? reroll.picks : {},
      emphasis: targets?.emphasis,
      requests,
    });
  }, [summary, targets, stores, jctx, slot, reroll.date, reroll.count, reroll.picks, recent, requests]); // eslint-disable-line react-hooks/exhaustive-deps

  // 내일 아침 — 하루 목표 전부·세 끼 기준으로 다시 판정한다 (오늘 남은 양 기준 판정과 다르다)
  const tomorrow = useMemo(() => {
    const count = plan ? tomorrowPreviewCount(plan) : 0;
    if (!plan || !targets || !stores.length || recent === null || count === 0) return [];
    const now = new Date();
    const ctx = { profile: jctx.profile, now: tomorrowMorning(now), mealSlotsLeft: 3 };
    const candidates = collectCandidates(stores, getMenusByBrand, targets, ctx, menusForStore);
    const todayLogs = summary?.logs ?? [];
    const today = toDateKey(now);
    const recentLogs: RecentEaten[] = [...recent.filter((r) => r.date !== today), ...todayLogs.map((l) => ({ name: l.name, date: l.date, menuId: l.menuId, brandId: l.brandId, storeName: l.storeName }))];
    return tomorrowMeals({ candidates, targetKcal: targets.kcal, now, recentLogs, todayPlan: plan.meals, requests }).slice(0, count);
  }, [plan, targets, stores, jctx, recent, summary, requests]);

  return { plan, recentLoading: recent === null, tomorrow };
}
