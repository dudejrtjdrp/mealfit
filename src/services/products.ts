/**
 * 시판 가공식품 서버 검색 (Supabase public.products — 식약처 전체 26만 개).
 * 앱 번들(mfds-products.json 3.7만 개)은 오프라인·키 없음 폴백이고, 검색의 기본은 이 테이블이다 (2026-09-24 효님 결정).
 * 스키마·인덱스: supabase/migrations/0002_products.sql
 */
import { normalizeName, searchMenus } from '@/data';
import { DATASETS, PACKAGED_BRAND_ID } from '@/data/ingest/nutrition';
import type { MenuItem, Nutrients } from '@/domain/types';

import { getSupabase } from './supabase';

/** products 테이블 행 (0002_products.sql) */
export interface ProductRow {
  id: string;
  name: string;
  maker: string | null;
  category: string;
  serving: string;
  serving_note: string | null;
  kcal: number;
  carbs: number | null;
  protein: number | null;
  fat: number | null;
  sat_fat: number | null;
  sugar: number | null;
  sodium: number | null;
  caffeine: number | null;
}

const COLUMNS = 'id,name,maker,category,serving,serving_note,kcal,carbs,protein,fat,sat_fat,sugar,sodium,caffeine';
const CATEGORIES = new Set(['drink', 'meal', 'snack', 'salad', 'side']);

export function productRowToMenu(row: ProductRow): MenuItem {
  const ds = DATASETS.processed;
  const nutrients: Nutrients = { kcal: row.kcal };
  if (row.carbs != null) nutrients.carbs = row.carbs;
  if (row.protein != null) nutrients.protein = row.protein;
  if (row.fat != null) nutrients.fat = row.fat;
  if (row.sat_fat != null) nutrients.satFat = row.sat_fat;
  if (row.sugar != null) nutrients.sugar = row.sugar;
  if (row.sodium != null) nutrients.sodium = row.sodium;
  if (row.caffeine != null) nutrients.caffeine = row.caffeine;
  const category = (CATEGORIES.has(row.category) ? row.category : 'snack') as MenuItem['category'];
  const menu: MenuItem = {
    id: row.id,
    brandId: PACKAGED_BRAND_ID,
    name: row.name,
    category,
    serving: row.serving,
    nutrients,
    // 1회 섭취참고량 기준 행은 "한 번 먹는 양"이 추정이다 (ingest rowToProduct 와 같은 규칙, 테이블에 trust 열이 없어 serving 으로 판별)
    trust: row.serving.startsWith('1회 섭취참고량') ? 'estimated' : 'official',
    sourceUrl: ds.url,
    sourceName: ds.sourceName,
    imageKey: category,
  };
  if (row.maker) menu.maker = row.maker;
  if (row.serving_note) menu.servingNote = row.serving_note;
  if (nutrients.caffeine && nutrients.caffeine > 0) menu.tags = ['카페인 있음'];
  return menu;
}

/** 이번 실행에서 서버로 받은 제품 — 상세 화면(D4)·기록이 id 로 다시 찾을 수 있게 세션 캐시에 둔다 */
const cache = new Map<string, MenuItem>();
export function getCachedRemoteProduct(id: string): MenuItem | undefined {
  return cache.get(id);
}

/**
 * 서버에서 제품 검색 (이름·제조사 부분 일치, pg_trgm 인덱스).
 * Supabase 미설정·오류·오프라인이면 null → 호출 쪽은 로컬 번들 결과만 쓴다.
 */
export async function searchProductsRemote(query: string, limit = 40): Promise<MenuItem[] | null> {
  const db = getSupabase();
  if (!db) return null;
  // ilike 패턴 메타문자(% _)와 PostgREST or= 구분자(콤마·괄호)는 제거 — 검색어 문자로서 의미가 없다
  const q = normalizeName(query).replace(/[%_,()]/g, '');
  if (!q) return [];
  try {
    const { data, error } = await db
      .from('products')
      .select(COLUMNS)
      .or(`name_norm.ilike.%${q}%,maker_norm.ilike.%${q}%`)
      .order('name')
      .limit(limit);
    if (error || !data) return null;
    const items = (data as ProductRow[]).map(productRowToMenu);
    for (const m of items) cache.set(m.id, m);
    return items;
  } catch {
    return null;
  }
}

/**
 * 이름으로 가장 비슷한 메뉴 (영양 정보 있는 것만): 이름이 같음 > 검색어로 시작 > 이름 길이 차이가 작은 순.
 * 직접 입력에서 칼로리를 모를 때 "비슷한 메뉴로 계산"하는 기준 — 순수 함수.
 */
export function pickSimilar(query: string, candidates: MenuItem[]): MenuItem | undefined {
  const q = normalizeName(query);
  if (!q) return undefined;
  const scored = candidates
    .filter((m) => m.nutrients != null && m.trust !== 'none')
    .map((m, i) => {
      const n = normalizeName(m.name);
      const rank = n === q ? 0 : n.startsWith(q) ? 1 : n.includes(q) ? 2 : 3;
      return { m, rank, diff: Math.abs(n.length - q.length), i };
    });
  scored.sort((a, b) => a.rank - b.rank || a.diff - b.diff || a.i - b.i);
  return scored[0]?.m;
}

/**
 * 직접 입력한 이름 → 가장 비슷한 메뉴. 앱 번들(매장 메뉴·시판 제품) + 서버 제품에서 찾고,
 * 이름 전체로 못 찾으면 긴 단어부터 하나씩 다시 찾는다 ("엄마표 김치찌개" → "김치찌개").
 */
export async function findSimilarMenu(name: string): Promise<MenuItem | undefined> {
  const words = name.split(/\s+/).filter((w) => normalizeName(w).length >= 2);
  const queries = [name, ...words.sort((a, b) => b.length - a.length)].filter((q, i, arr) => arr.indexOf(q) === i);
  for (const q of queries) {
    const local = searchMenus(q, 40);
    const remote = (await searchProductsRemote(q, 20)) ?? [];
    const hit = pickSimilar(q, [...local, ...remote]);
    if (hit) return hit;
  }
  return undefined;
}
