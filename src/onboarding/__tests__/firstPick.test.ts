import type { Judgement, MenuItem, Store, Verdict } from '../../domain/types';
import { FALLBACK_BRANDS, NEARBY_STORES_TO_CHECK, pickExample, pickFirstVerdict, pickNearby, type Ranked } from '../firstPick';

const menu = (id: string, brandId: string): MenuItem => ({ id, brandId, name: id, category: 'meal', serving: '1개', nutrients: { kcal: 300 }, trust: 'official' });
const judged = (verdict: Verdict, unknown = false): Judgement => ({ verdict, unknown, score: unknown ? -1 : verdict === 'good' ? 90 : verdict === 'ok' ? 60 : 20, reasons: ['이유'] });

const store = (id: string, brandId: string | undefined, distanceM: number, coverage: Store['coverage'] = 'full'): Store => ({ id, name: `${id}점`, brandId, category: 'cafe', coverage, distanceM, lat: 0, lng: 0 });

/** 브랜드별 1위 판정을 정해 두는 가짜 순위 함수 */
function fakeRank(top: Record<string, Verdict | 'unknown'>) {
  return (menus: MenuItem[]): Ranked => {
    if (menus.length === 0) return [];
    const v = top[menus[0].brandId];
    if (!v) return [];
    return [{ menu: menus[0], judgement: v === 'unknown' ? judged('pass', true) : judged(v) }];
  };
}
const menusOf = (brandId: string) => [menu(`${brandId}-1`, brandId)];

describe('첫 판정 체험 — 근처에서 지금 먹기 좋은 메뉴 하나', () => {
  it('가까운 매장 중 "좋음"이 나오는 첫 매장의 1위 (매장 이름·거리 포함)', () => {
    const stores = [store('far', 'b', 300), store('near', 'a', 100), store('mid', 'c', 200)];
    const pick = pickNearby({ stores, nearbyIsReal: true, menusOf, rank: fakeRank({ a: 'ok', b: 'good', c: 'good' }) });
    expect(pick).toMatchObject({ menu: { id: 'c-1' }, storeName: 'mid점', distanceM: 200, example: false });
  });

  it('"좋음"이 없으면 가장 가까운 "괜찮음"', () => {
    const stores = [store('s1', 'a', 100), store('s2', 'b', 200)];
    expect(pickNearby({ stores, nearbyIsReal: true, menusOf, rank: fakeRank({ a: 'ok', b: 'ok' }) })?.storeName).toBe('s1점');
  });

  it('정보 없는 매장·브랜드 매칭 실패·패스뿐인 매장은 건너뛴다', () => {
    const stores = [store('none', 'x', 50, 'none'), store('nobrand', undefined, 60), store('pass', 'p', 70), store('unk', 'u', 80), store('ok', 'a', 90)];
    const pick = pickNearby({ stores, nearbyIsReal: true, menusOf, rank: fakeRank({ x: 'good', p: 'pass', u: 'unknown', a: 'ok' }) });
    expect(pick?.storeName).toBe('ok점');
  });

  it(`가까운 매장 ${NEARBY_STORES_TO_CHECK}곳까지만 본다`, () => {
    const stores = Array.from({ length: NEARBY_STORES_TO_CHECK + 1 }, (_, i) => store(`s${i}`, i === NEARBY_STORES_TO_CHECK ? 'good' : 'none-brand', (i + 1) * 10));
    expect(pickNearby({ stores, nearbyIsReal: true, menusOf, rank: fakeRank({ good: 'good' }) })).toBeNull();
  });

  it('실제 근처가 아니면(목 매장·데모 동네) 근처라고 하지 않고 예시로', () => {
    const stores = [store('s1', 'subway', 100)];
    const rank = fakeRank({ subway: 'good' });
    expect(pickNearby({ stores, nearbyIsReal: false, menusOf, rank })).toBeNull();
    expect(pickFirstVerdict({ stores, nearbyIsReal: false, menusOf, rank })).toMatchObject({ example: true, menu: { brandId: 'subway' } });
  });

  it('근처에서 못 찾으면 대표 브랜드 예시 — "좋음" 우선, 없으면 첫 "괜찮음"', () => {
    const [first, second] = FALLBACK_BRANDS;
    expect(pickFirstVerdict({ stores: [], nearbyIsReal: true, menusOf, rank: fakeRank({ [first]: 'ok', [second]: 'good' }) })).toMatchObject({ example: true, menu: { brandId: second } });
    expect(pickExample({ menusOf, rank: fakeRank({ [first]: 'ok' }) })?.menu.brandId).toBe(first);
    expect(pickExample({ menusOf, rank: fakeRank({}) })).toBeNull();
  });
});
