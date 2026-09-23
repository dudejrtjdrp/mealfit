import type { Brand, MenuItem, Store } from '../domain/types';
import brandsJson from './brands.json';
import mfdsJson from './generated/mfds.json';
import { mergeBrands, mergeMenus } from './ingest/nutrition';
import menusJson from './menus.json';
import { getMockStores as buildMockStores } from './mockStores';

/** scripts/ingest-nutrition.mjs 가 만드는 식약처 공공데이터 번들 */
interface MfdsBundle {
  meta: { generatedAt: string | null; sources: unknown[] };
  brands: Brand[];
  menus: MenuItem[];
}
const MFDS = mfdsJson as unknown as MfdsBundle;

// 손으로 만든 시드 + 공공데이터 (정책은 mergeMenus 참고):
// 공공데이터 official 20개 이상 브랜드는 시드 estimated 를 목록에서 빼고, 같은 브랜드·메뉴명의 추정치는 공식값으로 교체, 나머지는 추가
const MERGED = mergeMenus(menusJson as unknown as MenuItem[], MFDS.menus);
const MENUS = MERGED.menus;
const BRANDS = mergeBrands(brandsJson as Brand[], MFDS.brands, MENUS);

const brandById = new Map(BRANDS.map((b) => [b.id, b]));
// 목록에서 뺀 시드 메뉴도 id 로는 찾을 수 있게 둔다 — 예전 기록(menuId)·딥링크가 "정보 없음"으로 바뀌지 않게
const menuById = new Map([...MERGED.hidden, ...MENUS].map((m) => [m.id, m]));
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
/** 시드 정리 정책 결과 (목록에서 뺀/남긴 시드 메뉴 수) — 검증·디버그용 */
export function getSeedPolicy() {
  return MERGED.seedPolicy;
}

// 기록 추가(E2) 검색용: 정규화 이름을 한 번만 계산해 두고(1만여 개), 키 입력마다 정규식을 다시 돌리지 않는다
let searchIndex: { menu: MenuItem; key: string; brandKey: string }[] | null = null;
/** 메뉴명 또는 브랜드명에 검색어가 들어간 메뉴를 목록 순서대로 최대 limit 개 (찾는 즉시 멈춘다) */
export function searchMenus(query: string, limit = 40): MenuItem[] {
  const q = normalizeName(query);
  if (!q) return [];
  if (!searchIndex) {
    const brandKeys = new Map(BRANDS.map((b) => [b.id, normalizeName(b.name)]));
    searchIndex = MENUS.map((m) => ({ menu: m, key: normalizeName(m.name), brandKey: brandKeys.get(m.brandId) ?? '' }));
  }
  const out: MenuItem[] = [];
  for (const x of searchIndex) {
    if (x.key.includes(q) || x.brandKey.includes(q)) {
      out.push(x.menu);
      if (out.length >= limit) break;
    }
  }
  return out;
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
