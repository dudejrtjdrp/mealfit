import { getMenu } from '../../data';
import { REFERENCE_FOOD_SPECS, foodEquivalent, resolveReferenceFoods, type ReferenceFood } from '../foodEquivalent';

const FOODS: ReferenceFood[] = [
  { menuId: 'sandwich', one: '샌드위치 하나', two: '샌드위치 두 개', kcal: 380 },
  { menuId: 'onigiri', one: '삼각김밥 하나', two: '삼각김밥 두 개', kcal: 210 },
  { menuId: 'latte', one: '라떼 한 잔', kcal: 180 },
];

describe('foodEquivalent', () => {
  it('1개로 맞으면 1개로 말한다', () => {
    expect(foodEquivalent(390, FOODS)?.text).toBe('샌드위치 하나 정도예요');
    expect(foodEquivalent(200, FOODS)?.text).toBe('삼각김밥 하나 정도예요');
  });

  it('1개로 안 맞으면 2개 조합 — 큰 것을 앞에', () => {
    const r = foodEquivalent(560, FOODS);
    expect(r?.text).toBe('샌드위치 하나에 라떼 한 잔 정도예요');
    expect(r?.kcal).toBe(560);
    expect(r?.parts.map((p) => p.menuId)).toEqual(['sandwich', 'latte']);
  });

  it('같은 것 2개는 "두 개" 말로', () => {
    expect(foodEquivalent(760, FOODS)?.text).toBe('샌드위치 두 개 정도예요');
  });

  it('±15% 를 벗어나면 null (숫자를 지어내지 않는다)', () => {
    expect(foodEquivalent(1500, FOODS)).toBeNull();
    expect(foodEquivalent(100, FOODS)).toBeNull();
  });

  it('0·음수·NaN·기준 음식 없음이면 null', () => {
    expect(foodEquivalent(0, FOODS)).toBeNull();
    expect(foodEquivalent(-120, FOODS)).toBeNull();
    expect(foodEquivalent(Number.NaN, FOODS)).toBeNull();
    expect(foodEquivalent(400, [])).toBeNull();
  });

  it('고른 조합은 항상 오차 15% 안', () => {
    for (let kcal = 50; kcal <= 2500; kcal += 17) {
      const r = foodEquivalent(kcal, FOODS);
      if (r) expect(Math.abs(r.kcal - kcal)).toBeLessThanOrEqual(kcal * 0.15);
    }
  });
});

describe('resolveReferenceFoods', () => {
  it('정보 없음·못 찾은 메뉴는 뺀다', () => {
    const specs = [
      { menuId: 'a', one: 'A 하나' },
      { menuId: 'b', one: 'B 하나' },
      { menuId: 'c', one: 'C 하나' },
    ];
    const lookup = (id: string) =>
      id === 'a' ? { nutrients: { kcal: 200 }, trust: 'estimated' as const } : id === 'b' ? { nutrients: null, trust: 'none' as const } : undefined;
    expect(resolveReferenceFoods(specs, lookup)).toEqual([{ menuId: 'a', one: 'A 하나', kcal: 200 }]);
  });

  it('기준 음식은 전부 앱 메뉴 데이터에서 kcal 을 찾는다', () => {
    const foods = resolveReferenceFoods(REFERENCE_FOOD_SPECS, getMenu);
    expect(foods).toHaveLength(REFERENCE_FOOD_SPECS.length);
    for (const f of foods) expect(f.kcal).toBe(getMenu(f.menuId)?.nutrients?.kcal);
  });

  it('실제 데이터로: 남은 560kcal → 한 줄이 나온다', () => {
    const foods = resolveReferenceFoods(REFERENCE_FOOD_SPECS, getMenu);
    const r = foodEquivalent(560, foods);
    expect(r).not.toBeNull();
    expect(r!.text).toMatch(/정도예요$/);
  });
});
