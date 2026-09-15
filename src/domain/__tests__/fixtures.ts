import type { DailyTargets, MealLog, MenuItem, Profile } from '../types';

export const TARGETS: DailyTargets = {
  kcal: 1800,
  carbs: 225,
  protein: 90,
  fat: 60,
  sugar: 45,
  sodium: 2000,
  emphasis: ['carbs', 'protein', 'fat'],
};

export const PROFILE: Pick<Profile, 'primaryGoal' | 'secondaryGoals' | 'diet'> = {
  primaryGoal: 'maintain',
  secondaryGoals: [],
  diet: { type: 'balanced', evidence: [], source: 'rule' },
};

export function menu(partial: Partial<MenuItem> & Pick<MenuItem, 'id'>): MenuItem {
  return {
    brandId: 'test',
    name: partial.id,
    category: 'drink',
    serving: '1잔',
    nutrients: { kcal: 100 },
    trust: 'estimated',
    ...partial,
  };
}

export function log(partial: Partial<MealLog> & Pick<MealLog, 'id'>): MealLog {
  return {
    date: '2026-09-15',
    mealType: 'lunch',
    time: '2026-09-15T12:00:00.000Z',
    name: '테스트',
    nutrients: { kcal: 300 },
    trust: 'user',
    qty: 1,
    createdAt: '2026-09-15T12:00:00.000Z',
    ...partial,
  };
}
