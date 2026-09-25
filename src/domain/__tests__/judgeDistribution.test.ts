/**
 * 판정 분포 회귀 테스트 — 시드 데이터 전체에 대해 good/ok/pass 가 고르게 나오는지 본다.
 * 기준: 남 35세 175cm/68kg 활동 3, 유지, 균형형. 시안(E1) 수치대로 탄 122/250 · 단 56/100 · 지 28/70 소비 후 842 kcal 남음.
 */
import { getMenu, getMenusByBrand } from '../../data';
import { judgeMenu, rankMenus, type JudgeContext } from '../judge';
import { computeTargets } from '../targets';
import type { DailyTargets, Verdict } from '../types';

const today = new Date(2026, 8, 15);
const targets = computeTargets(
  {
    sex: 'male',
    birthYear: 1991,
    heightCm: 175,
    weightKg: 68,
    activity: 3,
    primaryGoal: 'maintain',
    secondaryGoals: [],
    diet: { type: 'balanced', evidence: [], source: 'rule' },
  },
  today,
);
/** 시안 D3 상태바 시각 9:41 — 아침 끼니, 세 끼 남음 (판정은 이번 끼니 적정량 = 남은 kcal ÷ 남은 끼니 수 기준) */
const AT_0941 = new Date(2026, 8, 15, 9, 41);
const ctx: JudgeContext = {
  profile: { primaryGoal: 'maintain', secondaryGoals: [], diet: { type: 'balanced', evidence: [], source: 'rule' } },
  now: AT_0941,
};

/** 시안 기준 남은 여유. 당·나트륨은 목표량의 2/3 남음으로 둔다(시안에 수치 없음) */
const remaining = (kcal: number): DailyTargets => ({
  kcal,
  carbs: 250 - 122,
  protein: 100 - 56,
  fat: 70 - 28,
  sugar: Math.round((targets.sugar * 2) / 3),
  sodium: Math.round((targets.sodium * 2) / 3),
  emphasis: targets.emphasis,
});

// 스타벅스처럼 공공데이터 official 이 충분한 브랜드는 옵션 없는 시드 estimated 가 목록에서 빠지지만(mergeMenus), id 로는 찾을 수 있다
const verdictOf = (brand: string, id: string, kcal: number): Verdict => {
  const m = getMenu(id);
  expect(m?.brandId).toBe(brand);
  if (!m) throw new Error(`시드에 ${id} 없음`);
  if (!m) throw new Error(`시드에 ${id} 없음`);
  return judgeMenu(m, remaining(kcal), ctx).verdict;
};

describe('판정 분포 (스타벅스, 842 kcal 남음)', () => {
  const ranked = rankMenus(getMenusByBrand('starbucks'), remaining(842), ctx);

  it('good·ok·pass 가 각각 1개 이상', () => {
    const count = (v: Verdict) => ranked.filter((x) => x.judgement.verdict === v).length;
    expect(count('good')).toBeGreaterThanOrEqual(1);
    expect(count('ok')).toBeGreaterThanOrEqual(1);
    expect(count('pass')).toBeGreaterThanOrEqual(1);
  });

  it('시안 D3: 아이스 아메리카노 good · 아이스 카페 라떼 ok · 햄&치즈 샌드위치 pass', () => {
    expect(verdictOf('starbucks', 'starbucks-iced-americano', 842)).toBe('good');
    expect(verdictOf('starbucks', 'starbucks-iced-latte', 842)).toBe('ok');
    expect(verdictOf('starbucks', 'starbucks-ham-cheese-sandwich', 842)).toBe('pass');
    expect(ranked[0].judgement.verdict).toBe('good');
  });

  it('여유 200 kcal 이면 라떼류 대부분 pass', () => {
    const lattes = getMenusByBrand('starbucks').filter((m) => /라떼|마키아또|모카|카푸치노/.test(m.name));
    expect(lattes.length).toBeGreaterThanOrEqual(5);
    const pass = lattes.filter((m) => judgeMenu(m, remaining(200), ctx).verdict === 'pass').length;
    expect(pass / lattes.length).toBeGreaterThan(0.5);
  });
});

describe('판정 분포 (편의점)', () => {
  it('GS25 도시락(600 kcal↑)은 ok 이하', () => {
    const heavy = getMenusByBrand('gs25').filter((m) => (m.nutrients?.kcal ?? 0) >= 600);
    expect(heavy.length).toBeGreaterThanOrEqual(1);
    for (const m of heavy) expect(judgeMenu(m, remaining(842), ctx).verdict).not.toBe('good');
  });
});

describe('구매 가이드 (시드)', () => {
  it('라떼 "시럽 빼기" 로 판정이 한 단계 좋아지는 경우가 시드에 있다', () => {
    // 시럽 옵션은 시드 추정 메뉴에만 있다 — 공공데이터 커버 브랜드에서도 옵션 시드는 목록에 남는다(mergeMenus)
    const syrupLattes = getMenusByBrand('starbucks').filter(
      (m) => /라떼|마키아또/.test(m.name) && m.options?.some((g) => g.id === 'syrup'),
    );
    const hit = syrupLattes.some((m) =>
      [250, 300, 350, 400, 450, 500].some((kcal) => judgeMenu(m, remaining(kcal), ctx).guide?.startsWith('시럽 빼면')),
    );
    expect(hit).toBe(true);
  });
});

describe('끼니별 분포 — 아침·점심·저녁 모두 좋음/괜찮음/패스가 한쪽으로 쏠리지 않는다', () => {
  // 하루 목표량의 몇 %가 남았는지 (아침 전부 · 점심 70% · 저녁 35%)
  const scenarios = [
    { label: '아침 8시', now: new Date(2026, 8, 15, 8), left: 1 },
    { label: '점심 12시', now: new Date(2026, 8, 15, 12), left: 0.7 },
    { label: '저녁 7시', now: new Date(2026, 8, 15, 19), left: 0.35 },
  ];
  const scaled = (f: number): DailyTargets => ({
    kcal: Math.round(targets.kcal * f),
    carbs: Math.round(targets.carbs * f),
    protein: Math.round(targets.protein * f),
    fat: Math.round(targets.fat * f),
    sugar: Math.round(targets.sugar * f),
    sodium: Math.round(targets.sodium * f),
    emphasis: targets.emphasis,
  });
  const rows = scenarios.flatMap((s) => ['starbucks', 'gs25'].map((brand) => ({ brand, label: s.label, s })));
  it.each(rows)('$brand · $label', ({ brand, s }) => {
    const js = getMenusByBrand(brand).map((m) => judgeMenu(m, scaled(s.left), { ...ctx, now: s.now })).filter((j) => !j.unknown);
    const share = (v: Verdict) => js.filter((j) => j.verdict === v).length / js.length;
    for (const v of ['good', 'ok', 'pass'] as const) {
      expect(share(v)).toBeGreaterThan(0);
      expect(share(v)).toBeLessThanOrEqual(0.7);
    }
  });
});
