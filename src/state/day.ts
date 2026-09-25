import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';

import { mealTypeAt } from '@/domain/mealBudget';
import { summarizeDay, toDateKey } from '@/domain/summary';
import type { DailyTargets, DaySummary, MealLog, MealType, Verdict } from '@/domain/types';
import { getRepos, type Repos } from '@/services/repo';

import { onAccountChange } from './accountEvents';
import { useProfile } from './profile';

/** 현재 시각 기준 기본 끼니 — 판정(이번 끼니 적정량)과 같은 경계: ~10:30 아침 · ~15시 점심 · ~21시 저녁 · 그 외 간식 */
export function defaultMealType(d: Date = new Date()): MealType {
  return mealTypeAt(d);
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
  /** from~to(포함) 날짜별 기록 — 기록 탭 주간 캘린더용. 한 주를 한 번에 읽고 기록이 바뀔 때까지 캐시 */
  logsInRange: (from: string, to: string) => Promise<Record<string, MealLog[]>>;
  /** 최근 N일(오늘 포함) 기록 전체, 최신순 — 기록 추가의 "자주 먹어요"·"최근" */
  recentLogs: (days: number) => Promise<MealLog[]>;
  /** 목표량이 바뀌었을 때 요약만 다시 계산 */
  recompute: () => void;
}

/**
 * 기간별 기록 캐시 — 기록이 추가·수정·삭제되면 통째로 비운다.
 * 저장소(계정/이 기기)가 바뀌거나 로그아웃·탈퇴·이 기기 데이터 지우기가 있으면 역시 비운다 —
 * 남겨 두면 다른 계정·게스트에게 이전 사람의 주간 점·자주 먹어요·최근 기록이 보인다.
 */
const rangeCache = new Map<string, Promise<Record<string, MealLog[]>>>();
/** 캐시를 채운 저장소 — getRepos() 는 사용자가 바뀌면 새 인스턴스를 돌려준다 */
let rangeCacheRepos: Repos | null = null;
export function clearLogRangeCache() {
  rangeCache.clear();
  rangeCacheRepos = null;
}
onAccountChange(() => clearLogRangeCache());

const VERDICT_ORDER: Verdict[] = ['good', 'ok', 'pass'];

/** 그날 기록의 판정 중 가장 많은 것 (같으면 좋음 > 괜찮음 > 패스). 판정 있는 기록이 없으면 undefined */
export function dominantVerdict(logs: Pick<MealLog, 'verdict'>[]): Verdict | undefined {
  const n: Record<Verdict, number> = { good: 0, ok: 0, pass: 0 };
  for (const l of logs) if (l.verdict) n[l.verdict] += 1;
  let best: Verdict | undefined;
  for (const v of VERDICT_ORDER) if (n[v] > 0 && (!best || n[v] > n[best])) best = v;
  return best;
}

/** 주간 요약 재료: 좋음 판정 끼니 수 · 기록한 날 수 */
export function weekTally(byDate: Record<string, Pick<MealLog, 'verdict'>[]>): { good: number; days: number } {
  let good = 0;
  let days = 0;
  for (const logs of Object.values(byDate)) {
    if (!logs.length) continue;
    days += 1;
    good += logs.filter((l) => l.verdict === 'good').length;
  }
  return { good, days };
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
    rangeCache.clear();
    try {
      await getRepos().logs.add(log);
      rangeCache.clear();
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
    rangeCache.clear();
    try {
      await getRepos().logs.update(log);
      rangeCache.clear();
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
    rangeCache.clear();
    try {
      await getRepos().logs.remove(id);
      rangeCache.clear();
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

  logsInRange: async (from, to) => {
    const repos = getRepos();
    if (repos !== rangeCacheRepos) {
      rangeCache.clear();
      rangeCacheRepos = repos;
    }
    const key = `${from}~${to}`;
    let hit = rangeCache.get(key);
    if (!hit) {
      hit = (async () => {
        const repo = repos.logs;
        const dates = await repo.datesWithLogs(from, to);
        const lists = await Promise.all(dates.map((d) => repo.listByDate(d)));
        const out: Record<string, MealLog[]> = {};
        dates.forEach((d, i) => {
          if (lists[i].length) out[d] = lists[i];
        });
        return out;
      })();
      rangeCache.set(key, hit);
      const mine = hit;
      hit.catch(() => {
        if (rangeCache.get(key) === mine) rangeCache.delete(key);
      });
    }
    try {
      const byDate = { ...(await hit) };
      // 오늘 목록은 저장이 끝나기 전에도 화면 상태가 최신이다
      const { date, logs, status } = get();
      if (status === 'ready' && date >= from && date <= to) {
        if (logs.length) byDate[date] = logs;
        else delete byDate[date];
      }
      return byDate;
    } catch {
      return {};
    }
  },

  recentLogs: async (days) => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - Math.max(0, days - 1));
    const byDate = await get().logsInRange(toDateKey(start), toDateKey(end));
    return Object.values(byDate)
      .flat()
      .sort((a, b) => b.time.localeCompare(a.time));
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
