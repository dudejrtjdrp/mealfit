import {
  applyOptions,
  budgetReason,
  judgeMenu,
  mealBudget,
  MILK_DRINK_REASON,
  optionPhrase,
  rankMenus,
  SWEET_DRINK_REASON,
  suggestAlternatives,
  type JudgeContext,
} from '../judge';
import type { DailyTargets, MenuItem, OptionGroup } from '../types';
import { menu, PROFILE } from './fixtures';

const REMAINING: DailyTargets = {
  kcal: 842,
  carbs: 128,
  protein: 44,
  fat: 42,
  sugar: 30,
  sodium: 1200,
  emphasis: ['carbs', 'protein', 'fat'],
};
/** 점심 12:30 — 점심·저녁 2끼 남음 → 이번 끼니 적정량 = 남은 kcal ÷ 2 (842 → 421) */
const LUNCH = new Date(2026, 8, 15, 12, 30);
const ctx: JudgeContext = { profile: PROFILE, now: LUNCH };
const BANNED = ['제한', '초과', '금지', '나쁨', '위험', '여유분'];

const size: OptionGroup = {
  id: 'size',
  label: '사이즈',
  choices: [
    { label: 'Tall', delta: {}, isDefault: true },
    { label: 'Grande', delta: { kcal: 60, sugar: 8 } },
    { label: 'Venti', delta: { kcal: 700, sugar: 16 } },
  ],
};
const syrup: OptionGroup = {
  id: 'syrup',
  label: '시럽',
  choices: [
    { label: '기본', delta: {}, isDefault: true },
    { label: '시럽 빼기', delta: { kcal: -40, carbs: -10, sugar: -10 } },
  ],
};

const vanillaLatte = menu({
  id: 'vanilla',
  name: '아이스 바닐라 라떼',
  nutrients: { kcal: 190, carbs: 28, protein: 6, fat: 5, sugar: 26 },
  options: [size, syrup],
});

describe('applyOptions', () => {
  it('기본 선택(isDefault)은 차이가 없다', () => {
    expect(applyOptions(vanillaLatte)).toEqual(vanillaLatte.nutrients);
  });
  it('선택한 옵션 차이를 더하고, 음수는 0, 없는 영양소는 만들지 않는다', () => {
    const n = applyOptions(vanillaLatte, { size: 'Grande', syrup: '시럽 빼기' });
    expect(n).toEqual({ kcal: 210, carbs: 18, protein: 6, fat: 5, sugar: 24 });
    const tiny = menu({ id: 't', nutrients: { kcal: 20, sugar: 5 }, options: [syrup] });
    const t = applyOptions(tiny, { syrup: '시럽 빼기' });
    expect(t).toEqual({ kcal: 0, sugar: 0 });
    expect(t && 'carbs' in t).toBe(false);
  });
  it('영양 정보가 없으면 null', () => {
    expect(applyOptions(menu({ id: 'x', nutrients: null, trust: 'none' }))).toBeNull();
  });
});

describe('judgeMenu', () => {
  it('정보 없음 → unknown', () => {
    const j = judgeMenu(menu({ id: 'x', nutrients: null, trust: 'none' }), REMAINING, ctx);
    expect(j).toEqual({
      unknown: true,
      verdict: 'pass',
      score: -1,
      reasons: ['아직 추가되지 않은 정보입니다', '영양표시 의무가 없는 메뉴예요'],
    });
  });

  it('가벼운 메뉴는 좋음', () => {
    const j = judgeMenu(menu({ id: 'am', nutrients: { kcal: 10, carbs: 2, protein: 1, fat: 0 } }), REMAINING, ctx);
    expect(j.verdict).toBe('good');
    // kcal 100×0.7 + 강조(탄100·단45.5·지100 평균 81.8)×0.3 = 94.5 → 30 kcal 미만 상한 85
    expect(j.score).toBe(85);
    expect(j.unknown).toBe(false);
    // 근거 숫자 한 줄: 10 ÷ 421
    expect(j.reasons[0]).toBe('점심 적정량의 2%예요');
  });

  it('남은 kcal 보다 크면 점수와 상관없이 패스', () => {
    const big = menu({ id: 'big', category: 'meal', nutrients: { kcal: 900, carbs: 10, protein: 40, fat: 5 } });
    const j = judgeMenu(big, REMAINING, ctx);
    expect(j.verdict).toBe('pass');
    expect(j.score).toBeLessThan(40);
    expect(j.reasons).toEqual(['오늘 남은 양의 107%라 조금 커요', '다른 메뉴가 더 잘 맞아요']);
  });

  it('남은 여유가 0이면 어떤 메뉴든 패스', () => {
    const j = judgeMenu(menu({ id: 'a', nutrients: { kcal: 10 } }), { ...REMAINING, kcal: 0 }, ctx);
    expect(j.verdict).toBe('pass');
    expect(j.reasons).toEqual(['오늘은 여기까지 채웠어요', '내일 다시 채워져요']);
  });

  it('연속형 점수 (음료 상한 전)', () => {
    const food = menu({ ...vanillaLatte, id: 'food', category: 'snack', options: undefined });
    const j = judgeMenu(food, { ...REMAINING, kcal: 400 }, ctx);
    // 적정량 200, r=0.95 → kcal 50×0.7=35 · 강조(끼니 몫 탄64·단22·지21 → 100·61.8·100)=87.3×0.3=26.2 → 61
    expect(j.score).toBe(61);
    expect(j.verdict).toBe('ok');
    expect(j.reasons).toEqual(['점심 적정량의 95%예요', '평소처럼 드셔도 좋아요']);
  });

  it('시럽 가이드: 음료는 상한 때문에 pass → ok 로 올라간다', () => {
    const rem = { ...REMAINING, kcal: 300 };
    const j = judgeMenu(vanillaLatte, rem, ctx);
    expect(j.verdict).toBe('pass');
    expect(j.reasons[0]).toBe('점심 적정량의 127%라 이번 끼니엔 조금 커요');
    expect(j.guide).toBe('시럽 빼면 괜찮음이 돼요');
    const noSyrup = judgeMenu(vanillaLatte, rem, { ...ctx, selectedOptions: { syrup: '시럽 빼기' } });
    expect(noSyrup.verdict).toBe('ok');
    expect(noSyrup.reasons).toEqual(['점심 적정량의 100%예요', MILK_DRINK_REASON, '평소처럼 드셔도 좋아요']);
  });

  it('음료 상한: 80 kcal 이상 음료는 최대 괜찮음(69), 단백질 10 g 이상은 예외', () => {
    const latte = judgeMenu(menu({ id: 'l', name: '아이스 카페 라떼', nutrients: { kcal: 110, carbs: 9, protein: 6, fat: 6 } }), REMAINING, ctx);
    expect(latte.score).toBe(69);
    expect(latte.verdict).toBe('ok');
    expect(latte.reasons).toEqual(['점심 적정량의 26%예요', MILK_DRINK_REASON, '평소처럼 드셔도 좋아요']);
    const tea = judgeMenu(menu({ id: 't', name: '자몽 허니 블랙 티', nutrients: { kcal: 125, carbs: 31, protein: 0, fat: 0 } }), REMAINING, ctx);
    expect(tea.verdict).toBe('ok');
    expect(tea.reasons.slice(1)).toEqual([SWEET_DRINK_REASON, '평소처럼 드셔도 좋아요']);
    const shake = judgeMenu(menu({ id: 's', name: '프로틴 음료', nutrients: { kcal: 120, carbs: 9, protein: 16, fat: 2 } }), REMAINING, ctx);
    expect(shake.verdict).toBe('good');
    expect(shake.score).toBeGreaterThan(69);
    // 음료가 아니면 상한 없음
    const food = judgeMenu(menu({ id: 'f', category: 'snack', nutrients: { kcal: 110, carbs: 9, protein: 6, fat: 6 } }), REMAINING, ctx);
    expect(food.verdict).toBe('good');
  });

  it('초저칼로리 상한 85: 아메리카노가 식사보다 위에 서지 않는다', () => {
    const americano = menu({ id: 'am', nutrients: { kcal: 10, carbs: 2, protein: 1, fat: 0 } });
    const salad = menu({ id: 'salad', category: 'salad', nutrients: { kcal: 180, carbs: 10, protein: 18, fat: 7 } });
    expect(judgeMenu(americano, REMAINING, ctx).score).toBe(85);
    expect(rankMenus([americano, salad], REMAINING, ctx).map((x) => x.menu.id)).toEqual(['salad', 'am']);
  });

  it('"단백질도 챙길 수 있어요" 는 단백질 10 g 이상일 때만', () => {
    const low = judgeMenu(menu({ id: 'a', category: 'snack', nutrients: { kcal: 150, carbs: 10, protein: 9, fat: 3 } }), REMAINING, ctx);
    expect(low.verdict).toBe('good');
    expect(low.reasons.join(' ')).not.toContain('단백질');
    const high = judgeMenu(menu({ id: 'b', category: 'snack', nutrients: { kcal: 150, carbs: 10, protein: 12, fat: 3 } }), REMAINING, ctx);
    expect(high.reasons[1]).toBe('단백질도 챙길 수 있어요');
  });

  it('식단 유형·목적 보정은 총점에 가감', () => {
    const rem = { ...REMAINING, sugar: 1000, sodium: 5000 };
    const base = { kcal: 300, carbs: 60, protein: 8, fat: 15, satFat: 4, sugar: 19, sodium: 300 };
    const scoreOf = (n: typeof base, profile: JudgeContext['profile']) =>
      judgeMenu(menu({ id: 'x', category: 'meal', nutrients: n }), rem, { profile, now: LUNCH }).score;
    const diet = (type: 'low_sugar' | 'balanced') => ({ type, evidence: [], source: 'rule' as const });

    const bs = { ...PROFILE, primaryGoal: 'blood_sugar' as const };
    expect(scoreOf(base, bs) - scoreOf({ ...base, sugar: 20 }, bs)).toBe(15);
    const ch = { ...PROFILE, primaryGoal: 'cholesterol' as const };
    expect(scoreOf(base, ch) - scoreOf({ ...base, satFat: 5 }, ch)).toBe(10);
    // satFat 값이 없으면 보정하지 않음
    const { satFat: _omit, ...noSat } = base;
    expect(scoreOf(noSat as typeof base, ch)).toBe(scoreOf(base, ch));
    expect(scoreOf({ ...base, sugar: 15 }, { ...PROFILE, diet: diet('balanced') }) - scoreOf({ ...base, sugar: 15 }, { ...PROFILE, diet: diet('low_sugar') })).toBe(15);
  });

  it('점수 곡선', () => {
    const { kcalScore, nutrientShareScore } = jest.requireActual('../judge');
    // r = 메뉴 kcal ÷ 이번 끼니 적정량
    expect(kcalScore(0.5)).toBe(100);
    expect(kcalScore(0.8)).toBeCloseTo(70);
    expect(kcalScore(1.1)).toBeCloseTo(30);
    expect(kcalScore(1.5)).toBeCloseTo(0);
    expect(kcalScore(2)).toBe(0);
    // share = 값 ÷ 이번 끼니 몫
    expect(nutrientShareScore('carbs', 0.75)).toBe(100);
    expect(nutrientShareScore('carbs', 1.375)).toBeCloseTo(50);
    expect(nutrientShareScore('sodium', 2.1)).toBe(0);
    expect(nutrientShareScore('protein', 0)).toBe(40);
    expect(nutrientShareScore('protein', 0.8)).toBe(100);
  });

  it('사이즈 가이드: Venti 가 패스면 "Tall로 하면"', () => {
    const j = judgeMenu(vanillaLatte, REMAINING, { ...ctx, selectedOptions: { size: 'Venti' } });
    expect(j.verdict).toBe('pass');
    expect(j.guide).toBe('Tall로 하면 괜찮음이 돼요');
  });

  it('고단백 증량형은 단백질 20 g 이상 가산', () => {
    const m = menu({ id: 'p', category: 'meal', nutrients: { kcal: 500, carbs: 130, protein: 25, fat: 30 } });
    const plain = judgeMenu(m, REMAINING, ctx).score;
    const bulk = judgeMenu(m, REMAINING, {
      ...ctx,
      profile: { ...PROFILE, diet: { type: 'high_protein_bulk', evidence: [], source: 'rule' } },
    }).score;
    expect(bulk - plain).toBe(10);
  });

  it('이유 문구에 금지어가 없다', () => {
    const menus: MenuItem[] = [
      menu({ id: 'a', nutrients: { kcal: 10 } }),
      menu({ id: 'b', nutrients: { kcal: 600, carbs: 120, fat: 40, sugar: 40, sodium: 1500 } }),
      menu({ id: 'c', nutrients: { kcal: 2000 } }),
      menu({ id: 'd', name: '카페 라떼', nutrients: { kcal: 400, carbs: 80, protein: 5, fat: 20 } }),
      menu({ id: 'e', category: 'meal', nutrients: { kcal: 300, carbs: 20, protein: 30, fat: 5, sodium: 300 } }),
    ];
    for (const now of [new Date(2026, 8, 15, 8), LUNCH, new Date(2026, 8, 15, 19), new Date(2026, 8, 15, 23)]) {
      for (const kcal of [0, 300, 842, 2000]) {
        for (const m of menus) {
          const j = judgeMenu(m, { ...REMAINING, kcal }, { ...ctx, now });
          expect(j.reasons.length).toBeLessThanOrEqual(3);
          for (const w of BANNED) expect(j.reasons.join(' ') + (j.guide ?? '')).not.toContain(w);
        }
      }
    }
  });
});

describe('optionPhrase', () => {
  it('라벨 → 가이드 앞부분', () => {
    expect(optionPhrase('시럽 빼기')).toBe('시럽 빼면');
    expect(optionPhrase('Tall')).toBe('Tall로 하면');
    expect(optionPhrase('면 반만')).toBe('면을 반만 드시면');
    expect(optionPhrase('오트밀크')).toBe('오트밀크로 하면');
    expect(optionPhrase('일반')).toBe('일반으로 하면');
    expect(optionPhrase('15cm')).toBe('15cm로 하면');
  });
});

describe('rankMenus / suggestAlternatives', () => {
  const light = menu({ id: 'light', nutrients: { kcal: 10, carbs: 2, protein: 1, fat: 0 } });
  const mid = menu({ id: 'mid', nutrients: { kcal: 400, carbs: 60, protein: 5, fat: 20 } });
  const heavy = menu({ id: 'heavy', category: 'meal', nutrients: { kcal: 900 } });
  const none1 = menu({ id: 'none1', nutrients: null, trust: 'none' });
  const none2 = menu({ id: 'none2', nutrients: null, trust: 'none' });
  const salad = menu({ id: 'salad', category: 'salad', nutrients: { kcal: 150, carbs: 10, protein: 20, fat: 5 } });

  it('score 내림차순, unknown 은 원래 순서대로 맨 뒤', () => {
    const ranked = rankMenus([none1, heavy, mid, none2, light], REMAINING, ctx).map((x) => x.menu.id);
    expect(ranked).toEqual(['light', 'mid', 'heavy', 'none1', 'none2']);
  });

  it('같은 카테고리 우선, 점수가 더 높은 것만', () => {
    const alts = suggestAlternatives(mid, [mid, salad, light, heavy, none1], REMAINING, ctx, 2).map((x) => x.menu.id);
    expect(alts).toEqual(['light', 'salad']);
    const forHeavy = suggestAlternatives(heavy, [heavy, mid, light], REMAINING, ctx, 1).map((x) => x.menu.id);
    expect(forHeavy).toEqual(['light']);
    expect(suggestAlternatives(light, [light, mid, heavy], REMAINING, ctx)).toEqual([]);
  });
});

describe('끼니 기준 판정 (이번 끼니 적정량 = 남은 kcal ÷ 남은 끼니 수)', () => {
  const salad = menu({ id: 'sal', category: 'salad', nutrients: { kcal: 450, carbs: 40, protein: 25, fat: 18 } });
  const at = (h: number, m = 0) => new Date(2026, 8, 15, h, m);

  it('저녁 7시에 700 kcal 남았으면 450 kcal 샐러드는 좋음 (남은 양의 64%)', () => {
    const j = judgeMenu(salad, { ...REMAINING, kcal: 700 }, { ...ctx, now: at(19) });
    expect(j.verdict).toBe('good');
    expect(j.reasons[0]).toBe('오늘 남은 양의 64%예요');
  });

  it('아침엔 하루 남은 양이 많아도 한 끼 몫으로 본다 — 700 kcal 한 끼는 좋음이 아니다', () => {
    const full = { ...REMAINING, kcal: 2000, carbs: 250, protein: 90, fat: 60 };
    const big = menu({ id: 'b', category: 'meal', nutrients: { kcal: 700, carbs: 90, protein: 25, fat: 25 } });
    const morning = judgeMenu(big, full, { ...ctx, now: at(8) });
    expect(morning.verdict).toBe('ok');
    expect(morning.reasons[0]).toBe('아침 적정량의 105%예요');
    // 같은 메뉴·같은 남은 양이라도 저녁(마지막 끼니)이면 좋음
    expect(judgeMenu(big, full, { ...ctx, now: at(19) }).verdict).toBe('good');
  });

  it('mealSlotsLeft 를 주면 시각보다 우선', () => {
    const j = judgeMenu(salad, { ...REMAINING, kcal: 700 }, { ...ctx, now: at(19), mealSlotsLeft: 2 });
    expect(j.reasons[0]).toBe('저녁 적정량의 129%라 이번 끼니엔 조금 커요');
    expect(j.verdict).toBe('pass');
  });

  it('eatenMeals: 점심을 이미 기록했으면 저녁(마지막 끼니) 기준', () => {
    const rem = { ...REMAINING, kcal: 900 };
    expect(judgeMenu(salad, rem, { ...ctx, now: LUNCH }).reasons[0]).toBe('점심 적정량의 100%예요');
    expect(judgeMenu(salad, rem, { ...ctx, now: LUNCH, eatenMeals: ['lunch'] }).reasons[0]).toBe('오늘 남은 양의 50%예요');
    // 지난 끼니(아침)를 안 먹은 건 상관없다 — 시간 우선
    expect(judgeMenu(salad, rem, { ...ctx, now: LUNCH, eatenMeals: [] }).reasons[0]).toBe('점심 적정량의 100%예요');
  });

  it('now 가 없으면 지금 시각으로 계산한다', () => {
    jest.useFakeTimers().setSystemTime(at(19));
    try {
      const { now: _drop, ...noNow } = ctx;
      expect(judgeMenu(salad, { ...REMAINING, kcal: 700 }, noNow).reasons[0]).toBe('오늘 남은 양의 64%예요');
    } finally {
      jest.useRealTimers();
    }
  });

  it('rankMenus·suggestAlternatives 도 같은 끼니 기준을 쓴다', () => {
    const rem = { ...REMAINING, kcal: 700 };
    const light = menu({ id: 'light', category: 'salad', nutrients: { kcal: 200, carbs: 15, protein: 20, fat: 6 } });
    const eve = { ...ctx, now: at(19) };
    expect(rankMenus([salad, light], rem, eve).map((x) => x.judgement.reasons[0])).toEqual(['오늘 남은 양의 29%예요', '오늘 남은 양의 64%예요']);
    const alts = suggestAlternatives(salad, [salad, light], rem, { ...ctx, now: at(8), mealSlotsLeft: 3 });
    expect(alts.map((x) => x.judgement.reasons[0])).toEqual(['아침 적정량의 86%예요']);
  });
});

describe('budgetReason (근거 숫자 한 줄)', () => {
  const lunch = mealBudget(800, new Date(2026, 8, 15, 12)); // 400 kcal, 2끼
  const dinner = mealBudget(800, new Date(2026, 8, 15, 19)); // 마지막 끼니
  it('적정량 대비 퍼센트, 110% 넘으면 "이번 끼니엔 조금 커요"', () => {
    expect(budgetReason(240, lunch, 800)).toBe('점심 적정량의 60%예요');
    expect(budgetReason(440, lunch, 800)).toBe('점심 적정량의 110%예요');
    expect(budgetReason(600, lunch, 800)).toBe('점심 적정량의 150%라 이번 끼니엔 조금 커요');
    expect(budgetReason(1, lunch, 800)).toBe('점심 적정량의 1%도 안 돼요');
  });
  it('마지막 끼니는 오늘 남은 양 대비, 남은 양보다 크면 그 비율', () => {
    expect(budgetReason(400, dinner, 800)).toBe('오늘 남은 양의 50%예요');
    expect(budgetReason(1000, dinner, 800)).toBe('오늘 남은 양의 125%라 조금 커요');
    expect(budgetReason(1000, lunch, 800)).toBe('오늘 남은 양의 125%라 조금 커요');
  });
  it('남은 양이 없으면 숫자 줄 없음', () => {
    expect(budgetReason(100, mealBudget(0, new Date(2026, 8, 15, 12)), 0)).toBeUndefined();
  });
});
