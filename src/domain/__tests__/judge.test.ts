import { applyOptions, judgeMenu, optionPhrase, rankMenus, suggestAlternatives, type JudgeContext } from '../judge';
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
const ctx: JudgeContext = { profile: PROFILE };
const BANNED = ['제한', '초과', '금지', '나쁨', '위험'];

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
    expect(j.reasons[0]).toBe('여유분 안에서 가볍게 들어가요');
  });

  it('남은 kcal 보다 크면 점수와 상관없이 패스', () => {
    const big = menu({ id: 'big', category: 'meal', nutrients: { kcal: 900, carbs: 10, protein: 40, fat: 5 } });
    const j = judgeMenu(big, REMAINING, ctx);
    expect(j.verdict).toBe('pass');
    expect(j.score).toBeLessThan(40);
    expect(j.reasons).toEqual(['오늘 남은 여유보다 조금 커요', '다른 메뉴가 더 잘 맞아요']);
  });

  it('남은 여유가 0이면 어떤 메뉴든 패스', () => {
    const j = judgeMenu(menu({ id: 'a', nutrients: { kcal: 10 } }), { ...REMAINING, kcal: 0 }, ctx);
    expect(j.verdict).toBe('pass');
    expect(j.reasons[1]).toBe('내일 다시 채워져요');
  });

  it('연속형 점수 (음료 상한 전)', () => {
    const food = menu({ ...vanillaLatte, id: 'food', category: 'snack', options: undefined });
    const j = judgeMenu(food, { ...REMAINING, kcal: 450 }, ctx);
    // r=0.422 → kcal 35.6×0.7=24.9 · 강조(탄100·단72.7·지100)=90.9×0.3=27.3 → 52
    expect(j.score).toBe(52);
    expect(j.verdict).toBe('ok');
  });

  it('시럽 가이드: 음료는 상한 때문에 pass → ok 로 올라간다', () => {
    const rem = { ...REMAINING, kcal: 350 };
    const j = judgeMenu(vanillaLatte, rem, ctx);
    expect(j.verdict).toBe('pass');
    expect(j.guide).toBe('시럽 빼면 괜찮음이 돼요');
    const noSyrup = judgeMenu(vanillaLatte, rem, { ...ctx, selectedOptions: { syrup: '시럽 빼기' } });
    expect(noSyrup.verdict).toBe('ok');
    expect(noSyrup.reasons).toEqual(['우유가 들어가지만 전체 여유분 안에서 무난해요', '평소처럼 드셔도 좋아요']);
  });

  it('음료 상한: 80 kcal 이상 음료는 최대 괜찮음(69), 단백질 10 g 이상은 예외', () => {
    const latte = judgeMenu(menu({ id: 'l', name: '아이스 카페 라떼', nutrients: { kcal: 110, carbs: 9, protein: 6, fat: 6 } }), REMAINING, ctx);
    expect(latte.score).toBe(69);
    expect(latte.verdict).toBe('ok');
    expect(latte.reasons).toEqual(['우유가 들어가지만 전체 여유분 안에서 무난해요', '평소처럼 드셔도 좋아요']);
    const tea = judgeMenu(menu({ id: 't', name: '자몽 허니 블랙 티', nutrients: { kcal: 125, carbs: 31, protein: 0, fat: 0 } }), REMAINING, ctx);
    expect(tea.verdict).toBe('ok');
    expect(tea.reasons[0]).toBe('달콤한 음료는 여유분 안에서 가볍게 즐겨요');
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
      judgeMenu(menu({ id: 'x', category: 'meal', nutrients: n }), rem, { profile }).score;
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
    expect(kcalScore(0.3)).toBe(100);
    expect(kcalScore(0.4)).toBeCloseTo(40);
    expect(kcalScore(0.6)).toBeCloseTo(0);
    expect(kcalScore(1.2)).toBe(0);
    expect(nutrientShareScore('carbs', 0.25)).toBe(100);
    expect(nutrientShareScore('carbs', 0.525)).toBeCloseTo(50);
    expect(nutrientShareScore('sodium', 0.9)).toBe(0);
    expect(nutrientShareScore('protein', 0)).toBe(40);
    expect(nutrientShareScore('protein', 0.3)).toBe(100);
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
    ];
    for (const m of menus) {
      const j = judgeMenu(m, REMAINING, ctx);
      for (const w of BANNED) expect(j.reasons.join(' ') + (j.guide ?? '')).not.toContain(w);
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
