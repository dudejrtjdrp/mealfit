import AsyncStorage from '@react-native-async-storage/async-storage';

import { TARGETS, log } from '../../domain/__tests__/fixtures';
import { resetReposForTest } from '../../services/repo';
import { clearLogRangeCache, defaultMealType, dominantVerdict, useDay, weekTally } from '../day';
import { useProfile } from '../profile';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid-1', CryptoDigestAlgorithm: {}, digestStringAsync: jest.fn() }));

const DATE = '2026-09-15';

beforeEach(async () => {
  await AsyncStorage.clear();
  resetReposForTest();
  useProfile.setState({ targets: TARGETS });
  useDay.setState({ date: DATE, logs: [], summary: null, status: 'idle' });
  clearLogRangeCache();
});

describe('day store', () => {
  it('load: 기록이 없으면 empty 요약', async () => {
    await useDay.getState().load(DATE);
    const s = useDay.getState();
    expect(s.status).toBe('ready');
    expect(s.summary?.status).toBe('empty');
    expect(s.summary?.remaining.kcal).toBe(1800);
  });

  it('addLog → 요약 갱신 + 저장소 반영, 다시 load 해도 유지', async () => {
    await useDay.getState().load(DATE);
    await useDay.getState().addLog(log({ id: 'a', date: DATE, nutrients: { kcal: 500, protein: 20 } }));
    await useDay.getState().addLog(log({ id: 'b', date: DATE, time: '2026-09-15T08:00:00.000Z', nutrients: { kcal: 300 } }));
    let s = useDay.getState();
    expect(s.logs.map((l) => l.id)).toEqual(['b', 'a']);
    expect(s.summary?.consumed.kcal).toBe(800);
    expect(s.summary?.status).toBe('room');

    useDay.setState({ logs: [], summary: null });
    await useDay.getState().load(DATE);
    s = useDay.getState();
    expect(s.logs).toHaveLength(2);
    expect(await s.datesWithLogs('2026-09-14', '2026-09-20')).toEqual([DATE]);
  });

  it('updateLog·removeLog', async () => {
    await useDay.getState().load(DATE);
    const a = log({ id: 'a', date: DATE, nutrients: { kcal: 1700 } });
    await useDay.getState().addLog(a);
    expect(useDay.getState().summary?.status).toBe('almost');
    await useDay.getState().updateLog({ ...a, qty: 2, nutrients: { kcal: 3400 } });
    expect(useDay.getState().summary?.status).toBe('over');
    await useDay.getState().removeLog('a');
    expect(useDay.getState().summary?.status).toBe('empty');
    await useDay.getState().load(DATE);
    expect(useDay.getState().logs).toHaveLength(0);
  });

  it('다른 날짜 기록은 오늘 목록에 섞이지 않는다', async () => {
    await useDay.getState().load(DATE);
    await useDay.getState().addLog(log({ id: 'y', date: '2026-09-14', nutrients: { kcal: 400 } }));
    expect(useDay.getState().logs).toHaveLength(0);
    expect(await useDay.getState().datesWithLogs('2026-09-14', '2026-09-14')).toEqual(['2026-09-14']);
  });

  it('목표량이 바뀌면 요약을 다시 계산한다', async () => {
    await useDay.getState().load(DATE);
    useProfile.setState({ targets: { ...TARGETS, kcal: 2000 } });
    expect(useDay.getState().summary?.remaining.kcal).toBe(2000);
  });

  it('defaultMealType: 시각 기준 기본 끼니', () => {
    const at = (h: number) => new Date(2026, 8, 15, h, 0);
    expect(defaultMealType(at(8))).toBe('breakfast');
    expect(defaultMealType(at(12))).toBe('lunch');
    expect(defaultMealType(at(19))).toBe('dinner');
    expect(defaultMealType(at(22))).toBe('snack');
  });

  it('logsInRange: 날짜별로 묶고, 기록이 바뀌면 캐시를 비운다', async () => {
    await useDay.getState().load(DATE);
    await useDay.getState().addLog(log({ id: 'm', date: '2026-09-14', verdict: 'good' }));
    await useDay.getState().addLog(log({ id: 't', date: DATE, verdict: 'ok' }));
    let week = await useDay.getState().logsInRange('2026-09-14', '2026-09-20');
    expect(Object.keys(week).sort()).toEqual(['2026-09-14', DATE]);

    await useDay.getState().removeLog('t');
    week = await useDay.getState().logsInRange('2026-09-14', '2026-09-20');
    expect(Object.keys(week)).toEqual(['2026-09-14']);

    // 되돌리기: 지운 기록을 다시 add
    await useDay.getState().addLog(log({ id: 't', date: DATE, verdict: 'ok' }));
    week = await useDay.getState().logsInRange('2026-09-14', '2026-09-20');
    expect(week[DATE].map((l) => l.id)).toEqual(['t']);
  });

  it('dominantVerdict: 가장 많은 판정, 같으면 좋은 쪽', () => {
    expect(dominantVerdict([])).toBeUndefined();
    expect(dominantVerdict([{}, {}])).toBeUndefined();
    expect(dominantVerdict([{ verdict: 'pass' }, { verdict: 'pass' }, { verdict: 'good' }])).toBe('pass');
    expect(dominantVerdict([{ verdict: 'ok' }, { verdict: 'good' }])).toBe('good');
    expect(dominantVerdict([{ verdict: 'ok' }, { verdict: 'pass' }, {}])).toBe('ok');
  });

  it('weekTally: 좋음 끼니 수 · 기록한 날 수', () => {
    expect(weekTally({ a: [{ verdict: 'good' }, { verdict: 'ok' }], b: [{ verdict: 'good' }], c: [] })).toEqual({ good: 2, days: 2 });
  });
});
