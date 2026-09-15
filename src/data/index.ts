import type { Brand, MenuItem, Store } from '@/domain/types';

export function getBrands(): Brand[] {
  throw new Error('not implemented');
}
export function getBrand(_id: string): Brand | undefined {
  throw new Error('not implemented');
}
export function getMenusByBrand(_brandId: string): MenuItem[] {
  throw new Error('not implemented');
}
export function getMenu(_id: string): MenuItem | undefined {
  throw new Error('not implemented');
}
/** 카카오 place_name → 브랜드 매칭 ("GS25 역삼센터점" → gs25) */
export function matchBrand(_placeName: string): Brand | undefined {
  throw new Error('not implemented');
}
/** 카카오 키가 없을 때 쓰는 목 매장 (역삼동 기준, 시안의 4곳 포함) */
export function getMockStores(_center: { lat: number; lng: number }): Store[] {
  throw new Error('not implemented');
}
