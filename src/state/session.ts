import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

/** MVP 로컬 세션 — Supabase Auth 연결 전까지 provider·닉네임·생성 시각만 저장 */
export type AuthProvider = 'kakao' | 'apple' | 'email';

export interface Session {
  provider: AuthProvider;
  nickname?: string;
  email?: string;
  createdAt: string;
}

const KEY = 'mealfit:session';

interface SessionState {
  session: Session | null;
  status: 'loading' | 'ready';
  load: () => Promise<Session | null>;
  signIn: (provider: AuthProvider, nickname?: string, email?: string) => Promise<Session>;
  signOut: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  session: null,
  status: 'loading',
  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const session = raw ? (JSON.parse(raw) as Session) : null;
      set({ session, status: 'ready' });
      return session;
    } catch {
      set({ session: null, status: 'ready' });
      return null;
    }
  },
  signIn: async (provider, nickname, email) => {
    const session: Session = { provider, nickname: nickname?.trim() || undefined, email: email?.trim() || undefined, createdAt: new Date().toISOString() };
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(session));
    } catch {
      // 저장 실패해도 이번 실행 동안은 로그인 상태 유지
    }
    set({ session, status: 'ready' });
    return session;
  },
  signOut: async () => {
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      // 무시
    }
    set({ session: null });
  },
}));

/** 컴포넌트 밖에서 쓰는 단축 함수 */
export const signIn = (provider: AuthProvider, nickname?: string, email?: string) => useSession.getState().signIn(provider, nickname, email);
