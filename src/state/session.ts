import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session as SupabaseSession, SupabaseClient } from '@supabase/supabase-js';
import { create } from 'zustand';

import {
  appleSignIn,
  type AuthProvider,
  type AuthResult,
  classifyAuthError,
  emailSignIn,
  emailSignUp,
  NICKNAME_FALLBACK,
  type OAuthProvider,
  oauthSignIn,
  type Session,
  sessionFromSupabase,
} from '@/services/auth';
import { getAuthUserId, setAuthUserId } from '@/services/authState';
import { newId } from '@/services/id';
import { createLocalRepos } from '@/services/repo/local';
import { discardMigratedBackup, migrateLocalToSupabase } from '@/services/repo/migrate';
import { createSupabaseRepos } from '@/services/repo/supabase';
import { clearStoredAuthSession, getSupabase, readStoredAuthSession } from '@/services/supabase';

import { emitAccountChange } from './accountEvents';
import { clearFavorites } from './favorites';

/**
 * 세션 스토어
 * - Supabase 미설정(.env 비어 있음): 로컬 세션(provider·닉네임·생성 시각)만 AsyncStorage 에 저장
 * - Supabase 설정: Supabase Auth 세션이 기준. 로그인 직후 로컬 데이터를 1회 옮긴다
 */
export type { AuthProvider, AuthResult, OAuthProvider, Session } from '@/services/auth';

const KEY = 'mealfit:session';

interface SessionState {
  session: Session | null;
  status: 'loading' | 'ready';
  /** 'local' | 'supabase' — 로그인 화면이 어떤 시트를 보여줄지 결정 */
  mode: 'local' | 'supabase';
  load: () => Promise<Session | null>;
  /** 로컬 모드 전용: 닉네임 시트로 시작 */
  signIn: (provider: AuthProvider, nickname?: string, email?: string) => Promise<Session>;
  /** Supabase 모드: 이메일+비밀번호 가입 */
  signUpEmail: (email: string, password: string, nickname: string) => Promise<AuthResult>;
  /** Supabase 모드: 이메일+비밀번호 로그인 */
  signInEmail: (email: string, password: string) => Promise<AuthResult>;
  /** Supabase 모드: 카카오·Google OAuth (시스템 브라우저) */
  signInOAuth: (provider: OAuthProvider) => Promise<AuthResult>;
  /** Supabase 모드: iOS 네이티브 Sign in with Apple → signInWithIdToken */
  signInApple: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

let listening = false;
let loading: Promise<Session | null> | null = null;
const migrating = new Map<string, Promise<void>>();

/** 로컬 → Supabase 1회 마이그레이션 (실패해도 로그인은 유지, 다음 로그인 때 다시 시도) */
function migrateOnce(db: SupabaseClient, userId: string): Promise<void> {
  const running = migrating.get(userId);
  if (running) return running;
  const p = migrateLocalToSupabase({
    storage: AsyncStorage,
    local: createLocalRepos(AsyncStorage),
    remote: createSupabaseRepos(db, userId),
    userId,
    newId,
  })
    .then((r) => {
      if (r.status === 'done' && (r.profile || r.logs > 0)) console.info(`[session] 로컬 데이터를 옮겼어요 (프로필 ${r.profile ? 1 : 0} · 기록 ${r.logs})`);
    })
    .catch((e) => console.warn('[session] 로컬 → Supabase 마이그레이션 실패', e))
    .finally(() => migrating.delete(userId));
  migrating.set(userId, p);
  return p;
}

/**
 * 이미 서버로 옮긴 로컬 백업 비우기 (migrate 플래그가 있을 때만).
 * 로그아웃 뒤나 세션 없이 켰을 때 예전 계정 데이터가 게스트 화면에 뜨거나, 새 게스트 데이터가 다음 로그인 때 건너뛰어지지 않게.
 */
export async function discardMigratedLocalBackup(): Promise<void> {
  try {
    await discardMigratedBackup({ storage: AsyncStorage, local: createLocalRepos(AsyncStorage) });
  } catch (e) {
    console.warn('[session] 옮긴 로컬 백업 정리 실패', e);
  }
}

/**
 * Supabase 로그아웃. 오프라인에서 토큰까지 만료됐으면 auth-js 는 세션을 읽지 못해(갱신 실패) scope 와 상관없이
 * {error} 만 돌려주고 저장된 세션을 그대로 둔다 → 다음 온라인 실행 때 이전 계정으로 자동 로그인된다.
 * error 면 scope:'local' 로 한 번 더, 그래도 기기에 세션이 남아 있으면 저장 키를 직접 지운다.
 */
export async function signOutSupabase(db: SupabaseClient): Promise<void> {
  let failed = false;
  try {
    const { error } = await db.auth.signOut();
    if (error) {
      failed = true;
      console.warn('[session] Supabase 로그아웃 실패 — 이 기기 세션만 지워요', error);
    }
  } catch (e) {
    failed = true;
    console.warn('[session] Supabase 로그아웃 예외 — 이 기기 세션만 지워요', e);
  }
  if (!failed) return;
  try {
    await db.auth.signOut({ scope: 'local' });
  } catch {
    // 아래에서 직접 지운다
  }
  try {
    if (await readStoredAuthSession(db)) await clearStoredAuthSession(db);
  } catch (e) {
    console.warn('[session] 저장된 로그인 세션 지우기 실패', e);
  }
}

export const useSession = create<SessionState>((set, get) => {
  /** Supabase 세션을 스토어에 반영 (마이그레이션까지 끝낸 뒤 화면이 프로필을 읽도록) */
  const activate = async (db: SupabaseClient, s: SupabaseSession): Promise<Session> => {
    const prev = getAuthUserId();
    setAuthUserId(s.user.id);
    if (prev !== s.user.id) await emitAccountChange('signedIn');
    await migrateOnce(db, s.user.id);
    const session = sessionFromSupabase(s);
    set({ session, status: 'ready' });
    return session;
  };

  /**
   * 오프라인 로그인 사용자: 세션 확인이 실패했지만(네트워크) 기기에 로그인 세션이 남아 있으면 게스트로 떨어뜨리지 않고
   * 마지막 세션 정보로 계정 저장소를 계속 쓴다. 게스트로 떨어지면 옛 로컬 백업이 화면에 뜨고, 그때 쓴 기록은 옮김 플래그 때문에
   * 다음 로그인 때 안 옮겨지고 로그아웃 때 지워졌다. 네트워크가 돌아오면 첫 서버 요청이 토큰을 갱신해 TOKEN_REFRESHED 로 이어진다.
   * 마이그레이션은 오프라인이라 건너뛰고 다음 실행(activate) 때 한다.
   * 반환: 세션 / 기기에 세션 없음(null) / 저장소를 못 읽음(undefined)
   */
  const restoreOffline = async (db: SupabaseClient): Promise<Session | null | undefined> => {
    let stored: Awaited<ReturnType<typeof readStoredAuthSession>>;
    try {
      stored = await readStoredAuthSession(db);
    } catch (e) {
      console.warn('[session] 저장된 로그인 세션 확인 실패', e);
      return undefined;
    }
    if (!stored) return null;
    const prev = getAuthUserId();
    setAuthUserId(stored.user.id);
    if (prev !== stored.user.id) await emitAccountChange('signedIn');
    const session = sessionFromSupabase(stored);
    set({ session, status: 'ready' });
    console.info('[session] 오프라인 — 이 기기에 남은 로그인으로 이어서 써요');
    return session;
  };

  const withActivate = async (db: SupabaseClient, run: Promise<AuthResult>): Promise<AuthResult> => {
    try {
      const res = await run;
      if (!res.ok) return res;
      const { data } = await db.auth.getSession();
      if (data.session) {
        const session = await activate(db, data.session);
        // Apple 첫 로그인 이름을 서버에 못 남겼을 때도 이번 세션 닉네임은 유지
        const fromRes = res.session.nickname;
        if (fromRes && fromRes !== NICKNAME_FALLBACK && (!session.nickname || session.nickname === NICKNAME_FALLBACK)) {
          const merged = { ...session, nickname: fromRes };
          set({ session: merged });
          return { ok: true, session: merged };
        }
        return { ok: true, session };
      }
      return res;
    } catch (e) {
      // 예전엔 어떤 예외든 "인터넷 연결"로 덮어 진짜 원인이 가려졌다 — 원인별 문구 + 원인 한 줄(detail)
      const f = classifyAuthError(e);
      console.warn('[session] 로그인 중 예외', f.detail ?? e);
      return { ok: false, ...f };
    }
  };

  const notConfigured: AuthResult = { ok: false, message: '서버 로그인이 설정되지 않았어요.' };

  return {
    session: null,
    status: 'loading',
    mode: getSupabase() ? 'supabase' : 'local',

    load: () => {
      if (loading) return loading;
      loading = (async () => {
        const db = getSupabase();
        if (!db) {
          try {
            const raw = await AsyncStorage.getItem(KEY);
            const parsed = raw ? (JSON.parse(raw) as Session) : null;
            const session = parsed ? { ...parsed, backend: 'local' as const } : null;
            set({ session, status: 'ready' });
            return session;
          } catch {
            set({ session: null, status: 'ready' });
            return null;
          }
        }

        if (!listening) {
          listening = true;
          // 콜백 안에서 Supabase 호출을 await 하면 교착될 수 있어 상태만 동기로 반영
          // INITIAL_SESSION 은 load 가 직접 처리한다 — 오프라인·만료면 null 로 오는데, 그걸로 지우면 오프라인 로그인 사용자가 게스트가 된다
          db.auth.onAuthStateChange((event, s) => {
            if (event === 'SIGNED_OUT') {
              const had = getAuthUserId() !== null;
              setAuthUserId(null);
              set({ session: null });
              if (had) void emitAccountChange('signedOut');
            } else if (s && (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
              setAuthUserId(s.user.id);
              set({ session: sessionFromSupabase(s) });
            }
          });
        }

        let checked = false;
        try {
          const { data, error } = await db.auth.getSession();
          if (data.session) return await activate(db, data.session);
          if (error) console.warn('[session] Supabase 세션 확인 실패', error);
          checked = !error;
        } catch (e) {
          console.warn('[session] Supabase 세션 확인 실패', e);
        }
        // 확인이 실패해도 기기에 로그인 세션이 남아 있으면 오프라인 로그인 사용자
        const offline = checked ? null : await restoreOffline(db);
        if (offline) return offline;
        // 확실히 로그아웃 상태일 때만(세션 확인 성공, 또는 기기에 세션이 없음): 이미 옮긴 백업을 비워 게스트로 새로 시작 (서버에는 남아 있다)
        if (checked || offline === null) await discardMigratedLocalBackup();
        setAuthUserId(null);
        set({ session: null, status: 'ready' });
        return null;
      })().finally(() => {
        loading = null;
      });
      return loading;
    },

    signIn: async (provider, nickname, email) => {
      const session: Session = {
        provider,
        nickname: nickname?.trim() || undefined,
        email: email?.trim() || undefined,
        createdAt: new Date().toISOString(),
        backend: 'local',
      };
      try {
        await AsyncStorage.setItem(KEY, JSON.stringify(session));
      } catch {
        // 저장 실패해도 이번 실행 동안은 로그인 상태 유지
      }
      set({ session, status: 'ready' });
      return session;
    },

    signUpEmail: async (email, password, nickname) => {
      const db = getSupabase();
      return db ? withActivate(db, emailSignUp(db, email, password, nickname)) : notConfigured;
    },

    signInEmail: async (email, password) => {
      const db = getSupabase();
      return db ? withActivate(db, emailSignIn(db, email, password)) : notConfigured;
    },

    signInOAuth: async (provider) => {
      const db = getSupabase();
      return db ? withActivate(db, oauthSignIn(db, provider)) : notConfigured;
    },

    signInApple: async () => {
      const db = getSupabase();
      return db ? withActivate(db, appleSignIn(db)) : notConfigured;
    },

    signOut: async () => {
      const db = getSupabase();
      if (db && get().session?.backend === 'supabase') {
        await signOutSupabase(db);
        await discardMigratedLocalBackup();
      }
      setAuthUserId(null);
      try {
        await AsyncStorage.removeItem(KEY);
      } catch {
        // 무시
      }
      set({ session: null });
      // 로그아웃·탈퇴·이 기기 데이터 지우기 모두 여기를 지난다: 다음 사람에게 이전 기록·즐겨찾기가 보이지 않게
      await clearFavorites();
      await emitAccountChange('signedOut');
    },
  };
});

/** 컴포넌트 밖에서 쓰는 단축 함수 */
export const signIn = (provider: AuthProvider, nickname?: string, email?: string) => useSession.getState().signIn(provider, nickname, email);
