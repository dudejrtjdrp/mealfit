import AsyncStorage from '@react-native-async-storage/async-storage';

import { log } from '../../domain/__tests__/fixtures';
import { clearFavorites, FAVORITES_KEY, rankFrequent, useFavorites, type FavoriteEntry } from '../favorites';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
  useFavorites.setState({ items: [], status: 'idle' });
});

describe('즐겨찾기 저장', () => {
  it('toggle 로 담고 빼며, 기기에 남아 다시 load 해도 유지된다', async () => {
    expect(await useFavorites.getState().toggle({ menuId: 'a', name: '라떼' })).toBe(true);
    expect(await useFavorites.getState().toggle({ menuId: 'b', name: '샐러드' })).toBe(true);
    expect(useFavorites.getState().items.map((x) => x.menuId)).toEqual(['b', 'a']);

    useFavorites.setState({ items: [], status: 'idle' });
    await useFavorites.getState().load();
    expect(useFavorites.getState().items.map((x) => x.name)).toEqual(['샐러드', '라떼']);

    expect(await useFavorites.getState().toggle({ menuId: 'a', name: '라떼' })).toBe(false);
    expect(JSON.parse((await AsyncStorage.getItem(FAVORITES_KEY))!)).toHaveLength(1);
  });

  it('깨진 저장값이면 빈 목록', async () => {
    await AsyncStorage.setItem(FAVORITES_KEY, '{oops');
    await useFavorites.getState().load();
    expect(useFavorites.getState()).toMatchObject({ items: [], status: 'ready' });
  });
});

describe('자주 먹어요 순위', () => {
  const fav = (menuId: string, addedAt: string): FavoriteEntry => ({ menuId, name: menuId, addedAt });

  it('즐겨찾기 먼저, 그다음 2번 이상 먹은 것을 많이 먹은 순으로, 중복 없이', () => {
    const logs = [
      log({ id: '1', menuId: 'latte', name: '라떼', time: '2026-09-10T08:00:00Z' }),
      log({ id: '2', menuId: 'latte', name: '라떼', time: '2026-09-12T08:00:00Z' }),
      log({ id: '3', menuId: 'salad', name: '샐러드', time: '2026-09-11T12:00:00Z' }),
      log({ id: '4', menuId: 'salad', name: '샐러드', time: '2026-09-12T12:00:00Z' }),
      log({ id: '5', menuId: 'salad', name: '샐러드', time: '2026-09-13T12:00:00Z' }),
      log({ id: '6', name: '엄마 김밥', time: '2026-09-13T19:00:00Z' }),
      log({ id: '7', name: '엄마  김밥!', time: '2026-09-14T19:00:00Z' }),
      log({ id: '8', menuId: 'once', name: '한 번', time: '2026-09-14T20:00:00Z' }),
    ];
    const out = rankFrequent(logs, [fav('latte', '2026-09-01'), fav('bagel', '2026-09-02')]);
    expect(out.map((x) => x.key)).toEqual(['m:bagel', 'm:latte', 'm:salad', 'n:엄마김밥']);
    expect(out[1]).toMatchObject({ count: 2, lastLog: { id: '2' } });
    expect(out[0].lastLog).toBeUndefined();
    expect(out[2].count).toBe(3);
    expect(out[3].lastLog?.id).toBe('7');
  });

  it('limit 만큼만', () => {
    expect(rankFrequent([], [fav('a', '1'), fav('b', '2'), fav('c', '3')], 2)).toHaveLength(2);
  });
});

describe('clearFavorites', () => {
  it('메모리와 기기 저장값을 모두 비운다', async () => {
    await useFavorites.getState().toggle({ menuId: 'a', name: '라떼' });
    await clearFavorites();
    expect(useFavorites.getState()).toMatchObject({ items: [], status: 'ready' });
    expect(await AsyncStorage.getItem(FAVORITES_KEY)).toBeNull();
  });
});
