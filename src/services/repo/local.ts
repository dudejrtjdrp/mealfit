import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DietClassification, MealLog, Profile } from '../../domain/types';
import type { AICacheRepo, LogRepo, ProfileRepo, Repos } from './types';

/** AsyncStorage 와 같은 모양의 최소 인터페이스 (테스트에서 교체 가능) */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const STORAGE_KEYS = {
  profile: 'mealfit:profile',
  logs: (date: string) => `mealfit:logs:${date}`,
  logDates: 'mealfit:logdates',
  aiCache: (key: string) => `mealfit:aicache:${key}`,
  /** 로컬 → Supabase 1회 마이그레이션 완료 표시 (값: 옮겨 받은 사용자 id) */
  migrated: 'mealfit:migrated-to-supabase',
} as const;

async function readJson<T>(storage: KeyValueStorage, key: string): Promise<T | null> {
  const raw = await storage.getItem(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null; // 깨진 값은 없는 것으로 본다
  }
}

const writeJson = (storage: KeyValueStorage, key: string, value: unknown) =>
  storage.setItem(key, JSON.stringify(value));

export function createLocalProfileRepo(storage: KeyValueStorage): ProfileRepo {
  return {
    get: () => readJson<Profile>(storage, STORAGE_KEYS.profile),
    save: (profile) => writeJson(storage, STORAGE_KEYS.profile, profile),
    clear: () => storage.removeItem(STORAGE_KEYS.profile),
  };
}

export function createLocalLogRepo(storage: KeyValueStorage): LogRepo {
  const getDates = async () => (await readJson<string[]>(storage, STORAGE_KEYS.logDates)) ?? [];
  const setDates = (dates: string[]) => writeJson(storage, STORAGE_KEYS.logDates, [...new Set(dates)].sort());
  const getLogs = async (date: string) => (await readJson<MealLog[]>(storage, STORAGE_KEYS.logs(date))) ?? [];

  const putLogs = async (date: string, logs: MealLog[]) => {
    const dates = await getDates();
    if (logs.length === 0) {
      await storage.removeItem(STORAGE_KEYS.logs(date));
      if (dates.includes(date)) await setDates(dates.filter((d) => d !== date));
      return;
    }
    const sorted = [...logs].sort((a, b) => a.time.localeCompare(b.time));
    await writeJson(storage, STORAGE_KEYS.logs(date), sorted);
    if (!dates.includes(date)) await setDates([...dates, date]);
  };

  /** id 로 기록이 들어 있는 날짜 찾기 */
  const findDate = async (id: string): Promise<string | undefined> => {
    for (const d of await getDates()) {
      if ((await getLogs(d)).some((l) => l.id === id)) return d;
    }
    return undefined;
  };

  return {
    listByDate: async (date) => [...(await getLogs(date))].sort((a, b) => a.time.localeCompare(b.time)),
    datesWithLogs: async (fromDate, toDate) => (await getDates()).filter((d) => d >= fromDate && d <= toDate),
    add: async (log) => {
      const logs = await getLogs(log.date);
      await putLogs(log.date, [...logs.filter((l) => l.id !== log.id), log]);
    },
    update: async (log) => {
      const oldDate = await findDate(log.id);
      if (oldDate && oldDate !== log.date) {
        await putLogs(oldDate, (await getLogs(oldDate)).filter((l) => l.id !== log.id));
      }
      const logs = await getLogs(log.date);
      await putLogs(log.date, [...logs.filter((l) => l.id !== log.id), log]);
    },
    remove: async (id) => {
      const date = await findDate(id);
      if (!date) return;
      await putLogs(date, (await getLogs(date)).filter((l) => l.id !== id));
    },
    clear: async () => {
      for (const d of await getDates()) await storage.removeItem(STORAGE_KEYS.logs(d));
      await storage.removeItem(STORAGE_KEYS.logDates);
    },
  };
}

export function createLocalAICacheRepo(storage: KeyValueStorage): AICacheRepo {
  return {
    get: (key) => readJson<DietClassification>(storage, STORAGE_KEYS.aiCache(key)),
    set: (key, value) => writeJson(storage, STORAGE_KEYS.aiCache(key), value),
  };
}

export function createLocalRepos(storage: KeyValueStorage = AsyncStorage): Repos {
  return {
    profile: createLocalProfileRepo(storage),
    logs: createLocalLogRepo(storage),
    aiCache: createLocalAICacheRepo(storage),
    backend: 'local',
  };
}
