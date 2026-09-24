import type { MenuItem, Nutrients } from './types';

/** 기록 수량 단계 — 효님 지정 (2026-09-25). 라면 반 개·한 개 반처럼 실제로 먹는 양을 고른다 */
export const QTY_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** 1개 기준 영양 × 수량. 소수 첫째 자리까지 (kcal·mg 도 같은 규칙 — 기존 기록 편집과 동일) */
export function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  if (factor === 1) return n;
  return Object.fromEntries(
    Object.entries(n).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * factor * 10) / 10 : v]),
  ) as Nutrients;
}

/** 제공 단위 이름: "1개 (120 g)" → 개, "1잔" → 잔, "1회 섭취참고량 (…)" → 회분, 그 밖엔 인분 */
export function qtyUnit(serving: string | undefined): string {
  if (!serving) return '인분';
  if (serving.startsWith('1회')) return '회분';
  const m = serving.match(/^1\s*(개|잔|병|컵|봉지|캔|조각)/);
  return m ? m[1] : '인분';
}

/** 0.75 → "0.75개", 1 → "1개" */
export function qtyLabel(q: number, unit = '인분'): string {
  return `${q}${unit}`;
}

export function menuQtyUnit(menu: Pick<MenuItem, 'serving'> | undefined): string {
  return qtyUnit(menu?.serving);
}
