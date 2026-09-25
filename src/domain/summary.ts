import type { DailyTargets, DaySummary, MealLog, Nutrients, OverNutrient } from './types';

const OPTIONAL_KEYS = ['carbs', 'protein', 'fat', 'satFat', 'sugar', 'sodium', 'caffeine'] as const;
const TARGET_KEYS = ['kcal', 'carbs', 'protein', 'fat', 'sugar', 'sodium'] as const;
/** 넘으면 빨강으로 보여주는 영양소 (단백질 제외 — 많을수록 좋은 쪽) */
export const OVER_KEYS: readonly OverNutrient[] = ['kcal', 'carbs', 'fat', 'sugar', 'sodium'];

const round1 = (v: number) => Math.round(v * 10) / 10;

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

  const over: DaySummary['over'] = {};
  for (const k of OVER_KEYS) {
    const t = targets[k];
    const d = round1((consumed[k] ?? 0) - t);
    if (t > 0 && d > 0) over[k] = d;
  }

  let status: DaySummary['status'];
  if (logs.length === 0) status = 'empty';
  else if (consumed.kcal > targets.kcal) status = 'over';
  else if (targets.kcal > 0 && consumed.kcal >= targets.kcal * 0.8) status = 'almost';
  else status = 'room';

  return { date, consumed, targets, remaining, over, status, logs };
}

/** "목표보다 320kcal 더 드셨어요" — 넘은 양은 숨기지 않고 사실로만 말한다 (비난·금지 표현 없이) */
export function overKcalText(overKcal: number): string {
  return `목표보다 ${formatNumber(overKcal)}kcal 더 드셨어요`;
}

/** 상태 문구 — 홈 카드/미니바용. 예: {title:'지금도 여유가 있어요', sub:'842 kcal 더 드실 수 있어요'} · 넘으면 {title:'목표보다 320kcal 더 드셨어요', sub:'내일 다시 채워져요'} */
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
      return { title: overKcalText(summary.over.kcal ?? 0), sub: '내일 다시 채워져요' };
  }
}

/**
 * 이 메뉴(kcal)를 먹으면 하루 목표 대비 어떻게 되는지 — 메뉴 상세 "먹으면 …" 막대용.
 * - left: 먹어도 목표 안 → 남는 kcal
 * - crosses: 이번에 목표를 넘김 → 넘는 kcal
 * - already: 이미 넘은 상태 → 지금 넘은 kcal (alreadyOver) · 이 메뉴가 더할 kcal (adds)
 */
export type AfterEating =
  | { kind: 'left'; left: number; text: string }
  | { kind: 'crosses'; overBy: number; text: string }
  | { kind: 'already'; alreadyOver: number; adds: number; text: string };

export function afterEating(consumedKcal: number, targetKcal: number, menuKcal: number): AfterEating {
  const before = Math.round(targetKcal - consumedKcal);
  const after = Math.round(targetKcal - consumedKcal - menuKcal);
  if (before < 0) {
    const alreadyOver = -before;
    const adds = Math.round(menuKcal);
    return { kind: 'already', alreadyOver, adds, text: `이미 목표보다 ${formatNumber(alreadyOver)}kcal 더 드셨어요 · 먹으면 +${formatNumber(adds)}kcal` };
  }
  if (after < 0) return { kind: 'crosses', overBy: -after, text: `먹으면 목표보다 ${formatNumber(-after)}kcal 넘어요` };
  return { kind: 'left', left: after, text: `먹으면 ${formatNumber(after)}kcal 남아요` };
}

/** 기록 직후 토스트 꼬리말 — 기록 뒤 하루 목표를 넘은 상태면 " · 오늘 목표보다 120kcal 넘었어요", 아니면 '' */
export function overToastSuffix(after: Pick<DaySummary, 'over'> | null | undefined): string {
  const n = after?.over.kcal ?? 0;
  return n > 0 ? ` · 오늘 목표보다 ${formatNumber(n)}kcal 넘었어요` : '';
}

/** 로컬 날짜 YYYY-MM-DD */
export function toDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
