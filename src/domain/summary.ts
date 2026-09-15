import type { DailyTargets, DaySummary, MealLog, Nutrients } from './types';

const OPTIONAL_KEYS = ['carbs', 'protein', 'fat', 'satFat', 'sugar', 'sodium', 'caffeine'] as const;
const TARGET_KEYS = ['kcal', 'carbs', 'protein', 'fat', 'sugar', 'sodium'] as const;

/** 1234 → "1,234" (기기 로케일과 무관하게 동일) */
export function formatNumber(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function summarizeDay(date: string, logs: MealLog[], targets: DailyTargets): DaySummary {
  const consumed: Nutrients = { kcal: 0 };
  for (const log of logs) {
    const n = log.nutrients;
    consumed.kcal += n?.kcal ?? 0;
    for (const k of OPTIONAL_KEYS) {
      const v = n?.[k];
      if (typeof v === 'number' && Number.isFinite(v)) consumed[k] = (consumed[k] ?? 0) + v;
    }
  }

  const remaining: DailyTargets = { ...targets, emphasis: [...targets.emphasis] };
  for (const k of TARGET_KEYS) {
    remaining[k] = Math.max(0, targets[k] - (consumed[k] ?? 0));
  }

  let status: DaySummary['status'];
  if (logs.length === 0) status = 'empty';
  else if (consumed.kcal > targets.kcal) status = 'over';
  else if (targets.kcal > 0 && consumed.kcal >= targets.kcal * 0.8) status = 'almost';
  else status = 'room';

  return { date, consumed, targets, remaining, status, logs };
}

/** 허용의 언어로 된 상태 문구 — 홈 카드/미니바용. 예: {title:'지금도 여유가 있어요', sub:'842 kcal 더 드실 수 있어요'} */
export function remainingMessage(summary: DaySummary): { title: string; sub: string } {
  const left = formatNumber(summary.remaining.kcal);
  switch (summary.status) {
    case 'empty':
      return { title: '오늘의 첫 끼를 기다리고 있어요', sub: `${left} kcal 드실 수 있어요` };
    case 'room':
      return { title: '지금도 여유가 있어요', sub: `${left} kcal 더 드실 수 있어요` };
    case 'almost':
      return { title: '오늘 거의 다 채웠어요', sub: '가볍게 마무리해도 좋아요' };
    case 'over':
      return { title: '오늘은 여기까지', sub: '내일 다시 채워져요' };
  }
}

/** 로컬 날짜 YYYY-MM-DD */
export function toDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
