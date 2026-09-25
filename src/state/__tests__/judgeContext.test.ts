import { judgeMenu } from '@/domain/judge';
import type { MealLog } from '@/domain/types';

import { defaultMealType } from '../day';
import { judgeContext } from '../judgeContext';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1', CryptoDigestAlgorithm: {}, digestStringAsync: jest.fn() }));

const log = (mealType: MealLog['mealType']): MealLog =>
  ({ id: mealType, date: '2026-09-25', mealType, time: '', name: 'x', nutrients: { kcal: 500 }, trust: 'user', createdAt: '' }) as MealLog;

describe('judgeContext', () => {
  it('오늘 먹은 끼니를 중복 없이 넘긴다', () => {
    const ctx = judgeContext(null, [log('lunch'), log('lunch'), log('snack')]);
    expect(ctx.eatenMeals).toEqual(['lunch', 'snack']);
    expect(ctx.profile.primaryGoal).toBe('maintain');
  });

  it('기록이 없으면 eatenMeals 를 비운다', () => {
    expect(judgeContext(null, []).eatenMeals).toBeUndefined();
    expect(judgeContext(null, null).eatenMeals).toBeUndefined();
  });

  it('점심을 먹은 뒤 오후 1시에는 저녁 한 끼 기준으로 판정한다 (남은 양을 반으로 나누지 않음)', () => {
    const remaining = { kcal: 800, carbs: 100, protein: 60, fat: 30, sugar: 30, sodium: 1500, emphasis: ['kcal'] } as never;
    const menu = { id: 'm', brandId: 'b', name: '닭가슴살 샐러드', category: 'salad', trust: 'official', serving: '1개', nutrients: { kcal: 600, protein: 40 } } as never;
    const at1pm = new Date(2026, 8, 25, 13, 0);
    const before = judgeMenu(menu, remaining, { ...judgeContext(null, []), now: at1pm });
    const after = judgeMenu(menu, remaining, { ...judgeContext(null, [log('lunch')]), now: at1pm });
    expect(after.score).toBeGreaterThan(before.score);
  });
});

describe('defaultMealType', () => {
  it('판정과 같은 경계(10:30)를 쓴다', () => {
    expect(defaultMealType(new Date(2026, 8, 25, 10, 15))).toBe('breakfast');
    expect(defaultMealType(new Date(2026, 8, 25, 10, 45))).toBe('lunch');
  });
});
