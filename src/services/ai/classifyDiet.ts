import type { DietClassification, Goal } from '@/domain/types';
import type { Repos } from '@/services/repo/types';

/**
 * B6 성향 분류 진입점: 캐시 → (키 있으면) Claude API → 규칙 기반 폴백.
 * 같은 서술(normalizeDietText 기준)은 절대 AI를 다시 부르지 않는다.
 */
export async function classifyDiet(
  _text: string,
  _opts: { repos: Repos; primaryGoal?: Goal },
): Promise<DietClassification> {
  throw new Error('not implemented');
}
