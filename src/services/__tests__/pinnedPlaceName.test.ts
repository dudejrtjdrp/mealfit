jest.mock('../env', () => ({ env: {} as { kakaoRestKey?: string } }));

import { env } from '../env';
import { PINNED_FALLBACK_NAME, areaFromCoord2Address, pinnedPlaceName } from '../location';

const mockEnv = env as { kakaoRestKey?: string };

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockReset();
  (globalThis as { fetch: unknown }).fetch = fetchMock;
  delete mockEnv.kakaoRestKey;
});

const doc = (r1: string, r2: string, r3: string) => ({ region_1depth_name: r1, region_2depth_name: r2, region_3depth_name: r3 });

describe('areaFromCoord2Address', () => {
  it('지번 주소의 시·구·동을 짧게 잇는다', () => {
    expect(areaFromCoord2Address({ documents: [{ address: doc('서울특별시', '강남구', '역삼동'), road_address: null }] })).toBe('서울 강남구 역삼동');
    expect(areaFromCoord2Address({ documents: [{ address: doc('경상남도', '창원시 성산구', '상남동') }] })).toBe('경남 창원시 성산구 상남동');
  });

  it('지번이 없으면 도로명 주소의 동을 쓴다', () => {
    expect(areaFromCoord2Address({ documents: [{ address: null, road_address: doc('서울', '강남구', '대치동') }] })).toBe('서울 강남구 대치동');
  });

  it('동 이름이 없거나 결과가 없으면 null', () => {
    expect(areaFromCoord2Address({ documents: [] })).toBeNull();
    expect(areaFromCoord2Address({ documents: [{ address: doc('서울', '강남구', '') }] })).toBeNull();
    expect(areaFromCoord2Address(null)).toBeNull();
  });
});

describe('pinnedPlaceName', () => {
  it('카카오 키가 없으면 부르지 않고 "지정한 위치"', async () => {
    await expect(pinnedPlaceName(37.5, 127.03)).resolves.toBe(PINNED_FALLBACK_NAME);
    expect(PINNED_FALLBACK_NAME).toBe('지정한 위치');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('키가 있으면 coord2address 로 동 이름', async () => {
    mockEnv.kakaoRestKey = 'test-key';
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ documents: [{ address: doc('서울특별시', '강남구', '역삼동') }] }) });
    await expect(pinnedPlaceName(37.5006, 127.0366)).resolves.toBe('서울 강남구 역삼동');
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe('https://dapi.kakao.com/v2/local/geo/coord2address.json?x=127.0366&y=37.5006');
    expect(init.headers.Authorization).toBe('KakaoAK test-key');
  });

  it('응답 오류·네트워크 실패·빈 결과면 "지정한 위치"', async () => {
    mockEnv.kakaoRestKey = 'test-key';
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    await expect(pinnedPlaceName(37.5, 127.03)).resolves.toBe('지정한 위치');
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(pinnedPlaceName(37.5, 127.03)).resolves.toBe('지정한 위치');
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ documents: [] }) });
    await expect(pinnedPlaceName(37.5, 127.03)).resolves.toBe('지정한 위치');
  });
});
