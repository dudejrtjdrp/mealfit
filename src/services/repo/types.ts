import type { DietClassification, MealLog, Profile } from '@/domain/types';

/** 프로필 저장소 — 로컬(AsyncStorage) 구현과 Supabase 구현이 같은 인터페이스를 따른다 */
export interface ProfileRepo {
  get(): Promise<Profile | null>;
  save(profile: Profile): Promise<void>;
  clear(): Promise<void>;
}

export interface LogRepo {
  listByDate(date: string): Promise<MealLog[]>;
  /** 주간 캘린더 점 표시용: 기록이 있는 날짜 목록 */
  datesWithLogs(fromDate: string, toDate: string): Promise<string[]>;
  add(log: MealLog): Promise<void>;
  update(log: MealLog): Promise<void>;
  remove(id: string): Promise<void>;
}

/** 식단 성향 AI 결과 캐시 — key = sha256(정규화 서술 + 프롬프트 버전) */
export interface AICacheRepo {
  get(key: string): Promise<DietClassification | null>;
  set(key: string, value: DietClassification): Promise<void>;
}

export interface Repos {
  profile: ProfileRepo;
  logs: LogRepo;
  aiCache: AICacheRepo;
  /** 'local' | 'supabase' — 설정 화면 표기용 */
  backend: 'local' | 'supabase';
}
