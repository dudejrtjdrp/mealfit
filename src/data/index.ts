import type { Brand, MenuItem, Store } from '../domain/types';
import { PLACE_EST_ID_SUFFIX, placeDishQueries, toPlaceEstimate } from './placeDishes';
import brandsJson from './brands.json';
import { mergeSeedOptionsIntoOfficial } from './dedupe';
import { applyPerPortion } from './perPortion';
import { applyPackagedServing } from './packagedServing';
import { applyPerServing, type ServingRule } from './perServing';
import { applyPerSlice } from './perSlice';
import { DATASETS, GENERIC_BRAND_ID, GENERIC_ID_PREFIX, PACKAGED_BRAND_ID, mergeBrands, mergeMenus } from './ingest/nutrition';
import { getMockStores as buildMockStores } from './mockStores';
import { rankKey, rankMatches, type RankKey } from './searchRank';

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

/** scripts/ingest-nutrition.mjs 가 만드는 일반 음식 번들 (돼지국밥·김치찌개처럼 브랜드 없는 대표 음식 — brandId·출처는 메타로 접어 둔다) */
interface DishesBundle {
  meta: { count: number };
  menus: MenuItem[];
}

/**
 * 일반 음식(대표 음식)이 속하는 가상 브랜드. 매장 매칭 키워드는 비워 둔다 —
 * 장소 이름과 매칭돼 "일반 식당"이라는 매장처럼 보이지 않게(주변 매장·브랜드 검색에 나오지 않는다).
 */
const GENERIC_BRAND: Brand = {
  id: GENERIC_BRAND_ID,
  name: '일반 식당',
  category: 'korean',
  matchKeywords: [],
  coverage: 'full',
  blurb: '식약처 음식 데이터의 대표 음식 1인분이에요.',
};

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
  /** 1마리·반마리로 바꾼 치킨 수 · "100 g 기준" 으로 표기만 바로잡은 메뉴 수 (브랜드별) */
  perPortion: { portionedByBrand: Record<string, number>; relabeledByBrand: Record<string, number> };
  /** 한 번 먹는 단위로 바꾼 메뉴 수 (규칙별·브랜드별) */
  perServing: { byRule: Record<ServingRule, number>; byBrand: Record<string, number> };
  /** 1회 섭취참고량으로 바꾼 대용량 가공식품 수 (매장 메뉴) */
  packagedConverted: number;
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
  // 100 g 당 값이 "1인분 (100 g)" 으로 잡힌 치킨은 1마리·반마리로, 나머지는 "100 g 기준" 표기로 (perPortion.ts — 출처 있는 중량만)
  const portioned = applyPerPortion(sliced.menus);
  // 그래도 남은 한 판·홀·100 g 기준 메뉴는 한 번 먹는 단위로 (perServing.ts — 1회 섭취참고량·브랜드 컵 용량·조각 무게, 전부 추정 + 근거 한 줄)
  const served = applyPerServing(portioned.menus);
  // 매장 메뉴로 들어온 대용량 가공식품(편의점 우유 1.8 L·아메리카노 1 L)은 1회 섭취참고량으로 (packagedServing.ts — 시판 제품 번들·서버 제품과 같은 규칙)
  const packed = applyPackagedServing(served.menus);
  const menus = packed.menus;
  const brands = [...mergeBrands(brandsJson as Brand[], mfds.brands, menus), PACKAGED_BRAND, GENERIC_BRAND];

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
    menuById: new Map([...merged.hidden, ...deduped.hidden, ...sliced.hidden, ...portioned.hidden, ...served.hidden, ...packed.hidden, ...menus].map((m) => [m.id, m])),
    menusByBrand,
    // 긴 키워드부터 비교해 "CU" 같은 짧은 키워드가 먼저 잡히지 않게 한다
    keywordIndex: brands
      .flatMap((b) => b.matchKeywords.map((k) => ({ key: normalizeName(k), brand: b })))
      .filter((x) => x.key.length > 0)
      .sort((a, b) => b.key.length - a.key.length),
    seedPolicy: merged.seedPolicy,
    mergedSeedsByBrand: deduped.mergedByBrand,
    perSlice: { slicedByBrand: sliced.slicedByBrand, cakesByBrand: sliced.cakesByBrand },
    perPortion: { portionedByBrand: portioned.portionedByBrand, relabeledByBrand: portioned.relabeledByBrand },
    perServing: { byRule: served.byRule, byBrand: served.byBrand },
    packagedConverted: packed.converted,
  };
}

function data(): Catalog {
  if (!catalog) catalog = buildCatalog();
  return catalog;
}

// ───────── 시판 제품 (라면·과자·음료 등 2.3만 개) ─────────
// 6MB 번들이라 매장 화면과는 무관하게, 검색·상세에서 처음 필요할 때만 로드한다.
let products: { list: MenuItem[]; byId: Map<string, MenuItem>; converted: number } | null = null;

function loadProducts(): { list: MenuItem[]; byId: Map<string, MenuItem>; converted: number } {
  if (products) return products;
  const bundle = require('./generated/mfds-products.json') as ProductsBundle;
  const ds = DATASETS.processed;
  // 용량 때문에 접어 둔 공통 필드(brandId·출처)를 되살린다
  const raw = bundle.menus.map((m) => ({ ...m, brandId: PACKAGED_BRAND_ID, sourceUrl: ds.url, sourceName: ds.sourceName }));
  // 여러 번 나눠 먹는 대용량 포장은 1회 섭취참고량으로 (packagedServing.ts). 원래 포장 id 도 예전 기록용으로 찾힌다
  const packed = applyPackagedServing(raw);
  const list = packed.menus;
  products = { list, byId: new Map([...packed.hidden, ...list].map((m) => [m.id, m])), converted: packed.converted };
  return products;
}

// ───────── 일반 음식 (돼지국밥·김치찌개 같은 대표 음식 1.7천 개, 0.6MB) ─────────
// 검색·AI 기록 맞추기·주변 일반 식당 추정에서 처음 필요할 때만 로드한다.
interface Dishes {
  list: MenuItem[];
  byId: Map<string, MenuItem>;
  /** 정규화 이름·다른 이름 → 음식 (번들 순서 = 1인분 있음·식당 값 먼저) */
  byName: Map<string, MenuItem[]>;
}
let dishes: Dishes | null = null;

function loadDishes(): Dishes {
  if (dishes) return dishes;
  const bundle = require('./generated/mfds-dishes.json') as DishesBundle;
  const ds = DATASETS.food;
  const list = bundle.menus.map((m) => ({ ...m, brandId: GENERIC_BRAND_ID, sourceUrl: ds.url, sourceName: ds.sourceName }));
  const byName = new Map<string, MenuItem[]>();
  for (const m of list) {
    for (const n of new Set([m.name, ...(m.aliases ?? [])].map(normalizeName))) {
      if (!n) continue;
      const arr = byName.get(n);
      if (arr) arr.push(m);
      else byName.set(n, [m]);
    }
  }
  dishes = { list, byId: new Map(list.map((m) => [m.id, m])), byName };
  return dishes;
}

/** 일반 음식 전체 (대표 음식 — 검증·디버그용) */
export function getGenericDishes(): MenuItem[] {
  return loadDishes().list;
}

/**
 * 이름(또는 다른 이름)이 같은 일반 음식 하나. "돼지국밥" → 돼지고기 국밥 (식당 1인분 1,200 g).
 * 같은 이름이 여러 개면 1인분 중량이 있는 것 > 식당 값 > 집밥 > 급식 (번들 순서).
 */
export function findGenericDish(name: string): MenuItem | undefined {
  const hits = loadDishes().byName.get(normalizeName(name));
  if (!hits) return undefined;
  return hits.find((m) => m.serving.startsWith('1인분')) ?? hits[0];
}

const placeCache = new Map<string, MenuItem[]>();
/**
 * 브랜드가 아닌 식당(카카오 이름·분류)에서 "이런 메뉴가 있을 거예요" — 일반 음식 1인분을 추정(estimated)으로.
 * 이름·분류에 단서가 없으면 빈 배열 (지어내지 않는다). 같은 이름·분류는 같은 배열(메모이제이션 안정).
 */
export function estimatedMenusForPlace(name: string, placeCategory?: string): MenuItem[] {
  const key = `${name}|${placeCategory ?? ''}`;
  const hit = placeCache.get(key);
  if (hit) return hit;
  const out: MenuItem[] = [];
  const seen = new Set<string>();
  for (const q of placeDishQueries(name, placeCategory)) {
    const d = findGenericDish(q);
    // 1인분 중량을 아는 음식만 — "100 g 기준" 은 가게 메뉴 한 그릇으로 보여줄 수 없다
    if (!d || seen.has(d.id) || !d.serving.startsWith('1인분')) continue;
    seen.add(d.id);
    out.push(toPlaceEstimate(d));
  }
  placeCache.set(key, out);
  return out;
}

/** 매장의 메뉴 — 브랜드 매장은 브랜드 메뉴, 브랜드가 아닌 식당은 일반 음식 추정 */
export function menusForStore(store: Pick<Store, 'brandId' | 'name' | 'placeCategory'>): MenuItem[] {
  if (store.brandId) return getMenusByBrand(store.brandId);
  return estimatedMenusForPlace(store.name, store.placeCategory);
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
      // 시판 제품(6MB)·일반 음식도 한가할 때 미리 — 첫 검색 입력·주변 식당 추정이 파싱에 막히지 않게
      setTimeout(() => {
        try {
          loadDishes();
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
  dishes = null;
  placeCache.clear();
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
  if (brandId === GENERIC_BRAND_ID) return loadDishes().list;
  return data().menusByBrand.get(brandId) ?? [];
}
export function getMenu(id: string): MenuItem | undefined {
  // 시판 제품(pkg-…)은 필요한 그 순간에만 6MB 번들을 로드한다
  if (id.startsWith('pkg-')) return loadProducts().byId.get(id);
  if (id.startsWith(GENERIC_ID_PREFIX)) {
    // 주변 일반 식당 추정 메뉴(…-est)는 원래 일반 음식을 추정으로 바꿔 돌려준다 (기록·상세가 id 로 다시 찾는다)
    if (id.endsWith(PLACE_EST_ID_SUFFIX)) {
      const base = loadDishes().byId.get(id.slice(0, -PLACE_EST_ID_SUFFIX.length));
      return base ? toPlaceEstimate(base) : undefined;
    }
    return loadDishes().byId.get(id);
  }
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
/** 1마리·반마리로 바꾼 치킨 수 · 100 g 기준 표기로 바로잡은 메뉴 수 (브랜드별) — 검증·디버그용 */
export function getPerPortionCounts() {
  return data().perPortion;
}
/** 한 번 먹는 단위(1조각·1잔·1회 섭취참고량)로 바꾼 메뉴 수 (규칙별·브랜드별) — 검증·디버그용 */
export function getPerServingCounts() {
  return data().perServing;
}
/** 1회 섭취참고량으로 바꾼 대용량 가공식품 수 — 매장 메뉴·시판 제품 번들 (검증·디버그용) */
export function getPackagedServingCounts(): { catalog: number; products: number } {
  return { catalog: data().packagedConverted, products: loadProducts().converted };
}
/** 공식 사이즈판과 합쳐 목록에서 뺀 시드 옵션판 수 (브랜드별) — 검증·디버그용 */
export function getMergedSeedCounts(): Record<string, number> {
  return data().mergedSeedsByBrand;
}

// 기록 추가(E2) 검색용: 정규화 이름·순위 키를 한 번만 계산해 두고(3만여 개), 키 입력마다 정규식을 다시 돌리지 않는다
let searchIndex: { menus: MenuItem[]; keys: RankKey[]; groupTotals: Map<string, number> } | null = null;
/**
 * 메뉴명·브랜드명·제조사명에 검색어가 들어간 메뉴를 순위대로 최대 limit 개 (searchRank.ts).
 * 이름의 머리(끝)가 검색어인 메뉴 > 꾸밈말 자리 · 매장 메뉴 > 시판 제품 · 그 음식을 주로 파는 브랜드 > 가끔 파는 브랜드 · 짧은 이름 순.
 * ("치킨" → BBQ·교촌·굽네 치킨이 스타벅스 "치킨 클럽"보다 앞, "라면" → 라면이 "라면왕김통깨"보다 앞)
 */
export function searchMenus(query: string, limit = 40): MenuItem[] {
  const q = normalizeName(query);
  if (!q) return [];
  if (!searchIndex) {
    const { brands, menus } = data();
    const brandNames = new Map(brands.map((b) => [b.id, b.name]));
    // 매장 메뉴 → 일반 음식(대표 음식) → 시판 제품. 순위는 rankMatches 가 정하고, 동점이면 이 순서
    const all = [...menus, ...loadDishes().list, ...loadProducts().list];
    const keys = all.map((m) => rankKey(m, brandNames.get(m.brandId) ?? ''));
    const groupTotals = new Map<string, number>();
    for (const k of keys) groupTotals.set(k.group, (groupTotals.get(k.group) ?? 0) + 1);
    searchIndex = { menus: all, keys, groupTotals };
  }
  const idx = searchIndex;
  return rankMatches(q, idx.menus, idx.keys, (g) => idx.groupTotals.get(g) ?? 0).slice(0, limit);
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
