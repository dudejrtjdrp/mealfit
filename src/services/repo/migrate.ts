import type { KeyValueStorage } from './local';
import { STORAGE_KEYS } from './local';
import type { Repos } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MigrationResult {
  status: 'done' | 'skipped';
  profile: boolean;
  logs: number;
}

/**
 * 로컬(AsyncStorage) → Supabase 1회 마이그레이션.
 * - 이 기기에서 이미 옮겼으면(플래그) 건너뛴다.
 * - 프로필: Supabase 에 아직 없을 때만 올린다 (다른 기기에서 만든 계정을 덮어쓰지 않음). id 는 로그인 사용자 id.
 * - 기록: 날짜별로 전부 upsert (id 가 uuid 가 아니면 새로 발급).
 * - 중간에 실패하면 플래그를 남기지 않아 다음 로그인 때 다시 시도한다(upsert 라 중복되지 않음).
 * - 로컬 데이터는 지우지 않는다(백업). Supabase 로그인 중에는 로컬에 새로 쓰지 않으므로 다시 옮겨질 일이 없다.
 */
export async function migrateLocalToSupabase(opts: {
  storage: KeyValueStorage;
  local: Repos;
  remote: Repos;
  userId: string;
  newId: () => string;
}): Promise<MigrationResult> {
  const { storage, local, remote, userId, newId } = opts;
  if (await storage.getItem(STORAGE_KEYS.migrated)) return { status: 'skipped', profile: false, logs: 0 };

  let profileMoved = false;
  const localProfile = await local.profile.get();
  if (localProfile && !(await remote.profile.get())) {
    await remote.profile.save({ ...localProfile, id: userId });
    profileMoved = true;
  }

  let moved = 0;
  let dates: string[] = [];
  try {
    const raw = await storage.getItem(STORAGE_KEYS.logDates);
    dates = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    dates = [];
  }
  for (const date of dates) {
    for (const log of await local.logs.listByDate(date)) {
      await remote.logs.add(UUID_RE.test(log.id) ? log : { ...log, id: newId() });
      moved += 1;
    }
  }

  await storage.setItem(STORAGE_KEYS.migrated, userId);
  return { status: 'done', profile: profileMoved, logs: moved };
}
