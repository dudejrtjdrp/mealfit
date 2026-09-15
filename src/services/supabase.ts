import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
