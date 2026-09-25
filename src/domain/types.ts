/**
 * mealfit 도메인 공통 타입 — 모든 모듈(도메인·데이터·화면·저장소)이 이 계약을 공유한다.
 * 화면 ID(A1~F5)와 용어는 docs/IA.md 기준.
 */

export type Sex = 'male' | 'female';

/** 1 거의 앉아 있음 · 2 가벼운 활동 · 3 보통 · 4 활발 · 5 매우 활발 */
export type ActivityLevel = 1 | 2 | 3 | 4 | 5;

/** 온보딩 B4 목적. 체중 3종은 배타, 나머지는 부 목적으로 복수 선택 가능 */
export type Goal =
  | 'lose' // 체중 감량
  | 'maintain' // 체중 유지
  | 'gain' // 체중 증량
  | 'blood_sugar' // 혈당 관리
  | 'cholesterol' // 콜레스테롤 관리
  | 'slow_aging'; // 저속노화

/** B6 식단 유형 */
export type DietType =
  | 'balanced' // 균형형
  | 'low_carb_high_protein' // 저탄고단형
  | 'low_sugar' // 저당형
  | 'low_sodium' // 저염형
  | 'light_eater' // 소식형
  | 'high_protein_bulk' // 고단백 증량형
  | 'convenience'; // 간편식형(편의점·카페 위주)

export interface DietTypeInfo {
  type: DietType;
  /** 화면 표기명 예: "균형형 식사" */
  label: string;
  /** 한 줄 정의 */
  description: string;
}

export interface DietClassification {
  type: DietType;
  /** 근거 3줄 — 각 항목은 {title, detail} (B6 카드의 리스트) */
  evidence: { title: string; detail: string }[];
  /** 'rule' 규칙 기반 · 'ai' AI 호출 · 'cache' AI 캐시 히트 · 'manual' 직접 선택 */
  source: 'rule' | 'ai' | 'cache' | 'manual';
}

export interface Profile {
  id: string;
  nickname: string;
  sex: Sex;
  birthYear: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  primaryGoal: Goal;
  secondaryGoals: Goal[];
  /** 감량/증량일 때만 */
  targetWeightKg?: number;
  targetWeeks?: number;
  /** B5 자유 서술 원문 */
  dietDescription?: string;
  diet: DietClassification;
  onboardingDone: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/** 영양소. 질량은 g, 나트륨은 mg. 없는 값은 undefined (0이 아님 — "정보 없음"과 구분) */
export interface Nutrients {
  kcal: number;
  carbs?: number;
  protein?: number;
  fat?: number;
  satFat?: number;
  sugar?: number;
  sodium?: number;
  caffeine?: number; // mg
}

/** 오늘 목표량 — 전부 필수 */
export interface DailyTargets {
  kcal: number;
  carbs: number;
  protein: number;
  fat: number;
  sugar: number;
  sodium: number;
  /** 목적에 따라 홈에서 강조할 영양소 3~4개 (표시 순서) */
  emphasis: (keyof Omit<DailyTargets, 'emphasis'>)[];
}

/** 신뢰등급: official 공식 영양표 · estimated 추정치 · none 정보 없음 · user 내가 입력 */
export type Trust = 'official' | 'estimated' | 'none' | 'user';

export type StoreCategory = 'convenience' | 'cafe' | 'salad' | 'korean' | 'bakery' | 'fastfood' | 'other';

export type MenuCategory =
  | 'drink' // 음료
  | 'meal' // 식사(도시락·샌드위치·볼 등)
  | 'snack' // 간식·디저트·베이커리
  | 'salad'
  | 'side';

export interface OptionChoice {
  label: string; // "시럽 빼기"
  /** 기본 영양에 더해지는 차이. 음수 가능 */
  delta: Partial<Nutrients>;
  priceDelta?: number;
  isDefault?: boolean;
}

export interface OptionGroup {
  id: string; // "size" | "syrup" | "milk" | "noodle" ...
  label: string; // "사이즈"
  choices: OptionChoice[];
}

export interface MenuItem {
  id: string;
  brandId: string;
  name: string;
  category: MenuCategory;
  /** "Tall (355 ml)" · "1개 (195 g)" */
  serving: string;
  price?: number;
  /** null = 영양 정보 없음(trust 'none'). 0으로 채우지 않는다 */
  nutrients: Nutrients | null;
  trust: Trust;
  sourceUrl?: string;
  /** 출처 이름 — 예: "식약처·전국통합식품영양성분정보(음식)". 공공데이터 인제스트 메뉴에 붙는다 */
  sourceName?: string;
  /** 시판 가공식품의 제조사 표시명 (예: "농심") — 매장 브랜드 대신 이걸 보여준다 */
  maker?: string;
  /** 제공량 보충 설명 — 1인분량을 몰라 100 g 기준으로 표시할 때 그 사실을 밝힌다 */
  servingNote?: string;
  /** 시안 카드 보조 표기용: "카페인 있음" 등 */
  tags?: string[];
  options?: OptionGroup[];
  /** 짧은 소개 한 줄 (D4 상단) */
  blurb?: string;
  imageKey?: string;
}

/** 매장 단위 커버리지: full 영양표 있음 · partial 일부 · none 정보 없음 */
export type Coverage = 'full' | 'partial' | 'none';

export interface Brand {
  id: string; // "gs25" | "starbucks" ...
  name: string; // "GS25"
  category: StoreCategory;
  /** 카카오 로컬 검색 결과의 place_name 에서 브랜드를 알아보기 위한 키워드들 */
  matchKeywords: string[];
  coverage: Coverage;
  /** D1 카드 한 줄 설명 */
  blurb?: string;
  logoKey?: string;
}

export interface Store {
  id: string; // 카카오 place id 또는 mock id
  name: string; // "GS25 역삼센터점"
  brandId?: string; // 매칭 실패 시 undefined → coverage none
  category: StoreCategory;
  coverage: Coverage;
  distanceM: number;
  address?: string;
  lat: number;
  lng: number;
  phone?: string;
  placeUrl?: string;
}

export type Verdict = 'good' | 'ok' | 'pass';

export const VERDICT_LABEL: Record<Verdict, string> = {
  good: '좋음',
  ok: '괜찮음',
  pass: '오늘은 패스',
};

export interface Judgement {
  verdict: Verdict;
  /** 0~100. 순위 정렬 키 */
  score: number;
  /** 판정 이유 템플릿 문구 (1~3줄). 첫 줄이 굵은 제목, 둘째 줄이 보조 */
  reasons: string[];
  /** 구매 가이드 한 줄 ("시럽 빼면 좋음이 돼요") — 없으면 undefined */
  guide?: string;
  /** 정보 없음(trust none)이면 true → 배지 대신 "아직 추가되지 않은 정보입니다" */
  unknown: boolean;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
  snack: '간식',
};

export interface MealLog {
  id: string;
  date: string; // YYYY-MM-DD (로컬)
  mealType: MealType;
  time: string; // ISO
  name: string;
  brandId?: string;
  storeName?: string;
  menuId?: string;
  /** 선택한 옵션 라벨들 */
  optionLabels?: string[];
  /** 옵션·수량 반영 후 최종 영양 */
  nutrients: Nutrients;
  trust: Trust;
  qty: number; // 0.5 ~ 2, 0.25 단위 · 조각 메뉴는 1 ~ 6 (domain/qty qtyOptionsFor)
  verdict?: Verdict;
  createdAt: string;
}

/** 오늘 합계 + 남은 여유 */
/** 목표를 넘으면 빨강으로 보여주는 영양소 — 단백질은 많을수록 좋은 쪽이라 넘어도 '달성'이지 초과 표시가 아니다 */
export type OverNutrient = 'kcal' | 'carbs' | 'fat' | 'sugar' | 'sodium';

export interface DaySummary {
  date: string;
  consumed: Nutrients;
  targets: DailyTargets;
  /** 목표 - 먹은 양, 0 하한 (판정 엔진 입력) */
  remaining: DailyTargets;
  /** 목표보다 더 먹은 양 (양수만, 소수 첫째 자리). 넘지 않은 영양소는 키가 없다 — 2026-09-25 효님 결정: 넘은 양도 보여준다 */
  over: Partial<Record<OverNutrient, number>>;
  /** 'empty' 기록 없음 · 'room' 여유 있음 · 'almost' 거의 다 참(80%↑) · 'over' 넘김 */
  status: 'empty' | 'room' | 'almost' | 'over';
  logs: MealLog[];
}
