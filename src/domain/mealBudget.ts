/**
 * 이번 끼니 적정량 — "하루 남은 kcal 을 남은 주 끼니 수로 나눈 양".
 * 하루 3끼(아침·점심·저녁) 고정, 간식은 끼니 수에 넣지 않는다(효님 결정 전 기본값).
 * 남은 끼니 수는 현재 시각이 정한다 — 점심 시간인데 아침을 안 먹었어도 남은 건 점심·저녁 2끼(시간 우선).
 * React 의존 없음 — 판정 엔진과 화면(오늘·주변·상세)이 같이 쓴다.
 */
import { MEAL_LABEL, type MealLog, type MealType } from './types';

/** 이 시각(로컬, 자정부터 분) 전이면 아침 — 10:30 */
export const BREAKFAST_UNTIL_MIN = 10 * 60 + 30;
/** 이 시각 전이면 점심 — 15:00 */
export const LUNCH_UNTIL_MIN = 15 * 60;
/** 이 시각 전이면 저녁, 그 뒤는 간식(늦은 시간) — 21:00 */
export const DINNER_UNTIL_MIN = 21 * 60;

/** 하루 주 끼니 (간식 제외) */
export const MAIN_MEALS: readonly MealType[] = ['breakfast', 'lunch', 'dinner'];

export interface MealBudgetOptions {
  /** 오늘 이미 기록한 끼니 종류 — 지금 끼니를 이미 먹었으면 다음 끼니부터 센다 */
  eatenMeals?: readonly MealType[];
  /** 남은 끼니 수를 직접 지정 (1 이상). 주면 시각·기록보다 우선 */
  slotsLeft?: number;
}

export interface MealBudget {
  /** 이번 끼니 적정량 (kcal, 반올림). 남은 양이 없으면 0 */
  kcal: number;
  /** 이번 끼니를 포함해 남은 주 끼니 수 (1 이상) */
  slotsLeft: number;
  /** 이번 끼니 이름 — '아침' · '점심' · '저녁' · '야식'(21시 이후) · '간식'(21시 전에 세 끼를 다 기록) */
  label: string;
  mealType: MealType;
  /** 오늘 마지막 주 끼니 — 적정량 = 남은 전부. 간식·야식 슬롯은 상한이 있어 false */
  isLast: boolean;
  /** 주 끼니가 남지 않은 간식·야식 슬롯 — 적정량에 SNACK_* 상한이 걸린다 */
  isSnack: boolean;
}

/**
 * 간식·야식 슬롯(21시 이후, 또는 세 끼를 다 기록한 뒤)의 적정량 상한.
 * 주 끼니가 남지 않았다고 하루 남은 양 전부를 한 번에 먹을 양으로 보면, 밤 9시에 아무것도 기록하지 않은 사람에게
 * 1,260kcal 우유 1.8L 팩이 '좋음'이 된다. 그래서 min(남은 양, max(SNACK_MIN_KCAL, 남은 양 ÷ SNACK_SHARE_DIVISOR)):
 * - ÷3: 하루 세 끼 중 한 끼 몫보다 크지 않게 (남은 2,579 → 860)
 * - 최소 400: 남은 양이 적은 날에도 가벼운 한 끼·간식(삼각김밥+우유 정도)은 알맞게 본다
 * - 남은 양보다 크게는 잡지 않는다
 */
export const SNACK_MIN_KCAL = 400;
export const SNACK_SHARE_DIVISOR = 3;

/**
 * 이 kcal 이상 기록한 끼니만 "먹은 끼니"로 친다 — 라떼 한 잔(150kcal)만 적어도 점심을 먹은 것으로 보고
 * 남은 양 전부를 저녁 한 끼 기준으로 판정하던 문제를 막는다. 하루 목표 1,500~2,500kcal 의 한 끼(500~800)의
 * 1/3 안팎이라 "끼니"와 "음료·간식"을 가르는 선으로 200kcal 을 쓴다 (효님 결정 전 기본값).
 */
export const MEAL_EATEN_MIN_KCAL = 200;

/** 오늘 기록 → 먹은 끼니 목록 (끼니별 kcal 합계가 MEAL_EATEN_MIN_KCAL 이상인 것만, 처음 나온 순서) */
export function eatenMealsFromLogs(logs: readonly Pick<MealLog, 'mealType' | 'nutrients'>[] | null | undefined, minKcal: number = MEAL_EATEN_MIN_KCAL): MealType[] {
  const sum = new Map<MealType, number>();
  for (const l of logs ?? []) {
    const k = l.nutrients?.kcal;
    sum.set(l.mealType, (sum.get(l.mealType) ?? 0) + (typeof k === 'number' && Number.isFinite(k) ? k : 0));
  }
  return [...sum].filter(([, kcal]) => kcal >= minKcal).map(([m]) => m);
}

/** 시각 → 지금 끼니 (~10:30 아침 · ~15:00 점심 · ~21:00 저녁 · 그 뒤 간식) */
export function mealTypeAt(now: Date = new Date()): MealType {
  const m = now.getHours() * 60 + now.getMinutes();
  if (m < BREAKFAST_UNTIL_MIN) return 'breakfast';
  if (m < LUNCH_UNTIL_MIN) return 'lunch';
  if (m < DINNER_UNTIL_MIN) return 'dinner';
  return 'snack';
}

/** 지금 시각 기준으로 아직 남은 주 끼니 (이번 끼니 포함, 기록은 반영 안 함) */
export function mealsLeftAt(now: Date = new Date()): MealType[] {
  const t = mealTypeAt(now);
  const i = MAIN_MEALS.indexOf(t);
  return i < 0 ? [] : MAIN_MEALS.slice(i);
}

/**
 * 이번 끼니 적정량.
 * @example mealBudget(1500, new Date(2026, 8, 25, 12, 30)) // { kcal: 750, slotsLeft: 2, label: '점심', ... }
 */
export function mealBudget(remainingKcal: number, now: Date = new Date(), opts: MealBudgetOptions = {}): MealBudget {
  const eaten = opts.eatenMeals ?? [];
  const upcoming = mealsLeftAt(now).filter((m) => !eaten.includes(m));
  const forced = opts.slotsLeft !== undefined && Number.isFinite(opts.slotsLeft) ? Math.max(1, Math.floor(opts.slotsLeft)) : undefined;
  const slotsLeft = forced ?? Math.max(1, upcoming.length);
  const mealType: MealType = upcoming[0] ?? 'snack';
  const rem = Number.isFinite(remainingKcal) ? Math.max(0, remainingKcal) : 0;
  // slotsLeft 를 직접 준 경우는 호출한 쪽이 끼니 수를 정한 것이라 상한을 걸지 않는다
  const isSnack = forced === undefined && upcoming.length === 0;
  const kcal = isSnack ? Math.min(rem, Math.max(SNACK_MIN_KCAL, rem / SNACK_SHARE_DIVISOR)) : rem / slotsLeft;
  const late = mealTypeAt(now) === 'snack';
  return {
    kcal: Math.round(kcal),
    slotsLeft,
    label: isSnack && late ? '야식' : MEAL_LABEL[mealType],
    mealType,
    isLast: slotsLeft === 1 && !isSnack,
    isSnack,
  };
}
