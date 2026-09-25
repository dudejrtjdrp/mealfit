import { estimatedMenusForPlace, getBrands, getMockStores, matchBrand } from '@/data';
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
const CATEGORY_ENDPOINT = 'https://dapi.kakao.com/v2/local/search/category.json';
/** 주변 음식점(FD6) 분류 검색 페이지 수 (한 페이지 15곳, 가까운 순) — 브랜드가 아닌 동네 식당을 찾는다 */
export const RESTAURANT_PAGES = 2;
/** 대표 음식으로 추정해 보여줄 브랜드 아닌 식당 최대 수 (목록이 동네 식당으로 가득 차지 않게) */
export const GENERIC_PLACE_LIMIT = 8;

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
  const cat = p.category_name ?? '';
  const category: StoreCategory =
    brand?.category ??
    (/베이커리|제과/.test(cat) ? 'bakery' : /음식점 > (한식|분식)/.test(cat) ? 'korean' : undefined) ??
    (p.category_group_code ? GROUP_CATEGORY[p.category_group_code] : undefined) ??
    'other';
  // 브랜드가 아닌 식당은 이름·분류로 대표 음식을 추정할 수 있으면 '일부'(추정 메뉴만), 아니면 정보 없음
  const estimated = !brand && estimatedMenusForPlace(p.place_name, cat || undefined).length > 0;
  return {
    id: p.id,
    name: p.place_name,
    brandId: brand?.id,
    category,
    coverage: brand?.coverage ?? (estimated ? 'partial' : 'none'),
    distanceM: Math.round(p.distance && Number.isFinite(d) ? d : haversineM(center, { lat, lng })),
    address: p.road_address_name || p.address_name || undefined,
    lat,
    lng,
    phone: p.phone || undefined,
    placeUrl: p.place_url || undefined,
    ...(cat ? { placeCategory: cat } : {}),
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

/** 카카오 분류 검색 (가까운 순 한 페이지) */
async function searchCategory(group: string, center: LatLng, radiusM: number, page: number, key: string): Promise<KakaoPlace[]> {
  const params = new URLSearchParams({
    category_group_code: group,
    x: String(center.lng),
    y: String(center.lat),
    radius: String(radiusM),
    sort: 'distance',
    page: String(page),
    size: '15',
  });
  const res = await fetch(`${CATEGORY_ENDPOINT}?${params.toString()}`, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!res.ok) throw new Error(`kakao ${res.status}`);
  const json = (await res.json()) as { documents?: KakaoPlace[] };
  return json.documents ?? [];
}

/**
 * 브랜드가 아닌 동네 식당 중 대표 음식을 추정할 수 있는 곳만, 가까운 순 limit 곳.
 * ("○○돼지국밥"·"음식점 > 한식 > 국밥" → 돼지국밥·순대국밥 … 일반 식당 기준 추정)
 */
export function pickGenericPlaces(stores: Store[], limit = GENERIC_PLACE_LIMIT): Store[] {
  return stores
    .filter((s) => !s.brandId && s.coverage !== 'none')
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
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
 * 주변 매장 검색 진입점. 카카오 키가 있으면 브랜드별 키워드 검색 + 음식점 분류 검색(브랜드 아닌 동네 식당 중
 * 대표 음식을 추정할 수 있는 곳 GENERIC_PLACE_LIMIT 곳까지), 없거나 실패하면 목 매장.
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
        // 매장 키워드가 없는 가상 브랜드(시판 제품·일반 식당)는 검색하지 않는다
        getBrands()
          .filter((b) => b.matchKeywords.length > 0)
          .map(async (b) => {
            const docs = await searchKeyword(b.name, center, opts.radiusM, groupFor(b), key);
            return docs
              .map((d) => placeToStore(d, center))
              .filter((s): s is Store => !!s && s.brandId === b.id);
          }),
      );
      const ok = results.filter((r): r is PromiseFulfilledResult<Store[]> => r.status === 'fulfilled');
      if (ok.length === 0) throw new Error('kakao all failed');
      // 브랜드 아닌 동네 식당 (음식점 분류 검색) — 실패해도 브랜드 매장은 그대로 보여준다
      const pages = await Promise.allSettled(
        Array.from({ length: RESTAURANT_PAGES }, (_, i) => searchCategory('FD6', center, opts.radiusM, i + 1, key)),
      );
      const places = pages
        .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
        .map((d) => placeToStore(d, center))
        .filter((s): s is Store => !!s);
      const generic = pickGenericPlaces(places);
      value = { stores: mergeStores([...ok.map((r) => r.value), generic], opts.radiusM), source: 'kakao' };
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
