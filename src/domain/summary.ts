import type { DailyTargets, DaySummary, MealLog } from './types';

export function summarizeDay(_date: string, _logs: MealLog[], _targets: DailyTargets): DaySummary {
  throw new Error('not implemented');
}

/** 허용의 언어로 된 상태 문구 — 홈 카드/미니바용. 예: {title:'지금도 여유가 있어요', sub:'842 kcal 더 드실 수 있어요'} */
export function remainingMessage(_summary: DaySummary): { title: string; sub: string } {
  throw new Error('not implemented');
}

/** 로컬 날짜 YYYY-MM-DD */
export function toDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
