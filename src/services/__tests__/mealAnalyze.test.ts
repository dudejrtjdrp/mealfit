import { AI_MEAL_DAILY_LIMIT } from '../../domain/aiMeal';
import { __setStorage, aiMealQuotaLeft, analyzeMeal } from '../ai/mealAnalyze';
import { callLLM } from '../ai/llm';
import { hasLLM } from '../env';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async (_alg: string, data: string) => `sha256(${data})`),
}));
jest.mock('../env', () => ({ hasLLM: jest.fn(() => false) }));
jest.mock('../ai/llm', () => ({ callLLM: jest.fn() }));

const mockedHasLLM = hasLLM as jest.Mock;
const mockedCallLLM = callLLM as jest.Mock;
const NOW = new Date(2026, 8, 25, 12, 30);

function memory() {
  const m = new Map<string, string>();
  return { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v), m };
}

const AI_JSON = JSON.stringify({ mealType: null, items: [{ name: '김치찌개', amount: 1, unit: '그릇', kcal: 420 }, { name: '공깃밥', amount: 0.5, portion: '반 공기' }] });

beforeEach(() => {
  __setStorage(memory());
  mockedCallLLM.mockReset();
  mockedHasLLM.mockReturnValue(false);
});

describe('글 정리', () => {
  it('키가 없으면 규칙 기반으로 나누고 횟수는 0', async () => {
    const r = await analyzeMeal({ kind: 'text', text: '점심에 김치찌개 한 그릇이랑 밥 반 공기' }, NOW);
    expect(r.ok && r.meal.source).toBe('rules');
    expect(r.ok && r.meal.items.map((i) => i.name)).toEqual(['김치찌개', '밥']);
    expect(r.quotaLeft).toBe(0);
    expect(mockedCallLLM).not.toHaveBeenCalled();
  });

  it('AI 로 정리하고, 같은 글은 캐시로 (다시 부르지 않음)', async () => {
    mockedHasLLM.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue(AI_JSON);
    const a = await analyzeMeal({ kind: 'text', text: '점심에 김치찌개랑 밥 반 공기' }, NOW);
    expect(a.ok && a.meal.source).toBe('ai');
    // AI 가 끼니를 놓치면 글에서 채운다
    expect(a.ok && a.meal.mealType).toBe('lunch');
    expect(a.quotaLeft).toBe(AI_MEAL_DAILY_LIMIT - 1);
    const b = await analyzeMeal({ kind: 'text', text: '점심에  김치찌개랑 밥 반 공기.' }, NOW);
    expect(b.ok && b.meal.source).toBe('cache');
    expect(mockedCallLLM).toHaveBeenCalledTimes(1);
    expect(b.quotaLeft).toBe(AI_MEAL_DAILY_LIMIT - 1);
  });

  it('AI 가 실패하면 규칙 기반', async () => {
    mockedHasLLM.mockReturnValue(true);
    mockedCallLLM.mockRejectedValue(new Error('x'));
    const r = await analyzeMeal({ kind: 'text', text: '라면 하나' }, NOW);
    expect(r.ok && r.meal.source).toBe('rules');
  });

  it('하루 횟수를 다 쓰면 AI 를 부르지 않는다', async () => {
    mockedHasLLM.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue(AI_JSON);
    for (let i = 0; i < AI_MEAL_DAILY_LIMIT; i++) await analyzeMeal({ kind: 'text', text: `라면 ${i}개` }, NOW);
    expect(await aiMealQuotaLeft(NOW)).toBe(0);
    mockedCallLLM.mockClear();
    const r = await analyzeMeal({ kind: 'text', text: '떡볶이 조금' }, NOW);
    expect(mockedCallLLM).not.toHaveBeenCalled();
    expect(r.ok && r.meal.source).toBe('rules');
    // 다음 날 다시 채워짐
    expect(await aiMealQuotaLeft(new Date(2026, 8, 26, 8))).toBe(AI_MEAL_DAILY_LIMIT);
  });

  it('빈 글', async () => {
    const r = await analyzeMeal({ kind: 'text', text: '  ' }, NOW);
    expect(r).toMatchObject({ ok: false, reason: 'empty' });
  });
});

describe('사진 정리', () => {
  it('키가 없으면 photo-unavailable', async () => {
    const r = await analyzeMeal({ kind: 'photo', base64: 'abc' }, NOW);
    expect(r).toMatchObject({ ok: false, reason: 'photo-unavailable' });
  });

  it('사진과 설명을 함께 보낸다', async () => {
    mockedHasLLM.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue(AI_JSON);
    const r = await analyzeMeal({ kind: 'photo', base64: 'abc', note: '저녁, 반쯤 먹었어요' }, NOW);
    expect(r.ok && r.meal.items).toHaveLength(2);
    expect(r.ok && r.meal.mealType).toBe('dinner');
    const user = mockedCallLLM.mock.calls[0][0][1];
    expect(user.content[0]).toMatchObject({ type: 'image', base64: 'abc' });
    expect(user.content[1].text).toContain('반쯤');
  });

  it('음식이 없으면 nothing, 형식이 틀리면 failed', async () => {
    mockedHasLLM.mockReturnValue(true);
    mockedCallLLM.mockResolvedValueOnce('{"items":[]}').mockResolvedValueOnce('몰라요');
    expect(await analyzeMeal({ kind: 'photo', base64: 'a' }, NOW)).toMatchObject({ ok: false, reason: 'nothing' });
    expect(await analyzeMeal({ kind: 'photo', base64: 'a' }, NOW)).toMatchObject({ ok: false, reason: 'failed' });
  });
});
