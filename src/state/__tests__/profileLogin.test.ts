import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Profile } from '@/domain/types';
import { setAuthUserId } from '@/services/authState';
import type { Repos } from '@/services/repo';
import { createLocalRepos } from '@/services/repo/local';

import { reloadAfterLogin } from '../bootstrap';
import { useProfile } from '../profile';
import { useSession } from '../session';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1', CryptoDigestAlgorithm: {}, digestStringAsync: jest.fn() }));
jest.mock('expo-apple-authentication', () => ({ AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 }, isAvailableAsync: jest.fn(async () => true), signInAsync: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `mealfit://${path}` }));

// 저장소: 게스트(로컬) ↔ 로그인 계정(가짜 서버). 서버 읽기 실패를 흉내 낸다
let mockRepos: Repos;
jest.mock('@/services/repo', () => ({ getRepos: () => mockRepos }));

const guest: Profile = {
  id: 'guest',
  nickname: '회원',
  sex: 'female',
  birthYear: 1995,
  heightCm: 160,
  weightKg: 55,
  activity: 2,
  primaryGoal: 'maintain',
  secondaryGoals: [],
  diet: { type: 'balanced', evidence: [], source: 'rule' },
  onboardingDone: true,
  createdAt: '2026-09-20T00:00:00.000Z',
  updatedAt: '2026-09-20T00:00:00.000Z',
};

function server(get: () => Promise<Profile | null>): Repos & { saved: Profile[] } {
  const local = createLocalRepos(AsyncStorage);
  const saved: Profile[] = [];
  return {
    ...local,
    backend: 'supabase',
    saved,
    profile: {
      get,
      save: async (p) => {
        saved.push(p);
      },
      clear: async () => {},
    },
  };
}

beforeEach(async () => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  await AsyncStorage.clear();
  setAuthUserId(null);
  mockRepos = createLocalRepos(AsyncStorage);
  useProfile.setState({ profile: null, targets: null, status: 'loading', owner: null });
  // 게스트로 온보딩을 마친 상태
  await useProfile.getState().load();
  await useProfile.getState().completeOnboarding({ secondaryGoals: [], dietDescription: '', sex: guest.sex, birthYear: guest.birthYear, heightCm: guest.heightCm, weightKg: guest.weightKg } as never, undefined);
  useSession.setState({ session: { provider: 'email', nickname: '효', backend: 'supabase', userId: 'user-1', createdAt: '' }, status: 'ready' });
});

afterEach(() => jest.restoreAllMocks());

describe('로그인 직후 서버 프로필 읽기', () => {
  it('끝내 실패하면 게스트 프로필을 서버에 쓰지 않고(닉네임 채우기 포함) 비운 채 error', async () => {
    const remote = server(async () => {
      throw new Error('network');
    });
    mockRepos = remote;
    setAuthUserId('user-1');

    const res = await reloadAfterLogin();
    expect(res).toEqual({ profile: null, loaded: false });
    expect(remote.saved).toEqual([]);
    expect(useProfile.getState()).toMatchObject({ profile: null, status: 'error' });
    // 이전 저장소 프로필로 쓰기도 막힌다
    expect(await useProfile.getState().updateProfile({ nickname: '효' })).toBe(false);
    expect(remote.saved).toEqual([]);
  });

  it('한 번 실패해도 재시도에서 읽히면 서버 프로필이 우선이고 닉네임은 서버 프로필 기준으로만 채운다', async () => {
    let calls = 0;
    const onServer = { ...guest, id: 'user-1', nickname: '지은' };
    const remote = server(async () => {
      calls += 1;
      if (calls === 1) throw new Error('flaky');
      return onServer;
    });
    mockRepos = remote;
    setAuthUserId('user-1');

    const res = await reloadAfterLogin();
    expect(res.loaded).toBe(true);
    expect(res.profile?.nickname).toBe('지은');
    expect(remote.saved).toEqual([]);
  });

  it('서버에 프로필이 없으면(읽기 성공) 이 기기 프로필을 이어 쓰고 계정 이름으로 채운다', async () => {
    const remote = server(async () => null);
    mockRepos = remote;
    setAuthUserId('user-1');

    const res = await reloadAfterLogin();
    expect(res.loaded).toBe(true);
    expect(res.profile).toMatchObject({ id: 'user-1', nickname: '효' });
    expect(remote.saved.at(-1)).toMatchObject({ id: 'user-1', nickname: '효' });
  });

  it('같은 저장소의 일시적 읽기 실패는 지금 프로필을 그대로 둔다', async () => {
    const before = useProfile.getState().profile;
    const local = createLocalRepos(AsyncStorage);
    mockRepos = {
      ...local,
      profile: {
        ...local.profile,
        get: async () => {
          throw new Error('disk');
        },
      },
    };
    expect(await useProfile.getState().load()).toBe(before);
    expect(useProfile.getState().status).toBe('ready');
  });
});
