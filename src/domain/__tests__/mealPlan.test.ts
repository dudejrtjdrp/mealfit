import { buildMealPlan, daySeed, foodKind, planSlots, type MealPlanInput, type PlanCandidate } from '../mealPlan';
import type { MenuCategory, Store, Verdict } from '../types';
import { log, menu } from './fixtures';

// 2026-09-26 09:00 (아침 시간) — 로컬 시각
const MORNING = new Date(2026, 8, 26, 9, 0);
const NOON = new Date(2026, 8, 26, 12, 30);
const TODAY = '2026-09-26';
const YESTERDAY = '2026-09-25';
const THREE_DAYS_AGO = '2026-09-23';

function store(id: string, distanceM = 100): Store {
  return { id: `s-${id}`, name: `${id} 역삼점`, brandId: id, category: 'convenience', coverage: 'full', distanceM, lat: 0, lng: 0 };
}

function cand(id: string, brand: string, kcal: number, opts: { name?: string; category?: MenuCategory; verdict?: Verdict; score?: number; protein?: number; sugar?: number; distanceM?: number } = {}): PlanCandidate {
  const nutrients = { kcal, protein: opts.protein, sugar: opts.sugar };
  return {
    menu: menu({ id, brandId: brand, name: opts.name ?? id, category: opts.category ?? 'meal', serving: '1개', nutrients }),
    judgement: { verdict: opts.verdict ?? 'good', score: opts.score ?? 80, reasons: [], unknown: false },
    store: store(brand, opts.distanceM),
    kcal,
    nutrients,
  };
}

const CANDIDATES: PlanCandidate[] = [
  cand('a-sand', 'a', 450, { name: '에그 샌드위치', protein: 18 }),
  cand('a-latte', 'a', 150, { name: '라떼', category: 'drink' }),
  cand('a-kimbap', 'a', 480, { name: '참치 김밥', protein: 14 }),
  cand('b-bowl', 'b', 520, { name: '닭가슴살 포케', protein: 32 }),
  cand('b-tea', 'b', 90, { name: '유자 아이스티', category: 'drink', sugar: 20 }),
  cand('c-dosirak', 'c', 600, { name: '제육 도시락', protein: 25 }),
  cand('c-kimbap', 'c', 420, { name: '야채 김밥' }),
  cand('d-pasta', 'd', 560, { name: '토마토 파스타', verdict: 'ok', score: 60 }),
  cand('e-burger', 'e', 620, { name: '치킨 버거' }),
  cand('f-cake', 'f', 1900, { name: '홀케이크', category: 'snack', verdict: 'ok' }),
];

function input(partial: Partial<MealPlanInput> = {}): MealPlanInput {
  return { candidates: CANDIDATES, remainingKcal: 1800, now: MORNING, todayLogs: [], recentLogs: [], seed: daySeed(MORNING), ...partial };
}

const planned = (p: ReturnType<typeof buildMealPlan>) => p.meals.filter((m) => m.status === 'planned');

describe('foodKind', () => {
  it('이름 키워드로 음식 종류를 가른다', () => {
    expect(foodKind('에그 샌드위치')).toBe('샌드위치');
    expect(foodKind('참치 김밥')).toBe('김밥');
    expect(foodKind('참치마요 삼각김밥')).toBe('삼각김밥');
    expect(foodKind('아메리카노')).toBeUndefined();
  });
});

describe('planSlots', () => {
  it('아침 시간·기록 없음 → 세 끼를 남은 양 ÷ 3 으로', () => {
    const { meals, upcoming } = planSlots(1800, MORNING, []);
    expect(upcoming).toBe(3);
    expect(meals.map((m) => [m.mealType, m.status, m.budgetKcal])).toEqual([
      ['breakfast', 'planned', 600],
      ['lunch', 'planned', 600],
      ['dinner', 'planned', 600],
    ]);
  });

  it('점심 시간 — 아침을 기록했으면 done, 안 했으면 skipped', () => {
    const done = planSlots(1200, NOON, [log({ id: 'l1', mealType: 'breakfast', name: '베이글', nutrients: { kcal: 380 } })]);
    expect(done.meals[0]).toMatchObject({ status: 'done', loggedKcal: 380, loggedNames: ['베이글'] });
    expect(done.meals[1]).toMatchObject({ status: 'planned', budgetKcal: 600 });
    const skipped = planSlots(1200, NOON, []);
    expect(skipped.meals[0].status).toBe('skipped');
  });

  it('세 끼를 다 기록하고 남은 양이 있으면 간식 하나', () => {
    const logs = (['breakfast', 'lunch', 'dinner'] as const).map((m, i) => log({ id: `l${i}`, mealType: m, nutrients: { kcal: 400 } }));
    const { meals, upcoming } = planSlots(600, new Date(2026, 8, 26, 19, 0), logs);
    expect(upcoming).toBe(0);
    expect(meals[3]).toMatchObject({ mealType: 'snack', status: 'planned', label: '간식' });
    expect(meals[3].budgetKcal).toBeLessThanOrEqual(600);
  });
});

describe('buildMealPlan', () => {
  it('끼니마다 서로 다른 매장, 적정량 안에서 고른다', () => {
    const p = buildMealPlan(input());
    expect(p.status).toBe('ok');
    const meals = planned(p);
    expect(meals).toHaveLength(3);
    const stores = meals.map((m) => m.main!.store.id);
    expect(new Set(stores).size).toBe(3);
    for (const m of meals) {
      expect(m.main!.kcal).toBeLessThanOrEqual(m.budgetKcal! * 1.1);
      expect(m.totalKcal!).toBeLessThanOrEqual(Math.round(m.budgetKcal! * 1.1));
      expect(m.main!.menu.category).not.toBe('drink');
      expect(m.reason).toBeTruthy();
    }
    expect(p.storeCount).toBe(3);
    // 1,900kcal 케이크는 어느 끼니에도 안 들어간다
    expect(meals.some((m) => m.main!.menu.id === 'f-cake')).toBe(false);
  });

  it('최근 2일 먹은 메뉴(menuId·이름)는 빼고, 사흘 전 것은 다시 권할 수 있다', () => {
    const recentLogs = [
      { date: YESTERDAY, name: '닭가슴살 포케', menuId: 'b-bowl', brandId: 'b' },
      { date: TODAY, name: '제육도시락', brandId: 'zz' }, // 이름만 같음(공백 차이)
    ];
    for (let seed = 0; seed < 8; seed++) {
      const ids = planned(buildMealPlan(input({ recentLogs, seed }))).map((m) => m.main!.menu.id);
      expect(ids).not.toContain('b-bowl');
      expect(ids).not.toContain('c-dosirak');
    }
    const old = [{ date: THREE_DAYS_AGO, name: '닭가슴살 포케', menuId: 'b-bowl', brandId: 'b' }];
    const any = Array.from({ length: 8 }, (_, seed) => planned(buildMealPlan(input({ recentLogs: old, seed }))).map((m) => m.main!.menu.id)).flat();
    expect(any).toContain('b-bowl');
  });

  it('어제 먹은 종류는 뒤로 미루고 이유 문구에 적는다', () => {
    const recentLogs = [{ date: YESTERDAY, name: '햄치즈 샌드위치', brandId: 'zz' }];
    const p = buildMealPlan(input({ recentLogs, seed: 0 }));
    const first = planned(p)[0];
    expect(foodKind(first.main!.menu.name)).not.toBe('샌드위치');
    expect(first.reason).toMatch(/^어제 드신 샌드위치는 빼고, /);
  });

  it('같은 입력·seed 면 늘 같은 식단 (결정적)', () => {
    const a = buildMealPlan(input());
    const b = buildMealPlan(input({ candidates: [...CANDIDATES].reverse() }));
    expect(planned(a).map((m) => m.main!.menu.id)).toEqual(planned(b).map((m) => m.main!.menu.id));
  });

  it('다른 조합 보기(seed+1)는 결과를 바꾼다', () => {
    const seed = daySeed(MORNING);
    const ids = (s: number) => planned(buildMealPlan(input({ seed: s }))).map((m) => m.main!.menu.id).join(',');
    expect(ids(seed + 1)).not.toBe(ids(seed));
  });

  it('이미 기록한 끼니는 done 으로 두고 남은 끼니만 짠다', () => {
    const todayLogs = [log({ id: 'l1', date: TODAY, mealType: 'lunch', name: '비빔밥', nutrients: { kcal: 620 } })];
    const p = buildMealPlan(input({ now: NOON, remainingKcal: 1100, todayLogs }));
    expect(p.meals.map((m) => [m.mealType, m.status])).toEqual([
      ['breakfast', 'skipped'],
      ['lunch', 'done'],
      ['dinner', 'planned'],
    ]);
    expect(p.meals[1].loggedKcal).toBe(620);
    expect(p.meals[2].budgetKcal).toBe(1100);
  });

  it('여유가 남으면 같은 매장 음료를 곁들인다', () => {
    const cands = [cand('a-sand', 'a', 350, { name: '에그 샌드위치' }), cand('a-latte', 'a', 150, { name: '라떼', category: 'drink' })];
    const p = buildMealPlan(input({ candidates: cands, now: new Date(2026, 8, 26, 18, 0), remainingKcal: 600 }));
    const dinner = planned(p)[0];
    expect(dinner.main!.menu.id).toBe('a-sand');
    expect(dinner.extra?.menu.id).toBe('a-latte');
    expect(dinner.totalKcal).toBe(500);
  });

  it('남은 양이 없으면 full — 짠 끼니 없음', () => {
    const p = buildMealPlan(input({ remainingKcal: 0 }));
    expect(p.status).toBe('full');
    expect(planned(p)).toHaveLength(0);
  });

  it('맞는 후보가 없으면 noCandidates', () => {
    expect(buildMealPlan(input({ candidates: [] })).status).toBe('noCandidates');
    const p = buildMealPlan(input({ candidates: [cand('f-cake', 'f', 1900, { category: 'snack' })] }));
    expect(p.status).toBe('noCandidates');
    expect(p.meals.every((m) => m.status === 'empty')).toBe(true);
  });

  it('후보가 모자라면 앞 끼니부터 채우고 나머지는 empty', () => {
    const p = buildMealPlan(input({ candidates: [cand('b-bowl', 'b', 520, { name: '포케' })] }));
    expect(p.meals.map((m) => m.status)).toEqual(['planned', 'empty', 'empty']);
  });
});

describe('곁들임·음식 종류 보강', () => {
  it('저녁엔 커피류를 곁들이지 않는다', () => {
    const cands = [cand('a-sand', 'a', 350, { name: '에그 샌드위치' }), cand('a-ame', 'a', 120, { name: '아이스 카페 아메리카노', category: 'drink' })];
    const p = buildMealPlan(input({ candidates: cands, now: new Date(2026, 8, 26, 18, 0), remainingKcal: 600 }));
    expect(p.meals.find((m) => m.status === 'planned')!.extra).toBeUndefined();
  });

  it('주 메뉴가 적정량의 75% 이상이면 곁들이지 않는다', () => {
    const cands = [cand('a-sand', 'a', 480, { name: '에그 샌드위치' }), cand('a-milk', 'a', 100, { name: '우유', category: 'drink', protein: 6 })];
    const p = buildMealPlan(input({ candidates: cands, now: new Date(2026, 8, 26, 18, 0), remainingKcal: 600 }));
    expect(p.meals.find((m) => m.status === 'planned')!.extra).toBeUndefined();
  });

  it('메뉴 이름으로 모르면 매장 이름으로 종류를 본다', () => {
    expect(foodKind('에그마요', '서브웨이 역삼역점')).toBe('샌드위치');
    expect(foodKind('에그마요')).toBeUndefined();
  });
});
