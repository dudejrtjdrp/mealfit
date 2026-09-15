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
  useNearby.setState({ center: null, areaName: '', radiusM: 500, category: 'all', stores: [], status: 'idle', source: null });
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
