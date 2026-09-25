import { create } from 'zustand';

import { classifyDietByRules } from '@/domain/diet';
import { computeTargets } from '@/domain/targets';
import type { DailyTargets, DietClassification, Profile } from '@/domain/types';
import { getAuthUserId } from '@/services/authState';
import { getRepos } from '@/services/repo';

import type { OnboardingDraft } from './onboarding';
import { discardMigratedLocalBackup, useSession } from './session';

/** 목표량 계산 — 도메인 오류가 나도 화면은 살아 있게 null */
export function safeTargets(profile: Profile | null): DailyTargets | null {
  if (!profile) return null;
  try {
    return computeTargets(profile);
  } catch (e) {
    console.warn('[profile] computeTargets 실패', e);
    return null;
  }
}

/** 성향 분류가 비어 있을 때 규칙 기반으로 채움. 규칙도 실패하면 균형형 + 정의 문장 */
export function fallbackDiet(text: string, primaryGoal?: Profile['primaryGoal']): DietClassification {
  try {
    return classifyDietByRules(text, { primaryGoal });
  } catch {
    return { type: 'balanced', evidence: [], source: 'rule' };
  }
}

function makeId() {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** 지금 저장소의 주인 — 'local'(이 기기) 또는 'user:<id>'(계정). 메모리 프로필이 어느 저장소 것인지 가린다 */
function storageOwner(): string {
  const repos = getRepos();
  return repos.backend === 'supabase' ? `user:${getAuthUserId() ?? ''}` : 'local';
}

/** 읽기 실패 시 한 번 더 시도하기 전 대기 */
export const PROFILE_LOAD_RETRY_MS = 800;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface ProfileState {
  profile: Profile | null;
  targets: DailyTargets | null;
  /**
   * error: 저장소가 바뀐 뒤(로그인·오프라인 로그인) 새 저장소의 프로필을 읽지 못했다 — 이전 저장소 프로필은 비우고
   * 쓰기를 막는다. 진입 게이트가 온보딩 대신 '다시 시도'를 보여준다(온보딩을 새로 하면 계정 프로필을 덮는다).
   */
  status: 'loading' | 'ready' | 'error';
  /** 메모리의 profile 이 속한 저장소 (storageOwner). 다른 저장소로 쓰지 않게 비교한다 */
  owner: string | null;
  /** 한 번 재시도. 같은 저장소면 실패해도 메모리 프로필을 유지, 저장소가 바뀌었으면 비우고 status 'error' */
  load: () => Promise<Profile | null>;
  /** 드래프트 → Profile 조립 → 저장. 저장 실패해도 메모리에는 반영하고 false 반환 */
  completeOnboarding: (draft: OnboardingDraft, nickname?: string) => Promise<{ profile: Profile; saved: boolean }>;
  updateProfile: (partial: Partial<Profile>) => Promise<boolean>;
  /** 로그인 직후 서버에 프로필이 없을 때 이 기기의 프로필을 그대로 이어 쓴다 (id 는 로그인 사용자 id) */
  adoptProfile: (profile: Profile) => Promise<Profile>;
  /**
   * 로그아웃·탈퇴.
   * - 로컬 저장소: 둘 다 이 기기의 프로필을 지운다(탈퇴는 기록까지)
   * - Supabase: 로그아웃은 서버 데이터를 두고 세션만 끊는다. 탈퇴는 서버의 프로필·기록을 지운 뒤 로그아웃
   */
  signOut: (kind?: 'logout' | 'withdraw') => Promise<void>;
}

export const useProfile = create<ProfileState>((set, get) => ({
  profile: null,
  targets: null,
  status: 'loading',
  owner: null,

  load: async () => {
    const owner = storageOwner();
    for (let attempt = 0; ; attempt++) {
      try {
        const profile = await getRepos().profile.get();
        if (storageOwner() !== owner) return get().profile; // 그 사이 로그인·로그아웃 — 뒤에 부른 load 가 정한다
        set({ profile, targets: safeTargets(profile), status: 'ready', owner });
        return profile;
      } catch (e) {
        if (attempt >= 1) {
          console.warn('[profile] load 실패', e);
          break;
        }
        await sleep(PROFILE_LOAD_RETRY_MS);
      }
    }
    if (storageOwner() !== owner) return get().profile;
    if (get().owner === owner) {
      // 같은 저장소의 일시적 실패 — 지금 보이는 프로필을 그대로 둔다
      set({ status: 'ready' });
      return get().profile;
    }
    // 저장소가 바뀌었는데 새 저장소를 못 읽었다: 이전(게스트) 프로필을 계정 것처럼 보여주거나 서버에 쓰지 않게 비운다
    set({ profile: null, targets: null, status: 'error', owner });
    return null;
  },

  completeOnboarding: async (draft, nickname) => {
    const now = new Date().toISOString();
    const prev = get().profile;
    const primaryGoal = draft.primaryGoal ?? 'maintain';
    const weightGoal = primaryGoal === 'lose' || primaryGoal === 'gain';
    const profile: Profile = {
      id: prev?.id ?? makeId(),
      nickname: nickname?.trim() || prev?.nickname || '회원',
      sex: draft.sex ?? 'female',
      birthYear: draft.birthYear ?? 1990,
      heightCm: draft.heightCm ?? 165,
      weightKg: draft.weightKg ?? 60,
      activity: draft.activity ?? 3,
      primaryGoal,
      secondaryGoals: draft.secondaryGoals.filter((g) => g !== primaryGoal),
      targetWeightKg: weightGoal ? draft.targetWeightKg : undefined,
      targetWeeks: weightGoal ? draft.targetWeeks : undefined,
      dietDescription: draft.dietDescription.trim() || undefined,
      diet: draft.diet ?? fallbackDiet(draft.dietDescription, primaryGoal),
      onboardingDone: true,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    set({ profile, targets: safeTargets(profile), status: 'ready', owner: storageOwner() });
    try {
      const repos = getRepos();
      // 게스트로 새로 시작: 예전에 서버로 옮긴 백업·플래그를 비워야 이 데이터가 다음 로그인 때 옮겨진다
      if (repos.backend === 'local') await discardMigratedLocalBackup();
      await repos.profile.save(profile);
      return { profile, saved: true };
    } catch (e) {
      console.warn('[profile] save 실패', e);
      return { profile, saved: false };
    }
  },

  updateProfile: async (partial) => {
    const cur = get().profile;
    if (!cur) return false;
    // 다른 저장소에서 온 프로필(로그인 직후 아직 다시 읽기 전 등)은 지금 저장소에 쓰지 않는다 — 계정 프로필을 덮지 않게
    if (get().owner !== storageOwner()) return false;
    const profile: Profile = { ...cur, ...partial, id: cur.id, updatedAt: new Date().toISOString() };
    set({ profile, targets: safeTargets(profile) });
    try {
      await getRepos().profile.save(profile);
      return true;
    } catch (e) {
      console.warn('[profile] update 실패', e);
      return false;
    }
  },

  adoptProfile: async (p) => {
    const profile: Profile = { ...p, id: getAuthUserId() ?? p.id };
    set({ profile, targets: safeTargets(profile), status: 'ready', owner: storageOwner() });
    try {
      await getRepos().profile.save(profile);
    } catch (e) {
      console.warn('[profile] adopt 저장 실패 — 이번 실행 동안 메모리로 유지', e);
    }
    return profile;
  },

  signOut: async (kind = 'logout') => {
    const repos = getRepos();
    const shouldClear = repos.backend === 'local' || kind === 'withdraw';
    if (shouldClear) {
      try {
        await repos.profile.clear();
        if (kind === 'withdraw') await repos.logs.clear();
      } catch (e) {
        console.warn('[profile] clear 실패', e);
      }
    }
    set({ profile: null, targets: null });
    await useSession.getState().signOut();
    set({ owner: storageOwner() });
  },
}));

