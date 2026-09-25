import AsyncStorage from '@react-native-async-storage/async-storage';

import { PROFILE, TARGETS, log, menu } from '../../domain/__tests__/fixtures';
import { toDateKey } from '../../domain/summary';
import type { Profile } from '../../domain/types';
import { resetReposForTest } from '../../services/repo';
import { clearLogRangeCache, useDay } from '../day';
import { useProfile } from '../profile';
import { applyLogEdit, buildLogs, judgeEaten, recordItems } from '../recordItems';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-crypto', () => ({ randomUUID: () => `id-${Math.random().toString(36).slice(2)}`, CryptoDigestAlgorithm: {}, digestStringAsync: jest.fn() }));
jest.mock('@/components/Toast', () => ({ showToast: jest.fn() }));

const { showToast } = jest.requireMock('@/components/Toast') as { showToast: jest.Mock };

// 2026-09-26 13:05 (로컬)
const NOW = new Date(2026, 8, 26, 13, 5);
const TODAY = '2026-09-26';
const PROF = PROFILE as Profile;
const ENV = { dayLogs: [], targets: TARGETS, profile: PROF };
const SALAD = menu({ id: 'salad', category: 'meal', serving: '1개', nutrients: { kcal: 400, protein: 30, carbs: 30, fat: 12 }, trust: 'official' });

beforeEach(async () => {
  await AsyncStorage.clear();
  resetReposForTest();
  clearLogRangeCache();
  showToast.mockClear();
  useProfile.setState({ targets: TARGETS, profile: PROF });
  useDay.setState({ date: toDateKey(), logs: [], summary: null, status: 'ready' });
});

describe('buildLogs 날짜', () => {
  it('기본은 오늘·지금', () => {
    const [l] = buildLogs([{ name: '샐러드', base: SALAD.nutrients!, qty: 1, trust: 'official', menu: SALAD }], 'lunch', { now: NOW, env: ENV });
    expect(l.date).toBe(TODAY);
    expect(l.time).toBe(NOW.toISOString());
  });

  it('지난 날은 그날 끼니 시각, 여러 개는 순서대로, 미래는 오늘로', () => {
    const items = [
      { name: 'a', base: { kcal: 100 }, qty: 1, trust: 'user' as const },
      { name: 'b', base: { kcal: 200 }, qty: 2, trust: 'user' as const },
    ];
    const logs = buildLogs(items, 'dinner', { date: '2026-09-25', now: NOW, env: ENV });
    expect(logs.map((l) => l.date)).toEqual(['2026-09-25', '2026-09-25']);
    const t = new Date(logs[0].time);
    expect([t.getHours(), t.getMinutes()]).toEqual([18, 30]);
    expect(logs[1].time > logs[0].time).toBe(true);
    expect(logs[1].nutrients.kcal).toBe(400);
    expect(buildLogs(items, 'dinner', { date: '2026-09-30', now: NOW, env: ENV })[0].date).toBe(TODAY);
  });

  it('판정은 먹은 양 기준 — 2개 먹으면 1개보다 같거나 낮게, 직접 입력·noVerdict 는 판정 없음', () => {
    const one = buildLogs([{ name: 's', base: SALAD.nutrients!, qty: 1, trust: 'official', menu: SALAD }], 'lunch', { now: NOW, env: ENV })[0];
    const three = buildLogs([{ name: 's', base: SALAD.nutrients!, qty: 2, trust: 'official', menu: SALAD }], 'lunch', { now: NOW, env: ENV })[0];
    const rank = { good: 0, ok: 1, pass: 2 } as const;
    expect(one.verdict).toBeDefined();
    expect(rank[three.verdict!]).toBeGreaterThanOrEqual(rank[one.verdict!]);
    expect(three.verdict).toBe(judgeEaten(SALAD, three.nutrients, TODAY, NOW, ENV));
    expect(buildLogs([{ name: 's', base: SALAD.nutrients!, qty: 1, trust: 'user', menu: SALAD }], 'lunch', { now: NOW, env: ENV })[0].verdict).toBeUndefined();
    expect(buildLogs([{ name: 's', base: SALAD.nutrients!, qty: 1, trust: 'estimated', menu: SALAD, noVerdict: true }], 'lunch', { now: NOW, env: ENV })[0].verdict).toBeUndefined();
  });

  it('매장 이름을 주면 메뉴 브랜드보다 먼저, 메뉴가 없으면 참조 id 를 옮겨 적는다', () => {
    const [a] = buildLogs([{ name: 's', base: { kcal: 1 }, qty: 1, trust: 'official', menu: SALAD, storeName: '역삼점' }], 'lunch', { now: NOW, env: ENV });
    expect(a.storeName).toBe('역삼점');
    const [b] = buildLogs([{ name: 'p', base: { kcal: 1 }, qty: 1, trust: 'official', menuId: 'remote:1', brandId: 'x' }], 'lunch', { now: NOW, env: ENV });
    expect([b.menuId, b.brandId]).toEqual(['remote:1', 'x']);
  });
});

describe('recordItems', () => {
  it('어제로 기록 → 저장소의 그날에 들어가고 토스트는 "어제 점심으로 기록했어요"', async () => {
    const d = new Date();
    const yesterday = toDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1));
    const logs = await recordItems([{ name: '김밥', base: { kcal: 300 }, qty: 1, trust: 'user' }], 'lunch', { date: yesterday });
    expect(logs[0].date).toBe(yesterday);
    expect(useDay.getState().logs).toHaveLength(0); // 오늘 목록엔 없다
    const byDate = await useDay.getState().logsInRange(yesterday, yesterday);
    expect(byDate[yesterday]).toHaveLength(1);
    expect(showToast.mock.calls[0][0]).toBe('어제 점심으로 기록했어요');
  });
});

describe('applyLogEdit', () => {
  const base = log({ id: 'a', date: TODAY, mealType: 'lunch', time: NOW.toISOString(), menuId: 'salad', trust: 'official', qty: 1, nutrients: SALAD.nutrients!, verdict: 'good' });

  it('수량을 바꾸면 영양을 다시 곱하고 판정도 다시 낸다', () => {
    const next = applyLogEdit(base, { qty: 2 }, { ...ENV, menu: SALAD, now: NOW });
    expect(next.nutrients.kcal).toBe(800);
    expect(next.verdict).toBe(judgeEaten(SALAD, next.nutrients, TODAY, NOW, ENV));
  });

  it('메뉴를 찾을 수 없으면 수량이 바뀐 경우 판정을 지운다, 수량이 같으면 둔다', () => {
    expect(applyLogEdit(base, { qty: 1.5 }, { ...ENV, now: NOW }).verdict).toBeUndefined();
    expect(applyLogEdit(base, { mealType: 'dinner' }, { ...ENV, now: NOW }).verdict).toBe('good');
  });

  it('판정 기준에서 고치는 기록 자신은 뺀다', () => {
    const next = applyLogEdit(base, { qty: 2 }, { ...ENV, dayLogs: [base], menu: SALAD, now: NOW });
    expect(next.verdict).toBe(judgeEaten(SALAD, next.nutrients, TODAY, NOW, ENV));
  });

  it('날짜를 옮기면 그날 끼니 시각으로, 미래는 오늘로', () => {
    const moved = applyLogEdit(base, { date: '2026-09-25', mealType: 'breakfast' }, { ...ENV, menu: SALAD, now: NOW });
    expect(moved.date).toBe('2026-09-25');
    expect(new Date(moved.time).getHours()).toBe(8);
    expect(applyLogEdit(base, { date: '2026-10-01' }, { ...ENV, now: NOW }).date).toBe(TODAY);
  });

  it('직접 입력한 기록만 이름·kcal(1인분)을 고칠 수 있다', () => {
    const manual = log({ id: 'm', date: TODAY, trust: 'user', qty: 2, name: '떡볶이', nutrients: { kcal: 600, carbs: 100 } });
    const next = applyLogEdit(manual, { name: ' 라볶이 ', baseKcal: 350 }, { ...ENV, now: NOW });
    expect(next.name).toBe('라볶이');
    expect(next.nutrients).toEqual({ kcal: 700, carbs: 100 });
    expect(next.verdict).toBeUndefined();
    const other = applyLogEdit(base, { name: '다른 이름', baseKcal: 1 }, { ...ENV, menu: SALAD, now: NOW });
    expect(other.name).toBe(base.name);
    expect(other.nutrients).toBe(base.nutrients);
  });
});

describe('day.updateLog 날짜 옮기기', () => {
  it('다른 날에서 보고 있는 날로 옮겨 오면 목록에 들어오고, 나가면 빠진다', async () => {
    const DATE = '2026-09-15';
    useDay.setState({ date: DATE, logs: [], summary: null, status: 'ready' });
    const l = log({ id: 'x', date: '2026-09-14' });
    await useDay.getState().addLog(l);
    expect(useDay.getState().logs).toHaveLength(0);
    const rev = useDay.getState().rev;
    await useDay.getState().updateLog({ ...l, date: DATE });
    expect(useDay.getState().logs.map((x) => x.id)).toEqual(['x']);
    expect(useDay.getState().rev).toBeGreaterThan(rev);
    await useDay.getState().updateLog({ ...l, date: '2026-09-13' });
    expect(useDay.getState().logs).toHaveLength(0);
  });
});
