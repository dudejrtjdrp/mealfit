import type { Brand, MenuItem, Store } from '../domain/types';
import brandsJson from './brands.json';
import { mergeSeedOptionsIntoOfficial } from './dedupe';
import { applyPerSlice } from './perSlice';
import { DATASETS, PACKAGED_BRAND_ID, mergeBrands, mergeMenus } from './ingest/nutrition';
import { getMockStores as buildMockStores } from './mockStores';

/** scripts/ingest-nutrition.mjs 가 만드는 식약처 공공데이터 번들 */
interface MfdsBundle {
  meta: { generatedAt: string | null; sources: unknown[] };
  brands: Brand[];
  menus: MenuItem[];
}

/** scripts/ingest-nutrition.mjs 가 만드는 시판 제품 번들 (라면·과자·음료 등 — brandId·출처는 메타로 접어 둔다) */
interface ProductsBundle {
  meta: { count: number };
  menus: MenuItem[];
}

/** 시판 제품 전체가 속하는 가상 브랜드 — 매장 매칭 키워드는 비워 둔다(장소 이름과 매칭되면 안 됨) */
const PACKAGED_BRAND: Brand = { id: PACKAGED_BRAND_ID, name: '가공식품', category: 'convenience', matchKeywords: [], coverage: 'full' };

interface Catalog {
  brands: Brand[];
  menus: MenuItem[];
  brandById: Map<string, Brand>;
  menuById: Map<string, MenuItem>;
  menusByBrand: Map<string, MenuItem[]>;
  keywordIndex: { key: string; brand: Brand }[];
  seedPolicy: ReturnType<typeof mergeMenus>['seedPolicy'];
  /** 공식 사이즈판과 겹쳐 목록에서 뺀(옵션은 공식판으로 옮긴) 시드 옵션판 수, 브랜드별 */
  mergedSeedsByBrand: Record<string, number>;
  /** 1조각 기준으로 바꾼 피자·조각 메뉴로 대신한 홀케이크 수 (브랜드별) */
  perSlice: { slicedByBrand: Record<string, number>; cakesByBrand: Record<string, number> };
}

/**
 * 메뉴 카탈로그는 첫 접근 때 한 번만 만든다 (lazy).
 * 4.2MB 식약처 번들(mfds.json) 로드 + 1만여 메뉴 병합은 Hermes 에서 수백 ms~수 초라,
 * 모듈 최상위에서 하면 이 파일을 import 하는 모든 화면(컴포넌트 배럴 경유로 로그인까지)의 첫 렌더를 막는다.
 * 그래서 JSON 은 함수 안에서 require 하고, 앱 시작 직후 prewarmCatalog() 로 한가할 때 미리 만들어 둔다.
 */
let catalog: Catalog | null = null;

function buildCatalog(): Catalog {
  const menusJson = require('./menus.json') as MenuItem[];
  const mfds = require('./generated/mfds.json') as MfdsBundle;

  // 손으로 만든 시드 + 공공데이터 (정책은 mergeMenus 참고):
  // 공공데이터 official 20개 이상 브랜드는 옵션 없는 시드 estimated 를 목록에서 빼고(옵션 시드는 D4 옵션 칩·구매 가이드용으로 유지), 같은 브랜드·메뉴명의 추정치는 공식값으로 교체, 나머지는 추가
  const merged = mergeMenus(menusJson, mfds.menus);
  // 같은 음료가 시드 옵션판 + 공식 사이즈판으로 두 번 보이지 않게: 공식판을 남기고 시드의 사이즈 외 옵션(시럽·우유 등)을 옮긴다
  const deduped = mergeSeedOptionsIntoOfficial(merged.menus);
  // 피자 한 판·홀케이크처럼 나눠 먹는 단위가 1인분으로 잡힌 메뉴는 1조각 기준으로 (perSlice.ts — 공식 조각값 또는 공개 조각 수로 나눈 값만)
  const sliced = applyPerSlice(deduped.menus);
  const menus = sliced.menus;
  const brands = [...mergeBrands(brandsJson as Brand[], mfds.brands, menus), PACKAGED_BRAND];

  const menusByBrand = new Map<string, MenuItem[]>();
  for (const m of menus) {
    const list = menusByBrand.get(m.brandId) ?? [];
    list.push(m);
    menusByBrand.set(m.brandId, list);
  }
  return {
    brands,
    menus,
    brandById: new Map(brands.map((b) => [b.id, b])),
    // 목록에서 뺀 시드 메뉴도 id 로는 찾을 수 있게 둔다 — 예전 기록(menuId)·딥링크가 "정보 없음"으로 바뀌지 않게
    menuById: new Map([...merged.hidden, ...deduped.hidden, ...sliced.hidden, ...menus].map((m) => [m.id, m])),
    menusByBrand,
    // 긴 키워드부터 비교해 "CU" 같은 짧은 키워드가 먼저 잡히지 않게 한다
    keywordIndex: brands
      .flatMap((b) => b.matchKeywords.map((k) => ({ key: normalizeName(k), brand: b })))
      .filter((x) => x.key.length > 0)
      .sort((a, b) => b.key.length - a.key.length),
    seedPolicy: merged.seedPolicy,
    mergedSeedsByBrand: deduped.mergedByBrand,
    perSlice: { slicedByBrand: sliced.slicedByBrand, cakesByBrand: sliced.cakesByBrand },
  };
}

function data(): Catalog {
  if (!catalog) catalog = buildCatalog();
  return catalog;
}

// ───────── 시판 제품 (라면·과자·음료 등 2.3만 개) ─────────
// 6MB 번들이라 매장 화면과는 무관하게, 검색·상세에서 처음 필요할 때만 로드한다.
let products: { list: MenuItem[]; byId: Map<string, MenuItem> } | null = null;

function loadProducts(): { list: MenuItem[]; byId: Map<string, MenuItem> } {
  if (products) return products;
  const bundle = require('./generated/mfds-products.json') as ProductsBundle;
  const ds = DATASETS.processed;
  // 용량 때문에 접어 둔 공통 필드(brandId·출처)를 되살린다
  const list = bundle.menus.map((m) => ({ ...m, brandId: PACKAGED_BRAND_ID, sourceUrl: ds.url, sourceName: ds.sourceName }));
  products = { list, byId: new Map(list.map((m) => [m.id, m])) };
  return products;
}

/** 카탈로그가 이미 만들어졌는지 (예열 확인·테스트용) */
export function isCatalogReady(): boolean {
  return catalog !== null;
}

let prewarmScheduled = false;
/**
 * 첫 화면이 뜬 뒤 JS 가 한가할 때 카탈로그를 미리 만든다 (앱 시작 후 1회).
 * 동기 API(getMenus 등)는 그대로 — 예열 전에 불리면 그 자리에서 만든다.
 */
export function prewarmCatalog(delayMs = 600): void {
  if (catalog || prewarmScheduled) return;
  prewarmScheduled = true;
  const run = () => {
    try {
      data();
      // 시판 제품(6MB)도 한가할 때 미리 — 첫 검색 입력이 파싱에 막히지 않게
      setTimeout(() => {
        try {
          loadProducts();
        } catch (e) {
          console.warn('[data] 시판 제품 예열 실패', e);
        }
      }, 800);
    } catch (e) {
      // 여기서 실패해도 첫 실제 접근 때 다시 시도한다
      prewarmScheduled = false;
      console.warn('[data] 카탈로그 예열 실패', e);
    }
  };
  const idle = (globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => unknown }).requestIdleCallback;
  setTimeout(() => {
    if (typeof idle === 'function') idle(run, { timeout: 2000 });
    else run();
  }, delayMs);
}

/** 테스트용: 카탈로그를 버려 다음 접근 때 다시 만들게 한다 */
export function resetCatalogForTest(): void {
  catalog = null;
  products = null;
  prewarmScheduled = false;
  searchIndex = null;
}

/** 대소문자·공백·기호 무시 비교용 */
export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

export function getBrands(): Brand[] {
  return data().brands;
}
export function getBrand(id: string): Brand | undefined {
  return data().brandById.get(id);
}
export function getMenus(): MenuItem[] {
  return data().menus;
}
export function getMenusByBrand(brandId: string): MenuItem[] {
  return data().menusByBrand.get(brandId) ?? [];
}
export function getMenu(id: string): MenuItem | undefined {
  // 시판 제품(pkg-…)은 필요한 그 순간에만 6MB 번들을 로드한다
  if (id.startsWith('pkg-')) return loadProducts().byId.get(id);
  return data().menuById.get(id);
}
/** 검색에 포함되는 시판 제품(라면·과자·음료 등) 수 — 검색 안내 문구용 */
export function getProductCount(): number {
  return loadProducts().list.length;
}
/** 시드 정리 정책 결과 (목록에서 뺀/남긴 시드 메뉴 수) — 검증·디버그용 */
export function getSeedPolicy() {
  return data().seedPolicy;
}
/** 1조각 기준으로 바꾼 피자 수·조각 메뉴로 대신한 홀케이크 수 (브랜드별) — 검증·디버그용 */
export function getPerSliceCounts() {
  return data().perSlice;
}
/** 공식 사이즈판과 합쳐 목록에서 뺀 시드 옵션판 수 (브랜드별) — 검증·디버그용 */
export function getMergedSeedCounts(): Record<string, number> {
  return data().mergedSeedsByBrand;
}

// 기록 추가(E2) 검색용: 정규화 이름을 한 번만 계산해 두고(3만여 개), 키 입력마다 정규식을 다시 돌리지 않는다
let searchIndex: { menu: MenuItem; key: string; brandKey: string }[] | null = null;
/**
 * 메뉴명·브랜드명·제조사명에 검색어가 들어간 메뉴를 최대 limit 개 (찾는 즉시 멈춘다).
 * 매장 메뉴(주변 판정과 같은 데이터)가 앞, 시판 제품(라면·과자 등 식약처 가공식품)이 뒤.
 */
export function searchMenus(query: string, limit = 40): MenuItem[] {
  const q = normalizeName(query);
  if (!q) return [];
  if (!searchIndex) {
    const { brands, menus } = data();
    const brandKeys = new Map(brands.map((b) => [b.id, normalizeName(b.name)]));
    const entry = (m: MenuItem) => ({ menu: m, key: normalizeName(m.name), brandKey: m.maker ? normalizeName(m.maker) : (brandKeys.get(m.brandId) ?? '') });
    searchIndex = [...menus.map(entry), ...loadProducts().list.map(entry)];
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
  return data().keywordIndex.find((x) => name.includes(x.key))?.brand;
}
/** 카카오 키가 없을 때 쓰는 목 매장 (역삼동 기준, 시안의 4곳 포함) */
export function getMockStores(center: { lat: number; lng: number }): Store[] {
  return buildMockStores(center);
}
