import { computeTargets, emphasisFor, type TargetInput } from '../targets';

const today = new Date(2026, 8, 15);
const base: TargetInput = {
  sex: 'male',
  birthYear: 1996, // 30세
  heightCm: 175,
  weightKg: 70,
  activity: 3,
  primaryGoal: 'maintain',
  secondaryGoals: [],
  diet: { type: 'balanced', evidence: [], source: 'rule' },
};

describe('computeTargets', () => {
  it('남성 유지: Mifflin-St Jeor × 활동계수', () => {
    // BMR = 700 + 1093.75 - 150 + 5 = 1648.75 → ×1.55 = 2555.56
    const t = computeTargets(base, today);
    expect(t.kcal).toBe(2556);
    expect(t.carbs).toBe(Math.round((2555.5625 * 0.5) / 4));
    expect(t.protein).toBe(Math.round((2555.5625 * 0.2) / 4));
    expect(t.fat).toBe(Math.round((2555.5625 * 0.3) / 9));
    expect(t.sugar).toBe(64);
    expect(t.sodium).toBe(2000);
    expect(t.emphasis).toEqual(['carbs', 'protein', 'fat']);
  });

  it('여성: -161 보정', () => {
    // BMR = 550 + 1000 - 150 - 161 = 1239 → ×1.2 = 1486.8
    const t = computeTargets({ ...base, sex: 'female', heightCm: 160, weightKg: 55, activity: 1 }, today);
    expect(t.kcal).toBe(1487);
  });

  it('감량은 -15%, 하한은 여 1,200 / 남 1,500', () => {
    expect(computeTargets({ ...base, primaryGoal: 'lose' }, today).kcal).toBe(Math.round(2555.5625 * 0.85));
    const smallF = computeTargets(
      { ...base, sex: 'female', heightCm: 150, weightKg: 42, birthYear: 1966, activity: 1, primaryGoal: 'lose' },
      today,
    );
    expect(smallF.kcal).toBe(1200);
    const smallM = computeTargets(
      { ...base, heightCm: 155, weightKg: 48, birthYear: 1956, activity: 1, primaryGoal: 'lose' },
      today,
    );
    expect(smallM.kcal).toBe(1500);
  });

  it('증량은 +10%, 부 목적은 kcal에 영향 없음', () => {
    expect(computeTargets({ ...base, primaryGoal: 'gain' }, today).kcal).toBe(Math.round(2555.5625 * 1.1));
    expect(computeTargets({ ...base, secondaryGoals: ['blood_sugar', 'slow_aging'] }, today).kcal).toBe(2556);
  });

  it('식단 유형별 비율과 단백질 하한(체중×1.2)', () => {
    const lc = computeTargets({ ...base, diet: { ...base.diet, type: 'low_carb_high_protein' } }, today);
    expect(lc.protein).toBe(Math.round((2555.5625 * 0.35) / 4));
    // 체중이 크고 열량이 낮으면 단백질 하한이 적용되고 탄수에서 빠진다
    const heavy = computeTargets({ ...base, sex: 'female', weightKg: 120, heightCm: 150, birthYear: 1950, activity: 1, primaryGoal: 'lose' }, today);
    expect(heavy.protein).toBe(144);
    const kcalRaw = Math.max((1200 + 937.5 - 380 - 161) * 1.2 * 0.85, 1200);
    expect(heavy.carbs).toBe(Math.round((kcalRaw * 0.5) / 4 - (144 - (kcalRaw * 0.2) / 4)));
  });

  it('저염형·콜레스테롤이면 나트륨 1,500', () => {
    expect(computeTargets({ ...base, diet: { ...base.diet, type: 'low_sodium' } }, today).sodium).toBe(1500);
    expect(computeTargets({ ...base, secondaryGoals: ['cholesterol'] }, today).sodium).toBe(1500);
  });

  it('강조 영양소: 주 목적 우선, 부 목적도 반영', () => {
    expect(emphasisFor('blood_sugar', [])).toEqual(['sugar', 'carbs', 'protein']);
    expect(emphasisFor('maintain', ['cholesterol'])).toEqual(['fat', 'sodium', 'protein']);
    expect(emphasisFor('slow_aging', ['blood_sugar'])).toEqual(['protein', 'sugar', 'sodium']);
    expect(computeTargets({ ...base, secondaryGoals: ['blood_sugar'] }, today).emphasis).toEqual(['sugar', 'carbs', 'protein']);
  });
});
