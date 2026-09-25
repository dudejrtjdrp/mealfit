import { create } from 'zustand';

import type { ActivityLevel, DietClassification, Goal, Sex } from '@/domain/types';

/** 온보딩 B1~B6 입력 드래프트 — 뒤로 가도 유지된다 */
export interface OnboardingDraft {
  /** B1 에서 물어본 호칭. '' 이면 건너뜀 → 저장할 때 세션 이름 또는 '회원' */
  nickname?: string;
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
  /** 대화형 UI 진행 기록: 마친 단계 중 가장 큰 번호 (뒤로 돌아왔을 때 이미 답한 단계를 알기 위해 — 저장 데이터 아님) */
  reached: number;
  set: (patch: Partial<OnboardingDraft>) => void;
  markReached: (step: number) => void;
  reset: () => void;
}

export const useOnboarding = create<OnboardingState>((set) => ({
  draft: initial,
  reached: 0,
  set: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  markReached: (step) => set((s) => ({ reached: Math.max(s.reached, step) })),
  reset: () => set({ draft: initial, reached: 0 }),
}));
