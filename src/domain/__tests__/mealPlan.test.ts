import { buildMealPlan, candidateGroup, cyclePicks, daySeed, planOutlook, planSlots, tomorrowBreakfast, tomorrowMeals, type MealPlanInput, type PlanCandidate } from '../mealPlan';
import type { MenuCategory, Store, StoreCategory, Verdict } from '../types';
import { parseRequestByRules } from '../preferences';
import { log, menu } from './fixtures';

// 2026-09-26 09:00 (아침 시간) — 로컬 시각
const MORNING = new Date(2026, 8, 26, 9, 0);
const NOON = new Date(2026, 8, 26, 12, 30);
const TODAY = '2026-09-26';
const YESTERDAY = '2026-09-25';
const THREE_DAYS_AGO = '2026-09-23';

function store(id: string, distanceM = 100, category: StoreCategory = 'convenience'): Store {
  return { id: `s-${id}`, name: `${id} 역삼점`, brandId: id, category, coverage: 'full', distanceM, lat: 0, lng: 0 };
}

function cand(id: string, brand: string, kcal: number, opts: { name?: string; category?: MenuCategory; verdict?: Verdict; score?: number; protein?: number; sugar?: number; carbs?: number; fat?: number; distanceM?: number; storeCategory?: StoreCategory } = {}): PlanCandidate {
  const nutrients = { kcal, protein: opts.protein, sugar: opts.sugar, carbs: opts.carbs, fat: opts.fat };
  return {
    menu: menu({ id, brandId: brand, name: opts.name ?? id, category: opts.category ?? 'meal', serving: '1개', nutrients }),
    judgement: { verdict: opts.verdict ?? 'good', score: opts.score ?? 80, reasons: [], unknown: false },
    store: store(brand, opts.distanceM, opts.storeCategory),
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

  it('어제 먹은 갈래는 뒤로 미루고 첫 끼 이유 문구에 적는다', () => {
    const recentLogs = [{ date: YESTERDAY, name: '햄치즈 샌드위치', brandId: 'zz' }];
    const p = buildMealPlan(input({ recentLogs, seed: 0 }));
    const first = planned(p)[0];
    expect(candidateGroup(first.main!)).not.toBe('bread');
    expect(first.reason).toMatch(/^어제 드신 빵은 빼고, /);
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

});

// ── 음식 갈래 (2026-09-26 효님 피드백: 아침 샌드위치·점심 햄버거·저녁 빵 = 세 끼 다 빵) ──
describe('하루 끼니 갈래', () => {
  const BREADY: PlanCandidate[] = [
    cand('a-sand', 'a', 450, { name: '에그 샌드위치', score: 95 }),
    cand('b-burger', 'b', 500, { name: '치킨 버거', score: 95 }),
    cand('c-bread', 'c', 480, { name: '치즈듬뿍어니언', category: 'snack', storeCategory: 'bakery', score: 95 }),
    cand('d-rice', 'd', 480, { name: '제육 도시락', score: 60 }),
    cand('e-noodle', 'e', 450, { name: '가쓰오 우동', score: 60 }),
  ];
  const groups = (p: ReturnType<typeof buildMealPlan>) => planned(p).map((m) => candidateGroup(m.main!));

  it('빵 후보 점수가 높아도 하루 빵은 한 번, 세 끼 갈래는 모두 다르다', () => {
    for (let seed = 0; seed < 6; seed++) {
      const g = groups(buildMealPlan(input({ candidates: BREADY, seed })));
      expect(g).toHaveLength(3);
      expect(g.filter((x) => x === 'bread')).toHaveLength(1);
      expect(new Set(g).size).toBe(3);
    }
  });

  it('점심·저녁엔 빵보다 밥·면 같은 한 끼를 앞세운다', () => {
    const cands = [cand('a-sand', 'a', 480, { name: '에그 샌드위치', score: 95 }), cand('d-rice', 'd', 480, { name: '제육 도시락', score: 70 })];
    const p = buildMealPlan(input({ candidates: cands, now: new Date(2026, 8, 26, 18, 0), remainingKcal: 600 }));
    expect(planned(p)[0].main!.menu.id).toBe('d-rice');
  });

  it('후보가 빵뿐이면 겹쳐도 채운다 (가능할 때만 지키는 규칙)', () => {
    const p = buildMealPlan(input({ candidates: BREADY.slice(0, 3) }));
    expect(planned(p)).toHaveLength(3);
  });

  it('오늘 기록한 아침이 샌드위치면 점심·저녁은 빵이 아니다 + "드셔서" 이유', () => {
    const todayLogs = [log({ id: 'l1', date: TODAY, mealType: 'breakfast', name: '햄치즈 샌드위치', nutrients: { kcal: 420 } })];
    const p = buildMealPlan(input({ candidates: BREADY, now: new Date(2026, 8, 26, 10, 0), remainingKcal: 1000, todayLogs }));
    expect(p.meals[0]).toMatchObject({ status: 'done', group: 'bread' });
    const g = groups(p);
    expect(g).toHaveLength(2);
    expect(g).not.toContain('bread');
    expect(planned(p)[0].reason).toMatch(/^아침에 빵을 드셔서 점심은 (밥|면)으로 골랐어요$/);
  });

  it('이유 문구 — 앞 끼니 갈래와 이어서 말한다', () => {
    const p = buildMealPlan(input({ candidates: BREADY, seed: 0 }));
    const [b, l, d] = planned(p);
    const word = { bread: '빵', rice: '밥', noodle: '면' } as Record<string, string>;
    expect(l.reason).toBe(`아침에 ${word[b.group!]}${b.group === 'noodle' || b.group === 'rice' || b.group === 'bread' ? '을' : '를'} 골라서 점심은 ${word[l.group!]}으로 골랐어요`);
    expect(d.reason).toContain('점심에 ');
    expect(l.detail).toBeTruthy();
  });

  it('디저트는 주 끼니 주 메뉴로 권하지 않는다', () => {
    const cands = [cand('f-cake', 'f', 450, { name: '레드벨벳 케이크', category: 'snack', storeCategory: 'cafe', score: 99 })];
    expect(buildMealPlan(input({ candidates: cands })).status).toBe('noCandidates');
  });
});

describe('끼니별 다른 메뉴 넘겨 보기', () => {
  const MANY: PlanCandidate[] = [
    cand('a-sand', 'a', 450, { name: '에그 샌드위치' }),
    cand('a-kimbap', 'a', 450, { name: '참치 김밥' }),
    cand('b-bowl', 'b', 500, { name: '닭가슴살 포케' }),
    cand('c-dosirak', 'c', 520, { name: '제육 도시락' }),
    cand('d-pasta', 'd', 500, { name: '토마토 파스타' }),
    cand('e-udon', 'e', 430, { name: '가쓰오 우동' }),
    cand('f-soup', 'f', 480, { name: '누룽지미역국밥' }),
    cand('g-burger', 'g', 540, { name: '치킨 버거' }),
    cand('h-juk', 'h', 420, { name: '전복죽' }),
  ];

  it('끼니마다 후보 목록이 있고, 후보는 다른 끼니와 매장·갈래가 겹치지 않는다', () => {
    const p = buildMealPlan(input({ candidates: MANY }));
    const meals = planned(p);
    for (const m of meals) {
      expect(m.options!.length).toBeGreaterThan(1);
      expect(m.options!.length).toBeLessThanOrEqual(5);
      expect(m.options![m.optionIndex!].menu.id).toBe(m.main!.menu.id);
      const others = meals.filter((o) => o !== m);
      for (const opt of m.options!) {
        for (const o of others) {
          expect(opt.store.id).not.toBe(o.main!.store.id);
          expect(candidateGroup(opt)).not.toBe(o.group);
        }
      }
    }
  });

  it('한 끼를 넘기면 그 끼니만 바뀌고 다른 끼니는 그대로, 끝까지 넘기면 처음으로 돌아온다', () => {
    const base = buildMealPlan(input({ candidates: MANY }));
    const ids = (p: typeof base) => planned(p).map((m) => m.main!.menu.id);
    const lunch = planned(base)[1];
    let cur = base;
    const seen: string[] = [];
    for (let i = 0; i < lunch.options!.length; i++) {
      cur = buildMealPlan(input({ candidates: MANY, picks: cyclePicks(cur, 'lunch', 1) }));
      const now = ids(cur);
      expect(now[0]).toBe(ids(base)[0]);
      expect(now[2]).toBe(ids(base)[2]);
      seen.push(now[1]);
    }
    expect(new Set(seen).size).toBe(lunch.options!.length);
    expect(ids(cur)).toEqual(ids(base));
    // 거꾸로 한 칸
    const back = buildMealPlan(input({ candidates: MANY, picks: cyclePicks(base, 'lunch', -1) }));
    expect(planned(back)[1].main!.menu.id).toBe(lunch.options![(lunch.optionIndex! - 1 + lunch.options!.length) % lunch.options!.length].menu.id);
  });

  it('고른 메뉴가 더는 후보에 없으면 무시하고 새로 고른다', () => {
    const p = buildMealPlan(input({ candidates: MANY, picks: { lunch: 'nope' } }));
    expect(planned(p)[1].main).toBeDefined();
  });
});

describe('planOutlook — 이 식단이면 오늘은', () => {
  it('짠 끼니 합계를 남은 목표량과 견주고, 넘는 양은 단백질 빼고 적는다', () => {
    const cands = [
      cand('a-rice', 'a', 500, { name: '제육 도시락', carbs: 80, protein: 30, fat: 12 }),
      cand('b-noodle', 'b', 500, { name: '가쓰오 우동', carbs: 90, protein: 15, fat: 5 }),
    ];
    const p = buildMealPlan(input({ candidates: cands, now: NOON, remainingKcal: 1200 }));
    const o = planOutlook(p.meals, { kcal: 1200, carbs: 150, protein: 40, fat: 30 });
    expect(o.plannedKcal).toBe(1000);
    expect(o.leftKcal).toBe(200);
    expect(o.rows.map((r) => [r.key, r.planned, r.over])).toEqual([
      ['carbs', 170, 20],
      ['protein', 45, 0],
      ['fat', 17, 0],
    ]);
    expect(o.line).toBe('단백질은 오늘 목표를 다 채워요 · 200kcal 여유 있어요');
  });

  it('정보가 빠진 메뉴가 있으면 아는 것만 더하고 missing 으로 알린다', () => {
    const cands = [cand('a-rice', 'a', 500, { name: '제육 도시락', protein: 30 }), cand('b-noodle', 'b', 500, { name: '가쓰오 우동' })];
    const p = buildMealPlan(input({ candidates: cands, now: NOON, remainingKcal: 1200 }));
    const o = planOutlook(p.meals, { kcal: 1200, carbs: 150, protein: 90, fat: 30 });
    expect(o.rows[1]).toMatchObject({ planned: 30, missing: 1 });
    expect(o.rows[0]).toMatchObject({ planned: null, missing: 2 });
    expect(o.line).toBe('단백질 30g 넘게 채워요 · 200kcal 여유 있어요');
  });
});

describe('tomorrowBreakfast — 내일 아침 미리 보기', () => {
  const EVENING = new Date(2026, 8, 26, 19, 0);
  const cands = [
    cand('a-rice', 'a', 520, { name: '제육 도시락', score: 99 }),
    cand('b-sand', 'b', 480, { name: '에그 샌드위치', score: 60 }),
    cand('c-juk', 'c', 450, { name: '전복죽', score: 60 }),
  ];

  it('내일 아침 8시 기준, 하루 목표 ÷ 3 몫으로 한 끼를 고른다', () => {
    const m = tomorrowBreakfast({ candidates: cands, targetKcal: 1800, now: EVENING, recentLogs: [] });
    expect(m).toMatchObject({ mealType: 'breakfast', status: 'planned', budgetKcal: 600 });
  });

  it('오늘 저녁 식단과 같은 메뉴·갈래는 피한다', () => {
    const today = buildMealPlan(input({ candidates: cands, now: EVENING, remainingKcal: 700 }));
    const dinner = planned(today)[0];
    expect(dinner.main!.menu.id).toBe('a-rice');
    const m = tomorrowBreakfast({ candidates: cands, targetKcal: 1800, now: EVENING, recentLogs: [], todayPlan: today.meals });
    expect(m!.main!.menu.id).not.toBe('a-rice');
    expect(m!.group).not.toBe('rice');
  });

  it('내일 세 끼도 갈래·매장이 겹치지 않게 짠다', () => {
    const more = [...cands, cand('d-udon', 'd', 450, { name: '가쓰오 우동' })];
    const meals = tomorrowMeals({ candidates: more, targetKcal: 1800, now: EVENING, recentLogs: [] });
    expect(meals.map((m) => m.mealType)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(new Set(meals.map((m) => m.group)).size).toBe(3);
    expect(new Set(meals.map((m) => m.main!.store.id)).size).toBe(3);
  });
});

describe('밀리에게 한 요청 반영', () => {
  const reqs = (...texts: string[]) => texts.flatMap((t) => parseRequestByRules(t));
  const breakfast = (p: ReturnType<typeof buildMealPlan>) => p.meals.find((m) => m.mealType === 'breakfast')!;

  it('꼭 빼 달라는 메뉴는 어느 끼니에도 넣지 않고, 이유에 적는다', () => {
    const cands = [...CANDIDATES, cand('g-spicy', 'g', 500, { name: '불닭 덮밥', score: 100, protein: 30 })];
    for (let seed = 0; seed < 6; seed++) {
      const base = buildMealPlan(input({ candidates: cands, seed }));
      const p = buildMealPlan(input({ candidates: cands, seed, requests: reqs('매운 건 빼 줘') }));
      const ids = planned(p).flatMap((m) => (m.options ?? []).map((o) => o.menu.id));
      expect(ids).not.toContain('g-spicy');
      if (planned(base).some((m) => m.main!.menu.id === 'g-spicy')) {
        expect(planned(p).some((m) => m.reason === '요청하신 대로 매운 건 빼고 골랐어요')).toBe(true);
      }
    }
  });

  it('아침엔 샐러드 위주 → 근처에 샐러드가 있으면 아침은 샐러드 (seed 와 상관없이)', () => {
    const cands = [...CANDIDATES, cand('h-salad', 'h', 380, { name: '콥 샐러드', score: 40, verdict: 'ok' })];
    for (let seed = 0; seed < 6; seed++) {
      const without = buildMealPlan(input({ candidates: cands, seed }));
      const p = buildMealPlan(input({ candidates: cands, seed, requests: reqs('아침엔 웬만하면 샐러드 위주로 먹고 싶어') }));
      expect(breakfast(p).group).toBe('salad');
      expect(breakfast(p).reason).toBe('요청하신 대로 아침은 샐러드로 골랐어요');
      if (seed === 0) expect(breakfast(without).main!.menu.id).not.toBe('h-salad');
    }
  });

  it('근처에 샐러드가 없으면 다른 메뉴로 고르고 그렇게 알린다', () => {
    const noSalad = CANDIDATES.filter((c) => c.menu.id !== 'b-bowl');
    const p = buildMealPlan(input({ candidates: noSalad, requests: reqs('아침엔 샐러드 위주로') }));
    expect(breakfast(p).status).toBe('planned');
    expect(breakfast(p).reason).toBe('근처에 샐러드가 없어 다른 메뉴로 골랐어요');
    expect(breakfast(p).detail).toBeTruthy();
  });

  it('빵은 통밀로 — 통밀빵이 있으면 그걸, 없으면 "근처에 통밀빵이 없어 일반 빵으로"', () => {
    const breads = [cand('a-egg', 'a', 450, { name: '에그 샌드위치', score: 90 }), cand('b-whole', 'b', 430, { name: '통밀 햄치즈 샌드위치', score: 60 })];
    const only = (cs: PlanCandidate[]) => input({ candidates: cs, remainingKcal: 500, now: new Date(2026, 8, 26, 19, 0) });
    const withWhole = buildMealPlan({ ...only(breads), requests: reqs('빵은 통밀 위주로') });
    expect(planned(withWhole)[0].main!.menu.id).toBe('b-whole');
    expect(planned(withWhole)[0].reason).toBe('요청하신 대로 통밀빵으로 골랐어요');
    const plain = buildMealPlan({ ...only([breads[0]]), requests: reqs('빵은 통밀 위주로') });
    expect(planned(plain)[0].main!.menu.id).toBe('a-egg');
    expect(planned(plain)[0].reason).toBe('근처에 통밀빵이 없어 일반 빵으로 골랐어요');
  });

  it('빵은 통밀로 — 빵이 아닌 끼니를 빵으로 끌어오지는 않는다', () => {
    const p0 = buildMealPlan(input());
    const p = buildMealPlan(input({ requests: reqs('빵은 통밀로') }));
    expect(planned(p).map((m) => m.main!.menu.id)).toEqual(planned(p0).map((m) => m.main!.menu.id));
  });

  it('"빼고 골랐어요"는 하루 한 번만 — 여러 끼니에 되풀이하지 않는다', () => {
    const cands = [...CANDIDATES, cand('g-spicy', 'g', 500, { name: '불닭 덮밥' }), cand('i-spicy', 'i', 550, { name: '매콤 제육 덮밥' })];
    const p = buildMealPlan(input({ candidates: cands, requests: reqs('매운 건 빼 줘') }));
    expect(planned(p).filter((m) => m.reason === '요청하신 대로 매운 건 빼고 골랐어요')).toHaveLength(1);
  });

  it('요청이 없으면 식단은 그대로', () => {
    expect(buildMealPlan(input({ requests: [] }))).toEqual(buildMealPlan(input()));
  });
});
