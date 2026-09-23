jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-apple-authentication', () => ({ AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 }, isAvailableAsync: jest.fn(async () => true), signInAsync: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `mealfit://${path}` }));

const mockSignInWithOAuth = jest.fn();
jest.mock('@/services/supabase', () => ({
  getSupabase: () => ({ auth: { signInWithOAuth: (...a: unknown[]) => mockSignInWithOAuth(...a), getSession: jest.fn(async () => ({ data: { session: null } })), onAuthStateChange: jest.fn() } }),
}));

import { OFFLINE_MESSAGE, UNKNOWN_MESSAGE } from '@/services/auth';

import { useSession } from '../session';

describe('세션 로그인 예외 처리 (withActivate)', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('알 수 없는 예외를 "인터넷 연결"로 덮지 않고 원인 한 줄을 돌려준다', async () => {
    mockSignInWithOAuth.mockRejectedValueOnce(new TypeError('undefined is not a function'));
    const res = await useSession.getState().signInOAuth('kakao');
    expect(res).toEqual({ ok: false, message: UNKNOWN_MESSAGE, detail: 'TypeError: undefined is not a function' });
  });

  it('진짜 네트워크 에러만 오프라인 문구', async () => {
    mockSignInWithOAuth.mockRejectedValueOnce(new TypeError('Network request failed'));
    const res = await useSession.getState().signInOAuth('kakao');
    expect(res).toMatchObject({ ok: false, message: OFFLINE_MESSAGE });
  });
});
