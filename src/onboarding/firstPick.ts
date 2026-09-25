/**
 * 온보딩 끝 "첫 판정 체험" — 근처 매장(또는 대표 브랜드)에서 지금 먹기 좋은 메뉴 하나 고르기.
 * 순수 함수 (React·스토어 의존 없음). 판정·순위는 domain/judge 의 rankMenus 를 넘겨받아 쓴다.
 * 코치마크·설명 팝업 대신 이 한 장이 "먹기 전에 이렇게 알려드려요"를 보여준다.
 */
import type { Judgement, MenuItem, Store } from '../domain/types';

/** 위치·매장 검색이 이보다 늦으면 예시 메뉴로 보여준다 */
export const FIRST_PICK_TIMEOUT_MS = 4000;
/** 가까운 순으로 이만큼의 매장만 본다 (첫 화면이라 빨리) */
export const NEARBY_STORES_TO_CHECK = 6;
/** 근처 매장을 못 찾았을 때 예시로 쓰는 대표 브랜드 (영양 정보가 넉넉한 곳부터) */
export const FALLBACK_BRANDS = ['subway', 'gs25', 'starbucks', 'salady', 'cu'];

export type Ranked = { menu: MenuItem; judgement: Judgement }[];

export interface FirstPick {
  menu: MenuItem;
  judgement: Judgement;
  /** 근처 매장에서 골랐으면 매장 이름·거리 */
  storeName?: string;
  distanceM?: number;
  /** 근처 매장이 아니라 대표 브랜드 예시 — 화면에 "예시 메뉴예요"를 밝힌다 */
  example: boolean;
}

/** 순위 1위 중 판정이 있는(정보 있음) 좋음/괜찮음 메뉴 — 없으면 undefined */
function topOf(ranked: Ranked): Ranked[number] | undefined {
  return ranked.find((x) => !x.judgement.unknown && x.judgement.verdict !== 'pass');
}

/** 후보들 중 '좋음'이 있는 첫 후보, 없으면 '괜찮음'인 첫 후보 (후보 순서 = 가까운 순 / 대표 브랜드 순) */
function pickBest<T extends { top: Ranked[number] }>(cands: T[]): T | undefined {
  return cands.find((c) => c.top.judgement.verdict === 'good') ?? cands[0];
}

export interface FirstPickInput {
  /** 근처 매장 (가까운 순). 실제 위치 기준이 아니면(목 매장·데모 동네) nearbyIsReal=false */
  stores: Store[];
  nearbyIsReal: boolean;
  menusOf: (brandId: string) => MenuItem[];
  rank: (menus: MenuItem[]) => Ranked;
  fallbackBrands?: string[];
}

/** 근처 매장에서 1위 메뉴 — 실제 근처 매장이 없거나 판정할 메뉴가 없으면 null */
export function pickNearby({ stores, nearbyIsReal, menusOf, rank }: FirstPickInput): FirstPick | null {
  if (!nearbyIsReal) return null;
  const cands = [...stores]
    .filter((s) => s.brandId && s.coverage !== 'none')
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, NEARBY_STORES_TO_CHECK)
    .map((store) => ({ store, top: topOf(rank(menusOf(store.brandId!))) }))
    .filter((c): c is { store: Store; top: Ranked[number] } => !!c.top);
  const best = pickBest(cands);
  if (!best) return null;
  return { ...best.top, storeName: best.store.name, distanceM: best.store.distanceM, example: false };
}

/** 대표 브랜드 예시 1위 메뉴 */
export function pickExample({ menusOf, rank, fallbackBrands = FALLBACK_BRANDS }: Pick<FirstPickInput, 'menusOf' | 'rank' | 'fallbackBrands'>): FirstPick | null {
  const cands = fallbackBrands.map((brandId) => ({ top: topOf(rank(menusOf(brandId))) })).filter((c): c is { top: Ranked[number] } => !!c.top);
  const best = pickBest(cands);
  return best ? { ...best.top, example: true } : null;
}

/** 근처 1위 → 없으면 예시. 둘 다 없으면 null (화면은 체험 없이 넘어간다) */
export function pickFirstVerdict(input: FirstPickInput): FirstPick | null {
  return pickNearby(input) ?? pickExample(input);
}
