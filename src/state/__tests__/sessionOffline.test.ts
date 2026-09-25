import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { getAuthUserId, setAuthUserId } from '@/services/authState';
import { STORAGE_KEYS } from '@/services/repo/local';

import { FAVORITES_KEY, useFavorites } from '../favorites';
import { useSession } from '../session';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-apple-authentication', () => ({ AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 }, isAvailableAsync: jest.fn(async () => true), signInAsync: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `mealfit://${path}` }));

// 실제 supabase-js 클라이언트 + 오프라인 fetch — auth-js 의 진짜 동작(갱신 실패 시 세션 보존·signOut 실패)을 그대로 재현
let mockDb: SupabaseClient | null = null;
jest.mock('@/services/supabase', () => ({
  ...jest.requireActual('@/services/supabase'),
  getSupabase: () => mockDb,
}));

const offlineFetch = jest.fn(async () => {
  throw new TypeError('Network request failed');
});

const KEY = 'sb-proj-auth-token';
const storedSession = (expiresAt: number) => ({
  access_token: 'access',
  refresh_token: 'refresh',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: expiresAt,
  user: {
    id: 'user-1',
    aud: 'authenticated',
    email: 'hyo@example.com',
    app_metadata: { provider: 'email' },
    user_metadata: { nickname: '효' },
    created_at: '2026-09-01T00:00:00.000Z',
  },
});

/** fake timer 로 auth-js 의 재시도 대기(최대 30초)를 빨리 감는다 */
async function settle<T>(p: Promise<T>): Promise<T> {
  let done = false;
  const out = p.finally(() => {
    done = true;
  });
  for (let i = 0; i < 200 && !done; i++) await jest.advanceTimersByTimeAsync(500);
  return out;
}

beforeEach(async () => {
  jest.useFakeTimers({ now: new Date('2026-09-25T12:00:00Z') });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  await AsyncStorage.clear();
  setAuthUserId(null);
  useSession.setState({ session: null, status: 'loading' });
  mockDb = createClient('https://proj.supabase.co', 'anon', {
    auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: offlineFetch as unknown as typeof fetch },
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const expired = () => Math.floor(Date.now() / 1000) - 60;

describe('오프라인 + 토큰 만료로 앱을 켤 때', () => {
  it('(재현) getSession 은 {session:null, error} 인데 기기에는 로그인 세션이 남아 있다', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(storedSession(expired())));
    const { data, error } = await settle(mockDb!.auth.getSession());
    expect(data.session).toBeNull();
    expect(error).toBeTruthy();
    expect(await AsyncStorage.getItem(KEY)).not.toBeNull();
  });

  it('게스트로 떨어뜨리지 않고 오프라인 로그인 사용자로 이어 쓴다 — 옮긴 로컬 백업도 건드리지 않는다', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(storedSession(expired())));
    await AsyncStorage.setItem(STORAGE_KEYS.migrated, 'user-1');
    await AsyncStorage.setItem(STORAGE_KEYS.profile, JSON.stringify({ id: 'old', nickname: '예전' }));

    const session = await settle(useSession.getState().load());
    expect(session).toMatchObject({ backend: 'supabase', userId: 'user-1', nickname: '효' });
    expect(getAuthUserId()).toBe('user-1');
    expect(await AsyncStorage.getItem(STORAGE_KEYS.migrated)).toBe('user-1');
    expect(await AsyncStorage.getItem(STORAGE_KEYS.profile)).not.toBeNull();

    // 뒤늦게 오는 INITIAL_SESSION(null) 이 세션을 지우지 않는다
    await jest.advanceTimersByTimeAsync(5000);
    expect(useSession.getState().session?.userId).toBe('user-1');
    expect(getAuthUserId()).toBe('user-1');
  });

  it('기기에 세션이 없으면 예전처럼 게스트 — 옮긴 백업을 비운다', async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.migrated, 'user-1');
    await AsyncStorage.setItem(STORAGE_KEYS.profile, JSON.stringify({ id: 'old', nickname: '예전' }));
    expect(await settle(useSession.getState().load())).toBeNull();
    expect(getAuthUserId()).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.migrated)).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.profile)).toBeNull();
  });
});

describe('오프라인 로그아웃', () => {
  it('(재현) 토큰이 만료된 채 오프라인이면 auth.signOut 은 error 만 돌려주고 세션을 남긴다 — scope local 도 같다', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(storedSession(expired())));
    expect((await settle(mockDb!.auth.signOut())).error).toBeTruthy();
    expect((await settle(mockDb!.auth.signOut({ scope: 'local' }))).error).toBeTruthy();
    expect(await AsyncStorage.getItem(KEY)).not.toBeNull();
  });

  it('로그아웃하면 기기의 로그인 세션·즐겨찾기가 지워져 다음 실행 때 이전 계정으로 들어가지 않는다', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(storedSession(expired())));
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify([{ menuId: 'a', name: '라떼', addedAt: '' }]));
    await settle(useSession.getState().load());
    await useFavorites.getState().load();
    expect(useFavorites.getState().items).toHaveLength(1);

    await settle(useSession.getState().signOut());
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(useSession.getState().session).toBeNull();
    expect(getAuthUserId()).toBeNull();
    expect(await AsyncStorage.getItem(FAVORITES_KEY)).toBeNull();
    expect(useFavorites.getState().items).toEqual([]);

    // 다음 실행(네트워크 없어도)도 게스트
    useSession.setState({ session: null, status: 'loading' });
    expect(await settle(useSession.getState().load())).toBeNull();
  });
});
