import type { DailyTargets, DietType, Goal, Profile } from './types';

export type TargetInput = Pick<
  Profile,
  'sex' | 'birthYear' | 'heightCm' | 'weightKg' | 'activity' | 'primaryGoal' | 'secondaryGoals' | 'diet'
>;

type NutrientKey = DailyTargets['emphasis'][number];

/** 활동계수 (B3 5단계) */
export const ACTIVITY_FACTOR: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 1.2, 2: 1.375, 3: 1.55, 4: 1.725, 5: 1.9 };

/** 식단 유형별 탄·단·지 에너지 비율(%) */
export const MACRO_RATIO: Record<DietType, { carbs: number; protein: number; fat: number }> = {
  balanced: { carbs: 50, protein: 20, fat: 30 },
  low_carb_high_protein: { carbs: 35, protein: 35, fat: 30 },
  low_sugar: { carbs: 45, protein: 25, fat: 30 },
  low_sodium: { carbs: 50, protein: 20, fat: 30 },
  light_eater: { carbs: 50, protein: 20, fat: 30 },
  high_protein_bulk: { carbs: 45, protein: 30, fat: 25 },
  convenience: { carbs: 50, protein: 20, fat: 30 },
};

/**
 * 목적에 따라 강조할 영양소. 주 목적을 먼저 보고, 없으면 부 목적 순서대로 본다.
 * judge.ts 도 같은 규칙을 쓴다.
 */
export function emphasisFor(primaryGoal: Goal, secondaryGoals: Goal[] = []): NutrientKey[] {
  const goals = [primaryGoal, ...secondaryGoals];
  for (const g of goals) {
    if (g === 'blood_sugar') return ['sugar', 'carbs', 'protein'];
    if (g === 'cholesterol') return ['fat', 'sodium', 'protein'];
    if (g === 'slow_aging') return ['protein', 'sugar', 'sodium'];
  }
  return ['carbs', 'protein', 'fat'];
}

/** Mifflin-St Jeor × 활동계수 ± 목적 보정 → 오늘 목표량 */
export function computeTargets(input: TargetInput, today = new Date()): DailyTargets {
  const age = today.getFullYear() - input.birthYear;
  const bmr =
    10 * input.weightKg + 6.25 * input.heightCm - 5 * age + (input.sex === 'male' ? 5 : -161);
  let kcal = bmr * ACTIVITY_FACTOR[input.activity];

  // 체중 목적 보정은 주 목적만 본다 (부 목적은 kcal 에 영향 없음)
  if (input.primaryGoal === 'lose') {
    kcal = Math.max(kcal * 0.85, input.sex === 'female' ? 1200 : 1500);
  } else if (input.primaryGoal === 'gain') {
    kcal = kcal * 1.1;
  }

  const ratio = MACRO_RATIO[input.diet?.type ?? 'balanced'] ?? MACRO_RATIO.balanced;
  let protein = (kcal * ratio.protein) / 100 / 4;
  let carbs = (kcal * ratio.carbs) / 100 / 4;
  const fat = (kcal * ratio.fat) / 100 / 9;

  // 단백질 하한: 체중 × 1.2 g — 모자란 만큼 탄수에서 뺀다
  const minProtein = input.weightKg * 1.2;
  if (protein < minProtein) {
    carbs = Math.max(0, carbs - (minProtein - protein));
    protein = minProtein;
  }

  const goals = [input.primaryGoal, ...(input.secondaryGoals ?? [])];
  const sodium = input.diet?.type === 'low_sodium' || goals.includes('cholesterol') ? 1500 : 2000;

  return {
    kcal: Math.round(kcal),
    carbs: Math.round(carbs),
    protein: Math.round(protein),
    fat: Math.round(fat),
    sugar: Math.round((kcal * 0.1) / 4),
    sodium,
    emphasis: emphasisFor(input.primaryGoal, input.secondaryGoals ?? []),
  };
}
