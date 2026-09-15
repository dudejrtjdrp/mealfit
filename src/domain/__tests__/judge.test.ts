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
    expect(j.score).toBe(100);
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

  it('식단 유형·강조 영양소 반영 + 시럽 가이드', () => {
    const sugarCtx: JudgeContext = {
      profile: { primaryGoal: 'blood_sugar', secondaryGoals: [], diet: { type: 'low_sugar', evidence: [], source: 'rule' } },
    };
    const rem = { ...REMAINING, kcal: 400, sugar: 20 };
    const j = judgeMenu(vanillaLatte, rem, sugarCtx);
    // 50 + kcal 25 + sugar -20 + carbs 15 + protein 0 + 저당 -15 = 55
    expect(j.score).toBe(55);
    expect(j.verdict).toBe('ok');
    expect(j.reasons[0]).toBe('당이 조금 있지만 전체 여유분 안에서 무난해요');
    expect(j.guide).toBe('시럽 빼면 좋음이 돼요');

    const noSyrup = judgeMenu(vanillaLatte, rem, { ...sugarCtx, selectedOptions: { syrup: '시럽 빼기' } });
    expect(noSyrup.verdict).toBe('good');
    expect(noSyrup.guide).toBeUndefined();
  });

  it('사이즈 가이드: Venti 가 패스면 "Tall로 하면"', () => {
    const j = judgeMenu(vanillaLatte, REMAINING, { ...ctx, selectedOptions: { size: 'Venti' } });
    expect(j.verdict).toBe('pass');
    expect(j.guide).toBe('Tall로 하면 좋음이 돼요');
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
