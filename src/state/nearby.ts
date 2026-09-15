import { Platform } from 'react-native';
import { create } from 'zustand';

import { YEOKSAM_CENTER } from '@/data/mockStores';
import type { LatLng } from '@/domain/geo';
import type { Store, StoreCategory } from '@/domain/types';
import { searchNearbyStores, type Radius } from '@/services/kakao';
import * as location from '@/services/location';

export type NearbyStatus = 'idle' | 'locating' | 'loading' | 'ready' | 'denied' | 'error';
export type CategoryFilter = 'all' | StoreCategory;

/** 웹 미리보기처럼 위치를 못 잡는 환경에서 쓰는 데모 동네 */
export const DEMO_AREA = { center: YEOKSAM_CENTER, name: '서울 강남구 역삼동' };

interface NearbyState {
  center: LatLng | null;
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
  /** 위치 다시 잡고 매장 검색. relocate=false 면 기존 좌표로 반경만 다시 검색 */
  refresh: (opts?: { relocate?: boolean }) => Promise<void>;
  findStore: (id: string) => Store | undefined;
}

let seq = 0;

export const useNearby = create<NearbyState>((set, get) => ({
  center: null,
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
    let center = get().center;
    let areaName = get().areaName;

    if (relocate || !center) {
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

  findStore: (id) => get().stores.find((s) => s.id === id),
}));

function sameArea(a: LatLng, b: LatLng) {
  return Math.abs(a.lat - b.lat) < 0.002 && Math.abs(a.lng - b.lng) < 0.002;
}

/** 카테고리 필터 적용 */
export function filterStores(stores: Store[], category: CategoryFilter): Store[] {
  return category === 'all' ? stores : stores.filter((s) => s.category === category);
}
