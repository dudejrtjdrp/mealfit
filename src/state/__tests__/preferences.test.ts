import AsyncStorage from '@react-native-async-storage/async-storage';

import { MAX_REQUESTS, parseRequestByRules } from '../../domain/preferences';
import { PREFERENCES_KEY, clearPreferences, usePreferences } from '../preferences';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const add = (text: string) => usePreferences.getState().add({ text, tags: parseRequestByRules(text), source: 'rules' });

beforeEach(async () => {
  await AsyncStorage.clear();
  usePreferences.setState({ items: [], status: 'idle' });
});

describe('밀리에게 한 요청 저장', () => {
  it(`${MAX_REQUESTS}개까지 저장하고, 다 차면 하나를 지워야 새로 받는다`, async () => {
    for (const t of ['저당 위주로', '빵은 통밀로', '매운 건 빼 줘', '저녁엔 가볍게', '오이 알레르기']) expect(await add(t)).toEqual({ ok: true });
    expect(await add('단백질 위주로')).toEqual({ ok: false, reason: 'full' });
    expect(usePreferences.getState().items).toHaveLength(5);

    const first = usePreferences.getState().items[0];
    await usePreferences.getState().remove(first.id);
    expect(await add('단백질 위주로')).toEqual({ ok: true });

    // 기기에 남아 다시 불러와도 그대로
    usePreferences.setState({ items: [], status: 'idle' });
    await usePreferences.getState().load();
    expect(usePreferences.getState().items.map((r) => r.text)[0]).toBe('단백질 위주로');
    expect(usePreferences.getState().items).toHaveLength(5);
  });

  it('알아듣지 못한 글은 저장하지 않는다', async () => {
    expect(await add('안녕 밀리')).toEqual({ ok: false, reason: 'empty' });
  });

  it('로그아웃하면 기기에서도 지운다', async () => {
    await add('저당 위주로');
    await clearPreferences();
    expect(usePreferences.getState().items).toEqual([]);
    expect(await AsyncStorage.getItem(PREFERENCES_KEY)).toBeNull();
  });
});
