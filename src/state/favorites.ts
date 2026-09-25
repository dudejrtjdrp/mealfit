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
  /** 되돌리기: 뺀 항목을 담았던 시각(addedAt) 그대로 제자리에 되돌린다 (이미 있으면 그대로) */
  restore: (entry: FavoriteEntry) => Promise<void>;
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

  restore: async (entry) => {
    const { items } = get();
    if (items.some((x) => x.menuId === entry.menuId)) return;
    const next = [...items, entry].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    set({ items: next });
    await persist(next);
  },
}));

/**
 * 로그아웃·탈퇴·이 기기 데이터 지우기: 즐겨찾기를 메모리와 기기에서 모두 지운다.
 * 즐겨찾기는 계정이 아니라 기기에 있어, 두면 다음에 이 기기를 쓰는 사람(공용 기기)에게 그대로 보인다.
 * 같은 사람이 다시 로그인하면 잃는 셈이지만, 남의 식습관이 보이는 쪽이 더 나빠 로그아웃에도 지운다.
 */
export async function clearFavorites(): Promise<void> {
  useFavorites.setState({ items: [], status: 'ready' });
  try {
    await AsyncStorage.removeItem(FAVORITES_KEY);
  } catch (e) {
    console.warn('[favorites] 지우기 실패', e);
  }
}

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
 * 즐겨찾기는 사용자가 직접 담은 것이라 limit 로 자르지 않고 전부 싣는다. limit 는 빈도 항목이 채울 자리
 * (전체가 limit 가 될 때까지) — 즐겨찾기가 limit 이상이면 빈도 항목은 붙지 않는다.
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
  const room = Math.max(0, limit - out.length);
  const often = [...byKey.entries()]
    .filter(([k, v]) => v.count >= 2 && !seen.has(k))
    .sort(([, a], [, b]) => b.count - a.count || b.last.time.localeCompare(a.last.time))
    .slice(0, room);
  for (const [k, v] of often) {
    out.push({ key: k, name: v.last.name, menuId: v.last.menuId, lastLog: v.last, count: v.count });
  }
  return out;
}
