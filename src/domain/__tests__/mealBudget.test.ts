import { BREAKFAST_UNTIL_MIN, DINNER_UNTIL_MIN, eatenMealsFromLogs, LUNCH_UNTIL_MIN, MEAL_EATEN_MIN_KCAL, mealBudget, SNACK_MIN_KCAL, SNACK_SHARE_DIVISOR, mealsLeftAt, mealTypeAt } from '../mealBudget';

const at = (h: number, m = 0) => new Date(2026, 8, 15, h, m);

describe('mealTypeAt / mealsLeftAt', () => {
  it('경계: ~10:30 아침 · ~15:00 점심 · ~21:00 저녁 · 그 뒤 간식', () => {
    expect([BREAKFAST_UNTIL_MIN, LUNCH_UNTIL_MIN, DINNER_UNTIL_MIN]).toEqual([630, 900, 1260]);
    expect(mealTypeAt(at(0, 30))).toBe('breakfast');
    expect(mealTypeAt(at(10, 29))).toBe('breakfast');
    expect(mealTypeAt(at(10, 30))).toBe('lunch');
    expect(mealTypeAt(at(14, 59))).toBe('lunch');
    expect(mealTypeAt(at(15, 0))).toBe('dinner');
    expect(mealTypeAt(at(20, 59))).toBe('dinner');
    expect(mealTypeAt(at(21, 0))).toBe('snack');
  });
  it('남은 주 끼니 (간식 제외)', () => {
    expect(mealsLeftAt(at(8))).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(mealsLeftAt(at(12))).toEqual(['lunch', 'dinner']);
    expect(mealsLeftAt(at(18))).toEqual(['dinner']);
    expect(mealsLeftAt(at(22))).toEqual([]);
  });
});

describe('mealBudget', () => {
  it('남은 kcal ÷ 남은 끼니 수, 라벨은 이번 끼니', () => {
    expect(mealBudget(1800, at(8))).toEqual({ kcal: 600, slotsLeft: 3, label: '아침', mealType: 'breakfast', isLast: false, isSnack: false });
    expect(mealBudget(1001, at(12))).toEqual({ kcal: 501, slotsLeft: 2, label: '점심', mealType: 'lunch', isLast: false, isSnack: false });
    expect(mealBudget(700, at(19))).toEqual({ kcal: 700, slotsLeft: 1, label: '저녁', mealType: 'dinner', isLast: true, isSnack: false });
  });
  it('21시 이후(야식)는 한 끼 몫을 넘지 않게: min(남은 양, max(400, 남은 양 ÷ 3))', () => {
    expect(SNACK_MIN_KCAL).toBe(400);
    expect(SNACK_SHARE_DIVISOR).toBe(3);
    // 21:25 아무것도 기록하지 않았고 2,579 kcal 남음 → 860 (남은 전부가 아니다)
    expect(mealBudget(2579, at(21, 25))).toEqual({ kcal: 860, slotsLeft: 1, label: '야식', mealType: 'snack', isLast: false, isSnack: true });
    expect(mealBudget(900, at(22, 30))).toMatchObject({ kcal: 400, label: '야식' });
    expect(mealBudget(300, at(23))).toMatchObject({ kcal: 300 });
    expect(mealBudget(0, at(23)).kcal).toBe(0);
  });
  it('21시 전에 세 끼를 다 기록했으면 간식 — 같은 상한', () => {
    expect(mealBudget(1500, at(19), { eatenMeals: ['breakfast', 'lunch', 'dinner'] })).toMatchObject({ kcal: 500, label: '간식', isSnack: true, isLast: false });
  });
  it('기록한 끼니: 지금 끼니를 먹었으면 다음 끼니부터, 지난 끼니를 걸렀어도 시간 우선', () => {
    expect(mealBudget(1200, at(12), { eatenMeals: ['lunch'] })).toMatchObject({ kcal: 1200, slotsLeft: 1, label: '저녁' });
    expect(mealBudget(1200, at(12), { eatenMeals: [] })).toMatchObject({ kcal: 600, slotsLeft: 2, label: '점심' });
    expect(mealBudget(1200, at(12), { eatenMeals: ['breakfast'] })).toMatchObject({ slotsLeft: 2, label: '점심' });
    expect(mealBudget(1200, at(8), { eatenMeals: ['breakfast'] })).toMatchObject({ kcal: 600, slotsLeft: 2, label: '점심' });
    expect(mealBudget(300, at(19), { eatenMeals: ['dinner'] })).toMatchObject({ kcal: 300, slotsLeft: 1, label: '간식', isSnack: true });
  });
  it('slotsLeft 직접 지정이 우선 (1 이상으로 맞춤)', () => {
    expect(mealBudget(900, at(19), { slotsLeft: 3 })).toMatchObject({ kcal: 300, slotsLeft: 3, label: '저녁', isLast: false });
    expect(mealBudget(900, at(8), { slotsLeft: 0 })).toMatchObject({ kcal: 900, slotsLeft: 1, isLast: true });
  });
  it('남은 양이 0 이하이거나 숫자가 아니면 0', () => {
    expect(mealBudget(-200, at(12)).kcal).toBe(0);
    expect(mealBudget(Number.NaN, at(12)).kcal).toBe(0);
  });
});

describe('eatenMealsFromLogs', () => {
  const l = (mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack', kcal: number) => ({ mealType, nutrients: { kcal } });
  it('끼니별 합계가 기준(200kcal) 이상인 끼니만, 처음 나온 순서로', () => {
    expect(MEAL_EATEN_MIN_KCAL).toBe(200);
    expect(eatenMealsFromLogs([l('lunch', 150)])).toEqual([]);
    expect(eatenMealsFromLogs([l('breakfast', 250), l('lunch', 100), l('lunch', 100)])).toEqual(['breakfast', 'lunch']);
    expect(eatenMealsFromLogs([l('lunch', Number.NaN), l('lunch', 150)])).toEqual([]);
    expect(eatenMealsFromLogs(null)).toEqual([]);
  });
});
