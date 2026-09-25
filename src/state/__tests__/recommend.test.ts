import { getMenusByBrand, getMockStores } from '../../data';
import { YEOKSAM_CENTER } from '../../data/mockStores';
import { PROFILE, TARGETS, menu } from '../../domain/__tests__/fixtures';
import type { MenuItem, Store } from '../../domain/types';
import { collectCandidates, nearestStoresWithData, pickRecommendations } from '../recommend';

const ctx = { profile: PROFILE };

function store(partial: Partial<Store> & Pick<Store, 'id'>): Store {
  return { name: partial.id, category: 'cafe', coverage: 'full', distanceM: 100, lat: 0, lng: 0, ...partial };
}

const MENUS: Record<string, MenuItem[]> = {
  a: [
    menu({ id: 'a-salad', brandId: 'a', category: 'salad', nutrients: { kcal: 250, protein: 20, sugar: 4 } }),
    menu({ id: 'a-wrap', brandId: 'a', category: 'meal', nutrients: { kcal: 300, protein: 15, sugar: 6 } }),
  ],
  b: [
    menu({ id: 'b-sandwich', brandId: 'b', category: 'meal', nutrients: { kcal: 380, protein: 18, sugar: 8 } }),
    menu({ id: 'b-cake', brandId: 'b', category: 'snack', nutrients: { kcal: 1900, sugar: 60 } }),
    menu({ id: 'b-unknown', brandId: 'b', category: 'meal', nutrients: null, trust: 'none' }),
  ],
  c: [menu({ id: 'c-americano', brandId: 'c', category: 'drink', nutrients: { kcal: 10 } })],
  d: [menu({ id: 'd-bowl', brandId: 'd', category: 'meal', nutrients: { kcal: 420, protein: 30, sugar: 5 } })],
};
const menusFor = (id: string) => MENUS[id] ?? [];

describe('nearestStoresWithData', () => {
  it('정보 없는 매장은 빼고 브랜드마다 가장 가까운 매장 하나', () => {
    const stores = [
      store({ id: 'a2', brandId: 'a', distanceM: 300 }),
      store({ id: 'a1', brandId: 'a', distanceM: 120 }),
      store({ id: 'x', distanceM: 50, coverage: 'none' }),
      store({ id: 'b1', brandId: 'b', distanceM: 200, coverage: 'none' }),
      store({ id: 'd1', brandId: 'd', distanceM: 80 }),
    ];
    expect(nearestStoresWithData(stores).map((s) => s.id)).toEqual(['d1', 'a1']);
  });
});

describe('collectCandidates + pickRecommendations', () => {
  const stores = [store({ id: 'a1', brandId: 'a' }), store({ id: 'b1', brandId: 'b' }), store({ id: 'c1', brandId: 'c' }), store({ id: 'd1', brandId: 'd' })];

  it('정보 없음·오늘은 패스는 후보에서 빠진다', () => {
    const cands = collectCandidates(stores, menusFor, TARGETS, ctx);
    const ids = cands.map((c) => c.menu.id);
    expect(ids).not.toContain('b-unknown');
    expect(ids).not.toContain('b-cake');
    expect(cands.every((c) => c.judgement.verdict !== 'pass' && !c.judgement.unknown)).toBe(true);
    expect(cands.find((c) => c.menu.id === 'a-salad')?.store.id).toBe('a1');
  });

  it('같은 브랜드는 1개만, 최대 3개, 30kcal 미만은 맨 뒤에서만 채운다', () => {
    const picks = pickRecommendations(collectCandidates(stores, menusFor, TARGETS, ctx));
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((p) => p.menu.brandId)).size).toBe(3);
    expect(picks.map((p) => p.menu.id)).not.toContain('c-americano');
  });

  it('좋음이 괜찮음보다 먼저', () => {
    const picks = pickRecommendations(collectCandidates(stores, menusFor, TARGETS, ctx), 10);
    const firstOk = picks.findIndex((p) => p.judgement.verdict === 'ok');
    const lastGood = picks.map((p) => p.judgement.verdict).lastIndexOf('good');
    if (firstOk >= 0 && lastGood >= 0) expect(lastGood).toBeLessThan(firstOk);
  });

  it('데이터 매장이 없으면 빈 배열', () => {
    expect(collectCandidates([store({ id: 'x', coverage: 'none' })], menusFor, TARGETS, ctx)).toEqual([]);
    expect(pickRecommendations([])).toEqual([]);
  });

  it('남은 kcal 이 거의 없으면 들어갈 메뉴만 남는다', () => {
    const tight = { ...TARGETS, kcal: 200 };
    const cands = collectCandidates(stores, menusFor, tight, ctx);
    expect(cands.every((c) => c.kcal <= 200)).toBe(true);
  });
});

describe('실제 목 매장 (역삼동)', () => {
  it('3개, 서로 다른 매장, 전부 판정 있음', () => {
    const picks = pickRecommendations(collectCandidates(getMockStores(YEOKSAM_CENTER), getMenusByBrand, TARGETS, ctx));
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((p) => p.store.id)).size).toBe(3);
    for (const p of picks) {
      expect(p.judgement.unknown).toBe(false);
      expect(p.judgement.verdict).not.toBe('pass');
      expect(p.kcal).toBeGreaterThanOrEqual(30);
    }
  });
});
