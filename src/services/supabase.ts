import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type Session as SupabaseSession, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { env, hasSupabase } from './env';

let client: SupabaseClient | null | undefined;

/** 웹 정적 렌더링(Node) 중에는 window 가 없어 AsyncStorage(localStorage) 를 쓸 수 없다 */
const canPersist = () => Platform.OS !== 'web' || typeof window !== 'undefined';

/**
 * Supabase 클라이언트 싱글턴. `.env` 에 URL·ANON KEY 가 없으면 null → 호출 쪽은 로컬 폴백.
 * 세션은 AsyncStorage 에 저장하고, 딥링크 URL 에서 세션을 자동으로 읽지 않는다(OAuth 는 login 에서 직접 처리).
 */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  if (!hasSupabase()) {
    client = null;
    return client;
  }
  const persist = canPersist();
  client = createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    auth: {
      storage: persist ? AsyncStorage : undefined,
      persistSession: persist,
      autoRefreshToken: persist,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
  return client;
}

/** 테스트용: 싱글턴 교체 */
export function setSupabaseForTest(c: SupabaseClient | null | undefined): void {
  client = c;
}

/** auth-js 가 세션을 저장하는 키 (sb-<프로젝트>-auth-token). 내부 필드라 없으면 null */
function authStorageKey(db: SupabaseClient): string | null {
  const k = (db.auth as unknown as { storageKey?: unknown }).storageKey;
  return typeof k === 'string' && k.length > 0 ? k : null;
}

/**
 * 이 기기에 저장된 로그인 세션 — 네트워크 없이 읽는다.
 * 오프라인에서 토큰이 만료되면 getSession() 은 갱신을 못 해 {session:null, error} 를 돌려주지만,
 * auth-js 는 네트워크 오류(재시도 가능)면 저장된 세션을 지우지 않는다 → 여기 남아 있으면 "오프라인 로그인 사용자"다.
 * 없으면 null. 저장소 읽기 자체가 실패하면 던진다(호출 쪽이 '모름'으로 다룬다).
 */
export async function readStoredAuthSession(db: SupabaseClient): Promise<Pick<SupabaseSession, 'user' | 'refresh_token'> | null> {
  const key = authStorageKey(db);
  if (!key) return null;
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  let parsed: Partial<SupabaseSession> | null = null;
  try {
    parsed = JSON.parse(raw) as Partial<SupabaseSession>;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed.refresh_token !== 'string' || !parsed.refresh_token) return null;
  let user = parsed.user;
  if (!user?.id) {
    // userStorage 를 따로 쓰는 설정이면 사용자 정보는 <key>-user 에 있다
    try {
      const u = await AsyncStorage.getItem(`${key}-user`);
      user = u ? (JSON.parse(u) as { user?: SupabaseSession['user'] }).user : undefined;
    } catch {
      user = undefined;
    }
  }
  return user && typeof user.id === 'string' ? { user, refresh_token: parsed.refresh_token } : null;
}

/** 저장된 로그인 세션을 이 기기에서 지운다 — signOut 이 오프라인·만료로 세션을 못 지웠을 때의 마지막 수단 */
export async function clearStoredAuthSession(db: SupabaseClient): Promise<void> {
  const key = authStorageKey(db);
  if (!key) return;
  await AsyncStorage.multiRemove([key, `${key}-user`, `${key}-code-verifier`]);
}
