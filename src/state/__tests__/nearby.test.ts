jest.mock('../../services/env', () => ({ env: {}, hasKakao: () => false }));
jest.mock('../../services/location', () => ({
  getCurrentPosition: jest.fn(),
  getPermissionStatus: jest.fn(),
  reverseGeocode: jest.fn(async () => '서울 강남구 역삼동'),
}));

import { YEOKSAM_CENTER } from '../../data/mockStores';
import { clearNearbyCache } from '../../services/kakao';
import * as location from '../../services/location';
import { getBrands } from '../../data';
import { filterStores, groupByVerdict, nearestOfBrand, searchBrands, splitByInfo, summarizeRanked, useNearby } from '../nearby';

const loc = location as jest.Mocked<typeof location>;

beforeEach(() => {
  clearNearbyCache();
  jest.clearAllMocks();
  useNearby.setState({ center: null, pinned: null, areaName: '', radiusM: 500, category: 'all', stores: [], status: 'idle', source: null });
});

describe('nearby store', () => {
  it('위치 → 동네 이름 → 목 매장(키 없음)', async () => {
    loc.getCurrentPosition.mockResolvedValue(YEOKSAM_CENTER);
    await useNearby.getState().refresh();
    await Promise.resolve();
    const s = useNearby.getState();
    expect(s.status).toBe('ready');
    expect(s.source).toBe('mock');
    expect(s.stores[0].name).toBe('GS25 역삼센터점');
    expect(s.stores.every((x) => x.distanceM <= 500)).toBe(true);
    expect(s.areaName).toBe('서울 강남구 역삼동');
    expect(s.findStore(s.stores[0].id)).toBe(s.stores[0]);
  });

  it('반경 1km 로 바꾸면 매장이 늘어난다', async () => {
    loc.getCurrentPosition.mockResolvedValue(YEOKSAM_CENTER);
    await useNearby.getState().refresh();
    const n500 = useNearby.getState().stores.length;
    useNearby.getState().setRadius(1000);
    await new Promise((r) => setTimeout(r, 0));
    expect(useNearby.getState().radiusM).toBe(1000);
    expect(useNearby.getState().stores.length).toBeGreaterThan(n500);
    expect(loc.getCurrentPosition).toHaveBeenCalledTimes(1);
  });

  it('권한 거부 → denied, 권한은 있는데 실패 → error', async () => {
    loc.getCurrentPosition.mockResolvedValue(null);
    loc.getPermissionStatus.mockResolvedValue('denied');
    await useNearby.getState().refresh();
    expect(useNearby.getState().status).toBe('denied');
    loc.getPermissionStatus.mockResolvedValue('granted');
    await useNearby.getState().refresh();
    expect(useNearby.getState().status).toBe('error');
  });

  it('카테고리 필터', async () => {
    loc.getCurrentPosition.mockResolvedValue(YEOKSAM_CENTER);
    useNearby.setState({ radiusM: 1000 });
    await useNearby.getState().refresh();
    const cafes = filterStores(useNearby.getState().stores, 'cafe');
    expect(cafes.length).toBeGreaterThan(0);
    expect(cafes.every((s) => s.category === 'cafe')).toBe(true);
  });
});

describe('위치 설정 (지정 위치)', () => {
  // 역삼에서 약 3km 떨어진 곳 (목 매장이 이 좌표 기준으로 다시 배치돼야 한다)
  const SEOLLEUNG = { lat: 37.5045, lng: 127.0685 };

  it('지정 위치로 바꾸면 그 좌표 기준으로 검색하고 이름을 헤더에 쓴다', async () => {
    loc.getCurrentPosition.mockResolvedValue(YEOKSAM_CENTER);
    await useNearby.getState().refresh();
    loc.getCurrentPosition.mockClear();

    await useNearby.getState().setPinnedLocation(SEOLLEUNG, '서울 강남구 대치동');
    const s = useNearby.getState();
    expect(s.pinned).toEqual({ center: SEOLLEUNG, name: '서울 강남구 대치동' });
    expect(s.center).toEqual(SEOLLEUNG);
    expect(s.areaName).toBe('서울 강남구 대치동');
    expect(s.status).toBe('ready');
    expect(s.stores.length).toBeGreaterThan(0);
    // 목 매장이 지정 좌표 반경 안에 있다 (역삼 기준 목록이 아니다)
    for (const st of s.stores) {
      expect(Math.abs(st.lat - SEOLLEUNG.lat)).toBeLessThan(0.01);
      expect(Math.abs(st.lng - SEOLLEUNG.lng)).toBeLessThan(0.01);
    }
    expect(loc.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('지정 위치가 있으면 새로고침·반경 변경에도 GPS 를 쓰지 않는다', async () => {
    loc.getCurrentPosition.mockResolvedValue(YEOKSAM_CENTER);
    await useNearby.getState().setPinnedLocation(SEOLLEUNG, '지정한 위치');
    await useNearby.getState().refresh();
    useNearby.getState().setRadius(1000);
    await new Promise((r) => setTimeout(r, 0));
    const s = useNearby.getState();
    expect(loc.getCurrentPosition).not.toHaveBeenCalled();
    expect(s.center).toEqual(SEOLLEUNG);
    expect(s.areaName).toBe('지정한 위치');
    expect(s.radiusM).toBe(1000);
    expect(s.status).toBe('ready');
  });

  it('권한이 없어도 지정 위치로는 검색된다', async () => {
    loc.getCurrentPosition.mockResolvedValue(null);
    loc.getPermissionStatus.mockResolvedValue('denied');
    await useNearby.getState().refresh();
    expect(useNearby.getState().status).toBe('denied');
    await useNearby.getState().setPinnedLocation(SEOLLEUNG, '지정한 위치');
    expect(useNearby.getState().status).toBe('ready');
    expect(useNearby.getState().stores.length).toBeGreaterThan(0);
  });

  it('내 위치로 돌아가면 GPS 좌표와 GPS 라벨을 다시 쓴다', async () => {
    loc.getCurrentPosition.mockResolvedValue(YEOKSAM_CENTER);
    await useNearby.getState().setPinnedLocation(SEOLLEUNG, '서울 강남구 대치동');
    await useNearby.getState().clearPinnedLocation();
    await Promise.resolve();
    const s = useNearby.getState();
    expect(s.pinned).toBeNull();
    expect(loc.getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(s.center).toEqual(YEOKSAM_CENTER);
    expect(s.areaName).toBe('서울 강남구 역삼동');
    expect(s.stores[0].name).toBe('GS25 역삼센터점');
  });

  it('GPS 를 찾는 중에 위치를 지정하면 늦게 온 GPS 결과가 덮어쓰지 않는다', async () => {
    let resolveGps: (v: typeof YEOKSAM_CENTER) => void = () => {};
    loc.getCurrentPosition.mockImplementation(() => new Promise((r) => (resolveGps = r)));
    const pending = useNearby.getState().refresh();
    await useNearby.getState().setPinnedLocation(SEOLLEUNG, '지정한 위치');
    resolveGps(YEOKSAM_CENTER);
    await pending;
    const s = useNearby.getState();
    expect(s.center).toEqual(SEOLLEUNG);
    expect(s.areaName).toBe('지정한 위치');
    expect(s.status).toBe('ready');
  });
});

describe('주변 목록 도우미', () => {
  const store = (id: string, over: Partial<import('../../domain/types').Store> = {}) => ({
    id,
    name: id,
    brandId: 'gs25',
    category: 'convenience' as const,
    coverage: 'full' as const,
    distanceM: 100,
    lat: 0,
    lng: 0,
    ...over,
  });

  it('정보 없는 매장(커버리지 none·브랜드 모름)은 아래로 나눈다', () => {
    const { known, noInfo } = splitByInfo([
      store('a'),
      store('b', { coverage: 'none', brandId: 'mega' }),
      store('c', { brandId: undefined, coverage: 'none' }),
      store('d', { coverage: 'partial' }),
    ]);
    expect(known.map((s) => s.id)).toEqual(['a', 'd']);
    expect(noInfo.map((s) => s.id)).toEqual(['b', 'c']);
  });

  it('가장 가까운 같은 브랜드 매장', () => {
    const list = [store('far', { distanceM: 400 }), store('cu', { brandId: 'cu', distanceM: 50 }), store('near', { distanceM: 120 })];
    expect(nearestOfBrand(list, 'gs25')?.id).toBe('near');
    expect(nearestOfBrand(list, 'starbucks')).toBeUndefined();
  });

  it('브랜드 검색: 이름·키워드, 대소문자·공백 무시, 앞에서 맞는 게 먼저', () => {
    const brands = getBrands();
    expect(searchBrands(brands, 'gs').map((b) => b.id)).toContain('gs25');
    expect(searchBrands(brands, '스타')[0].id).toBe('starbucks');
    expect(searchBrands(brands, '  ')).toEqual([]);
    // 매장이 아닌 시판 제품 가상 브랜드는 나오지 않는다
    expect(searchBrands(brands, '가공식품')).toEqual([]);
  });

  it('판정별 묶기와 카드 요약 (오늘은 패스 메뉴는 추천하지 않는다)', () => {
    const j = (verdict: 'good' | 'ok' | 'pass', unknown = false) => ({ verdict, score: 0, reasons: [], unknown });
    const m = (id: string) => ({ id, brandId: 'x', name: id, category: 'meal' as const, serving: '', nutrients: { kcal: 100 }, trust: 'official' as const });
    const ranked = [
      { menu: m('p1'), judgement: j('pass') },
      { menu: m('o1'), judgement: j('ok') },
      { menu: m('g1'), judgement: j('good') },
      { menu: m('g2'), judgement: j('good') },
      { menu: m('u1'), judgement: j('pass', true) },
    ];
    const g = groupByVerdict(ranked);
    expect(g.good.map((r) => r.menu.id)).toEqual(['g1', 'g2']);
    expect(g.ok.map((r) => r.menu.id)).toEqual(['o1']);
    expect(g.pass.map((r) => r.menu.id)).toEqual(['p1']);
    expect(g.unknown.map((r) => r.menu.id)).toEqual(['u1']);

    const pick = summarizeRanked(ranked);
    expect(pick).toMatchObject({ good: 2, ok: 1, known: 4 });
    expect(pick.top?.menu.id).toBe('o1');
    expect(summarizeRanked([{ menu: m('p'), judgement: j('pass') }]).top).toBeNull();
  });
});
