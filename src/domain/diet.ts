import type { DietClassification, DietType, DietTypeInfo, Goal } from './types';

export const DIET_TYPES: Record<DietType, DietTypeInfo> = {
  balanced: { type: 'balanced', label: '균형형 식사', description: '다양한 음식을 골고루 즐기며, 건강과 맛의 균형을 중요하게 생각하는 타입이에요.' },
  low_carb_high_protein: { type: 'low_carb_high_protein', label: '저탄고단형 식사', description: '밥·면·빵은 줄이고 단백질을 챙기는 타입이에요.' },
  low_sugar: { type: 'low_sugar', label: '저당형 식사', description: '단 음료와 디저트를 줄이고 혈당을 신경 쓰는 타입이에요.' },
  low_sodium: { type: 'low_sodium', label: '저염형 식사', description: '국물·짠 음식을 줄이고 담백하게 먹는 타입이에요.' },
  light_eater: { type: 'light_eater', label: '소식형 식사', description: '한 번에 많이 먹기보다 가볍게, 자주 먹는 타입이에요.' },
  high_protein_bulk: { type: 'high_protein_bulk', label: '고단백 증량형 식사', description: '운동과 함께 단백질과 열량을 충분히 챙기는 타입이에요.' },
  convenience: { type: 'convenience', label: '간편식형 식사', description: '편의점·카페처럼 빠르게 살 수 있는 한 끼가 많은 타입이에요.' },
};

/** 비교·캐시용 정규화: 공백/문장부호 정리, 소문자 */
export function normalizeDietText(_text: string): string {
  throw new Error('not implemented');
}

/** 규칙 기반 분류 — 키워드 점수. 항상 evidence 3개를 채운다 */
export function classifyDietByRules(_text: string, _hints?: { primaryGoal?: Goal }): DietClassification {
  throw new Error('not implemented');
}
