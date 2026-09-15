import type { SupabaseClient } from '@supabase/supabase-js';

import type { DietClassification, MealLog, Nutrients, Profile } from '../../domain/types';
import type { AICacheRepo, LogRepo, ProfileRepo, Repos } from './types';

/** DB 행 모양 (supabase/migrations/0001_init.sql 과 1:1) */
export interface ProfileRow {
  id: string;
  nickname: string;
  sex: Profile['sex'];
  birth_year: number;
  height_cm: number;
  weight_kg: number;
  activity: Profile['activity'];
  primary_goal: Profile['primaryGoal'];
  secondary_goals: Profile['secondaryGoals'];
  target_weight_kg: number | null;
  target_weeks: number | null;
  diet_description: string | null;
  diet: DietClassification;
  onboarding_done: boolean;
  created_at: string;
  updated_at: string;
}

export interface MealLogRow {
  id: string;
  user_id: string;
  date: string;
  meal_type: MealLog['mealType'];
  time: string;
  name: string;
  brand_id: string | null;
  store_name: string | null;
  menu_id: string | null;
  option_labels: string[] | null;
  nutrients: Nutrients;
  trust: MealLog['trust'];
  qty: number;
  verdict: MealLog['verdict'] | null;
  created_at: string;
}

const orNull = <T>(v: T | undefined): T | null => (v === undefined ? null : v);
const orUndef = <T>(v: T | null | undefined): T | undefined => (v === null || v === undefined ? undefined : v);
/** numeric 컬럼은 문자열로 올 수도 있다 */
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v));
const numOrUndef = (v: unknown): number | undefined => (v === null || v === undefined ? undefined : num(v));

// ---------------------------------------------------------------------------
// camelCase ↔ snake_case 매핑
// ---------------------------------------------------------------------------

/** 프로필 → 행. id 는 항상 로그인 사용자 id (profiles.id = auth.users.id) */
export function profileToRow(p: Profile, userId: string): ProfileRow {
  return {
    id: userId,
    nickname: p.nickname,
    sex: p.sex,
    birth_year: p.birthYear,
    height_cm: p.heightCm,
    weight_kg: p.weightKg,
    activity: p.activity,
    primary_goal: p.primaryGoal,
    secondary_goals: p.secondaryGoals ?? [],
    target_weight_kg: orNull(p.targetWeightKg),
    target_weeks: orNull(p.targetWeeks),
    diet_description: orNull(p.dietDescription),
    diet: p.diet,
    onboarding_done: p.onboardingDone,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

export function rowToProfile(r: ProfileRow): Profile {
  return {
    id: r.id,
    nickname: r.nickname,
    sex: r.sex,
    birthYear: num(r.birth_year),
    heightCm: num(r.height_cm),
    weightKg: num(r.weight_kg),
    activity: num(r.activity) as Profile['activity'],
    primaryGoal: r.primary_goal,
    secondaryGoals: r.secondary_goals ?? [],
    targetWeightKg: numOrUndef(r.target_weight_kg),
    targetWeeks: numOrUndef(r.target_weeks),
    dietDescription: orUndef(r.diet_description),
    diet: r.diet,
    onboardingDone: Boolean(r.onboarding_done),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function logToRow(l: MealLog, userId: string): MealLogRow {
  return {
    id: l.id,
    user_id: userId,
    date: l.date,
    meal_type: l.mealType,
    time: l.time,
    name: l.name,
    brand_id: orNull(l.brandId),
    store_name: orNull(l.storeName),
    menu_id: orNull(l.menuId),
    option_labels: orNull(l.optionLabels),
    nutrients: l.nutrients,
    trust: l.trust,
    qty: l.qty,
    verdict: orNull(l.verdict),
    created_at: l.createdAt,
  };
}

export function rowToLog(r: MealLogRow): MealLog {
  const log: MealLog = {
    id: r.id,
    // date 컬럼은 'YYYY-MM-DD' 로 오지만 혹시 시각이 붙어 와도 날짜만
    date: String(r.date).slice(0, 10),
    mealType: r.meal_type,
    time: r.time,
    name: r.name,
    nutrients: r.nutrients,
    trust: r.trust,
    qty: num(r.qty),
    createdAt: r.created_at,
  };
  if (r.brand_id != null) log.brandId = r.brand_id;
  if (r.store_name != null) log.storeName = r.store_name;
  if (r.menu_id != null) log.menuId = r.menu_id;
  if (r.option_labels != null) log.optionLabels = r.option_labels;
  if (r.verdict != null) log.verdict = r.verdict;
  return log;
}

/** Supabase 오류를 그대로 던진다 (호출하는 스토어가 잡아서 화면을 살려 둔다) */
function check<T>(res: { data: T; error: { message: string; code?: string } | null }, what: string): T {
  if (res.error) {
    const err = new Error(`[supabase] ${what}: ${res.error.message}`) as Error & { code?: string };
    err.code = res.error.code;
    throw err;
  }
  return res.data;
}

// ---------------------------------------------------------------------------
// 저장소 구현 (현재 로그인 사용자 기준)
// ---------------------------------------------------------------------------

export function createSupabaseProfileRepo(db: SupabaseClient, userId: string): ProfileRepo {
  return {
    get: async () => {
      const data = check(await db.from('profiles').select('*').eq('id', userId).maybeSingle(), 'profile.get');
      return data ? rowToProfile(data as ProfileRow) : null;
    },
    save: async (profile) => {
      check(await db.from('profiles').upsert(profileToRow(profile, userId), { onConflict: 'id' }), 'profile.save');
    },
    clear: async () => {
      check(await db.from('profiles').delete().eq('id', userId), 'profile.clear');
    },
  };
}

export function createSupabaseLogRepo(db: SupabaseClient, userId: string): LogRepo {
  return {
    listByDate: async (date) => {
      const data = check(
        await db.from('meal_logs').select('*').eq('user_id', userId).eq('date', date).order('time', { ascending: true }),
        'logs.listByDate',
      );
      return ((data ?? []) as MealLogRow[]).map(rowToLog);
    },
    datesWithLogs: async (fromDate, toDate) => {
      const data = check(
        await db.from('meal_logs').select('date').eq('user_id', userId).gte('date', fromDate).lte('date', toDate),
        'logs.datesWithLogs',
      );
      return [...new Set(((data ?? []) as { date: string }[]).map((r) => String(r.date).slice(0, 10)))].sort();
    },
    add: async (log) => {
      check(await db.from('meal_logs').upsert(logToRow(log, userId), { onConflict: 'id' }), 'logs.add');
    },
    update: async (log) => {
      check(await db.from('meal_logs').upsert(logToRow(log, userId), { onConflict: 'id' }), 'logs.update');
    },
    remove: async (id) => {
      check(await db.from('meal_logs').delete().eq('user_id', userId).eq('id', id), 'logs.remove');
    },
    clear: async () => {
      check(await db.from('meal_logs').delete().eq('user_id', userId), 'logs.clear');
    },
  };
}

/** 전 사용자 공유 캐시 — 같은 서술이면 누가 먼저 불렀든 재호출하지 않는다 */
export function createSupabaseAICacheRepo(db: SupabaseClient): AICacheRepo {
  return {
    get: async (key) => {
      const data = check(await db.from('diet_type_cache').select('value').eq('key', key).maybeSingle(), 'aiCache.get');
      return data ? ((data as { value: DietClassification }).value ?? null) : null;
    },
    set: async (key, value) => {
      // insert 만 허용(RLS). 이미 누가 넣었으면(23505 중복) 조용히 넘어간다
      const res = await db.from('diet_type_cache').insert({ key, value });
      if (res.error && res.error.code !== '23505') check(res, 'aiCache.set');
    },
  };
}

export function createSupabaseRepos(db: SupabaseClient, userId: string): Repos {
  return {
    profile: createSupabaseProfileRepo(db, userId),
    logs: createSupabaseLogRepo(db, userId),
    aiCache: createSupabaseAICacheRepo(db),
    backend: 'supabase',
  };
}
