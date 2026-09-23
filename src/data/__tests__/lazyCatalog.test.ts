/**
 * 카탈로그 지연 로드: import 만으로는 4.2MB 식약처 번들을 읽거나 1만여 메뉴를 병합하지 않는다
 * (로그인·온보딩 첫 렌더를 막지 않게). 첫 접근 또는 예열 때 1회만 만든다.
 */
let mfdsLoads = 0;
jest.mock('../generated/mfds.json', () => {
  mfdsLoads += 1;
  return jest.requireActual('../generated/mfds.json');
});

import { getMenus, getSeedPolicy, isCatalogReady, prewarmCatalog, resetCatalogForTest, searchMenus } from '../index';

beforeEach(() => {
  resetCatalogForTest();
  jest.useRealTimers();
});

it('import 만으로는 카탈로그를 만들지 않는다 (mfds.json 미로드)', () => {
  expect(mfdsLoads).toBe(0);
  expect(isCatalogReady()).toBe(false);
});

it('첫 접근 때 한 번만 만들고 같은 결과를 재사용한다', () => {
  const a = getMenus();
  expect(isCatalogReady()).toBe(true);
  expect(mfdsLoads).toBe(1);
  expect(getMenus()).toBe(a);
  expect(a.length).toBeGreaterThan(1000);
  expect(getSeedPolicy()).toBeDefined();
  expect(searchMenus('아메리카노', 3).length).toBeGreaterThan(0);
});

it('prewarmCatalog: 즉시가 아니라 지연 뒤 한가할 때 만든다 (중복 예약 없음)', () => {
  jest.useFakeTimers();
  prewarmCatalog(500);
  prewarmCatalog(500);
  expect(isCatalogReady()).toBe(false);
  jest.advanceTimersByTime(499);
  expect(isCatalogReady()).toBe(false);
  jest.runAllTimers();
  expect(isCatalogReady()).toBe(true);
});
