import { getBrands, getMockStores, matchBrand } from '@/data';
import { haversineM, type LatLng } from '@/domain/geo';
import type { Brand, Store, StoreCategory } from '@/domain/types';

import { env } from './env';

export type Radius = 500 | 1000;

export interface KakaoPlace {
  id: string;
  place_name: string;
  category_name?: string;
  category_group_code?: string;
  phone?: string;
  address_name?: string;
  road_address_name?: string;
  x: string; // lng
  y: string; // lat
  place_url?: string;
  distance?: string;
}

export interface NearbyResult {
  stores: Store[];
  source: 'kakao' | 'mock';
}

/** 브랜드 하나당 최대 매장 수 (한 브랜드가 목록을 다 차지하지 않게) */
export const PER_BRAND_LIMIT = 3;
const CACHE_TTL_MS = 5 * 60 * 1000;
const ENDPOINT = 'https://dapi.kakao.com/v2/local/search/keyword.json';

/** 카카오 카테고리 그룹 코드 → 매장 카테고리 */
const GROUP_CATEGORY: Record<string, StoreCategory> = { CS2: 'convenience', CE7: 'cafe', FD6: 'other' };

/** 브랜드별 검색에 쓸 카테고리 그룹 (음식점은 그룹 코드 없이 키워드만) */
function groupFor(brand: Brand): string | undefined {
  if (brand.category === 'convenience') return 'CS2';
  if (brand.category === 'cafe') return 'CE7';
  return undefined;
}

/** 카카오 응답 한 건 → Store. 브랜드를 모르면 coverage none */
export function placeToStore(p: KakaoPlace, center: LatLng): Store | null {
  const lat = Number(p.y);
  const lng = Number(p.x);
  if (!p.id || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const brand = matchBrand(p.place_name);
  const d = Number(p.distance);
  const category: StoreCategory =
    brand?.category ?? (p.category_group_code ? GROUP_CATEGORY[p.category_group_code] : undefined) ?? (/베이커리|제과/.test(p.category_name ?? '') ? 'bakery' : 'other');
  return {
    id: p.id,
    name: p.place_name,
    brandId: brand?.id,
    category,
    coverage: brand?.coverage ?? 'none',
    distanceM: Math.round(p.distance && Number.isFinite(d) ? d : haversineM(center, { lat, lng })),
    address: p.road_address_name || p.address_name || undefined,
    lat,
    lng,
    phone: p.phone || undefined,
    placeUrl: p.place_url || undefined,
  };
}

/** 여러 검색 결과 병합: 반경 필터 → 중복 id 제거 → 브랜드별 상한 → 거리순 */
export function mergeStores(lists: Store[][], radiusM: number, perBrand = PER_BRAND_LIMIT): Store[] {
  const byId = new Map<string, Store>();
  for (const list of lists) {
    for (const s of list) {
      if (s.distanceM > radiusM) continue;
      const prev = byId.get(s.id);
      if (!prev || s.distanceM < prev.distanceM) byId.set(s.id, s);
    }
  }
  const sorted = [...byId.values()].sort((a, b) => a.distanceM - b.distanceM);
  const count = new Map<string, number>();
  return sorted.filter((s) => {
    const key = s.brandId ?? `_${s.id}`;
    const n = count.get(key) ?? 0;
    if (n >= perBrand) return false;
    count.set(key, n + 1);
    return true;
  });
}

async function searchKeyword(query: string, center: LatLng, radiusM: number, group: string | undefined, key: string, signal?: AbortSignal): Promise<KakaoPlace[]> {
  const params = new URLSearchParams({
    query,
    x: String(center.lng),
    y: String(center.lat),
    radius: String(radiusM),
    sort: 'distance',
    size: '15',
  });
  if (group) params.set('category_group_code', group);
  const res = await fetch(`${ENDPOINT}?${params.toString()}`, { headers: { Authorization: `KakaoAK ${key}` }, signal });
  if (!res.ok) throw new Error(`kakao ${res.status}`);
  const json = (await res.json()) as { documents?: KakaoPlace[] };
  return json.documents ?? [];
}

/** 목 매장을 반경으로 거른 결과 */
export function mockNearby(center: LatLng, radiusM: number): Store[] {
  return getMockStores(center).filter((s) => s.distanceM <= radiusM);
}

const cache = new Map<string, { at: number; value: NearbyResult }>();
export const cacheKey = (c: LatLng, radiusM: number) => `${c.lat.toFixed(3)},${c.lng.toFixed(3)}:${radiusM}`;
export function clearNearbyCache() {
  cache.clear();
}

/**
 * 주변 매장 검색 진입점. 카카오 키가 있으면 브랜드별 키워드 검색, 없거나 실패하면 목 매장.
 * 같은 좌표(소수 3자리)·반경은 5분간 메모리 캐시.
 */
export async function searchNearbyStores(opts: { lat: number; lng: number; radiusM: number; now?: number }): Promise<NearbyResult> {
  const center = { lat: opts.lat, lng: opts.lng };
  const now = opts.now ?? Date.now();
  const k = cacheKey(center, opts.radiusM);
  const hit = cache.get(k);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.value;

  let value: NearbyResult;
  const key = env.kakaoRestKey;
  if (!key) {
    value = { stores: mockNearby(center, opts.radiusM), source: 'mock' };
  } else {
    try {
      const results = await Promise.allSettled(
        getBrands().map(async (b) => {
          const docs = await searchKeyword(b.name, center, opts.radiusM, groupFor(b), key);
          return docs
            .map((d) => placeToStore(d, center))
            .filter((s): s is Store => !!s && s.brandId === b.id);
        }),
      );
      const ok = results.filter((r): r is PromiseFulfilledResult<Store[]> => r.status === 'fulfilled');
      if (ok.length === 0) throw new Error('kakao all failed');
      value = { stores: mergeStores(ok.map((r) => r.value), opts.radiusM), source: 'kakao' };
    } catch (e) {
      console.warn('[kakao] 검색 실패 → 목 매장', e);
      value = { stores: mockNearby(center, opts.radiusM), source: 'mock' };
      // 실패 결과는 캐시하지 않는다 (다음 새로고침에 다시 시도)
      return value;
    }
  }
  cache.set(k, { at: now, value });
  return value;
}
