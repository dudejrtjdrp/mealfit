/**
 * 홈 "지금 근처 추천" — 주변 매장(데이터 있는 곳)의 메뉴를 한 번에 판정해 상위 몇 개를 고른다.
 * 계산은 전부 순수 함수(테스트 대상). 화면은 useMemo 로 감싸 쓴다.
 */
import { create } from 'zustand';

import { TINY_KCAL, applyOptions, rankMenus, type JudgeContext } from '@/domain/judge';
import type { DailyTargets, Judgement, MenuItem, Nutrients, Store } from '@/domain/types';

/** 상황 칩: 전체 · 가볍게 · 단백질 든든 · 달지 않게 */
export type RecommendMode = 'all' | 'light' | 'protein' | 'lowSugar';

export const RECOMMEND_MODES: { id: RecommendMode; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'light', label: '가볍게' },
  { id: 'protein', label: '단백질 든든' },
  { id: 'lowSugar', label: '달지 않게' },
];

/** 고른 칩 — 세션 동안만 기억 (앱을 다시 켜면 전체) */
export const useRecommendMode = create<{ mode: RecommendMode; setMode: (m: RecommendMode) => void }>((set) => ({
  mode: 'all',
  setMode: (mode) => set({ mode }),
}));

export interface RecommendCandidate {
  menu: MenuItem;
  judgement: Judgement;
  /** 그 브랜드의 가장 가까운 매장 */
  store: Store;
  /** 기본 옵션 기준 kcal */
  kcal: number;
  /** 기본 옵션 기준 영양 */
  nutrients: Nutrients;
}

/** 데이터 있는 매장만, 브랜드마다 가장 가까운 매장 하나 (거리순) */
export function nearestStoresWithData(stores: Store[]): Store[] {
  const byBrand = new Map<string, Store>();
  for (const s of stores) {
    if (!s.brandId || s.coverage === 'none') continue;
    const cur = byBrand.get(s.brandId);
    if (!cur || s.distanceM < cur.distanceM) byBrand.set(s.brandId, s);
  }
  return [...byBrand.values()].sort((a, b) => a.distanceM - b.distanceM);
}

/**
 * 주변 메뉴 전체를 한 번에 rankMenus 한 결과 중 추천할 수 있는 것 (순위 순).
 * 정보 없음·오늘은 패스는 뺀다 — 추천은 "지금 먹기 좋은 것"만.
 */
export function collectCandidates(
  stores: Store[],
  menusFor: (brandId: string) => MenuItem[],
  remaining: DailyTargets,
  ctx: JudgeContext,
): RecommendCandidate[] {
  const storeByBrand = new Map<string, Store>();
  const menus: MenuItem[] = [];
  for (const s of nearestStoresWithData(stores)) {
    storeByBrand.set(s.brandId!, s);
    menus.push(...menusFor(s.brandId!));
  }
  if (menus.length === 0) return [];
  const out: RecommendCandidate[] = [];
  for (const { menu, judgement } of rankMenus(menus, remaining, ctx)) {
    if (judgement.unknown || judgement.verdict === 'pass') continue;
    const store = storeByBrand.get(menu.brandId);
    const nutrients = applyOptions(menu);
    if (!store || !nutrients || typeof nutrients.kcal !== 'number') continue;
    out.push({ menu, judgement, store, kcal: nutrients.kcal, nutrients });
  }
  return out;
}

/**
 * 칩별 정렬 값 (작을수록 앞). 정보가 없는 값은 undefined → 뒤로.
 * 가볍게 = kcal 낮은 순 · 단백질 든든 = kcal 당 단백질 높은 순 · 달지 않게 = 당 낮은 순 · 전체 = 판정 순위 그대로
 */
function modeKey(c: RecommendCandidate, mode: RecommendMode): number | undefined {
  switch (mode) {
    case 'light':
      return c.kcal;
    case 'protein': {
      const p = c.nutrients.protein;
      return typeof p === 'number' && c.kcal > 0 ? -(p / c.kcal) : undefined;
    }
    case 'lowSugar': {
      const s = c.nutrients.sugar;
      return typeof s === 'number' ? s : undefined;
    }
    default:
      return 0;
  }
}

/**
 * 상위 n개: 같은 브랜드(=매장)는 1개만.
 * 앞에서부터: 칩 기준 값이 있는 것 → 없는 것, 그 안에서 좋음 → 괜찮음, 그 안에서 칩 기준 → 판정 순위.
 * 30kcal 미만(아메리카노·제로 음료)은 "먹을 것" 추천이 아니라 맨 뒤에서만 채운다.
 */
export function pickRecommendations(candidates: RecommendCandidate[], mode: RecommendMode = 'all', n = 3): RecommendCandidate[] {
  const keyed = candidates.map((c, i) => {
    const key = modeKey(c, mode);
    const tier = (c.kcal < TINY_KCAL ? 4 : 0) + (key === undefined ? 2 : 0) + (c.judgement.verdict === 'good' ? 0 : 1);
    return { c, i, tier, key: key ?? 0 };
  });
  keyed.sort((a, b) => a.tier - b.tier || a.key - b.key || a.i - b.i);
  const seen = new Set<string>();
  const out: RecommendCandidate[] = [];
  for (const { c } of keyed) {
    if (seen.has(c.menu.brandId)) continue;
    seen.add(c.menu.brandId);
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

/** 카드 보조 수치 — 칩이 무엇을 기준으로 골랐는지 보여준다. 값이 없으면 undefined(지어내지 않음) */
export function modeSubLabel(c: RecommendCandidate, mode: RecommendMode): string | undefined {
  const fmt = (v: number) => String(Math.round(v * 10) / 10);
  if (mode === 'protein' && typeof c.nutrients.protein === 'number') return `단백질 ${fmt(c.nutrients.protein)}g`;
  if (mode === 'lowSugar' && typeof c.nutrients.sugar === 'number') return `당 ${fmt(c.nutrients.sugar)}g`;
  return undefined;
}
