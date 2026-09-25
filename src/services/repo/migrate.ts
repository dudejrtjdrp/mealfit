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
 * - 플래그는 "지금 로컬에 있는 건 이미 옮긴 백업"이라는 뜻이다. 로그아웃하거나 게스트로 온보딩을 새로 끝내면
 *   discardMigratedBackup() 이 백업과 플래그를 함께 비워, 그 뒤 새로 쌓인 게스트 데이터가 다음 로그인 때 옮겨진다.
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

/**
 * 이미 서버로 옮긴 로컬 백업을 비우고 플래그를 지운다 (플래그가 없으면 아무것도 하지 않음).
 * - 로그아웃 뒤·세션 없이 앱을 켰을 때: 예전 계정의 백업이 게스트 화면에 다시 뜨거나 다른 계정으로 옮겨지지 않게
 * - 게스트가 온보딩을 새로 끝낼 때: 플래그 때문에 새 게스트 데이터가 다음 로그인 때 건너뛰어지지 않게
 * 옮기지 못한 게스트 데이터(플래그 없음)는 건드리지 않는다.
 */
export async function discardMigratedBackup(opts: { storage: KeyValueStorage; local: Repos }): Promise<boolean> {
  const { storage, local } = opts;
  if (!(await storage.getItem(STORAGE_KEYS.migrated))) return false;
  await local.logs.clear();
  await local.profile.clear();
  await storage.removeItem(STORAGE_KEYS.migrated);
  return true;
}
