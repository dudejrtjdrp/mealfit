/**
 * 홈 "지금 근처 추천" — 주변 매장(데이터 있는 곳)의 메뉴를 한 번에 판정해 상위 몇 개를 고른다.
 * 계산은 전부 순수 함수(테스트 대상). 화면은 useMemo 로 감싸 쓴다.
 */
import { TINY_KCAL, applyOptions, rankMenus, type JudgeContext } from '@/domain/judge';
import type { DailyTargets, Judgement, MenuItem, Store } from '@/domain/types';

export interface RecommendCandidate {
  menu: MenuItem;
  judgement: Judgement;
  /** 그 브랜드의 가장 가까운 매장 */
  store: Store;
  /** 기본 옵션 기준 kcal */
  kcal: number;
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
    const kcal = applyOptions(menu)?.kcal;
    if (!store || typeof kcal !== 'number') continue;
    out.push({ menu, judgement, store, kcal });
  }
  return out;
}

/**
 * 상위 n개: 좋음 먼저 → 괜찮음, 같은 브랜드(=매장)는 1개만.
 * 30kcal 미만(아메리카노·제로 음료)은 "먹을 것" 추천이 아니라 맨 뒤에서만 채운다.
 */
export function pickRecommendations(candidates: RecommendCandidate[], n = 3): RecommendCandidate[] {
  const tier = (c: RecommendCandidate) => (c.judgement.verdict === 'good' ? 0 : 1) + (c.kcal < TINY_KCAL ? 2 : 0);
  const ordered = candidates.map((c, i) => ({ c, i })).sort((a, b) => tier(a.c) - tier(b.c) || a.i - b.i);
  const seen = new Set<string>();
  const out: RecommendCandidate[] = [];
  for (const { c } of ordered) {
    if (seen.has(c.menu.brandId)) continue;
    seen.add(c.menu.brandId);
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}
