import { prefTagLabel } from '../../domain/preferences';
import { __setStorage, parseRequest } from '../ai/parsePreference';
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

function memory() {
  const m = new Map<string, string>();
  return { getItem: async (k: string) => m.get(k) ?? null, setItem: async (k: string, v: string) => void m.set(k, v), m };
}

beforeEach(() => {
  __setStorage(memory());
  mockedCallLLM.mockReset();
  mockedHasLLM.mockReturnValue(false);
});

describe('parseRequest', () => {
  it('키가 없으면 규칙으로 (AI 부르지 않음)', async () => {
    const r = await parseRequest('아침엔 웬만하면 샐러드 위주로 먹고 싶어');
    expect(r.source).toBe('rules');
    expect(r.tags.map(prefTagLabel)).toEqual(['아침 · 샐러드 위주']);
    expect(mockedCallLLM).not.toHaveBeenCalled();
  });

  it('키가 있으면 한 번만 부르고, 같은 글은 캐시 — 어휘 밖 값은 버리고 규칙과 합친다', async () => {
    mockedHasLLM.mockReturnValue(true);
    mockedCallLLM.mockResolvedValue(
      '```json\n{"tags":[{"slot":"any","kind":"prefer","strength":"soft","group":null,"attr":"wholeGrain","keyword":null,"within":"bread"},{"slot":"any","kind":"prefer","strength":"soft","group":"croissant"}]}\n```',
    );
    const a = await parseRequest('빵은 통밀 위주로 부탁해');
    expect(a.source).toBe('ai');
    expect(a.tags.map(prefTagLabel)).toEqual(['빵 · 통밀로']);
    const [, opts] = mockedCallLLM.mock.calls[0];
    expect(opts).toMatchObject({ reasoningEffort: 'minimal', maxTokens: 200 });

    const b = await parseRequest('빵은 통밀 위주로 부탁해.');
    expect(b.source).toBe('cache');
    expect(b.tags.map(prefTagLabel)).toEqual(['빵 · 통밀로']);
    expect(mockedCallLLM).toHaveBeenCalledTimes(1);
  });

  it('AI 가 실패하면 규칙으로', async () => {
    mockedHasLLM.mockReturnValue(true);
    mockedCallLLM.mockRejectedValue(new Error('x'));
    const r = await parseRequest('매운 건 빼 줘');
    expect(r.source).toBe('rules');
    expect(r.tags.map(prefTagLabel)).toEqual(['매운 것 빼기']);
  });

  it('빈 글', async () => {
    expect(await parseRequest('   ')).toEqual({ tags: [], source: 'rules' });
  });
});
