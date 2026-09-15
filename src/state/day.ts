import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';

import { summarizeDay, toDateKey } from '@/domain/summary';
import type { DailyTargets, DaySummary, MealLog, MealType } from '@/domain/types';
import { getRepos } from '@/services/repo';

import { useProfile } from './profile';

/** 현재 시각 기준 기본 끼니: ~10시 아침 · ~15시 점심 · ~21시 저녁 · 그 외 간식 */
export function defaultMealType(d: Date = new Date()): MealType {
  const h = d.getHours();
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

interface DayState {
  date: string;
  logs: MealLog[];
  summary: DaySummary | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  load: (date?: string) => Promise<void>;
  addLog: (log: MealLog) => Promise<boolean>;
  updateLog: (log: MealLog) => Promise<boolean>;
  removeLog: (id: string) => Promise<boolean>;
  datesWithLogs: (from: string, to: string) => Promise<string[]>;
  /** 목표량이 바뀌었을 때 요약만 다시 계산 */
  recompute: () => void;
}

const sortLogs = (logs: MealLog[]) => [...logs].sort((a, b) => a.time.localeCompare(b.time));

function summarize(date: string, logs: MealLog[]): DaySummary | null {
  const targets: DailyTargets | null = useProfile.getState().targets;
  return targets ? summarizeDay(date, logs, targets) : null;
}

export const useDay = create<DayState>((set, get) => ({
  date: toDateKey(),
  logs: [],
  summary: null,
  status: 'idle',

  load: async (date = toDateKey()) => {
    set({ date, status: 'loading', summary: summarize(date, get().date === date ? get().logs : []) });
    try {
      const logs = sortLogs(await getRepos().logs.listByDate(date));
      if (get().date !== date) return; // 그 사이 다른 날짜를 불렀다
      set({ logs, summary: summarize(date, logs), status: 'ready' });
    } catch (e) {
      console.warn('[day] load 실패', e);
      set({ logs: [], summary: summarize(date, []), status: 'error' });
    }
  },

  addLog: async (log) => {
    const { date, logs } = get();
    if (log.date === date) {
      const next = sortLogs([...logs.filter((l) => l.id !== log.id), log]);
      set({ logs: next, summary: summarize(date, next) });
    }
    try {
      await getRepos().logs.add(log);
      return true;
    } catch (e) {
      console.warn('[day] add 실패', e);
      return false;
    }
  },

  updateLog: async (log) => {
    const { date, logs } = get();
    const next = sortLogs(log.date === date ? logs.map((l) => (l.id === log.id ? log : l)) : logs.filter((l) => l.id !== log.id));
    set({ logs: next, summary: summarize(date, next) });
    try {
      await getRepos().logs.update(log);
      return true;
    } catch (e) {
      console.warn('[day] update 실패', e);
      return false;
    }
  },

  removeLog: async (id) => {
    const { date, logs } = get();
    const next = logs.filter((l) => l.id !== id);
    set({ logs: next, summary: summarize(date, next) });
    try {
      await getRepos().logs.remove(id);
      return true;
    } catch (e) {
      console.warn('[day] remove 실패', e);
      return false;
    }
  },

  datesWithLogs: async (from, to) => {
    try {
      return await getRepos().logs.datesWithLogs(from, to);
    } catch {
      return [];
    }
  },

  recompute: () => {
    const { date, logs } = get();
    set({ summary: summarize(date, logs) });
  },
}));

// 목표량이 바뀌면(프로필 수정) 요약 재계산
useProfile.subscribe((s, prev) => {
  if (s.targets !== prev.targets) useDay.getState().recompute();
});

let appStateSub: { remove: () => void } | undefined;

/** 앱이 포그라운드로 돌아왔을 때 날짜가 바뀌었으면 오늘로 다시 로드. 한 번만 등록된다 */
export function watchDayRollover(): () => void {
  if (appStateSub) return () => {};
  const onChange = (next: AppStateStatus) => {
    if (next !== 'active') return;
    const today = toDateKey();
    const cur = useDay.getState();
    if (cur.date !== today && (cur.status === 'ready' || cur.status === 'error')) void cur.load(today);
  };
  appStateSub = AppState.addEventListener('change', onChange);
  return () => {
    appStateSub?.remove();
    appStateSub = undefined;
  };
}
