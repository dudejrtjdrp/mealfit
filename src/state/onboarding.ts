import { create } from 'zustand';

import type { ActivityLevel, DietClassification, Goal, Sex } from '@/domain/types';

/** 온보딩 B2~B6 입력 드래프트 — 뒤로 가도 유지된다 */
export interface OnboardingDraft {
  sex?: Sex;
  birthYear?: number;
  heightCm?: number;
  weightKg?: number;
  activity?: ActivityLevel;
  primaryGoal?: Goal;
  secondaryGoals: Goal[];
  targetWeightKg?: number;
  targetWeeks?: number;
  dietDescription: string;
  diet?: DietClassification;
}

const initial: OnboardingDraft = { secondaryGoals: [], dietDescription: '' };

interface OnboardingState {
  draft: OnboardingDraft;
  set: (patch: Partial<OnboardingDraft>) => void;
  reset: () => void;
}

export const useOnboarding = create<OnboardingState>((set) => ({
  draft: initial,
  set: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  reset: () => set({ draft: initial }),
}));
