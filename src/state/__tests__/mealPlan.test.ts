import { getMenusByBrand, getMockStores } from '../../data';
import { YEOKSAM_CENTER } from '../../data/mockStores';
import { PROFILE, TARGETS } from '../../domain/__tests__/fixtures';
import { buildMealPlan, candidateGroup, cyclePicks, daySeed, planSlots, tomorrowPreviewCount } from '../../domain/mealPlan';
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

  it('실제 메뉴로도 하루 빵은 한 번, 끼니 갈래는 모두 다르다 (여러 조합)', () => {
    for (let k = 0; k < 6; k++) {
      const plan = buildMealPlan({ candidates, remainingKcal: TARGETS.kcal, now, todayLogs: [], recentLogs: [], seed: daySeed(now) + k });
      const groups = plan.meals.filter((m) => m.status === 'planned').map((m) => candidateGroup(m.main!));
      expect(groups).toHaveLength(3);
      expect(new Set(groups).size).toBe(3);
      expect(groups.filter((g) => g === 'bread').length).toBeLessThanOrEqual(1);
      // 점심·저녁은 빵이 아닌 한 끼
      expect(groups.slice(1)).not.toContain('bread');
    }
  });

  it('점심만 넘겨도 아침·저녁은 그대로', () => {
    const base = buildMealPlan({ candidates, remainingKcal: TARGETS.kcal, now, todayLogs: [], recentLogs: [], seed: daySeed(now) });
    const next = buildMealPlan({ candidates, remainingKcal: TARGETS.kcal, now, todayLogs: [], recentLogs: [], seed: daySeed(now), picks: cyclePicks(base, 'lunch', 1) });
    const ids = (p: typeof base) => p.meals.map((m) => m.main?.menu.id);
    expect(ids(next)[0]).toBe(ids(base)[0]);
    expect(ids(next)[2]).toBe(ids(base)[2]);
    expect(ids(next)[1]).not.toBe(ids(base)[1]);
  });
});

describe('tomorrowPreviewCount — 빈 곳을 내일 미리 보기로', () => {
  const stores = getMockStores(YEOKSAM_CENTER);
  const at = (h: number, remainingKcal = TARGETS.kcal) => {
    const now = new Date(2026, 8, 26, h, 0);
    const { upcoming } = planSlots(remainingKcal, now, []);
    const candidates = collectCandidates(stores, getMenusByBrand, TARGETS, { profile: PROFILE, now, mealSlotsLeft: Math.max(1, upcoming) });
    return buildMealPlan({ candidates, remainingKcal, now, todayLogs: [], recentLogs: [], seed: daySeed(now) });
  };
  it('세 끼면 0 · 두 끼면 아침 1 · 한 끼면 세 끼 · 오늘 충분하면 세 끼', () => {
    expect(tomorrowPreviewCount(at(9))).toBe(0);
    expect(tomorrowPreviewCount(at(13))).toBe(1);
    expect(tomorrowPreviewCount(at(19))).toBe(3);
    expect(tomorrowPreviewCount(at(13, 0))).toBe(3);
  });
});
