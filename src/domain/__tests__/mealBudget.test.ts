import { BREAKFAST_UNTIL_MIN, DINNER_UNTIL_MIN, eatenMealsFromLogs, LUNCH_UNTIL_MIN, MEAL_EATEN_MIN_KCAL, mealBudget, mealsLeftAt, mealTypeAt } from '../mealBudget';

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
    expect(mealBudget(1800, at(8))).toEqual({ kcal: 600, slotsLeft: 3, label: '아침', mealType: 'breakfast', isLast: false });
    expect(mealBudget(1001, at(12))).toEqual({ kcal: 501, slotsLeft: 2, label: '점심', mealType: 'lunch', isLast: false });
    expect(mealBudget(700, at(19))).toEqual({ kcal: 700, slotsLeft: 1, label: '저녁', mealType: 'dinner', isLast: true });
  });
  it('늦은 시간은 남은 전부, 라벨 간식', () => {
    expect(mealBudget(500, at(22, 30))).toEqual({ kcal: 500, slotsLeft: 1, label: '간식', mealType: 'snack', isLast: true });
  });
  it('기록한 끼니: 지금 끼니를 먹었으면 다음 끼니부터, 지난 끼니를 걸렀어도 시간 우선', () => {
    expect(mealBudget(1200, at(12), { eatenMeals: ['lunch'] })).toMatchObject({ kcal: 1200, slotsLeft: 1, label: '저녁' });
    expect(mealBudget(1200, at(12), { eatenMeals: [] })).toMatchObject({ kcal: 600, slotsLeft: 2, label: '점심' });
    expect(mealBudget(1200, at(12), { eatenMeals: ['breakfast'] })).toMatchObject({ slotsLeft: 2, label: '점심' });
    expect(mealBudget(1200, at(8), { eatenMeals: ['breakfast'] })).toMatchObject({ kcal: 600, slotsLeft: 2, label: '점심' });
    expect(mealBudget(300, at(19), { eatenMeals: ['dinner'] })).toMatchObject({ kcal: 300, slotsLeft: 1, label: '간식' });
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
