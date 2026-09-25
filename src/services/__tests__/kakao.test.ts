jest.mock('../env', () => ({ env: { kakaoRestKey: 'test-key' }, hasKakao: () => true }));

import { YEOKSAM_CENTER } from '../../data/mockStores';
import type { Store } from '../../domain/types';
import { clearNearbyCache, mergeStores, pickGenericPlaces, placeToStore, searchNearbyStores, type KakaoPlace } from '../kakao';

const place = (p: Partial<KakaoPlace> & Pick<KakaoPlace, 'id' | 'place_name'>): KakaoPlace => ({
  x: String(YEOKSAM_CENTER.lng),
  y: String(YEOKSAM_CENTER.lat),
  distance: '100',
  ...p,
});

const store = (id: string, brandId: string | undefined, distanceM: number): Store => ({
  id,
  name: id,
  brandId,
  category: 'cafe',
  coverage: 'full',
  distanceM,
  lat: 0,
  lng: 0,
});

const fetchMock = jest.fn();

beforeEach(() => {
  clearNearbyCache();
  fetchMock.mockReset();
  (globalThis as { fetch: unknown }).fetch = fetchMock;
});

describe('placeToStore', () => {
  it('브랜드 매칭·거리·주소·링크를 싣는다', () => {
    const s = placeToStore(
      place({ id: '123', place_name: 'GS25 역삼센터점', distance: '120', road_address_name: '서울 강남구 테헤란로 146', place_url: 'http://place.map.kakao.com/123', category_group_code: 'CS2' }),
      YEOKSAM_CENTER,
    );
    expect(s).toMatchObject({ id: '123', brandId: 'gs25', category: 'convenience', coverage: 'full', distanceM: 120, address: '서울 강남구 테헤란로 146', placeUrl: 'http://place.map.kakao.com/123' });
  });

  it('distance 가 없으면 haversine 으로 계산한다', () => {
    const s = placeToStore(place({ id: '1', place_name: '스타벅스 역삼역점', distance: '', x: '127.0366', y: '37.5015' }), YEOKSAM_CENTER);
    expect(s?.distanceM).toBeGreaterThan(90);
    expect(s?.distanceM).toBeLessThan(110);
  });

  it('모르는 매장은 coverage none, 좌표가 깨지면 null', () => {
    expect(placeToStore(place({ id: '2', place_name: '동네 식당', category_group_code: 'FD6' }), YEOKSAM_CENTER)).toMatchObject({ brandId: undefined, coverage: 'none' });
    expect(placeToStore(place({ id: '4', place_name: '역삼 호프', category_name: '음식점 > 술집 > 호프,요리주점', category_group_code: 'FD6' }), YEOKSAM_CENTER)).toMatchObject({ coverage: 'none' });
    expect(placeToStore(place({ id: '3', place_name: 'CU', x: 'abc' }), YEOKSAM_CENTER)).toBeNull();
  });
});

describe('브랜드 아닌 동네 식당 → 대표 음식 추정 (일반 식당 기준)', () => {
  it('이름·분류에 단서가 있으면 coverage partial + 분류를 싣는다 (브랜드는 없다)', () => {
    const s = placeToStore(place({ id: 'g', place_name: '할매 돼지국밥', category_name: '음식점 > 한식 > 국밥', category_group_code: 'FD6' }), YEOKSAM_CENTER);
    expect(s).toMatchObject({ brandId: undefined, coverage: 'partial', category: 'korean', placeCategory: '음식점 > 한식 > 국밥' });
    expect(placeToStore(place({ id: 'k', place_name: '동네 김밥', category_group_code: 'FD6' }), YEOKSAM_CENTER)).toMatchObject({ brandId: undefined, coverage: 'partial' });
  });

  it('pickGenericPlaces: 추정할 수 있는 브랜드 아닌 식당만 가까운 순 limit 곳', () => {
    const mk = (id: string, over: Partial<Store>): Store => ({ ...store(id, undefined, 100), coverage: 'partial', ...over });
    const got = pickGenericPlaces([mk('far', { distanceM: 400 }), mk('none', { coverage: 'none', distanceM: 10 }), mk('brand', { brandId: 'gs25', distanceM: 5 }), mk('near', { distanceM: 50 }), mk('mid', { distanceM: 200 })], 2);
    expect(got.map((s) => s.id)).toEqual(['near', 'mid']);
  });

  it('검색: 브랜드 키워드 검색 + 음식점 분류 검색에서 추정 가능한 동네 식당을 더한다 (가상 브랜드는 검색하지 않는다)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (u.pathname.endsWith('/category.json')) {
        const page = u.searchParams.get('page');
        const docs =
          page === '1'
            ? [
                place({ id: 'p1', place_name: '할매 돼지국밥', category_name: '음식점 > 한식 > 국밥', distance: '90' }),
                place({ id: 'p2', place_name: '역삼 호프', category_name: '음식점 > 술집 > 호프,요리주점', distance: '60' }),
                place({ id: 'p3', place_name: 'GS25 역삼센터점', category_name: '가정,생활 > 편의점', distance: '120' }),
              ]
            : [];
        return { ok: true, json: async () => ({ documents: docs }) };
      }
      const q = u.searchParams.get('query');
      return { ok: true, json: async () => ({ documents: q === 'GS25' ? [place({ id: 'p3', place_name: 'GS25 역삼센터점', distance: '120' })] : [] }) };
    });
    const r = await searchNearbyStores({ lat: 37.5006, lng: 127.0366, radiusM: 500, now: 5000 });
    expect(r.stores.map((s) => s.id)).toEqual(['p1', 'p3']);
    expect(r.stores[0]).toMatchObject({ name: '할매 돼지국밥', brandId: undefined, coverage: 'partial' });
    const queries = fetchMock.mock.calls.map(([u]) => new URL(u as string).searchParams.get('query')).filter(Boolean);
    expect(queries).not.toContain('가공식품');
    expect(queries).not.toContain('일반 식당');
  });
});

describe('mergeStores', () => {
  it('반경 필터 → 중복 제거 → 브랜드 상한 → 거리순', () => {
    const merged = mergeStores(
      [
        [store('a', 'starbucks', 300), store('b', 'starbucks', 100), store('far', 'gs25', 900)],
        [store('b', 'starbucks', 100), store('c', 'starbucks', 200), store('d', 'starbucks', 50), store('e', 'gs25', 80)],
      ],
      500,
      3,
    );
    expect(merged.map((s) => s.id)).toEqual(['d', 'e', 'b', 'c']);
  });
});

describe('searchNearbyStores', () => {
  it('카카오 응답을 병합하고 5분 캐시한다', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const q = new URL(url).searchParams.get('query');
      const docs = q === 'GS25' ? [place({ id: 'g1', place_name: 'GS25 역삼센터점', distance: '120' })] : q === '스타벅스' ? [place({ id: 's1', place_name: '스타벅스 역삼역점', distance: '180' }), place({ id: 'x', place_name: '투썸플레이스', distance: '50' })] : [];
      return { ok: true, json: async () => ({ documents: docs }) };
    });
    const r = await searchNearbyStores({ lat: 37.5006, lng: 127.0366, radiusM: 500, now: 1000 });
    expect(r.source).toBe('kakao');
    expect(r.stores.map((s) => s.id)).toEqual(['g1', 's1']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('radius=500');
    expect(init.headers.Authorization).toBe('KakaoAK test-key');

    const calls = fetchMock.mock.calls.length;
    await searchNearbyStores({ lat: 37.50061, lng: 127.03662, radiusM: 500, now: 1000 + 60_000 });
    expect(fetchMock.mock.calls.length).toBe(calls);
    await searchNearbyStores({ lat: 37.5006, lng: 127.0366, radiusM: 500, now: 1000 + 6 * 60_000 });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(calls);
  });

  it('전부 실패하면 목 매장(반경 필터)으로 폴백', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await searchNearbyStores({ ...YEOKSAM_CENTER, radiusM: 500 });
    warn.mockRestore();
    expect(r.source).toBe('mock');
    expect(r.stores.length).toBeGreaterThan(0);
    expect(r.stores.every((s) => s.distanceM <= 500)).toBe(true);
    expect(r.stores[0].name).toBe('GS25 역삼센터점');
  });
});
