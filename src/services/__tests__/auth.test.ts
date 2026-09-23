jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `mealfit://${path}` }));

import * as AppleAuthentication from 'expo-apple-authentication';
import * as WebBrowser from 'expo-web-browser';

import {
  appleFullNameToNickname,
  appleSignIn,
  authErrorMessage,
  classifyAuthError,
  describeError,
  emailSignIn,
  isAppleRelayEmail,
  isOfflineError,
  OFFLINE_MESSAGE,
  SERVER_ERROR_MESSAGE,
  SERVER_UNREACHABLE_MESSAGE,
  UNKNOWN_MESSAGE,
  KAKAO_NOT_READY,
  NICKNAME_FALLBACK,
  oauthRedirectUri,
  oauthSignIn,
  sessionFromRedirect,
  sessionFromSupabase,
} from '../auth';

const USER = '11111111-1111-4111-8111-111111111111';
const user = (provider: string, meta: Record<string, unknown>, email?: string) => ({
  id: USER,
  email,
  created_at: '2026-09-01T00:00:00Z',
  app_metadata: { provider },
  user_metadata: meta,
  aud: 'authenticated',
});
const supa = (provider: string, meta: Record<string, unknown>, email?: string) => sessionFromSupabase({ user: user(provider, meta, email) } as never);

const signInAsync = AppleAuthentication.signInAsync as jest.Mock;
const openAuth = WebBrowser.openAuthSessionAsync as jest.Mock;

function fakeDb(over: Record<string, jest.Mock> = {}) {
  const session = (meta: Record<string, unknown>, provider = 'apple') => ({ user: user(provider, meta, 'abc@privaterelay.appleid.com') });
  const auth = {
    signInWithIdToken: jest.fn(async () => ({ data: { session: session({}), user: user('apple', {}) }, error: null })),
    updateUser: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ data: { user: user('apple', data, 'abc@privaterelay.appleid.com') }, error: null })),
    signInWithOAuth: jest.fn(async () => ({ data: { url: 'https://ref.supabase.co/auth/v1/authorize?provider=google' }, error: null })),
    exchangeCodeForSession: jest.fn(async () => ({ data: { session: session({ full_name: '김지은' }, 'google') }, error: null })),
    setSession: jest.fn(async () => ({ data: { session: session({ name: 'Jieun Kim' }, 'google') }, error: null })),
    ...over,
  };
  return { auth } as never as import('@supabase/supabase-js').SupabaseClient & { auth: typeof auth };
}

beforeEach(() => {
  signInAsync.mockReset();
  openAuth.mockReset();
});

describe('auth 매핑 — Apple', () => {
  it('relay 이메일을 알아본다', () => {
    expect(isAppleRelayEmail('x1y2@privaterelay.appleid.com')).toBe(true);
    expect(isAppleRelayEmail('jieun@icloud.com')).toBe(false);
    expect(isAppleRelayEmail(undefined)).toBe(false);
  });

  it('이름이 없으면 relay 이메일 앞부분 대신 "회원"', () => {
    const s = supa('apple', {}, 'x1y2@privaterelay.appleid.com');
    expect(s.provider).toBe('apple');
    expect(s.nickname).toBe(NICKNAME_FALLBACK);
    expect(s.email).toBe('x1y2@privaterelay.appleid.com');
  });

  it('저장해 둔 닉네임·이름이 있으면 그걸 쓴다', () => {
    expect(supa('apple', { nickname: '지은' }).nickname).toBe('지은');
    expect(supa('apple', { full_name: 'Jieun Kim' }).nickname).toBe('Jieun Kim');
  });

  it('Apple fullName → 닉네임 (한글은 성+이름, 영문은 이름 성)', () => {
    expect(appleFullNameToNickname({ givenName: '지은', familyName: '김' })).toBe('김지은');
    expect(appleFullNameToNickname({ givenName: 'Jieun', familyName: 'Kim' })).toBe('Jieun Kim');
    expect(appleFullNameToNickname({ givenName: '지은', familyName: null })).toBe('지은');
    expect(appleFullNameToNickname({ nickname: '지니', givenName: '지은' })).toBe('지니');
    expect(appleFullNameToNickname({ givenName: null, familyName: null })).toBeUndefined();
    expect(appleFullNameToNickname(null)).toBeUndefined();
  });
});

describe('auth 매핑 — Google·카카오', () => {
  it('Google 은 full_name → name 순서, avatar 는 쓰지 않는다', () => {
    const s = supa('google', { full_name: '김지은', name: 'Jieun', avatar_url: 'https://x/a.png' }, 'jieun@gmail.com');
    expect(s).toEqual({ provider: 'google', nickname: '김지은', email: 'jieun@gmail.com', createdAt: '2026-09-01T00:00:00Z', backend: 'supabase', userId: USER });
    expect(supa('google', { name: 'Jieun' }).nickname).toBe('Jieun');
    expect(supa('google', {}, 'min@gmail.com').nickname).toBe('min');
    expect(supa('google', {}).nickname).toBe(NICKNAME_FALLBACK);
  });

  it('알 수 없는 provider 는 email 로', () => {
    expect(supa('github', {}, 'a@b.com').provider).toBe('email');
  });

  it('카카오 KOE205 / invalid_request 는 사람이 읽을 수 있는 문구로', () => {
    expect(authErrorMessage({ message: 'KOE205 잘못된 요청' }, 'kakao')).toBe(KAKAO_NOT_READY);
    expect(authErrorMessage({ code: 'invalid_request', message: 'scope' }, 'kakao')).toBe(KAKAO_NOT_READY);
    // 다른 수단의 invalid_request 는 일반 문구
    expect(authErrorMessage({ code: 'invalid_request' }, 'google')).not.toBe(KAKAO_NOT_READY);
  });
});

describe('OAuth 콜백', () => {
  it('리다이렉트 주소는 mealfit://auth', () => {
    expect(oauthRedirectUri()).toBe('mealfit://auth');
  });

  it('?code= 는 exchangeCodeForSession', async () => {
    const db = fakeDb();
    const res = await sessionFromRedirect(db, 'mealfit://auth?code=abc', 'google');
    expect(db.auth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(res.ok && res.session.nickname).toBe('김지은');
  });

  it('#access_token 은 setSession', async () => {
    const db = fakeDb();
    const res = await sessionFromRedirect(db, 'mealfit://auth#access_token=a&refresh_token=r', 'google');
    expect(db.auth.setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
    expect(res.ok && res.session.provider).toBe('google');
  });

  it('카카오 오류 콜백은 준비 중 문구', async () => {
    const res = await sessionFromRedirect(fakeDb(), 'mealfit://auth?error=invalid_request&error_description=KOE205', 'kakao');
    expect(res).toEqual({ ok: false, message: KAKAO_NOT_READY });
  });

  it('브라우저를 닫으면 조용히 취소', async () => {
    openAuth.mockResolvedValue({ type: 'cancel' });
    const db = fakeDb();
    const res = await oauthSignIn(db, 'google');
    expect(db.auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google', options: expect.objectContaining({ redirectTo: 'mealfit://auth', skipBrowserRedirect: true }) }));
    expect(res).toMatchObject({ ok: false, cancelled: true });
  });
});

describe('Apple 네이티브 로그인', () => {
  it('identityToken 을 signInWithIdToken 으로 넘기고 첫 로그인 이름을 닉네임으로 남긴다', async () => {
    signInAsync.mockResolvedValue({ identityToken: 'jwt', fullName: { givenName: '지은', familyName: '김' }, email: 'abc@privaterelay.appleid.com' });
    const db = fakeDb();
    const res = await appleSignIn(db);
    expect(signInAsync).toHaveBeenCalledWith({ requestedScopes: [0, 1] });
    expect(db.auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'jwt' });
    expect(db.auth.updateUser).toHaveBeenCalledWith({ data: { nickname: '김지은', full_name: '김지은' } });
    expect(res.ok && res.session.nickname).toBe('김지은');
  });

  it('두 번째 로그인(이름 없음)은 메타데이터를 건드리지 않고 "회원"', async () => {
    signInAsync.mockResolvedValue({ identityToken: 'jwt', fullName: { givenName: null, familyName: null }, email: null });
    const db = fakeDb();
    const res = await appleSignIn(db);
    expect(db.auth.updateUser).not.toHaveBeenCalled();
    expect(res.ok && res.session.nickname).toBe(NICKNAME_FALLBACK);
  });

  it('닉네임 저장이 실패해도 이번 세션 닉네임은 채운다', async () => {
    signInAsync.mockResolvedValue({ identityToken: 'jwt', fullName: { givenName: 'Jieun', familyName: 'Kim' }, email: null });
    const db = fakeDb({ updateUser: jest.fn(async () => ({ data: { user: null }, error: { message: 'network' } })) });
    const res = await appleSignIn(db);
    expect(res.ok && res.session.nickname).toBe('Jieun Kim');
  });

  it('사용자가 취소(ERR_REQUEST_CANCELED)하면 조용히 취소', async () => {
    signInAsync.mockRejectedValue(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));
    const db = fakeDb();
    const res = await appleSignIn(db);
    expect(res).toMatchObject({ ok: false, cancelled: true });
    expect(db.auth.signInWithIdToken).not.toHaveBeenCalled();
  });
});

describe('로그인 오류 분류 — 원인을 가리지 않는다', () => {
  const retryable = (message: string, status = 0) => Object.assign(new Error(message), { name: 'AuthRetryableFetchError', status });

  it('오프라인은 진짜 네트워크 에러일 때만', () => {
    expect(authErrorMessage(new TypeError('Network request failed'))).toBe(OFFLINE_MESSAGE);
    expect(authErrorMessage(retryable('fetch failed: The Internet connection appears to be offline.'))).toBe(OFFLINE_MESSAGE);
    expect(authErrorMessage(retryable('fetch failed: 인터넷 연결이 오프라인 상태입니다.'))).toBe(OFFLINE_MESSAGE);
    expect(isOfflineError(new TypeError('Network request failed'))).toBe(true);
    // "fetch" 라는 단어만으로는 오프라인이 아니다 (expo/fetch 는 모든 실패가 "fetch failed:" 로 시작)
    expect(isOfflineError(retryable('fetch failed: A server with the specified hostname could not be found.'))).toBe(false);
  });

  it('서버에 닿지 못함(DNS·TLS·알 수 없는 fetch 실패)은 서버 연결 문구 + 원인 한 줄', () => {
    const dns = classifyAuthError(retryable('fetch failed: A server with the specified hostname could not be found.'));
    expect(dns.message).toBe(SERVER_UNREACHABLE_MESSAGE);
    expect(dns.detail).toMatch(/^AuthRetryableFetchError: fetch failed: A server/);
    expect(classifyAuthError(retryable('fetch failed: 지정된 호스트 이름의 서버를 찾을 수 없습니다.')).message).toBe(SERVER_UNREACHABLE_MESSAGE);
    expect(classifyAuthError(retryable('fetch failed: something odd')).message).toBe(SERVER_UNREACHABLE_MESSAGE);
    expect(classifyAuthError(retryable('Bad Gateway', 502)).message).toBe(SERVER_ERROR_MESSAGE);
  });

  it('알 수 없는 예외는 "로그인하지 못했어요" + 에러 이름·메시지 앞 80자', () => {
    const e = new TypeError(`Cannot assign to read-only property 'protocol' of object '#<URL>' ${'x'.repeat(100)}`);
    const f = classifyAuthError(e);
    expect(f.message).toBe(UNKNOWN_MESSAGE);
    expect(f.detail!.startsWith("TypeError: Cannot assign to read-only property 'protocol'")).toBe(true);
    expect(f.detail!.length).toBeLessThanOrEqual(80);
    // 서버 오류 코드·상태도 원인 줄에 싣는다
    expect(describeError(Object.assign(new Error('Unacceptable audience in id_token'), { name: 'AuthApiError', status: 400, code: 'bad_jwt' }))).toBe(
      'AuthApiError 400 [bad_jwt]: Unacceptable audience in id_token',
    );
  });

  it('사람이 고칠 수 있는 오류는 원래 문구 그대로', () => {
    expect(authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('이메일 또는 비밀번호를 확인해주세요.');
    expect(authErrorMessage({ message: 'Password should be at least 6 characters.' })).toMatch(/비밀번호는/);
    expect(authErrorMessage(null)).toBe(UNKNOWN_MESSAGE);
  });

  it('Supabase 가 돌려준 오류는 AuthResult.detail 로 화면까지 전달된다', async () => {
    const db = fakeDb({ signInWithPassword: jest.fn(async () => ({ data: { session: null }, error: retryable('fetch failed: The request timed out.') })) });
    const res = await emailSignIn(db, 'a@b.com', 'pw123456');
    expect(res).toMatchObject({ ok: false, detail: 'AuthRetryableFetchError: fetch failed: The request timed out.' });
  });

  it('Apple 시트 실패도 원인 코드를 남긴다', async () => {
    signInAsync.mockRejectedValue(Object.assign(new Error('The authorization attempt failed for an unknown reason'), { code: 'ERR_REQUEST_UNKNOWN' }));
    const res = await appleSignIn(fakeDb());
    expect(res).toMatchObject({ ok: false, detail: expect.stringContaining('ERR_REQUEST_UNKNOWN') });
  });
});
