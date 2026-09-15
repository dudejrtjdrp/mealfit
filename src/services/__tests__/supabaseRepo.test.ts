import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { MealLog, Profile } from '../../domain/types';
import { parseAuthParams, sessionFromSupabase } from '../auth';
import { createLocalRepos, STORAGE_KEYS } from '../repo/local';
import { migrateLocalToSupabase } from '../repo/migrate';
import {
  createSupabaseRepos,
  logToRow,
  type MealLogRow,
  profileToRow,
  type ProfileRow,
  rowToLog,
  rowToProfile,
} from '../repo/supabase';
import type { Repos } from '../repo/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-linking', () => ({ createURL: () => 'mealfit://' }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));

const USER = '11111111-1111-4111-8111-111111111111';

const profile: Profile = {
  id: 'local-p1',
  nickname: '지은',
  sex: 'female',
  birthYear: 1994,
  heightCm: 162,
  weightKg: 55.5,
  activity: 3,
  primaryGoal: 'lose',
  secondaryGoals: ['blood_sugar'],
  targetWeightKg: 52,
  targetWeeks: 12,
  dietDescription: '커피를 자주 마셔요',
  diet: { type: 'low_sugar', evidence: [{ title: 'a', detail: 'b' }], source: 'rule' },
  onboardingDone: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
};

const log = (id: string, date: string, extra: Partial<MealLog> = {}): MealLog => ({
  id,
  date,
  mealType: 'lunch',
  time: `${date}T03:00:00.000Z`,
  name: '닭가슴살 샐러드',
  nutrients: { kcal: 320, protein: 28 },
  trust: 'estimated',
  qty: 1,
  createdAt: `${date}T03:00:00.000Z`,
  ...extra,
});

/** supabase-js 쿼리 빌더 흉내: 체이닝 호출을 기록하고 await 하면 준비한 결과를 돌려준다 */
type Call = { table: string; ops: [string, unknown[]][] };
function mockClient(results: (call: Call) => { data: unknown; error: { message: string; code?: string } | null }) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const op of ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'gte', 'lte', 'order', 'maybeSingle']) {
        builder[op] = (...args: unknown[]) => {
          call.ops.push([op, args]);
          return builder;
        };
      }
      builder.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => Promise.resolve(results(call)).then(resolve, reject);
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}
const opNames = (c: Call) => c.ops.map(([o]) => o);
const argsOf = (c: Call, op: string) => c.ops.find(([o]) => o === op)?.[1];

describe('supabase 매핑 (camelCase ↔ snake_case)', () => {
  it('profile 왕복: id 는 로그인 사용자 id, undefined ↔ null', () => {
    const row = profileToRow(profile, USER);
    expect(row).toMatchObject({
      id: USER,
      birth_year: 1994,
      height_cm: 162,
      weight_kg: 55.5,
      primary_goal: 'lose',
      secondary_goals: ['blood_sugar'],
      target_weight_kg: 52,
      target_weeks: 12,
      diet_description: '커피를 자주 마셔요',
      onboarding_done: true,
      created_at: profile.createdAt,
      updated_at: profile.updatedAt,
    });
    expect(rowToProfile(row)).toEqual({ ...profile, id: USER });

    const bare = profileToRow({ ...profile, targetWeightKg: undefined, targetWeeks: undefined, dietDescription: undefined }, USER);
    expect(bare.target_weight_kg).toBeNull();
    expect(bare.diet_description).toBeNull();
    const back = rowToProfile(bare);
    expect('targetWeightKg' in back && back.targetWeightKg !== undefined).toBe(false);
    expect(back.dietDescription).toBeUndefined();
  });

  it('numeric 컬럼이 문자열로 와도 숫자로', () => {
    const row = { ...profileToRow(profile, USER), weight_kg: '55.5', height_cm: '162' } as unknown as ProfileRow;
    expect(rowToProfile(row).weightKg).toBe(55.5);
    const lrow = { ...logToRow(log('a', '2026-09-10'), USER), qty: '1.5' } as unknown as MealLogRow;
    expect(rowToLog(lrow).qty).toBe(1.5);
  });

  it('log 왕복: 선택 필드는 없으면 키 자체가 없다', () => {
    const full = log('a', '2026-09-10', { brandId: 'starbucks', storeName: '스타벅스 역삼점', menuId: 'sb-1', optionLabels: ['시럽 빼기'], verdict: 'good' });
    const row = logToRow(full, USER);
    expect(row).toMatchObject({ user_id: USER, meal_type: 'lunch', brand_id: 'starbucks', store_name: '스타벅스 역삼점', menu_id: 'sb-1', option_labels: ['시럽 빼기'], created_at: full.createdAt });
    expect(rowToLog(row)).toEqual(full);

    const bare = log('b', '2026-09-10');
    const brow = logToRow(bare, USER);
    expect(brow.brand_id).toBeNull();
    expect(brow.verdict).toBeNull();
    expect(rowToLog(brow)).toEqual(bare);
    expect(Object.keys(rowToLog(brow))).not.toContain('brandId');
  });
});

describe('supabase repos (클라이언트 mock)', () => {
  it('profile.get: 본인 id 로 조회, 없으면 null', async () => {
    const { client, calls } = mockClient(() => ({ data: null, error: null }));
    const repos = createSupabaseRepos(client, USER);
    expect(repos.backend).toBe('supabase');
    expect(await repos.profile.get()).toBeNull();
    expect(calls[0].table).toBe('profiles');
    expect(argsOf(calls[0], 'eq')).toEqual(['id', USER]);
    expect(opNames(calls[0])).toContain('maybeSingle');
  });

  it('profile.save: snake_case 행으로 upsert', async () => {
    const { client, calls } = mockClient(() => ({ data: null, error: null }));
    await createSupabaseRepos(client, USER).profile.save(profile);
    const [row, opts] = argsOf(calls[0], 'upsert') as [ProfileRow, unknown];
    expect(row.id).toBe(USER);
    expect(row.birth_year).toBe(1994);
    expect(opts).toEqual({ onConflict: 'id' });
  });

  it('logs.listByDate: user_id·date 로 거르고 행 → MealLog', async () => {
    const rows = [logToRow(log('a', '2026-09-10'), USER)];
    const { client, calls } = mockClient(() => ({ data: rows, error: null }));
    const out = await createSupabaseRepos(client, USER).logs.listByDate('2026-09-10');
    expect(out).toEqual([log('a', '2026-09-10')]);
    expect(calls[0].table).toBe('meal_logs');
    expect(calls[0].ops.filter(([o]) => o === 'eq').map(([, a]) => a)).toEqual([
      ['user_id', USER],
      ['date', '2026-09-10'],
    ]);
  });

  it('logs.datesWithLogs: 중복 제거·정렬', async () => {
    const { client } = mockClient(() => ({ data: [{ date: '2026-09-12' }, { date: '2026-09-10' }, { date: '2026-09-12' }], error: null }));
    expect(await createSupabaseRepos(client, USER).logs.datesWithLogs('2026-09-08', '2026-09-14')).toEqual(['2026-09-10', '2026-09-12']);
  });

  it('오류는 던진다', async () => {
    const { client } = mockClient(() => ({ data: null, error: { message: 'boom' } }));
    await expect(createSupabaseRepos(client, USER).logs.listByDate('2026-09-10')).rejects.toThrow('boom');
  });

  it('aiCache: value 꺼내기, 중복 insert(23505)는 무시', async () => {
    const hit = mockClient(() => ({ data: { value: profile.diet }, error: null }));
    expect(await createSupabaseRepos(hit.client, USER).aiCache.get('k')).toEqual(profile.diet);
    expect(hit.calls[0].table).toBe('diet_type_cache');

    const dup = mockClient(() => ({ data: null, error: { message: 'duplicate key', code: '23505' } }));
    await expect(createSupabaseRepos(dup.client, USER).aiCache.set('k', profile.diet)).resolves.toBeUndefined();
    expect(argsOf(dup.calls[0], 'insert')).toEqual([{ key: 'k', value: profile.diet }]);
  });
});

/** 메모리 Repos (마이그레이션 대상 흉내) */
function memoryRepos(initialProfile: Profile | null = null) {
  let p = initialProfile;
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

describe('로컬 → Supabase 1회 마이그레이션', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  const UUID_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  it('프로필·기록을 옮기고 플래그를 남긴다. 두 번째는 건너뛴다', async () => {
    const local = createLocalRepos(AsyncStorage);
    await local.profile.save(profile);
    await local.logs.add(log(UUID_A, '2026-09-10'));
    await local.logs.add(log('p_old_id', '2026-09-11'));
    const remote = memoryRepos();
    let n = 0;
    const newId = () => `bbbbbbbb-bbbb-4bbb-8bbb-00000000000${n++}`;

    const r1 = await migrateLocalToSupabase({ storage: AsyncStorage, local, remote: remote.repos, userId: USER, newId });
    expect(r1).toEqual({ status: 'done', profile: true, logs: 2 });
    expect(remote.getProfile()?.id).toBe(USER);
    expect(remote.logs.map((l) => l.id)).toEqual([UUID_A, 'bbbbbbbb-bbbb-4bbb-8bbb-000000000000']);
    expect(await AsyncStorage.getItem(STORAGE_KEYS.migrated)).toBe(USER);
    // 로컬 데이터는 백업으로 남긴다
    expect(await local.profile.get()).toEqual(profile);

    const r2 = await migrateLocalToSupabase({ storage: AsyncStorage, local, remote: remote.repos, userId: USER, newId });
    expect(r2.status).toBe('skipped');
    expect(remote.logs).toHaveLength(2);
  });

  it('서버에 이미 프로필이 있으면 덮어쓰지 않는다', async () => {
    const local = createLocalRepos(AsyncStorage);
    await local.profile.save(profile);
    const existing = { ...profile, id: USER, nickname: '서버닉' };
    const remote = memoryRepos(existing);
    const r = await migrateLocalToSupabase({ storage: AsyncStorage, local, remote: remote.repos, userId: USER, newId: () => 'x' });
    expect(r.profile).toBe(false);
    expect(remote.getProfile()?.nickname).toBe('서버닉');
  });

  it('로컬이 비어 있어도 플래그만 남기고 끝', async () => {
    const remote = memoryRepos();
    const r = await migrateLocalToSupabase({ storage: AsyncStorage, local: createLocalRepos(AsyncStorage), remote: remote.repos, userId: USER, newId: () => 'x' });
    expect(r).toEqual({ status: 'done', profile: false, logs: 0 });
    expect(await AsyncStorage.getItem(STORAGE_KEYS.migrated)).toBe(USER);
  });

  it('중간 실패 시 플래그를 남기지 않아 다음에 다시 시도', async () => {
    const local = createLocalRepos(AsyncStorage);
    await local.logs.add(log(UUID_A, '2026-09-10'));
    const remote = memoryRepos();
    remote.repos.logs.add = async () => {
      throw new Error('network');
    };
    await expect(migrateLocalToSupabase({ storage: AsyncStorage, local, remote: remote.repos, userId: USER, newId: () => 'x' })).rejects.toThrow('network');
    expect(await AsyncStorage.getItem(STORAGE_KEYS.migrated)).toBeNull();
  });
});

describe('auth 도우미', () => {
  it('리다이렉트 URL 의 query·fragment 를 읽는다', () => {
    expect(parseAuthParams('mealfit://?code=abc123')).toEqual({ code: 'abc123' });
    expect(parseAuthParams('mealfit://#access_token=t%2B1&refresh_token=r&type=bearer')).toEqual({ access_token: 't+1', refresh_token: 'r', type: 'bearer' });
    expect(parseAuthParams('mealfit://?error=access_denied&error_description=%EC%B7%A8%EC%86%8C')).toEqual({ error: 'access_denied', error_description: '취소' });
  });

  it('Supabase 세션 → 앱 세션 (provider·닉네임)', () => {
    const s = sessionFromSupabase({
      user: { id: USER, email: 'jieun@example.com', created_at: '2026-09-01T00:00:00Z', app_metadata: { provider: 'kakao' }, user_metadata: { name: '지은' }, aud: 'authenticated' },
    } as never);
    expect(s).toEqual({ provider: 'kakao', nickname: '지은', email: 'jieun@example.com', createdAt: '2026-09-01T00:00:00Z', backend: 'supabase', userId: USER });
    const e = sessionFromSupabase({ user: { id: USER, email: 'min@example.com', created_at: 'x', app_metadata: { provider: 'email' }, user_metadata: {} } } as never);
    expect(e.nickname).toBe('min');
    expect(e.provider).toBe('email');
  });
});
