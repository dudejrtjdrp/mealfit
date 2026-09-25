import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MealLog, Profile } from '../../domain/types';
import { createLocalRepos, STORAGE_KEYS } from '../repo/local';
import { discardMigratedBackup, migrateLocalToSupabase } from '../repo/migrate';
import type { Repos } from '../repo/types';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const USER_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const USER_B = 'bbbbbbbb-0000-4000-8000-00000000000b';

const profile = (nickname: string): Profile => ({
  id: `local-${nickname}`,
  nickname,
  sex: 'female',
  birthYear: 1994,
  heightCm: 162,
  weightKg: 55,
  activity: 3,
  primaryGoal: 'maintain',
  secondaryGoals: [],
  diet: { type: 'balanced', evidence: [], source: 'rule' },
  onboardingDone: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

const log = (id: string, date: string): MealLog => ({
  id,
  date,
  mealType: 'lunch',
  time: `${date}T03:00:00.000Z`,
  name: '샐러드',
  nutrients: { kcal: 300 },
  trust: 'estimated',
  qty: 1,
  createdAt: `${date}T03:00:00.000Z`,
});

/** 서버 저장소 흉내 (사용자 한 명 몫) */
function memoryRemote(initial: Profile | null = null) {
  let p = initial;
  const logs: MealLog[] = [];
  const repos: Repos = {
    backend: 'supabase',
    profile: { get: async () => p, save: async (x) => void (p = x), clear: async () => void (p = null) },
    logs: {
      listByDate: async (d) => logs.filter((l) => l.date === d),
      datesWithLogs: async () => [],
      add: async (l) => {
        const i = logs.findIndex((x) => x.id === l.id);
        if (i >= 0) logs[i] = l;
        else logs.push(l);
      },
      update: async () => {},
      remove: async () => {},
      clear: async () => {},
    },
    aiCache: { get: async () => null, set: async () => {} },
  };
  return { repos, logs, getProfile: () => p };
}

let n = 0;
const newId = () => `cccccccc-0000-4000-8000-${String(n++).padStart(12, '0')}`;
const UUID = (k: number) => `dddddddd-0000-4000-8000-${String(k).padStart(12, '0')}`;

describe('로그인 직후 데이터 이어받기 — 한 번 옮긴 기기에서 다시 게스트로 시작', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('게스트가 온보딩을 새로 끝내면(백업 비움) 새 데이터가 다음 로그인 때 옮겨진다', async () => {
    const local = createLocalRepos(AsyncStorage);
    // 1) 게스트 → A 로 로그인: 옮기고 플래그
    await local.profile.save(profile('에이'));
    await local.logs.add(log(UUID(1), '2026-09-10'));
    const a = memoryRemote();
    await migrateLocalToSupabase({ storage: AsyncStorage, local, remote: a.repos, userId: USER_A, newId });
    expect(a.logs).toHaveLength(1);

    // 2) 로그아웃 뒤 새 게스트가 온보딩을 끝냄 → 옮긴 백업·플래그 정리 후 새 프로필·기록
    expect(await discardMigratedBackup({ storage: AsyncStorage, local })).toBe(true);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.migrated)).toBeNull();
    await local.profile.save(profile('비'));
    await local.logs.add(log(UUID(2), '2026-09-20'));

    // 3) B 로 로그인: 새 게스트 데이터만 옮겨지고, A 의 예전 기록은 따라가지 않는다
    const b = memoryRemote();
    const r = await migrateLocalToSupabase({ storage: AsyncStorage, local, remote: b.repos, userId: USER_B, newId });
    expect(r).toEqual({ status: 'done', profile: true, logs: 1 });
    expect(b.getProfile()).toMatchObject({ id: USER_B, nickname: '비' });
    expect(b.logs.map((l) => l.id)).toEqual([UUID(2)]);
  });

  it('같은 계정으로 다시 로그인해도 예전 기록이 두 번 올라가지 않는다', async () => {
    const local = createLocalRepos(AsyncStorage);
    await local.logs.add(log('p_old', '2026-09-10')); // uuid 가 아니라 옮길 때 새 id 를 받는 기록
    const a = memoryRemote();
    await migrateLocalToSupabase({ storage: AsyncStorage, local, remote: a.repos, userId: USER_A, newId });
    await discardMigratedBackup({ storage: AsyncStorage, local });
    await local.logs.add(log(UUID(3), '2026-09-21'));
    await migrateLocalToSupabase({ storage: AsyncStorage, local, remote: a.repos, userId: USER_A, newId });
    expect(a.logs).toHaveLength(2);
  });

  it('서버에 이미 프로필이 있으면(재방문) 서버 것이 우선, 게스트 기록은 합쳐진다', async () => {
    const local = createLocalRepos(AsyncStorage);
    await local.profile.save(profile('게스트'));
    await local.logs.add(log(UUID(4), '2026-09-22'));
    const a = memoryRemote({ ...profile('서버닉'), id: USER_A });
    const r = await migrateLocalToSupabase({ storage: AsyncStorage, local, remote: a.repos, userId: USER_A, newId });
    expect(r.profile).toBe(false);
    expect(a.getProfile()?.nickname).toBe('서버닉');
    expect(a.logs).toHaveLength(1);
  });

  it('아직 옮기지 않은 게스트 데이터(플래그 없음)는 지우지 않는다', async () => {
    const local = createLocalRepos(AsyncStorage);
    await local.profile.save(profile('게스트'));
    await local.logs.add(log(UUID(5), '2026-09-23'));
    expect(await discardMigratedBackup({ storage: AsyncStorage, local })).toBe(false);
    expect(await local.profile.get()).not.toBeNull();
    expect(await local.logs.listByDate('2026-09-23')).toHaveLength(1);
  });
});
