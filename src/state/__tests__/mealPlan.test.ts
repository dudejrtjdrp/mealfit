import { getMenusByBrand, getMockStores } from '../../data';
import { YEOKSAM_CENTER } from '../../data/mockStores';
import { PROFILE, TARGETS } from '../../domain/__tests__/fixtures';
import { buildMealPlan, daySeed, planSlots } from '../../domain/mealPlan';
import { collectCandidates } from '../recommend';

// 실제 시드 메뉴 + 역삼동 목 매장으로 식단이 짜지는지 (화면 useMealPlan 과 같은 조합)
describe('밀리 식단 — 목 매장 통합', () => {
  const now = new Date(2026, 8, 26, 9, 0);
  const stores = getMockStores(YEOKSAM_CENTER);
  const { upcoming } = planSlots(TARGETS.kcal, now, []);
  const candidates = collectCandidates(stores, getMenusByBrand, TARGETS, { profile: PROFILE, now, mealSlotsLeft: upcoming });

  it('세 끼를 서로 다른 매장에서 적정량 안으로 짠다', () => {
    const plan = buildMealPlan({ candidates, remainingKcal: TARGETS.kcal, now, todayLogs: [], recentLogs: [], seed: daySeed(now) });
    if (process.env.PLAN_DEBUG) console.log(plan.meals.map((m) => `${m.label} ${m.main?.store.name} ${m.main?.menu.name}${m.extra ? ' + ' + m.extra.menu.name : ''} ${m.totalKcal}/${m.budgetKcal} ${m.main?.judgement.verdict} | ${m.reason}`).join('\n'));
    expect(plan.status).toBe('ok');
    const meals = plan.meals.filter((m) => m.status === 'planned');
    expect(meals).toHaveLength(3);
    expect(new Set(meals.map((m) => m.main!.store.id)).size).toBe(3);
    for (const m of meals) expect(m.totalKcal!).toBeLessThanOrEqual(Math.round(m.budgetKcal! * 1.1));
  });

  it('다시 짜기를 몇 번 해도 매번 끼니 메뉴가 바뀐다', () => {
    const key = (seed: number) =>
      buildMealPlan({ candidates, remainingKcal: TARGETS.kcal, now, todayLogs: [], recentLogs: [], seed })
        .meals.map((m) => m.main?.menu.id)
        .join(',');
    const s = daySeed(now);
    expect(key(s + 1)).not.toBe(key(s));
    expect(key(s + 2)).not.toBe(key(s + 1));
  });
});
