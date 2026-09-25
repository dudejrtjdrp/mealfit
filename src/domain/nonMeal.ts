/**
 * "지금 한 끼로 먹을 메뉴"가 아닌 것 — 조리용 식재료 · 한 번에 먹기 어려운 대용량 포장.
 * 매장 메뉴로 들어온 가공식품(편의점 두부 600 g·우유 1.8 L·밀가루)이 판정상 '좋음'이라 추천 1위에 서던 문제를 막는다.
 * 추천·순위(rankMenus 기본값, 홈 추천, 주변 카드 요약)에서만 빼고, 검색·기록·상세에서는 그대로 찾아진다.
 * 순수 함수 — 데이터 필드(name·serving·category·nutrients·sourceName)만 본다. 너무 넓게 잡지 않는다:
 * 식당·카페 메뉴(음식 데이터셋)는 이름에 '조리용' 같은 분명한 말이 있을 때만, 원물 이름·용량 규칙은 가공식품에만.
 */
import type { MenuItem } from './types';

export type NonMealKind = 'ingredient' | 'bulk';

/** 어디서든 분명한 조리용 표시 ("찌개/부침겸용", "국거리", "볶음용") */
const COOKING_USE_RE = /(찌개용|부침용|겸용|조리용|볶음용|구이용|찜용|탕용|국거리|육수용|요리용)/;

/**
 * 가공식품 이름이 이 말로 끝나면 원물·양념 (그대로 한 끼로 먹지 않는다).
 * "구운계란"·"훈제란"·"비빔면"·"양념치킨"·"마파두부덮밥"처럼 바로 먹는 것은 끝말이 달라 걸리지 않는다.
 */
const RAW_SUFFIX_RE =
  /(?<!마파)(두부|생면|소면|중면|칼국수면|우동면|사리|육수|양념|양념장|소스|밀가루|부침가루|튀김가루|전분|식용유|참기름|들기름|간장|고추장|된장|쌈장|다시다|떡볶이떡|떡국떡|가래떡|베이컨|생란|생계란)$/;
/** 달걀 원물 묶음 ("특란 30구") */
const EGG_PACK_RE = /\d+\s*구(\s|$)/;

/** 가공식품 음료가 이 용량(ml) 이상이면 대용량 팩 (우유 900 ml·1.8 L, 커피 1 L) — 카페 음료는 빅사이즈도 1인분이라 제외 */
export const BULK_DRINK_ML = 900;
/** 가공식품이 이 중량(g) 이상이면 대용량 */
export const BULK_FOOD_G = 1000;
/** 가공식품 1인분 표시가 이 kcal 이상이면 한 번에 먹는 양이 아니다 (도시락 최대 900 안팎) */
export const BULK_KCAL = 1200;

/** 매장 메뉴로 들어온 식약처 가공식품 또는 시판 제품(pkg-) */
function isPackaged(menu: Pick<MenuItem, 'id' | 'sourceName'>): boolean {
  return menu.id.startsWith('pkg-') || (menu.sourceName?.includes('가공식품') ?? false);
}

/** "1인분 (1800 ml)" · "1개 (500 g)" · "1.5L" → { value(ml·g), unit } */
function servingAmount(serving: string): { value: number; unit: 'g' | 'ml' } | null {
  const m = serving.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)(?![a-z])/i);
  if (!m) return null;
  const u = m[2].toLowerCase();
  const v = Number(m[1]) * (u === 'kg' || u === 'l' ? 1000 : 1);
  return Number.isFinite(v) ? { value: v, unit: u === 'g' || u === 'kg' ? 'g' : 'ml' } : null;
}

/** 이름 끝의 괄호·용량 표기 제거 ("국산콩두부 (300g)" → "국산콩두부") */
function coreName(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/\s*\d+(?:\.\d+)?\s*(?:kg|g|ml|l)\s*$/i, '')
    .trim();
}

/** 조리용 식재료·대용량이면 그 종류, 한 끼로 먹을 메뉴면 null */
export function nonMealKind(menu: Pick<MenuItem, 'id' | 'name' | 'serving' | 'category' | 'nutrients' | 'sourceName'>): NonMealKind | null {
  const name = coreName(menu.name);
  if (COOKING_USE_RE.test(name)) return 'ingredient';
  if (!isPackaged(menu)) return null;
  if (RAW_SUFFIX_RE.test(name) || EGG_PACK_RE.test(name)) return 'ingredient';
  const amt = servingAmount(menu.serving);
  if (amt?.unit === 'ml' && amt.value >= BULK_DRINK_ML) return 'bulk';
  if (amt?.unit === 'g' && amt.value >= BULK_FOOD_G) return 'bulk';
  const kcal = menu.nutrients?.kcal;
  if (typeof kcal === 'number' && kcal >= BULK_KCAL) return 'bulk';
  return null;
}

/** 추천·순위에 올려도 되는 메뉴 (조리용 식재료·대용량이 아님) */
export function isMealCandidate(menu: Pick<MenuItem, 'id' | 'name' | 'serving' | 'category' | 'nutrients' | 'sourceName'>): boolean {
  return nonMealKind(menu) === null;
}
