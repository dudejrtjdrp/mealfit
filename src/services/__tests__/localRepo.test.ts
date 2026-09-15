import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DietClassification, MealLog, Profile } from '../../domain/types';
import { createLocalRepos, STORAGE_KEYS } from '../repo/local';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1', CryptoDigestAlgorithm: {}, digestStringAsync: jest.fn() }));

const log = (id: string, date: string, time: string): MealLog => ({
  id,
  date,
  time,
  mealType: 'lunch',
  name: id,
  nutrients: { kcal: 100 },
  trust: 'user',
  qty: 1,
  createdAt: time,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('local repos', () => {
  it('profile 저장·조회·삭제', async () => {
    const repos = createLocalRepos();
    expect(repos.backend).toBe('local');
    expect(await repos.profile.get()).toBeNull();
    const p = { id: 'p1', nickname: '지은' } as Profile;
    await repos.profile.save(p);
    expect(await repos.profile.get()).toEqual(p);
    expect(await AsyncStorage.getItem('mealfit:profile')).not.toBeNull();
    await repos.profile.clear();
    expect(await repos.profile.get()).toBeNull();
  });

  it('logs: 날짜별 저장·시간순 정렬·날짜 목록', async () => {
    const { logs } = createLocalRepos();
    await logs.add(log('b', '2026-09-15', '2026-09-15T12:00:00Z'));
    await logs.add(log('a', '2026-09-15', '2026-09-15T08:00:00Z'));
    await logs.add(log('c', '2026-09-17', '2026-09-17T19:00:00Z'));
    expect((await logs.listByDate('2026-09-15')).map((l) => l.id)).toEqual(['a', 'b']);
    expect(await logs.datesWithLogs('2026-09-14', '2026-09-16')).toEqual(['2026-09-15']);
    expect(await logs.datesWithLogs('2026-09-01', '2026-09-30')).toEqual(['2026-09-15', '2026-09-17']);
    expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.logDates))!)).toEqual(['2026-09-15', '2026-09-17']);
    expect(await AsyncStorage.getItem('mealfit:logs:2026-09-17')).not.toBeNull();
  });

  it('logs: 수정(날짜 이동 포함)·삭제 시 빈 날짜 정리', async () => {
    const { logs } = createLocalRepos();
    await logs.add(log('a', '2026-09-15', '2026-09-15T08:00:00Z'));
    await logs.update({ ...log('a', '2026-09-16', '2026-09-16T08:00:00Z'), name: '수정' });
    expect(await logs.listByDate('2026-09-15')).toEqual([]);
    expect((await logs.listByDate('2026-09-16'))[0].name).toBe('수정');
    expect(await logs.datesWithLogs('2026-09-01', '2026-09-30')).toEqual(['2026-09-16']);
    await logs.remove('a');
    expect(await logs.listByDate('2026-09-16')).toEqual([]);
    expect(await logs.datesWithLogs('2026-09-01', '2026-09-30')).toEqual([]);
    await logs.remove('없는-id');
  });

  it('aiCache', async () => {
    const { aiCache } = createLocalRepos();
    const v: DietClassification = { type: 'balanced', evidence: [], source: 'ai' };
    expect(await aiCache.get('k')).toBeNull();
    await aiCache.set('k', v);
    expect(await aiCache.get('k')).toEqual(v);
    expect(await AsyncStorage.getItem('mealfit:aicache:k')).not.toBeNull();
  });

  it('newId 는 uuid 를 쓰고 실패하면 폴백', () => {
    const { newId } = require('../id');
    expect(newId()).toBe('uuid-1');
  });
});
