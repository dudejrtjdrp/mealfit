/**
 * 남은 kcal 을 친숙한 음식으로 번역한다 — "샌드위치 하나에 라떼 한 잔 정도예요".
 * 숫자는 지어내지 않는다: 기준 음식의 kcal 은 앱 메뉴 데이터(@/data)에서 id 로 찾아 온 값만 쓰고,
 * 못 찾거나 1~2개 조합으로 ±15% 안에 못 맞추면 null(화면에서 줄을 숨긴다).
 * React·데이터 모듈에 의존하지 않도록 메뉴 조회 함수는 밖에서 넘겨받는다.
 */
import type { MenuItem } from './types';

/** 기준 음식 정의 — 메뉴 id 와 화면에 쓸 말(수량 포함) */
export interface ReferenceFoodSpec {
  /** src/data 메뉴 id (시드). kcal 은 여기서 가져온다 */
  menuId: string;
  /** 1개일 때 말: "샌드위치 하나" */
  one: string;
  /** 같은 것 2개일 때 말: "삼각김밥 두 개". 없으면 2개 조합에 쓰지 않는다 */
  two?: string;
}

export interface ReferenceFood extends ReferenceFoodSpec {
  kcal: number;
}

/**
 * 누구나 떠올릴 수 있는 기준 음식. 편의점·카페 대표 메뉴(시드 데이터)에서 골랐다.
 * 큰 것부터 적는다 — 두 개를 조합할 때 앞에 오는 쪽이 문장 앞에 온다.
 */
export const REFERENCE_FOOD_SPECS: ReferenceFoodSpec[] = [
  { menuId: 'gs25-dosirak-gs', one: '편의점 도시락 하나', two: '편의점 도시락 두 개' },
  { menuId: 'mom_touch-thigh-burger', one: '치킨버거 하나' },
  { menuId: 'gs25-big-cup-ramen-gs', one: '큰 컵라면 하나' },
  { menuId: 'gs25-ham-egg-sandwich-gs', one: '샌드위치 하나', two: '샌드위치 두 개' },
  { menuId: 'paris_baguette-croissant', one: '크루아상 하나' },
  { menuId: 'gs25-tuna-mayo-onigiri-gs', one: '삼각김밥 하나', two: '삼각김밥 두 개' },
  { menuId: 'gs25-banana-milk-gs', one: '바나나우유 하나' },
  { menuId: 'gs25-sweet-potato-gs', one: '군고구마 하나' },
  { menuId: 'starbucks-latte', one: '라떼 한 잔', two: '라떼 두 잔' },
  { menuId: 'cu-nuts-cu', one: '견과 한 봉' },
  { menuId: 'gs25-boiled-egg-gs', one: '구운 달걀 두 개' },
  { menuId: 'gs25-greek-yogurt-gs', one: '그릭요거트 하나' },
];

/** 기본 허용 오차 ±15% */
export const EQUIVALENT_TOLERANCE = 0.15;

/** 메뉴 데이터에서 기준 음식의 kcal 을 붙인다. 정보가 없거나(trust none) 못 찾은 것은 뺀다 */
export function resolveReferenceFoods(
  specs: ReferenceFoodSpec[],
  lookup: (id: string) => Pick<MenuItem, 'nutrients' | 'trust'> | undefined,
): ReferenceFood[] {
  const out: ReferenceFood[] = [];
  for (const spec of specs) {
    const m = lookup(spec.menuId);
    const kcal = m?.nutrients?.kcal;
    if (!m || m.trust === 'none' || typeof kcal !== 'number' || !Number.isFinite(kcal) || kcal <= 0) continue;
    out.push({ ...spec, kcal });
  }
  return out;
}

export interface FoodEquivalent {
  /** 화면에 쓸 한 줄 */
  text: string;
  /** 조합에 쓴 기준 음식 (같은 것 2개면 두 번) */
  parts: ReferenceFood[];
  /** 조합 합계 kcal */
  kcal: number;
}

interface Combo {
  parts: ReferenceFood[];
  kcal: number;
  text: string;
  order: number;
}

/**
 * 남은 kcal 에 가장 가까운 1~2개 조합. 오차가 tolerance 를 넘으면 null.
 * 1개로 맞출 수 있으면 1개를 먼저 쓴다(한눈에 읽히게). 같은 개수끼리는 더 가까운 쪽 → 목록 순서.
 */
export function foodEquivalent(remainingKcal: number, foods: ReferenceFood[], tolerance = EQUIVALENT_TOLERANCE): FoodEquivalent | null {
  if (!Number.isFinite(remainingKcal) || remainingKcal <= 0 || foods.length === 0) return null;

  const singles: Combo[] = foods.map((f, i) => ({ parts: [f], kcal: f.kcal, text: `${f.one} 정도예요`, order: i }));
  const pairs: Combo[] = [];
  foods.forEach((a, i) => {
    if (a.two) pairs.push({ parts: [a, a], kcal: a.kcal * 2, text: `${a.two} 정도예요`, order: i * foods.length + i });
    for (let j = i + 1; j < foods.length; j++) {
      const b = foods[j];
      // 큰 것을 앞에: "샌드위치 하나에 라떼 한 잔"
      const [first, second] = b.kcal > a.kcal ? [b, a] : [a, b];
      pairs.push({ parts: [first, second], kcal: a.kcal + b.kcal, text: `${first.one}에 ${second.one} 정도예요`, order: i * foods.length + j });
    }
  });

  const within = (c: Combo) => Math.abs(c.kcal - remainingKcal) <= remainingKcal * tolerance;
  const closest = (list: Combo[]) =>
    list
      .filter(within)
      .sort((x, y) => Math.abs(x.kcal - remainingKcal) - Math.abs(y.kcal - remainingKcal) || x.order - y.order)[0];

  const best = closest(singles) ?? closest(pairs);
  if (!best) return null;
  return { text: best.text, parts: best.parts, kcal: best.kcal };
}
