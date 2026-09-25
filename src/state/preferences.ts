import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { MAX_REQUESTS, activeTags, addRequest, type AssistantRequest, type PrefTag } from '@/domain/preferences';
import { newId } from '@/services/id';

/**
 * 밀리에게 한 요청 (최대 MAX_REQUESTS 개) — 지금은 이 기기(AsyncStorage)에만 둔다.
 * 나중에 계정에 붙이려면 profile 처럼 repo 로 옮겨 Supabase 와 동기화하면 된다.
 * 즐겨찾기처럼 로그아웃·탈퇴·이 기기 데이터 지우기 때 지운다 (공용 기기에서 다른 사람에게 식습관이 보이지 않게).
 */
export const PREFERENCES_KEY = 'mealfit:assistantRequests';

export type AddResult = { ok: true } | { ok: false; reason: 'full' | 'empty' | 'duplicate' };

interface PreferencesState {
  items: AssistantRequest[];
  status: 'idle' | 'loading' | 'ready';
  load: () => Promise<void>;
  add: (req: Omit<AssistantRequest, 'id' | 'createdAt'>) => Promise<AddResult>;
  remove: (id: string) => Promise<void>;
}

async function persist(items: AssistantRequest[]) {
  try {
    await AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn('[preferences] 저장 실패', e);
  }
}

const valid = (x: unknown): x is AssistantRequest => {
  const r = x as AssistantRequest;
  return !!r && typeof r.id === 'string' && typeof r.text === 'string' && Array.isArray(r.tags);
};

export const usePreferences = create<PreferencesState>((set, get) => ({
  items: [],
  status: 'idle',

  load: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading' });
    try {
      const raw = await AsyncStorage.getItem(PREFERENCES_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const items = Array.isArray(parsed) ? parsed.filter(valid).slice(0, MAX_REQUESTS) : [];
      set({ items, status: 'ready' });
    } catch {
      set({ items: [], status: 'ready' });
    }
  },

  add: async (req) => {
    const r = addRequest(get().items, { ...req, id: newId(), createdAt: new Date().toISOString() });
    if (!r.ok) return r;
    set({ items: r.list });
    await persist(r.list);
    return { ok: true };
  },

  remove: async (id) => {
    const next = get().items.filter((x) => x.id !== id);
    set({ items: next });
    await persist(next);
  },
}));

/** 로그아웃·탈퇴·이 기기 데이터 지우기(session.signOut): 메모리와 기기에서 모두 지운다 */
export async function clearPreferences(): Promise<void> {
  usePreferences.setState({ items: [], status: 'ready' });
  try {
    await AsyncStorage.removeItem(PREFERENCES_KEY);
  } catch (e) {
    console.warn('[preferences] 지우기 실패', e);
  }
}

/** 처음 쓰는 화면에서 한 번 불러온다 */
export function ensurePreferencesLoaded() {
  if (usePreferences.getState().status === 'idle') void usePreferences.getState().load();
}

/** 식단·추천에 넘길 태그 (요청 목록이 바뀔 때만 새 배열) */
let lastItems: AssistantRequest[] | null = null;
let lastTags: PrefTag[] = [];
export function usePreferenceTags(): PrefTag[] {
  const items = usePreferences((s) => s.items);
  if (items !== lastItems) {
    lastItems = items;
    lastTags = activeTags(items);
  }
  return lastTags;
}
