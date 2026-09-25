import { getBrand, getBrands, normalizeName, searchMenus } from '@/data';
import { snapQty, type ParsedFood } from '@/domain/aiMeal';
import { applyOptions } from '@/domain/judge';
import { menuQtyUnit } from '@/domain/qty';
import type { MenuItem, Nutrients, Trust } from '@/domain/types';

import { pickSimilar, searchProductsRemote } from '../products';

/**
 * AI·규칙이 뽑은 음식 → 앱 데이터(식약처·브랜드)의 메뉴.
 * 이름이 딱 맞는 메뉴(브랜드 제품은 "브랜드 + 이름")만 그대로 쓰고, 그 밖엔
 * AI 추정값 → 비슷한 메뉴 순으로 채우며 둘 다 '추정'으로 표시한다.
 */

export type MatchKind =
  /** 같은 이름 메뉴 — 메뉴의 신뢰등급 그대로 */
  | 'exact'
  /** 데이터에 없어 AI 추정값(1인분) */
  | 'ai'
  /** 이름이 비슷한 메뉴로 계산 */
  | 'similar'
  /** 칼로리를 못 찾음 — 사용자가 메뉴를 골라야 기록 */
  | 'none';

export interface MatchedFood {
  key: string;
  /** 기록에 남길 이름 */
  name: string;
  food: ParsedFood;
  kind: MatchKind;
  menu?: MenuItem;
  /** 1(개·인분·조각) 기준 영양 */
  base: Nutrients | null;
  trust: Trust;
  unit: string;
  qty: number;
}

let seq = 0;
const newKey = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`;

const brandName = (m: MenuItem) => m.maker ?? getBrand(m.brandId)?.name;

/** "스타벅스 카페라떼" → { brand: 스타벅스, rest: 카페라떼 } */
function splitBrand(name: string): { brandId: string; rest: string } | null {
  const n = normalizeName(name);
  for (const b of getBrands()) {
    for (const k of [b.name, ...(b.matchKeywords ?? [])]) {
      const kn = normalizeName(k);
      if (kn.length >= 2 && n.startsWith(kn) && n.length > kn.length) return { brandId: b.id, rest: n.slice(kn.length) };
    }
  }
  return null;
}

function usable(m: MenuItem): boolean {
  return m.nutrients != null && m.trust !== 'none' && applyOptions(m) != null;
}

async function candidatesFor(q: string): Promise<MenuItem[]> {
  const local = searchMenus(q, 60);
  const seen = new Set(local.map((m) => m.id));
  const remote = ((await searchProductsRemote(q, 20)) ?? []).filter((m) => !seen.has(m.id));
  return [...local, ...remote].filter(usable);
}

/** 같은 이름(브랜드 제품이면 브랜드까지) 메뉴 */
export async function findExactMenu(name: string): Promise<MenuItem | undefined> {
  const q = normalizeName(name);
  if (!q) return undefined;
  const branded = splitBrand(name);
  if (branded) {
    const list = await candidatesFor(branded.rest);
    const hit = list.find((m) => m.brandId === branded.brandId && normalizeName(m.name) === branded.rest);
    if (hit) return hit;
    // 브랜드 안에서 이름이 들어간 메뉴 중 가장 짧은 것 ("스타벅스 라떼" → 카페 라떼)
    const within = list.filter((m) => m.brandId === branded.brandId && normalizeName(m.name).includes(branded.rest));
    if (within.length) return within.sort((a, b) => a.name.length - b.name.length)[0];
  }
  const list = await candidatesFor(name);
  return list.find((m) => normalizeName(m.name) === q || normalizeName(`${brandName(m) ?? ''}${m.name}`) === q);
}

/** AI 추정은 말한 단위 그대로 (반 마리 → 0.5마리). 영양도 그 단위 1개 기준으로 받는다 */
const AI_UNITS = new Set(['개', '잔', '병', '컵', '봉지', '캔', '조각', '그릇', '공기', '인분', '마리', '줄', '접시', '판']);

function build(food: ParsedFood, kind: MatchKind, menu: MenuItem | undefined, base: Nutrients | null, trust: Trust): MatchedFood {
  const unit = menu ? menuQtyUnit(menu) : kind === 'ai' && food.unit && AI_UNITS.has(food.unit) ? food.unit : '인분';
  // 조각 단위 메뉴인데 "한 판"이라고 했으면 8조각으로 본다
  const amount = unit === '조각' && food.unit === '판' ? food.amount * 8 : food.amount;
  return {
    key: newKey(),
    name: kind === 'exact' && menu ? menu.name : food.name,
    food,
    kind,
    menu,
    base,
    trust,
    unit,
    qty: snapQty(amount, unit),
  };
}

export async function matchFood(food: ParsedFood): Promise<MatchedFood> {
  try {
    const exact = await findExactMenu(food.name);
    if (exact) return build(food, 'exact', exact, applyOptions(exact), exact.trust);
  } catch {
    // 검색 실패 → 추정으로
  }
  if (food.guess) return build(food, 'ai', undefined, food.guess, 'estimated');
  try {
    const words = food.name.split(/\s+/).filter((w) => normalizeName(w).length >= 2);
    for (const q of [food.name, ...words.sort((a, b) => b.length - a.length)]) {
      const hit = pickSimilar(q, await candidatesFor(q));
      if (hit) return build(food, 'similar', hit, applyOptions(hit), 'estimated');
    }
  } catch {
    // 아래로
  }
  return build(food, 'none', undefined, null, 'none');
}

export async function matchFoods(foods: ParsedFood[]): Promise<MatchedFood[]> {
  return Promise.all(foods.map(matchFood));
}

/** 사용자가 직접 고른 메뉴로 바꾸기 */
export function withMenu(item: MatchedFood, menu: MenuItem): MatchedFood {
  const unit = menuQtyUnit(menu);
  return { ...item, name: menu.name, kind: 'exact', menu, base: applyOptions(menu), trust: menu.trust, unit, qty: snapQty(item.qty, unit) };
}

/** 확인 화면 설명 한 줄 */
export function matchLabel(item: MatchedFood): string {
  const by = item.menu ? brandName(item.menu) : undefined;
  switch (item.kind) {
    case 'exact':
      return by ? by : '식약처 영양 정보';
    case 'similar':
      return `‘${item.menu?.name ?? ''}’${by ? `(${by})` : ''}로 계산`;
    case 'ai':
      return '밀리가 1인분으로 어림했어요';
    default:
      return '칼로리를 못 찾았어요 · 눌러서 메뉴 고르기';
  }
}
