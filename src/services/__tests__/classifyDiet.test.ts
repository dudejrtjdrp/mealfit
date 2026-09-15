import type { DietClassification } from '../../domain/types';
import { classifyDiet, parseLLMResult } from '../ai/classifyDiet';
import { callLLM } from '../ai/llm';
import { hasLLM } from '../env';
import type { AICacheRepo, Repos } from '../repo/types';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: jest.fn(async (_alg: string, data: string) => `sha256(${data})`),
}));
jest.mock('../env', () => ({ hasLLM: jest.fn(() => false) }));
jest.mock('../ai/llm', () => ({ callLLM: jest.fn() }));

const mockedHasLLM = hasLLM as jest.Mock;
const mockedCallLLM = callLLM as jest.Mock;

function memoryRepos(): Repos & { store: Map<string, DietClassification> } {
  const store = new Map<string, DietClassification>();
  const aiCache: AICacheRepo = {
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: DietClassification) => void store.set(k, v)),
  };
  return {
    store,
    aiCache,
    backend: 'local',
    profile: { get: async () => null, save: async () => {}, clear: async () => {} },
    logs: { listByDate: async () => [], datesWithLogs: async () => [], add: async () => {}, update: async () => {}, remove: async () => {}, clear: async () => {} },
  };
}

const AI_JSON = JSON.stringify({
  type: 'low_sugar',
  evidence: [
    { title: '단 음료는 가끔만', detail: '달지 않은 음료를 골라요.' },
    { title: '디저트는 나눠서', detail: '디저트는 조금씩 즐겨요.' },
    { title: '채소 먼저', detail: '채소를 먼저 곁들여요.' },
  ],
});

beforeEach(() => {
  mockedHasLLM.mockReset().mockReturnValue(false);
  mockedCallLLM.mockReset();
});

describe('classifyDiet', () => {
  it('LLM 미설정이면 규칙 분류', async () => {
    const repos = memoryRepos();
    const r = await classifyDiet('밥 줄이고 단백질 챙겨요', { repos });
    expect(r.source).toBe('rule');
    expect(r.type).toBe('low_carb_high_protein');
    expect(mockedCallLLM).not.toHaveBeenCalled();
  });

  it('LLM 성공 → 캐시 저장(정규화 텍스트 + 버전 키), source ai', async () => {
    mockedHasLLM.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue(`결과입니다\n${AI_JSON}`);
    const repos = memoryRepos();
    const r = await classifyDiet('  단 거,  적게 먹어요! ', { repos, primaryGoal: 'blood_sugar' });
    expect(r.source).toBe('ai');
    expect(r.type).toBe('low_sugar');
    expect(r.evidence).toHaveLength(3);
    expect(repos.aiCache.set).toHaveBeenCalledWith('sha256(단 거 적게 먹어요|v1)', expect.objectContaining({ type: 'low_sugar' }));
  });

  it('캐시 히트면 LLM 호출 0회, source cache', async () => {
    mockedHasLLM.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue(AI_JSON);
    const repos = memoryRepos();
    await classifyDiet('단 거 적게 먹어요', { repos });
    mockedCallLLM.mockClear();
    const again = await classifyDiet('단 거 적게 먹어요!!', { repos });
    expect(again.source).toBe('cache');
    expect(again.type).toBe('low_sugar');
    expect(mockedCallLLM).toHaveBeenCalledTimes(0);
  });

  it('LLM 실패·잘못된 응답이면 규칙 폴백, 캐시하지 않음', async () => {
    mockedHasLLM.mockReturnValue(true);
    const repos = memoryRepos();
    mockedCallLLM.mockRejectedValueOnce(new Error('timeout'));
    expect((await classifyDiet('소식해요', { repos })).source).toBe('rule');
    mockedCallLLM.mockResolvedValueOnce('{"type":"keto","evidence":[]}');
    expect((await classifyDiet('소식해요', { repos })).source).toBe('rule');
    expect(repos.store.size).toBe(0);
  });
});

describe('parseLLMResult', () => {
  it('근거가 모자라면 유형 기본 문구로 3개 채움', () => {
    const r = parseLLMResult('{"type":"balanced","evidence":[{"title":"골고루","detail":"다 먹어요."}]}');
    expect(r?.type).toBe('balanced');
    expect(r?.evidence).toHaveLength(3);
    expect(r?.evidence[0].title).toBe('골고루');
  });
  it('JSON 이 아니면 null', () => {
    expect(parseLLMResult('모르겠어요')).toBeNull();
  });
});
