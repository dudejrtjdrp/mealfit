import type { Session as SupabaseSession, SupabaseClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

/** 앱 안에서 쓰는 로그인 수단 */
export type AuthProvider = 'kakao' | 'apple' | 'email';

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

/** Supabase 세션 → 앱 세션 */
export function sessionFromSupabase(s: Pick<SupabaseSession, 'user'>): Session {
  const u = s.user;
  const meta = u.user_metadata as Meta;
  const appMeta = u.app_metadata as Meta;
  const rawProvider = str(appMeta?.provider);
  const provider: AuthProvider = rawProvider === 'kakao' || rawProvider === 'apple' ? rawProvider : 'email';
  const email = str(u.email);
  const nickname =
    str(meta?.nickname) ?? str(meta?.name) ?? str(meta?.full_name) ?? str(meta?.preferred_username) ?? (email ? email.split('@')[0] : undefined);
  return { provider, nickname, email, createdAt: u.created_at, backend: 'supabase', userId: u.id };
}

/** Supabase Auth 오류 문구 → 한국어 안내 */
export function authErrorMessage(err: { message?: string; code?: string } | null | undefined): string {
  const m = `${err?.code ?? ''} ${err?.message ?? ''}`.toLowerCase();
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
export const oauthRedirectUri = () => Linking.createURL('');

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

/** 카카오·Apple: Supabase 가 준 인증 페이지를 인앱 브라우저로 열고, 돌아온 URL 로 세션을 만든다 */
export async function oauthSignIn(db: SupabaseClient, provider: 'kakao' | 'apple'): Promise<AuthResult> {
  if (Platform.OS === 'web') return { ok: false, message: '웹 미리보기에서는 이메일로 시작해주세요.' };
  const redirectTo = oauthRedirectUri();
  const { data, error } = await db.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data?.url) return { ok: false, message: authErrorMessage(error) };

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return { ok: false, cancelled: true, message: '로그인을 취소했어요.' };

  const params = parseAuthParams(res.url);
  if (params.error || params.error_description) return { ok: false, message: authErrorMessage({ message: params.error_description ?? params.error }) };

  if (params.code) {
    const ex = await db.auth.exchangeCodeForSession(params.code);
    if (ex.error || !ex.data.session) return { ok: false, message: authErrorMessage(ex.error) };
    return { ok: true, session: sessionFromSupabase(ex.data.session) };
  }
  if (params.access_token && params.refresh_token) {
    const set = await db.auth.setSession({ access_token: params.access_token, refresh_token: params.refresh_token });
    if (set.error || !set.data.session) return { ok: false, message: authErrorMessage(set.error) };
    return { ok: true, session: sessionFromSupabase(set.data.session) };
  }
  return { ok: false, message: '로그인 정보를 받지 못했어요. 다시 시도해주세요.' };
}
