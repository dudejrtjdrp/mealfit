import type { Session as SupabaseSession, SupabaseClient } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

/** 앱 안에서 쓰는 로그인 수단 */
export type AuthProvider = 'kakao' | 'apple' | 'google' | 'email';

/** 시스템 브라우저(OAuth)로 로그인하는 수단 */
export type OAuthProvider = 'kakao' | 'google';

/** Apple·relay 이메일 등으로 이름을 알 수 없을 때 닉네임 */
export const NICKNAME_FALLBACK = '회원';

/** 화면이 보는 세션. backend 가 supabase 면 userId 는 auth.users.id */
export interface Session {
  provider: AuthProvider;
  nickname?: string;
  email?: string;
  createdAt: string;
  backend: 'local' | 'supabase';
  userId?: string;
}

export type AuthResult =
  | { ok: true; session: Session }
  /**
   * needsConfirm: 가입은 됐지만 메일 인증이 켜져 있어 세션이 아직 없음 · cancelled: 사용자가 창을 닫음
   * detail: 원인 한 줄(에러 이름·메시지 앞 80자) — 알 수 없는 실패를 다음 빌드에서 바로 특정하려고 화면 캡션에 보여준다
   */
  | { ok: false; message: string; needsConfirm?: boolean; cancelled?: boolean; detail?: string };

export const PASSWORD_MIN = 8;

type Meta = Record<string, unknown> | undefined;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** Apple "나의 이메일 가리기" 주소 (xxx@privaterelay.appleid.com) */
export const isAppleRelayEmail = (email: string | undefined) => !!email && /@privaterelay\.appleid\.com$/i.test(email);

/** Apple 이 첫 로그인 때만 주는 이름 → 닉네임 한 줄 (한국식: 성+이름 붙여 쓰기, 영문은 이름 성) */
export function appleFullNameToNickname(n: Partial<AppleAuthentication.AppleAuthenticationFullName> | null | undefined): string | undefined {
  if (!n) return undefined;
  const nick = str(n.nickname);
  if (nick) return nick;
  const given = str(n.givenName);
  const family = str(n.familyName);
  if (!given && !family) return undefined;
  const hangul = /[\uac00-\ud7a3]/;
  if (given && family) return hangul.test(given + family) ? `${family}${given}` : `${given} ${family}`;
  return given ?? family;
}

/** Supabase 세션 → 앱 세션 */
export function sessionFromSupabase(s: Pick<SupabaseSession, 'user'>): Session {
  const u = s.user;
  const meta = u.user_metadata as Meta;
  const appMeta = u.app_metadata as Meta;
  const rawProvider = str(appMeta?.provider);
  const provider: AuthProvider = rawProvider === 'kakao' || rawProvider === 'apple' || rawProvider === 'google' ? rawProvider : 'email';
  const email = str(u.email);
  const named = str(meta?.nickname) ?? str(meta?.full_name) ?? str(meta?.name) ?? str(meta?.preferred_username);
  let nickname: string | undefined;
  if (provider === 'apple') {
    // 이름은 첫 로그인 때만 오고, 이메일은 relay 일 수 있어 앞부분을 닉네임으로 쓰지 않는다
    nickname = named ?? NICKNAME_FALLBACK;
  } else if (provider === 'google') {
    nickname = named ?? (email ? email.split('@')[0] : NICKNAME_FALLBACK);
  } else {
    nickname = str(meta?.nickname) ?? str(meta?.name) ?? str(meta?.full_name) ?? str(meta?.preferred_username) ?? (email ? email.split('@')[0] : undefined);
  }
  return { provider, nickname, email, createdAt: u.created_at, backend: 'supabase', userId: u.id };
}

export const KAKAO_NOT_READY = '카카오 로그인은 준비 중이에요. 이메일로 시작해 주세요';

export const OFFLINE_MESSAGE = '인터넷 연결을 확인해주세요.';
export const UNKNOWN_MESSAGE = '로그인하지 못했어요. 잠시 후 다시 시도해주세요.';
export const SERVER_UNREACHABLE_MESSAGE = '로그인 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요.';
export const SERVER_ERROR_MESSAGE = '로그인 서버에 문제가 있어요. 잠시 후 다시 시도해주세요.';
export const TIMEOUT_MESSAGE = '응답이 늦어요. 잠시 후 다시 시도해주세요.';

type ErrLike = { name?: unknown; message?: unknown; code?: unknown; status?: unknown };
const errText = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** 에러 → 원인 한 줄 ("AuthRetryableFetchError: fetch failed: …" 앞 max 자). 화면 캡션·로그용 */
export function describeError(e: unknown, max = 80): string {
  if (e == null) return '';
  let line: string;
  if (typeof e === 'object') {
    const o = e as ErrLike;
    const name = errText(o.name) || 'Error';
    const status = typeof o.status === 'number' && o.status > 0 ? ` ${o.status}` : '';
    const code = errText(o.code);
    const codePart = code && code !== name ? ` [${code}]` : '';
    const msg = errText(o.message) || (() => {
      try {
        return JSON.stringify(e);
      } catch {
        return String(e);
      }
    })();
    line = `${name}${status}${codePart}: ${msg}`;
  } else {
    line = String(e);
  }
  line = line.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

// 실제로 기기가 오프라인일 때만 나오는 문구 (RN XHR · iOS NSURLError 영/한 localizedDescription)
const OFFLINE_RE = /network request failed|internet connection appears to be offline|not connected to the internet|network connection was lost|오프라인|연결이 유실/i;
const TIMEOUT_RE = /timed out|timeout|시간이 초과/i;
// 인터넷은 되는데 서버에 닿지 못함: 호스트 없음(잘못된·일시중지된 프로젝트 URL)·접속 거부·TLS
const UNREACHABLE_RE = /hostname could not be found|could not connect to the server|ssl error|secure connection|호스트 이름|서버에 연결할 수 없|ssl 오류|보안 연결/i;

/** 오프라인 판정: 진짜 네트워크 에러(TypeError: Network request failed, NSURLError -1009/-1005 등)일 때만 */
export function isOfflineError(e: unknown): boolean {
  if (e == null || typeof e !== 'object') return false;
  return OFFLINE_RE.test(errText((e as ErrLike).message));
}

/** Supabase 가 fetch 실패를 감싼 에러(AuthRetryableFetchError) 또는 fetch 자체 실패인지 */
const isFetchFailure = (o: ErrLike) =>
  errText(o.name) === 'AuthRetryableFetchError' || /^fetch failed/i.test(errText(o.message)) || (errText(o.name) === 'TypeError' && /fetch|network/i.test(errText(o.message)));

export interface AuthFailure {
  message: string;
  detail?: string;
}

/**
 * 로그인 실패 원인 → 한국어 안내 + (알 수 없는 경우) 원인 한 줄.
 * 예전에는 'fetch'·'network' 가 들어간 모든 오류를 "인터넷 연결"로 뭉뚱그렸는데,
 * expo/fetch 의 모든 실패가 "fetch failed: …" 로 시작해 DNS·TLS·서버 오류까지 오프라인처럼 보였다.
 */
export function classifyAuthError(err: unknown, provider?: AuthProvider): AuthFailure {
  if (err == null) return { message: UNKNOWN_MESSAGE };
  const o = (typeof err === 'object' ? err : { message: String(err) }) as ErrLike;
  const m = `${errText(o.code)} ${errText(o.message)}`.toLowerCase();
  const detail = describeError(err) || undefined;
  const status = typeof o.status === 'number' ? o.status : 0;

  // 카카오 동의항목(이메일)이 없으면 KOE205 / invalid_request 로 돌아온다
  if (provider === 'kakao' && (m.includes('koe205') || m.includes('invalid_request') || m.includes('invalid_scope'))) return { message: KAKAO_NOT_READY };
  if (m.includes('invalid login credentials') || m.includes('invalid_credentials')) return { message: '이메일 또는 비밀번호를 확인해주세요.' };
  if (m.includes('already registered') || m.includes('user_already_exists')) return { message: '이미 가입된 이메일이에요. 로그인으로 바꿔서 시도해주세요.' };
  if (m.includes('email not confirmed') || m.includes('email_not_confirmed')) return { message: '메일함에서 인증을 마친 뒤 로그인해주세요.' };
  if (m.includes('weak_password') || /password.*(at least|characters|short)/.test(m)) return { message: `비밀번호는 ${PASSWORD_MIN}자 이상으로 정해주세요.` };
  if (m.includes('provider is not enabled') || m.includes('unsupported provider') || m.includes('provider_disabled'))
    return { message: '이 로그인 수단은 아직 준비 중이에요. 이메일로 시작해주세요.', detail };
  if (m.includes('rate limit') || m.includes('too many') || status === 429) return { message: '요청이 많아요. 잠시 후 다시 시도해주세요.' };

  if (isOfflineError(o)) return { message: OFFLINE_MESSAGE, detail };
  if (TIMEOUT_RE.test(m)) return { message: TIMEOUT_MESSAGE, detail };
  if (UNREACHABLE_RE.test(m)) return { message: SERVER_UNREACHABLE_MESSAGE, detail };
  if (isFetchFailure(o)) return { message: status >= 500 ? SERVER_ERROR_MESSAGE : SERVER_UNREACHABLE_MESSAGE, detail };
  if (status >= 500) return { message: SERVER_ERROR_MESSAGE, detail };
  return { message: UNKNOWN_MESSAGE, detail };
}

/** 한국어 안내 문구만 필요할 때 */
export function authErrorMessage(err: unknown, provider?: AuthProvider): string {
  return classifyAuthError(err, provider).message;
}

/** 실패 결과 한 건 (원인 한 줄 포함) — 콘솔에도 남겨 기기 로그로 추적 */
function authFailure(err: unknown, provider?: AuthProvider): AuthResult {
  const f = classifyAuthError(err, provider);
  if (f.detail) console.warn(`[auth] 로그인 실패${provider ? ` (${provider})` : ''}`, f.detail);
  return { ok: false, ...f };
}

/** 리다이렉트 URL 의 ?query 와 #fragment 파라미터를 합쳐 읽는다 (RN 의 URL 은 searchParams 가 불완전) */
export function parseAuthParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts: string[] = [];
  const q = url.indexOf('?');
  const h = url.indexOf('#');
  if (q >= 0) parts.push(url.slice(q + 1, h > q ? h : undefined));
  if (h >= 0) parts.push(url.slice(h + 1));
  for (const part of parts) {
    for (const pair of part.split('&')) {
      if (!pair) continue;
      const [k, v = ''] = pair.split('=');
      try {
        out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

/** OAuth 리다이렉트 주소 — 개발 빌드·스토어 빌드는 mealfit://, Expo Go 는 exp://.../--/ */
export const oauthRedirectUri = () => Linking.createURL('auth');

export async function emailSignUp(db: SupabaseClient, email: string, password: string, nickname: string): Promise<AuthResult> {
  const { data, error } = await db.auth.signUp({ email: email.trim(), password, options: { data: { nickname: nickname.trim() } } });
  if (error) return authFailure(error);
  if (!data.session) return { ok: false, needsConfirm: true, message: '인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해주세요.' };
  return { ok: true, session: sessionFromSupabase(data.session) };
}

export async function emailSignIn(db: SupabaseClient, email: string, password: string): Promise<AuthResult> {
  const { data, error } = await db.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.session) return authFailure(error);
  return { ok: true, session: sessionFromSupabase(data.session) };
}

/** 카카오·Google: Supabase 가 준 인증 페이지를 시스템 브라우저(ASWebAuthenticationSession / Custom Tabs)로 열고, 돌아온 URL 로 세션을 만든다 */
export async function oauthSignIn(db: SupabaseClient, provider: OAuthProvider): Promise<AuthResult> {
  if (Platform.OS === 'web') return { ok: false, message: '웹 미리보기에서는 이메일로 시작해주세요.' };
  const redirectTo = oauthRedirectUri();
  const { data, error } = await db.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true, ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}) },
  });
  if (error || !data?.url) return authFailure(error, provider);

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return { ok: false, cancelled: true, message: '로그인을 취소했어요.' };
  return sessionFromRedirect(db, res.url, provider);
}

/** 콜백 URL(mealfit://auth?code=... 또는 #access_token=...) → 세션 */
export async function sessionFromRedirect(db: SupabaseClient, url: string, provider: OAuthProvider): Promise<AuthResult> {
  const params = parseAuthParams(url);
  if (params.error || params.error_description || params.error_code) {
    if (params.error === 'access_denied' && !params.error_description?.toLowerCase().includes('koe')) {
      return { ok: false, cancelled: true, message: '로그인을 취소했어요.' };
    }
    return authFailure({ name: 'OAuthCallbackError', code: params.error_code ?? params.error, message: params.error_description ?? params.error }, provider);
  }

  if (params.code) {
    const ex = await db.auth.exchangeCodeForSession(params.code);
    if (ex.error || !ex.data.session) return authFailure(ex.error, provider);
    return { ok: true, session: sessionFromSupabase(ex.data.session) };
  }
  if (params.access_token && params.refresh_token) {
    const set = await db.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token });
    if (set.error || !set.data.session) return authFailure(set.error, provider);
    return { ok: true, session: sessionFromSupabase(set.data.session) };
  }
  return { ok: false, message: '로그인 정보를 받지 못했어요. 다시 시도해주세요.' };
}

/** 이 기기에서 네이티브 Sign in with Apple 을 쓸 수 있는지 (iOS 13+ 만 true, Android·웹은 false) */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

const isCancel = (e: unknown) => (e as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED' || (e as { code?: string } | null)?.code === 'ERR_CANCELED';

export type AppleNativeResult =
  | { ok: true; identityToken: string; nickname?: string; email?: string }
  | { ok: false; message: string; cancelled?: boolean; detail?: string };

/** 시스템 Apple 로그인 시트 → identityToken (+ 첫 로그인 때만 오는 이름) */
export async function appleNativeCredential(): Promise<AppleNativeResult> {
  try {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!cred.identityToken) return { ok: false, message: 'Apple 로그인 정보를 받지 못했어요. 다시 시도해주세요.' };
    return { ok: true, identityToken: cred.identityToken, nickname: appleFullNameToNickname(cred.fullName), email: str(cred.email) };
  } catch (e) {
    if (isCancel(e)) return { ok: false, cancelled: true, message: '로그인을 취소했어요.' };
    const detail = describeError(e) || undefined;
    console.warn('[auth] Apple 로그인 실패', detail);
    return { ok: false, message: 'Apple 로그인을 하지 못했어요. 잠시 후 다시 시도해주세요.', detail };
  }
}

/** Apple(iOS 네이티브): identityToken 을 Supabase 에 넘겨 세션을 만들고, 첫 로그인 이름은 user_metadata.nickname 에 남긴다 */
export async function appleSignIn(db: SupabaseClient): Promise<AuthResult> {
  if (!(await isAppleSignInAvailable())) return { ok: false, message: '이 기기에서는 Apple 로그인을 쓸 수 없어요. 이메일로 시작해주세요.' };
  const cred = await appleNativeCredential();
  if (!cred.ok) return cred;

  const { data, error } = await db.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken });
  if (error || !data.session) return authFailure(error, 'apple');

  const existing = str((data.user?.user_metadata as Meta)?.nickname);
  if (cred.nickname && !existing) {
    // 이름은 다시 오지 않으므로 서버 메타데이터에 남긴다 (실패해도 이번 세션 닉네임은 채움)
    const upd = await db.auth.updateUser({ data: { nickname: cred.nickname, full_name: cred.nickname } }).catch(() => null);
    if (upd && !upd.error && upd.data.user) return { ok: true, session: sessionFromSupabase({ user: upd.data.user }) };
    return { ok: true, session: { ...sessionFromSupabase(data.session), nickname: cred.nickname } };
  }
  return { ok: true, session: sessionFromSupabase(data.session) };
}
