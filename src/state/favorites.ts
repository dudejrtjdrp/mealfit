import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { MealLog, MenuItem } from '@/domain/types';

/**
 * 자주 먹는 메뉴(즐겨찾기) — 로그인 여부와 무관하게 이 기기(AsyncStorage)에 둔다.
 * menuId 목록 + 이름 스냅샷. 서버 검색으로만 찾을 수 있는 시판 제품은 다음 실행 때 다시 찾을 수 없어서 메뉴 전체를 같이 적어 둔다.
 */
export interface FavoriteEntry {
  menuId: string;
  name: string;
  storeName?: string;
  addedAt: string;
  /** 앱 번들에서 다시 찾을 수 없는 메뉴(서버 제품)만 — 영양 원본 그대로 */
  menu?: MenuItem;
}

export const FAVORITES_KEY = 'mealfit:favorites';

interface FavoritesState {
  items: FavoriteEntry[];
  status: 'idle' | 'loading' | 'ready';
  load: () => Promise<void>;
  /** 담겨 있으면 빼고, 없으면 맨 앞에 담는다. 결과 상태(담김=true)를 돌려준다 */
  toggle: (entry: Omit<FavoriteEntry, 'addedAt'>) => Promise<boolean>;
  remove: (menuId: string) => Promise<void>;
}

async function persist(items: FavoriteEntry[]) {
  try {
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn('[favorites] 저장 실패', e);
  }
}

export const useFavorites = create<FavoritesState>((set, get) => ({
  items: [],
  status: 'idle',

  load: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading' });
    try {
      const raw = await AsyncStorage.getItem(FAVORITES_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const items = Array.isArray(parsed) ? (parsed as FavoriteEntry[]).filter((x) => x && typeof x.menuId === 'string' && typeof x.name === 'string') : [];
      set({ items, status: 'ready' });
    } catch {
      set({ items: [], status: 'ready' });
    }
  },

  toggle: async (entry) => {
    const { items } = get();
    const has = items.some((x) => x.menuId === entry.menuId);
    const next = has ? items.filter((x) => x.menuId !== entry.menuId) : [{ ...entry, addedAt: new Date().toISOString() }, ...items];
    set({ items: next });
    await persist(next);
    return !has;
  },

  remove: async (menuId) => {
    const next = get().items.filter((x) => x.menuId !== menuId);
    set({ items: next });
    await persist(next);
  },
}));

/** 처음 쓰는 화면에서 한 번 불러온다 */
export function ensureFavoritesLoaded() {
  if (useFavorites.getState().status === 'idle') void useFavorites.getState().load();
}

export function useIsFavorite(menuId: string | undefined): boolean {
  return useFavorites((s) => !!menuId && s.items.some((x) => x.menuId === menuId));
}

const norm = (s: string) => s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
/** 같은 메뉴 판별 키: 메뉴 id 가 있으면 그것, 없으면(직접 입력) 이름 */
export const logKey = (l: Pick<MealLog, 'menuId' | 'name'>) => (l.menuId ? `m:${l.menuId}` : `n:${norm(l.name)}`);

export interface FrequentItem {
  key: string;
  name: string;
  menuId?: string;
  /** 가장 최근에 먹은 기록 (있으면 다시 기록할 때 옵션·영양을 그대로 쓴다) */
  lastLog?: MealLog;
  /** 기간 안에 먹은 횟수 */
  count: number;
  favorite?: FavoriteEntry;
}

/**
 * "자주 먹어요" 목록: 즐겨찾기(최근 담은 순) → 기간 안에 2번 이상 먹은 것(많이 먹은 순, 같으면 최근 순).
 * 같은 메뉴는 한 번만 — 즐겨찾기 행에도 최근 기록을 붙인다.
 */
export function rankFrequent(logs: MealLog[], favorites: FavoriteEntry[], limit = 8): FrequentItem[] {
  const byKey = new Map<string, { count: number; last: MealLog }>();
  for (const l of logs) {
    const k = logKey(l);
    const cur = byKey.get(k);
    if (!cur) byKey.set(k, { count: 1, last: l });
    else {
      cur.count += 1;
      if (l.time > cur.last.time) cur.last = l;
    }
  }
  const out: FrequentItem[] = [];
  const seen = new Set<string>();
  for (const f of [...favorites].sort((a, b) => b.addedAt.localeCompare(a.addedAt))) {
    const k = `m:${f.menuId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const hit = byKey.get(k);
    out.push({ key: k, name: f.name, menuId: f.menuId, lastLog: hit?.last, count: hit?.count ?? 0, favorite: f });
  }
  const often = [...byKey.entries()]
    .filter(([k, v]) => v.count >= 2 && !seen.has(k))
    .sort(([, a], [, b]) => b.count - a.count || b.last.time.localeCompare(a.last.time));
  for (const [k, v] of often) {
    out.push({ key: k, name: v.last.name, menuId: v.last.menuId, lastLog: v.last, count: v.count });
  }
  return out.slice(0, limit);
}
