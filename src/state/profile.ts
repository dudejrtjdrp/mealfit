import { create } from 'zustand';

import { classifyDietByRules } from '@/domain/diet';
import { computeTargets } from '@/domain/targets';
import type { DailyTargets, DietClassification, Profile } from '@/domain/types';
import { getRepos } from '@/services/repo';

import type { OnboardingDraft } from './onboarding';
import { useSession } from './session';

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

interface ProfileState {
  profile: Profile | null;
  targets: DailyTargets | null;
  status: 'loading' | 'ready';
  load: () => Promise<Profile | null>;
  /** 드래프트 → Profile 조립 → 저장. 저장 실패해도 메모리에는 반영하고 false 반환 */
  completeOnboarding: (draft: OnboardingDraft, nickname?: string) => Promise<{ profile: Profile; saved: boolean }>;
  updateProfile: (partial: Partial<Profile>) => Promise<boolean>;
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

  load: async () => {
    try {
      const profile = await getRepos().profile.get();
      set({ profile, targets: safeTargets(profile), status: 'ready' });
      return profile;
    } catch (e) {
      console.warn('[profile] load 실패', e);
      set({ status: 'ready' });
      return get().profile;
    }
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
    set({ profile, targets: safeTargets(profile), status: 'ready' });
    try {
      await getRepos().profile.save(profile);
      return { profile, saved: true };
    } catch (e) {
      console.warn('[profile] save 실패', e);
      return { profile, saved: false };
    }
  },

  updateProfile: async (partial) => {
    const cur = get().profile;
    if (!cur) return false;
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
  },
}));

