import { Platform } from 'react-native';
import { create } from 'zustand';

import { normalizeName } from '@/data';
import { YEOKSAM_CENTER } from '@/data/mockStores';
import type { LatLng } from '@/domain/geo';
import type { Brand, Judgement, MenuItem, Store, StoreCategory, Verdict } from '@/domain/types';
import { searchNearbyStores, type Radius } from '@/services/kakao';
import * as location from '@/services/location';

export type NearbyStatus = 'idle' | 'locating' | 'loading' | 'ready' | 'denied' | 'error';
export type CategoryFilter = 'all' | StoreCategory;

/** 웹 미리보기처럼 위치를 못 잡는 환경에서 쓰는 데모 동네 */
export const DEMO_AREA = { center: YEOKSAM_CENTER, name: '서울 강남구 역삼동' };

/** 사용자가 지도에서 직접 정한 검색 기준 위치 */
export interface PinnedLocation {
  center: LatLng;
  name: string;
}

interface NearbyState {
  /** 지금 검색 기준 좌표 (pinned 가 있으면 그 좌표, 없으면 GPS) */
  center: LatLng | null;
  /** 사용자 지정 위치. null 이면 GPS 현재 위치를 쓴다 (앱을 다시 켜면 GPS 로 돌아간다) */
  pinned: PinnedLocation | null;
  areaName: string;
  radiusM: Radius;
  category: CategoryFilter;
  stores: Store[];
  status: NearbyStatus;
  source: 'kakao' | 'mock' | null;
  /** 마지막으로 불러온 시각 (ms) */
  loadedAt: number | null;
  setRadius: (r: Radius) => void;
  setCategory: (c: CategoryFilter) => void;
  /** 위치 다시 잡고 매장 검색. relocate=false 면 기존 좌표로 반경만 다시 검색. 지정 위치가 있으면 GPS 를 쓰지 않는다 */
  refresh: (opts?: { relocate?: boolean }) => Promise<void>;
  /** 지도에서 고른 위치로 기준을 바꾸고 다시 검색 */
  setPinnedLocation: (center: LatLng, name: string) => Promise<void>;
  /** 지정 위치를 지우고 GPS 현재 위치로 다시 검색 */
  clearPinnedLocation: () => Promise<void>;
  findStore: (id: string) => Store | undefined;
}

let seq = 0;

export const useNearby = create<NearbyState>((set, get) => ({
  center: null,
  pinned: null,
  areaName: '',
  radiusM: 500,
  category: 'all',
  stores: [],
  status: 'idle',
  source: null,
  loadedAt: null,

  setRadius: (radiusM) => {
    if (get().radiusM === radiusM) return;
    set({ radiusM });
    void get().refresh({ relocate: false });
  },

  setCategory: (category) => set({ category }),

  refresh: async (opts) => {
    const my = ++seq;
    const relocate = opts?.relocate ?? true;
    const pinned = get().pinned;
    let center = get().center;
    let areaName = get().areaName;

    if (pinned) {
      center = pinned.center;
      areaName = pinned.name;
      set({ center, areaName });
    } else if (relocate || !center) {
      set({ status: 'locating' });
      const pos = await location.getCurrentPosition();
      if (my !== seq) return;
      if (pos) {
        center = pos;
        areaName = get().center && sameArea(get().center!, pos) && areaName ? areaName : '';
      } else if (Platform.OS === 'web') {
        // 웹은 위치를 못 잡는 경우가 많아 역삼동 데모로 보여준다
        center = DEMO_AREA.center;
        areaName = DEMO_AREA.name;
      } else {
        const perm = await location.getPermissionStatus();
        if (my !== seq) return;
        set({ status: perm === 'granted' ? 'error' : 'denied', stores: [] });
        return;
      }
      set({ center, areaName });
      if (!areaName) {
        const c = center;
        void location.reverseGeocode(c.lat, c.lng).then((name) => {
          if (get().center === c) set({ areaName: name });
        });
      }
    }

    set({ status: 'loading' });
    try {
      const { stores, source } = await searchNearbyStores({ lat: center.lat, lng: center.lng, radiusM: get().radiusM });
      if (my !== seq) return;
      set({ stores, source, status: 'ready', loadedAt: Date.now() });
    } catch (e) {
      console.warn('[nearby] refresh 실패', e);
      if (my !== seq) return;
      set({ status: 'error' });
    }
  },

  setPinnedLocation: async (center, name) => {
    set({ pinned: { center, name }, center, areaName: name, stores: [], loadedAt: null });
    await get().refresh({ relocate: false });
  },

  clearPinnedLocation: async () => {
    // 지정 위치 이름이 GPS 라벨로 남지 않게 비우고 GPS 로 다시 잡는다
    set({ pinned: null, areaName: '', stores: [], loadedAt: null });
    await get().refresh({ relocate: true });
  },

  findStore: (id) => get().stores.find((s) => s.id === id),
}));

function sameArea(a: LatLng, b: LatLng) {
  return Math.abs(a.lat - b.lat) < 0.002 && Math.abs(a.lng - b.lng) < 0.002;
}

/** 카테고리 필터 적용 */
export function filterStores(stores: Store[], category: CategoryFilter): Store[] {
  return category === 'all' ? stores : stores.filter((s) => s.category === category);
}

/** 정보 있는 매장(위) · 정보 없는 매장(아래 한 줄로 접는다)으로 나눈다. 순서는 그대로 */
export function splitByInfo(stores: Store[]): { known: Store[]; noInfo: Store[] } {
  const known: Store[] = [];
  const noInfo: Store[] = [];
  for (const s of stores) (s.coverage === 'none' || !s.brandId ? noInfo : known).push(s);
  return { known, noInfo };
}

/** 주변 목록에서 그 브랜드의 가장 가까운 매장 (검색에서 브랜드를 고를 때) */
export function nearestOfBrand(stores: Store[], brandId: string): Store | undefined {
  let best: Store | undefined;
  for (const s of stores) if (s.brandId === brandId && (!best || s.distanceM < best.distanceM)) best = s;
  return best;
}

/** 브랜드 이름·매칭 키워드로 찾기 (대소문자·공백·기호 무시). 이름이 검색어로 시작하는 브랜드가 앞 */
export function searchBrands(brands: Brand[], query: string): Brand[] {
  const q = normalizeName(query);
  if (!q) return [];
  const hits: { b: Brand; rank: number }[] = [];
  for (const b of brands) {
    if (b.matchKeywords.length === 0) continue; // 시판 제품 가상 브랜드 등 매장이 아닌 것
    const name = normalizeName(b.name);
    const rank = name.startsWith(q) ? 0 : name.includes(q) ? 1 : b.matchKeywords.some((k) => normalizeName(k).includes(q)) ? 2 : -1;
    if (rank >= 0) hits.push({ b, rank });
  }
  return hits.sort((a, b) => a.rank - b.rank).map((h) => h.b);
}

export interface RankedMenu {
  menu: MenuItem;
  judgement: Judgement;
}

/** 매장 메뉴를 판정별로 묶는다 (각 묶음 안은 들어온 순서 = 순위 순). 정보 없는 메뉴는 따로 */
export function groupByVerdict<T extends RankedMenu>(ranked: T[]): Record<Verdict | 'unknown', T[]> {
  const out: Record<Verdict | 'unknown', T[]> = { good: [], ok: [], pass: [], unknown: [] };
  for (const r of ranked) out[r.judgement.unknown ? 'unknown' : r.judgement.verdict].push(r);
  return out;
}

export interface StorePick {
  /** 판정 좋음 메뉴 수 */
  good: number;
  /** 판정 괜찮음 메뉴 수 */
  ok: number;
  /** 영양 정보가 있는 메뉴 수 */
  known: number;
  /** 1순위 메뉴 (좋음·괜찮음 중에서만 — 오늘은 패스 메뉴는 추천하지 않는다) */
  top: RankedMenu | null;
}

/** 매장 카드 한 줄 요약용 — rankMenus 결과(순위 순)를 받는다 */
export function summarizeRanked(ranked: RankedMenu[]): StorePick {
  let good = 0;
  let ok = 0;
  let known = 0;
  let top: RankedMenu | null = null;
  for (const r of ranked) {
    if (r.judgement.unknown) continue;
    known++;
    if (r.judgement.verdict === 'good') good++;
    else if (r.judgement.verdict === 'ok') ok++;
    if (!top && r.judgement.verdict !== 'pass') top = r;
  }
  return { good, ok, known, top };
}
