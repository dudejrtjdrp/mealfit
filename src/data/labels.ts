import type { ActivityLevel, Goal, MenuCategory, StoreCategory } from '../domain/types';

export const STORE_CATEGORY_LABEL: Record<StoreCategory, string> = {
  convenience: '편의점',
  cafe: '카페',
  salad: '샐러드',
  korean: '한식',
  bakery: '베이커리',
  fastfood: '패스트푸드',
  other: '기타',
};

export const MENU_CATEGORY_LABEL: Record<MenuCategory, string> = {
  drink: '음료',
  meal: '식사',
  snack: '간식',
  salad: '샐러드',
  side: '사이드',
};

/** 120 → "120m", 1250 → "1.3km" */
export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;
}

/** 5000 → "5,000원" */
export function formatPrice(won: number): string {
  return `${String(Math.round(won)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;
}

export const GOAL_LABEL: Record<Goal, string> = {
  lose: '체중 감량',
  maintain: '체중 유지',
  gain: '체중 증량',
  blood_sugar: '혈당 관리',
  cholesterol: '콜레스테롤 관리',
  slow_aging: '저속노화',
};

/** 목적 한 줄 설명 (F1 목표 카드) */
export const GOAL_DESCRIPTION: Record<Goal, string> = {
  lose: '가볍게, 꾸준히 몸을 돌보고 있어요.',
  maintain: '지금의 건강한 균형을 지켜가요.',
  gain: '든든하게 채우며 힘을 길러요.',
  blood_sugar: '당을 살피며 편안한 하루를 만들어요.',
  cholesterol: '지방과 나트륨을 살피며 챙겨요.',
  slow_aging: '단백질과 채소로 천천히 가꿔요.',
};

export const ACTIVITY_LABEL: Record<ActivityLevel, { title: string; description: string }> = {
  1: { title: '거의 앉아 있음', description: '대부분 앉아서 지내고 운동은 거의 안 해요.' },
  2: { title: '가벼운 활동', description: '주 1~3회 가볍게 걷거나 운동해요.' },
  3: { title: '보통', description: '주 3~5회 운동하거나 자주 움직여요.' },
  4: { title: '활발', description: '주 6~7회 운동하거나 몸 쓰는 일을 해요.' },
  5: { title: '매우 활발', description: '하루 두 번 운동하거나 강도 높은 일을 해요.' },
};

/** BMI 와 비난 없는 한 줄 */
export function bmiInfo(heightCm: number, weightKg: number): { bmi: number; label: string } {
  const m = heightCm / 100;
  const bmi = m > 0 ? weightKg / (m * m) : 0;
  const label = bmi >= 18.5 && bmi < 23 ? '정상 체중이에요' : bmi >= 23 && bmi < 25 ? '조금 신경 써요' : '천천히 함께 가요';
  return { bmi: Math.round(bmi * 10) / 10, label };
}
