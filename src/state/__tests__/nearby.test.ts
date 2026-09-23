jest.mock('../../services/env', () => ({ env: {}, hasKakao: () => false }));
jest.mock('../../services/location', () => ({
  getCurrentPosition: jest.fn(),
  getPermissionStatus: jest.fn(),
  reverseGeocode: jest.fn(async () => '서울 강남구 역삼동'),
}));

import { YEOKSAM_CENTER } from '../../data/mockStores';
import { clearNearbyCache } from '../../services/kakao';
import * as location from '../../services/location';
import { filterStores, useNearby } from '../nearby';

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
