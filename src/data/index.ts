import type { Brand, MenuItem, Store } from '../domain/types';
import brandsJson from './brands.json';
import menusJson from './menus.json';
import { getMockStores as buildMockStores } from './mockStores';

const BRANDS = brandsJson as Brand[];
const MENUS = menusJson as unknown as MenuItem[];

const brandById = new Map(BRANDS.map((b) => [b.id, b]));
const menuById = new Map(MENUS.map((m) => [m.id, m]));
const menusByBrand = new Map<string, MenuItem[]>();
for (const m of MENUS) {
  const list = menusByBrand.get(m.brandId) ?? [];
  list.push(m);
  menusByBrand.set(m.brandId, list);
}

/** 대소문자·공백·기호 무시 비교용 */
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

// 긴 키워드부터 비교해 "CU" 같은 짧은 키워드가 먼저 잡히지 않게 한다
const KEYWORD_INDEX = BRANDS.flatMap((b) => b.matchKeywords.map((k) => ({ key: normalizeName(k), brand: b })))
  .filter((x) => x.key.length > 0)
  .sort((a, b) => b.key.length - a.key.length);

export function getBrands(): Brand[] {
  return BRANDS;
}
export function getBrand(id: string): Brand | undefined {
  return brandById.get(id);
}
export function getMenus(): MenuItem[] {
  return MENUS;
}
export function getMenusByBrand(brandId: string): MenuItem[] {
  return menusByBrand.get(brandId) ?? [];
}
export function getMenu(id: string): MenuItem | undefined {
  return menuById.get(id);
}
/** 카카오 place_name → 브랜드 매칭 ("GS25 역삼센터점" → gs25) */
export function matchBrand(placeName: string): Brand | undefined {
  const name = normalizeName(placeName ?? '');
  if (!name) return undefined;
  return KEYWORD_INDEX.find((x) => name.includes(x.key))?.brand;
}
/** 카카오 키가 없을 때 쓰는 목 매장 (역삼동 기준, 시안의 4곳 포함) */
export function getMockStores(center: { lat: number; lng: number }): Store[] {
  return buildMockStores(center);
}
