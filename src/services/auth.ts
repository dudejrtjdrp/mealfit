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
  /** needsConfirm: 가입은 됐지만 메일 인증이 켜져 있어 세션이 아직 없음 · cancelled: 사용자가 창을 닫음 */
  | { ok: false; message: string; needsConfirm?: boolean; cancelled?: boolean };

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

/** Supabase Auth 오류 문구 → 한국어 안내 */
export const KAKAO_NOT_READY = '카카오 로그인은 준비 중이에요. 이메일로 시작해 주세요';

export function authErrorMessage(err: { message?: string; code?: string } | null | undefined, provider?: AuthProvider): string {
  const m = `${err?.code ?? ''} ${err?.message ?? ''}`.toLowerCase();
  // 카카오 동의항목(이메일)이 없으면 KOE205 / invalid_request 로 돌아온다
  if (provider === 'kakao' && (m.includes('koe205') || m.includes('invalid_request') || m.includes('invalid_scope'))) return KAKAO_NOT_READY;
  if (m.includes('invalid login credentials') || m.includes('invalid_credentials')) return '이메일 또는 비밀번호를 확인해주세요.';
  if (m.includes('already registered') || m.includes('user_already_exists')) return '이미 가입된 이메일이에요. 로그인으로 바꿔서 시도해주세요.';
  if (m.includes('email not confirmed') || m.includes('email_not_confirmed')) return '메일함에서 인증을 마친 뒤 로그인해주세요.';
  if (m.includes('password')) return `비밀번호는 ${PASSWORD_MIN}자 이상으로 정해주세요.`;
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) return '이 로그인 수단은 아직 준비 중이에요. 이메일로 시작해주세요.';
  if (m.includes('rate limit') || m.includes('too many')) return '요청이 많아요. 잠시 후 다시 시도해주세요.';
  if (m.includes('network') || m.includes('fetch')) return '인터넷 연결을 확인해주세요.';
  return '로그인하지 못했어요. 잠시 후 다시 시도해주세요.';
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
  if (error) return { ok: false, message: authErrorMessage(error) };
  if (!data.session) return { ok: false, needsConfirm: true, message: '인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해주세요.' };
  return { ok: true, session: sessionFromSupabase(data.session) };
}

export async function emailSignIn(db: SupabaseClient, email: string, password: string): Promise<AuthResult> {
  const { data, error } = await db.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.session) return { ok: false, message: authErrorMessage(error) };
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
  if (error || !data?.url) return { ok: false, message: authErrorMessage(error, provider) };

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
    return { ok: false, message: authErrorMessage({ code: params.error_code ?? params.error, message: params.error_description ?? params.error }, provider) };
  }

  if (params.code) {
    const ex = await db.auth.exchangeCodeForSession(params.code);
    if (ex.error || !ex.data.session) return { ok: false, message: authErrorMessage(ex.error, provider) };
    return { ok: true, session: sessionFromSupabase(ex.data.session) };
  }
  if (params.access_token && params.refresh_token) {
    const set = await db.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token });
    if (set.error || !set.data.session) return { ok: false, message: authErrorMessage(set.error, provider) };
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
  | { ok: false; message: string; cancelled?: boolean };

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
    console.warn('[auth] Apple 로그인 실패', e);
    return { ok: false, message: 'Apple 로그인을 하지 못했어요. 잠시 후 다시 시도해주세요.' };
  }
}

/** Apple(iOS 네이티브): identityToken 을 Supabase 에 넘겨 세션을 만들고, 첫 로그인 이름은 user_metadata.nickname 에 남긴다 */
export async function appleSignIn(db: SupabaseClient): Promise<AuthResult> {
  if (!(await isAppleSignInAvailable())) return { ok: false, message: '이 기기에서는 Apple 로그인을 쓸 수 없어요. 이메일로 시작해주세요.' };
  const cred = await appleNativeCredential();
  if (!cred.ok) return cred;

  const { data, error } = await db.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken });
  if (error || !data.session) return { ok: false, message: authErrorMessage(error, 'apple') };

  const existing = str((data.user?.user_metadata as Meta)?.nickname);
  if (cred.nickname && !existing) {
    // 이름은 다시 오지 않으므로 서버 메타데이터에 남긴다 (실패해도 이번 세션 닉네임은 채움)
    const upd = await db.auth.updateUser({ data: { nickname: cred.nickname, full_name: cred.nickname } }).catch(() => null);
    if (upd && !upd.error && upd.data.user) return { ok: true, session: sessionFromSupabase({ user: upd.data.user }) };
    return { ok: true, session: { ...sessionFromSupabase(data.session), nickname: cred.nickname } };
  }
  return { ok: true, session: sessionFromSupabase(data.session) };
}
