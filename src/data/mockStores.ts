import { haversineM, offsetLatLng, type LatLng } from '../domain/geo';
import type { Brand, Store } from '../domain/types';
import brandsJson from './brands.json';
import { placeDishQueries } from './placeDishes';

/** 역삼동 기준 좌표 (역삼역 인근) */
export const YEOKSAM_CENTER: LatLng = { lat: 37.5006, lng: 127.0366 };

const BRANDS = brandsJson as Brand[];

/**
 * 시안 D1의 4곳 + α. 거리(m)와 방위각으로 center 기준 좌표를 만든다.
 * brandId 가 없는 곳은 브랜드 아닌 동네 식당 — 카카오 분류(placeCategory)로 대표 음식을 추정해 보여준다 (일반 식당 기준).
 */
const MOCK: { id: string; name: string; brandId?: string; placeCategory?: string; distance: number; bearing: number; address: string }[] = [
  { id: 'mock-gs25-yeoksam-center', name: 'GS25 역삼센터점', brandId: 'gs25', distance: 120, bearing: 40, address: '서울 강남구 테헤란로 146' },
  { id: 'mock-starbucks-yeoksam-station', name: '스타벅스 역삼역점', brandId: 'starbucks', distance: 180, bearing: 250, address: '서울 강남구 테헤란로 134' },
  { id: 'mock-salady-gangnam', name: '샐러디 강남점', brandId: 'salady', distance: 260, bearing: 300, address: '서울 강남구 역삼로 120' },
  { id: 'mock-cu-yeoksam-teheran', name: 'CU 역삼테헤란점', brandId: 'cu', distance: 310, bearing: 95, address: '서울 강남구 테헤란로 152' },
  { id: 'mock-seven-yeoksam-star', name: '세븐일레븐 역삼스타점', brandId: 'seven_eleven', distance: 350, bearing: 170, address: '서울 강남구 논현로 508' },
  { id: 'mock-mega-yeoksam', name: '메가MGC커피 역삼점', brandId: 'mega', distance: 380, bearing: 20, address: '서울 강남구 역삼로 180' },
  { id: 'mock-bonjuk-yeoksam', name: '본죽 역삼점', brandId: 'bonjuk', distance: 420, bearing: 210, address: '서울 강남구 역삼로 111' },
  { id: 'mock-subway-yeoksam-station', name: '서브웨이 역삼역점', brandId: 'subway', distance: 460, bearing: 120, address: '서울 강남구 테헤란로 156' },
  { id: 'mock-ediya-yeoksam-central', name: '이디야커피 역삼중앙점', brandId: 'ediya', distance: 540, bearing: 330, address: '서울 강남구 역삼로 150' },
  { id: 'mock-parisbaguette-yeoksam', name: '파리바게뜨 역삼점', brandId: 'paris_baguette', distance: 650, bearing: 70, address: '서울 강남구 테헤란로 201' },
  { id: 'mock-gukbap-yeoksam', name: '역삼 돼지국밥', placeCategory: '음식점 > 한식 > 국밥', distance: 240, bearing: 140, address: '서울 강남구 역삼로 132' },
  { id: 'mock-jjigae-yeoksam', name: '역삼 찌개집', placeCategory: '음식점 > 한식 > 찌개,전골', distance: 490, bearing: 230, address: '서울 강남구 논현로 512' },
];

/** 카카오 키가 없을 때 쓰는 목 매장 — 거리순 */
export function getMockStores(center: LatLng = YEOKSAM_CENTER): Store[] {
  return MOCK.map((m) => {
    const brand = m.brandId ? BRANDS.find((b) => b.id === m.brandId) : undefined;
    const pos = offsetLatLng(center, m.distance, m.bearing);
    // 브랜드 아닌 식당: 대표 음식 단서가 있으면 '일부'(추정 메뉴만) — 카카오 placeToStore 와 같은 규칙
    const estimated = !brand && placeDishQueries(m.name, m.placeCategory).length > 0;
    const store: Store = {
      id: m.id,
      name: m.name,
      brandId: brand?.id,
      category: brand?.category ?? (m.placeCategory && /음식점 > (한식|분식)/.test(m.placeCategory) ? 'korean' : 'other'),
      coverage: brand?.coverage ?? (estimated ? 'partial' : 'none'),
      distanceM: Math.round(haversineM(center, pos)),
      address: m.address,
      lat: pos.lat,
      lng: pos.lng,
    };
    if (m.placeCategory) store.placeCategory = m.placeCategory;
    return store;
  }).sort((a, b) => a.distanceM - b.distanceM);
}
