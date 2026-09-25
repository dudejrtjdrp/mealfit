/**
 * 밀리 탭 "오늘은 이렇게 어때요?" — 오늘 남은 끼니 식단을 주변 매장 메뉴로 대략 짜 준다.
 * 전부 규칙·템플릿 (AI 없음). React·데이터 로더 의존 없음 — 후보(판정 끝난 주변 메뉴)는 호출한 쪽이 넘긴다.
 *
 * 규칙
 * - 끼니: 아침·점심·저녁 고정(mealBudget 과 같은 경계 10:30·15:00·21:00). 오늘 기록한 끼니(200kcal 이상)는 "기록했어요",
 *   지나간 빈 끼니는 "지나갔어요", 남은 끼니만 짠다. 주 끼니가 남지 않았고 남은 양이 있으면 간식 하나.
 * - 끼니별 적정량: 오늘 남은 kcal ÷ 남은 주 끼니 수 (간식은 mealBudget 의 간식 상한)
 * - 음식 갈래(domain/foodGroup): 하루 끼니끼리(기록한 끼니 포함) 갈래를 겹치지 않는다 — 빵을 아침에 골랐으면 점심·저녁은 밥·면·국 등.
 *   후보가 모자라면 단계적으로 풀어 준다: ① 갈래 모두 다르게 → ② 빵만 아니면 겹쳐도 → ③ 아무거나(점수는 깎는다).
 *   디저트·음료는 주 끼니의 주 메뉴로 권하지 않고, 점심·저녁엔 밥·면·국 같은 "한 끼다운" 갈래를 앞세운다.
 * - 다양성: 최근 기록(오늘·어제·그저께)의 같은 메뉴(menuId·정규화 이름)는 뺀다. 최근 먹은 브랜드·갈래는 뒤로 미룬다.
 *   같은 날 끼니끼리는 매장(브랜드)을 겹치지 않는다.
 * - 끼니별 다른 메뉴: 끼니마다 "다른 끼니와 겹치지 않는" 후보를 PLAN_OPTIONS 개까지 싣는다. 사용자가 한 끼를 넘기면
 *   (cyclePicks) 지금 보이는 끼니를 전부 고정(picks)한 채 그 끼니만 바꾼다 — 후보 목록 자체가 다른 끼니와 안 겹치는 것만이라
 *   다른 끼니는 그대로 둘 수 있다.
 * - 결정적: 같은 입력·seed·picks → 같은 식단. "다른 조합 보기"는 seed+1 + picks 비우기.
 * - 밀리에게 한 요청(domain/preferences 태그): 꼭 빼기 → 후보에서 뺀다 · 좋아요/덜 → 점수 ± · 좋아요에 맞는 후보가 있으면
 *   그중에서 고른다. 이유 한 줄에 "요청하신 대로 …" / "근처에 통밀빵이 없어 일반 빵으로 골랐어요" 를 싣는다.
 */
import { FOOD_GROUP_WORD, NON_MAIN_GROUPS, REAL_MEAL_GROUPS, foodGroup, type FoodGroup } from './foodGroup';
import { prefEffect, prefReason, prefTagKey, tagApplies, targetMatches, type PrefSubject, type PrefTag } from './preferences';
import { formatNumber } from './summary';
import { mealBudget, mealsLeftAt, mealTypeAt, eatenMealsFromLogs, MAIN_MEALS } from './mealBudget';
import { MEAL_LABEL, type DailyTargets, type Judgement, type MealLog, type MealType, type MenuItem, type Nutrients, type Store } from './types';

/** 식단 후보 — state/recommend 의 RecommendCandidate 와 같은 모양 */
export interface PlanCandidate {
  menu: MenuItem;
  judgement: Judgement;
  store: Store;
  /** 기본 옵션 기준 kcal */
  kcal: number;
  nutrients: Nutrients;
}

/** 최근에 먹은 것 — 기록(MealLog)에서 필요한 것만 */
export type RecentEaten = Pick<MealLog, 'name' | 'date'> & Partial<Pick<MealLog, 'menuId' | 'brandId' | 'storeName'>>;

/** 오늘 기록 — 끼니 칸 나누기와 기록한 끼니의 음식 갈래에 쓴다 */
export type TodayLog = Pick<MealLog, 'mealType' | 'nutrients' | 'name'> & Partial<Pick<MealLog, 'storeName'>>;

/** 사용자가 끼니별로 고른 메뉴 (menu.id) */
export type PlanPicks = Partial<Record<MealType, string>>;

export interface MealPlanInput {
  candidates: PlanCandidate[];
  /** 오늘 남은 kcal (목표 - 먹은 양). 0 이하면 오늘은 충분 */
  remainingKcal: number;
  now: Date;
  /** 오늘 기록 */
  todayLogs: readonly TodayLog[];
  /** 최근 기록 (오늘·어제·그저께 — 이보다 오래된 건 무시) */
  recentLogs: readonly RecentEaten[];
  /** 날짜 seed + 다시 짜기 횟수 */
  seed: number;
  /** 끼니별로 사용자가 넘겨 고른 메뉴 — 아직 맞으면 그대로 쓴다 */
  picks?: PlanPicks;
  /** 목적별 강조 영양소 (DailyTargets.emphasis) — 이유 문구 고를 때만 */
  emphasis?: readonly string[];
  /** 밀리에게 한 요청의 태그 (state/preferences activeTags) */
  requests?: readonly PrefTag[];
}

export type PlanMealStatus = 'done' | 'skipped' | 'planned' | 'empty';

export interface PlanMeal {
  mealType: MealType;
  /** '아침' · '점심' · '저녁' · '간식' · '야식' */
  label: string;
  /** "오후 3시까지" 같은 시간 안내 */
  timeHint: string;
  status: PlanMealStatus;
  /** done: 기록한 kcal 합계 */
  loggedKcal?: number;
  /** done: 기록한 음식 이름 */
  loggedNames?: string[];
  /** planned·empty: 이 끼니 적정량 */
  budgetKcal?: number;
  main?: PlanCandidate;
  /** 같은 매장에서 곁들일 음료·사이드 (적정량 안에서 여유가 있을 때만) */
  extra?: PlanCandidate;
  /** main + extra kcal */
  totalKcal?: number;
  /** 음식 갈래 — planned: 주 메뉴 · done: 기록한 것 중 가장 큰 것 */
  group?: FoodGroup;
  /** planned: 이 끼니로 고를 수 있는 후보 (다른 끼니와 매장·갈래가 겹치지 않는 것, 점수순, main 포함) */
  options?: PlanCandidate[];
  /** options 안에서 main 의 자리 (0부터) */
  optionIndex?: number;
  /** 한 줄 이유 ("아침에 빵을 골라서 점심은 밥으로 골랐어요") */
  reason?: string;
  /** 메뉴 특징 한 줄 ("단백질이 든든한 메뉴로 골랐어요") — reason 과 다를 때만 */
  detail?: string;
}

export interface MealPlan {
  /** ok: 짠 끼니가 하나 이상 · full: 오늘 남은 양이 없음 · noCandidates: 남은 끼니는 있는데 맞는 메뉴가 없음 · none: 남은 끼니가 없음 */
  status: 'ok' | 'full' | 'noCandidates' | 'none';
  meals: PlanMeal[];
  remainingKcal: number;
  /** 짠 끼니 kcal 합계 */
  plannedKcal: number;
  /** 식단에 쓴 서로 다른 매장 수 */
  storeCount: number;
}

// ── 상수 (효님 결정 전 기본값) ──────────────────────────────────────────

/** 끼니 적정량보다 이만큼(배)까지는 넣는다 — 판정의 BUDGET_BIG_PCT(110%)와 같게 */
export const PLAN_OVER_RATIO = 1.1;
/** 한 끼로 너무 작은 메뉴는 주 메뉴로 안 고른다 (적정량의 30% 미만 · 음료는 제외) */
export const PLAN_MIN_RATIO = 0.3;
/** 가장 좋은 적정량 비율 — 적정량의 80% 안팎이 제일 알맞다고 본다 */
export const PLAN_SWEET_RATIO = 0.8;
/** 다시 짜기에서 돌리는 상위 후보 수 · 최고 점수와 이만큼 차이 나는 후보까지만 */
export const PLAN_TOP_K = 4;
export const PLAN_TOP_MARGIN = 30;
/** 끼니마다 넘겨 볼 수 있는 후보 수 · 한 매장(그리고 먼저 담을 때 한 갈래)에서 최대 몇 개까지 */
export const PLAN_OPTIONS = 5;
export const PLAN_OPTIONS_PER_BRAND = 2;
/** 주 메뉴 뒤 남은 적정량이 이 이상이고, 주 메뉴가 적정량의 이 비율 미만일 때만 같은 매장 음료·사이드를 곁들인다 */
export const EXTRA_MIN_ROOM = 80;
export const EXTRA_MAIN_MAX_RATIO = 0.75;
/** 간식 슬롯은 남은 양이 이 이상일 때만 */
export const SNACK_PLAN_MIN_KCAL = 150;
/** 최근 N일(오늘 포함 3일 = 오늘·어제·그저께) */
export const RECENT_DAYS = 3;
/** 같은 날 갈래가 겹칠 수밖에 없을 때(풀어 준 단계) 깎는 점수 */
const SAME_DAY_GROUP_PENALTY = 30;

const TIME_HINT: Record<MealType, string> = {
  breakfast: '오전 10시 반까지',
  lunch: '오후 3시까지',
  dinner: '밤 9시까지',
  snack: '출출할 때',
};

// ── 작은 도우미 ───────────────────────────────────────────────────────

/** 대소문자·공백·기호 무시 (data/normalizeName 과 같은 규칙) */
export function normalizeMenuName(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

/** 후보 → 음식 갈래 */
export function candidateGroup(c: PlanCandidate): FoodGroup {
  return foodGroup({ name: c.menu.name, category: c.menu.category, storeName: c.store.name, storeCategory: c.store.category });
}

/** 날짜 → seed (로컬 날짜 기준 일수) — 같은 날엔 같은 식단 */
export function daySeed(d: Date = new Date()): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

/** now 기준 며칠 전인지 (오늘 0 · 어제 1 · 그저께 2). 형식이 이상하면 큰 값 */
function daysAgo(date: string, now: Date): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return 99;
  const that = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return Math.round((daySeed(now) * 86400000 - that) / 86400000);
}

const DAY_WORD = ['오늘', '어제', '그저께'];

/** 마지막 글자 받침 — 없음 0, 한글이 아니면 -1 */
function finalConsonant(word: string): number {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return -1;
  return (c - 0xac00) % 28;
}

/** 받침 있으면 a, 없으면 b ("샌드위치는" / "김밥은") */
function josa(word: string, withFinal: string, without: string): string {
  return finalConsonant(word) > 0 ? withFinal : without;
}

/** "밥으로" / "빵으로" / "국물 요리로" / "면으로" — 받침 없거나 ㄹ 받침이면 "로" */
function euro(word: string): string {
  const f = finalConsonant(word);
  return f > 0 && f !== 8 ? '으로' : '로';
}

/** 카페인 음료 (수치가 있거나 이름이 커피류) — 저녁·간식 곁들임에서 뺀다 */
const COFFEE_WORDS = /커피|카페|모카|아메리카노|에스프레소|콜드브루|코르타도|카푸치노|마키아또|샷|녹차|말차|홍차|에너지/;
const hasCaffeine = (c: PlanCandidate) => (c.nutrients.caffeine ?? 0) > 0 || COFFEE_WORDS.test(c.menu.name);

/** 소스·시럽 같은 건 곁들임으로 권하지 않는다 */
const NOT_EXTRA = /소스|디핑|시럽|드레싱|토핑|추가/;

const isDrinkish = (c: PlanCandidate) => c.menu.category === 'drink' || c.menu.category === 'side';

// ── 끼니 칸 ───────────────────────────────────────────────────────────

export interface PlanSlots {
  /** 아침·점심·저녁 (+ 간식) 순서의 칸 — 아직 메뉴는 없음 */
  meals: PlanMeal[];
  /** 짜야 하는 주 끼니 수 (판정 컨텍스트 mealSlotsLeft 로 쓴다) */
  upcoming: number;
}

/** 기록한 끼니의 음식 갈래 — 그 끼니에서 kcal 이 가장 큰 기록 기준 (음료만 적었으면 undefined) */
function loggedGroup(logs: readonly TodayLog[]): FoodGroup | undefined {
  const sorted = [...logs].sort((a, b) => (b.nutrients?.kcal ?? 0) - (a.nutrients?.kcal ?? 0));
  for (const l of sorted) {
    const g = foodGroup({ name: l.name, storeName: l.storeName });
    if (g !== 'drink') return g;
  }
  return undefined;
}

/** 오늘 끼니 칸 나누기 — 기록한 끼니 · 지나간 끼니 · 짤 끼니 + 끼니별 적정량 */
export function planSlots(remainingKcal: number, now: Date, todayLogs: readonly TodayLog[]): PlanSlots {
  const rem = Number.isFinite(remainingKcal) ? Math.max(0, remainingKcal) : 0;
  const eaten = eatenMealsFromLogs(todayLogs);
  const left = mealsLeftAt(now);
  const upcomingTypes = left.filter((m) => !eaten.includes(m));
  const perMeal = upcomingTypes.length ? Math.round(rem / upcomingTypes.length) : 0;

  const meals: PlanMeal[] = MAIN_MEALS.map((mealType) => {
    const base = { mealType, label: MEAL_LABEL[mealType], timeHint: TIME_HINT[mealType] };
    if (eaten.includes(mealType)) {
      const mine = todayLogs.filter((l) => l.mealType === mealType);
      const group = loggedGroup(mine);
      return {
        ...base,
        status: 'done' as const,
        loggedKcal: Math.round(mine.reduce((s, l) => s + (Number.isFinite(l.nutrients?.kcal) ? l.nutrients.kcal : 0), 0)),
        loggedNames: mine.map((l) => l.name),
        ...(group ? { group } : {}),
      };
    }
    if (!left.includes(mealType)) return { ...base, status: 'skipped' as const };
    return { ...base, status: 'planned' as const, budgetKcal: perMeal };
  });

  // 간식: 주 끼니가 남지 않았고(21시 이후 또는 세 끼 다 기록) 남은 양이 있으면 가볍게 하나
  if (upcomingTypes.length === 0 && rem >= SNACK_PLAN_MIN_KCAL) {
    const b = mealBudget(rem, now, { eatenMeals: eaten });
    meals.push({ mealType: 'snack', label: b.label, timeHint: mealTypeAt(now) === 'snack' ? '가볍게 한 번' : TIME_HINT.snack, status: 'planned', budgetKcal: b.kcal });
  }
  return { meals, upcoming: upcomingTypes.length };
}

// ── 점수 ──────────────────────────────────────────────────────────────

interface RecentIndex {
  ids: Set<string>;
  names: Set<string>;
  /** 브랜드 → 가장 최근 며칠 전 */
  brands: Map<string, number>;
  /** 음식 갈래 → 가장 최근 며칠 전 */
  groups: Map<FoodGroup, number>;
}

function indexRecent(recent: readonly RecentEaten[], now: Date): RecentIndex {
  const idx: RecentIndex = { ids: new Set(), names: new Set(), brands: new Map(), groups: new Map() };
  for (const r of recent) {
    const ago = daysAgo(r.date, now);
    if (ago < 0 || ago >= RECENT_DAYS) continue;
    if (r.menuId) idx.ids.add(r.menuId);
    idx.names.add(normalizeMenuName(r.name));
    if (r.brandId) idx.brands.set(r.brandId, Math.min(ago, idx.brands.get(r.brandId) ?? 99));
    const g = foodGroup({ name: r.name, storeName: r.storeName });
    if (g !== 'drink' && g !== 'other') idx.groups.set(g, Math.min(ago, idx.groups.get(g) ?? 99));
  }
  return idx;
}

function isRecent(c: PlanCandidate, idx: RecentIndex): boolean {
  return idx.ids.has(c.menu.id) || idx.names.has(normalizeMenuName(c.menu.name));
}

/** 끼니별 갈래 점수 — 점심·저녁은 한 끼다운 갈래를 앞세우고 빵은 뒤로. null 이면 이 끼니 주 메뉴로 안 권한다 */
function groupFit(group: FoodGroup, mealType: MealType): number | null {
  if (mealType === 'snack') return group === 'drink' ? null : group === 'light' || group === 'sweets' ? 10 : 0;
  if (NON_MAIN_GROUPS.includes(group)) return null;
  if (mealType === 'breakfast') {
    if (group === 'porridge' || group === 'salad') return 6;
    if (group === 'rice' || group === 'soup') return 2;
    if (group === 'light') return -8;
    // 아침 라면·떡볶이는 뒤로
    if (group === 'noodle' || group === 'bunsik') return -10;
    return 0;
  }
  // 점심·저녁
  if (group === 'light') return null;
  if (REAL_MEAL_GROUPS.includes(group)) return 14;
  if (group === 'salad') return 6;
  if (group === 'protein') return 2;
  if (group === 'bread') return -12;
  return 0;
}

interface Scored {
  c: PlanCandidate;
  s: number;
  g: FoodGroup;
  /** 맞춘 요청(좋아요) 수 */
  h: number;
}

/** 요청 태그에 견줄 메뉴 모양 */
function subjectOf(c: PlanCandidate, g: FoodGroup): PrefSubject {
  return { name: c.menu.name, storeName: c.store.name, group: g, kcal: c.kcal, nutrients: c.nutrients };
}

/** 주 메뉴 점수 (클수록 앞) — 다른 끼니와의 관계는 빼고 이 끼니만 본 점수. 적정량 밖이면 null */
function mainScore(c: PlanCandidate, g: FoodGroup, budget: number, mealType: MealType, idx: RecentIndex): number | null {
  if (budget <= 0 || c.kcal > budget * PLAN_OVER_RATIO) return null;
  if (isDrinkish(c)) return null;
  const fit = groupFit(g, mealType);
  if (fit === null) return null;
  // 아침·간식은 가벼운 것도 괜찮다 — 최소 비율을 낮춘다
  const minRatio = mealType === 'snack' ? 0.15 : mealType === 'breakfast' ? PLAN_MIN_RATIO * 0.7 : PLAN_MIN_RATIO;
  if (c.kcal < budget * minRatio) return null;
  const ratio = c.kcal / budget;
  let s = 100 - Math.abs(ratio - PLAN_SWEET_RATIO) * 60; // 적정량 80% 근처가 가장 좋다
  s += c.judgement.verdict === 'good' ? 20 : 0;
  s += Math.max(0, Math.min(100, c.judgement.score)) * 0.3; // 목적·식단 성향이 반영된 판정 점수
  s += fit;
  const brandAgo = idx.brands.get(c.menu.brandId);
  if (brandAgo !== undefined) s -= brandAgo <= 1 ? 20 : 10;
  const groupAgo = idx.groups.get(g);
  if (groupAgo !== undefined) s -= groupAgo <= 1 ? 20 : 8;
  return s;
}

/**
 * 같은 매장(브랜드) 판단 키 — 브랜드 매장은 브랜드, 브랜드 아닌 동네 식당(일반 식당 기준 추정 메뉴)은 그 가게.
 * 추정 메뉴는 모두 가상 브랜드 'generic' 이라 menu.brandId 로 보면 국밥집·찌개집이 한 매장처럼 겹친다.
 */
const sellerOf = (c: PlanCandidate): string => c.store.brandId ?? `place:${c.store.id}`;

/** 다른 끼니에 이미 놓인 것 (기록한 끼니는 갈래만) */
interface Taken {
  group?: FoodGroup;
  brandId?: string;
  storeId?: string;
}

/** 같은 날 겹치는지 셀 갈래 — 모르는 것(other)은 겹친다고 보지 않는다 */
const countsForDay = (g: FoodGroup | undefined): g is FoodGroup => !!g && g !== 'other' && g !== 'drink';

/**
 * 이 끼니 후보 순위 — 다른 끼니(taken)와 매장은 늘 겹치지 않게, 갈래는 단계적으로:
 * ① 모두 다르게 → ② 빵이 두 번만 아니면 겹쳐도(점수 깎음) → ③ 아무거나(점수 깎음). 후보가 있는 첫 단계를 쓴다.
 */
function rankSlot(scored: readonly Scored[], taken: readonly Taken[]): Scored[] {
  const brands = new Set(taken.map((t) => t.brandId).filter(Boolean));
  const stores = new Set(taken.map((t) => t.storeId).filter(Boolean));
  const groups = new Set(taken.map((t) => t.group).filter(countsForDay));
  const free = scored.filter((x) => !brands.has(sellerOf(x.c)) && !stores.has(x.c.store.id));
  const clash = (x: Scored) => countsForDay(x.g) && groups.has(x.g);
  const levels: ((x: Scored) => boolean)[] = [(x) => !clash(x), (x) => !(x.g === 'bread' && groups.has('bread')), () => true];
  for (const ok of levels) {
    const list = free.filter(ok);
    if (list.length) return list.map((x) => (clash(x) ? { ...x, s: x.s - SAME_DAY_GROUP_PENALTY } : x)).sort(byScore);
  }
  return [];
}

const byScore = (a: Scored, b: Scored) => b.s - a.s || a.c.store.distanceM - b.c.store.distanceM || a.c.menu.id.localeCompare(b.c.menu.id);

/** 편의점 자체 상표 앞말 — "유어스 가쓰오 우동"·"헤이루 가쓰오 우동"은 같은 메뉴로 본다 */
const PB_PREFIX = /^(유어스|youus|헤이루|세븐셀렉트|7select|리얼프라이스|피베|cu|gs)/;
const coreName = (c: PlanCandidate) => normalizeMenuName(c.menu.name).replace(PB_PREFIX, '');

/**
 * 넘겨 볼 후보 — 점수순, 이름이 같은 메뉴(편의점마다 있는 같은 상품)는 한 번만.
 * 여러 가지를 보여 주려고 한 매장·한 갈래에서 PLAN_OPTIONS_PER_BRAND 개까지 먼저 담고, 모자라면 갈래 개수만 풀어 채운다.
 * 지금 고른 것은 꼭 넣는다.
 */
function optionList(ranked: readonly Scored[], main: PlanCandidate): PlanCandidate[] {
  const out: Scored[] = [];
  const names = new Set<string>();
  const perBrand = new Map<string, number>();
  const perGroup = new Map<FoodGroup, number>();
  const add = (x: Scored) => {
    out.push(x);
    names.add(coreName(x.c));
    perBrand.set(sellerOf(x.c), (perBrand.get(sellerOf(x.c)) ?? 0) + 1);
    perGroup.set(x.g, (perGroup.get(x.g) ?? 0) + 1);
  };
  const mine = ranked.find((x) => x.c.menu.id === main.menu.id) ?? { c: main, s: -Infinity, g: candidateGroup(main), h: 0 };
  add(mine);
  for (const groupCap of [PLAN_OPTIONS_PER_BRAND, Infinity]) {
    for (const x of ranked) {
      if (out.length >= PLAN_OPTIONS) break;
      if (out.includes(x) || x.c.menu.id === main.menu.id || names.has(coreName(x.c))) continue;
      if ((perBrand.get(sellerOf(x.c)) ?? 0) >= PLAN_OPTIONS_PER_BRAND || (perGroup.get(x.g) ?? 0) >= groupCap) continue;
      add(x);
    }
  }
  return out.sort(byScore).map((x) => x.c);
}

/**
 * 같은 매장에서 곁들일 사이드·음료 — 남은 적정량 안, 최근에 안 먹은 것.
 * 사이드 → 단백질 있는 음료(우유·두유류) → 그 밖의 음료 순. 저녁·간식엔 카페인 음료는 권하지 않는다.
 */
function pickExtra(main: PlanCandidate, pool: PlanCandidate[], budget: number, mealType: MealType, idx: RecentIndex, requests: readonly PrefTag[] = []): PlanCandidate | undefined {
  const room = budget - main.kcal;
  if (room < EXTRA_MIN_ROOM || main.kcal >= budget * EXTRA_MAIN_MAX_RATIO) return undefined;
  const late = mealType === 'dinner' || mealType === 'snack';
  const tier = (c: PlanCandidate) => (c.menu.category === 'side' ? 0 : (c.nutrients.protein ?? 0) >= 5 ? 1 : 2);
  const opts = pool
    .filter(
      (c) =>
        sellerOf(c) === sellerOf(main) &&
        c.menu.id !== main.menu.id &&
        isDrinkish(c) &&
        c.kcal >= 30 &&
        !NOT_EXTRA.test(c.menu.name) &&
        c.kcal <= room &&
        !(late && hasCaffeine(c)) &&
        !isRecent(c, idx) &&
        !prefEffect(requests, mealType, subjectOf(c, candidateGroup(c)), budget).excluded &&
        prefEffect(requests, mealType, subjectOf(c, candidateGroup(c)), budget).delta >= 0,
    )
    .sort((a, b) => tier(a) - tier(b) || (b.judgement.verdict === 'good' ? 1 : 0) - (a.judgement.verdict === 'good' ? 1 : 0) || b.judgement.score - a.judgement.score || a.kcal - b.kcal || a.menu.id.localeCompare(b.menu.id));
  return opts[0];
}

// ── 이유 문구 (템플릿) ────────────────────────────────────────────────

/** 메뉴 특징 한 줄 */
export function traitPhrase(c: PlanCandidate, budget: number, emphasis: readonly string[] = []): string {
  const p = c.nutrients.protein;
  const sugar = c.nutrients.sugar;
  const proteinRich = typeof p === 'number' && (p >= 20 || (c.kcal > 0 && (p * 4) / c.kcal >= 0.25));
  const lowSugar = typeof sugar === 'number' && sugar <= 5;
  const light = budget > 0 && c.kcal <= budget * 0.6;
  const order: [boolean, string][] = emphasis.includes('sugar')
    ? [
        [lowSugar, '달지 않은 메뉴로 골랐어요'],
        [proteinRich, '단백질이 든든한 메뉴로 골랐어요'],
      ]
    : [
        [proteinRich, '단백질이 든든한 메뉴로 골랐어요'],
        [lowSugar, '달지 않은 메뉴로 골랐어요'],
      ];
  order.push([light, '가볍게 드실 수 있는 메뉴로 골랐어요']);
  for (const [ok, text] of order) if (ok) return text;
  return c.judgement.verdict === 'good' ? '남은 양에 잘 맞는 메뉴로 골랐어요' : '남은 양 안에서 무난한 메뉴로 골랐어요';
}

/**
 * 끼니 이유 한 줄.
 * - 앞 끼니(기록했거나 고른 것)와 갈래가 다르면: "아침에 빵을 골라서 점심은 밥으로 골랐어요" / "아침에 빵을 드셔서 …"
 * - 첫 끼니면 최근 먹은 다른 갈래: "어제 드신 빵은 빼고, 단백질이 든든한 메뉴로 골랐어요"
 * - 아니면 메뉴 특징만
 */
function planReason(meal: PlanMeal, prev: PlanMeal | undefined, idx: RecentIndex, trait: string): string {
  const mine = meal.group;
  if (prev && countsForDay(prev.group) && countsForDay(mine) && prev.group !== mine) {
    const a = FOOD_GROUP_WORD[prev.group];
    const b = FOOD_GROUP_WORD[mine];
    const verb = prev.status === 'done' ? '드셔서' : '골라서';
    return `${prev.label}에 ${a}${josa(a, '을', '를')} ${verb} ${meal.label}${josa(meal.label, '은', '는')} ${b}${euro(b)} 골랐어요`;
  }
  if (!prev) {
    let skipped: { g: FoodGroup; ago: number } | undefined;
    for (const [g, ago] of idx.groups) {
      if (g === mine) continue;
      if (!skipped || ago < skipped.ago || (ago === skipped.ago && g < skipped.g)) skipped = { g, ago };
    }
    if (skipped) {
      const w = FOOD_GROUP_WORD[skipped.g];
      return `${DAY_WORD[skipped.ago] ?? '최근'} 드신 ${w}${josa(w, '은', '는')} 빼고, ${trait}`;
    }
  }
  return trait;
}

// ── 식단 짜기 ─────────────────────────────────────────────────────────

/** 오늘 식단. 같은 입력·seed·picks 면 늘 같은 결과 */
export function buildMealPlan(input: MealPlanInput): MealPlan {
  const { candidates, now, todayLogs, recentLogs, seed, picks = {}, emphasis = [], requests = [] } = input;
  const remainingKcal = Number.isFinite(input.remainingKcal) ? Math.round(input.remainingKcal) : 0;
  const { meals: slots } = planSlots(remainingKcal, now, todayLogs);
  const idx = indexRecent(recentLogs, now);
  const pool = candidates.filter((c) => !isRecent(c, idx) && Number.isFinite(c.kcal) && !c.judgement.unknown && c.judgement.verdict !== 'pass');
  const withGroup = pool.map((c) => ({ c, g: candidateGroup(c) }));

  const open = remainingKcal > 0 ? slots.filter((m) => m.status === 'planned') : [];
  /** 끼니별 점수표 (다른 끼니와의 관계 빼고) */
  const scoredBy = new Map<MealType, Scored[]>();
  /** 끼니별로 "꼭 빼 줘" 요청 때문에 뺀 후보 (이유 문구용) */
  const excludedBy = new Map<MealType, Scored[]>();
  for (const slot of open) {
    const list: Scored[] = [];
    const excluded: Scored[] = [];
    for (const { c, g } of withGroup) {
      const s = mainScore(c, g, slot.budgetKcal ?? 0, slot.mealType, idx);
      if (s === null) continue;
      const eff = prefEffect(requests, slot.mealType, subjectOf(c, g), slot.budgetKcal ?? 0);
      if (eff.excluded) {
        excluded.push({ c, s, g, h: 0 });
        continue;
      }
      list.push({ c, s: s + eff.delta, g, h: eff.hits });
    }
    scoredBy.set(slot.mealType, list);
    excludedBy.set(slot.mealType, excluded);
  }

  const doneTaken: Taken[] = slots.filter((m) => m.status === 'done' && m.group).map((m) => ({ group: m.group }));
  const placed = new Map<MealType, Scored>();
  const takenExcept = (mt: MealType): Taken[] => [
    ...doneTaken,
    ...[...placed].filter(([k]) => k !== mt).map(([, x]) => ({ group: x.g, brandId: sellerOf(x.c), storeId: x.c.store.id })),
  ];

  // 1) 사용자가 고른 끼니 먼저 — 아직 이 끼니 후보(다른 끼니와 안 겹치는 것)에 있으면 그대로
  for (const slot of open) {
    const id = picks[slot.mealType];
    if (!id) continue;
    const hitPick = rankSlot(scoredBy.get(slot.mealType)!, takenExcept(slot.mealType)).find((x) => x.c.menu.id === id);
    if (hitPick) placed.set(slot.mealType, hitPick);
  }
  // 2) 나머지 끼니 — 시간 순서로, 상위 후보 안에서 seed 로 돌린다
  open.forEach((slot, i) => {
    if (placed.has(slot.mealType)) return;
    const all = rankSlot(scoredBy.get(slot.mealType)!, takenExcept(slot.mealType));
    if (!all.length) return;
    // 요청(좋아요)에 가장 많이 맞는 후보가 있으면 그중에서만 돌린다
    const bestHits = Math.max(...all.map((x) => x.h));
    const ranked = bestHits > 0 ? all.filter((x) => x.h === bestHits) : all;
    const top = ranked.filter((x) => x.s >= ranked[0].s - PLAN_TOP_MARGIN).slice(0, PLAN_TOP_K);
    placed.set(slot.mealType, top[(((seed + i) % top.length) + top.length) % top.length]);
  });

  // 3) 끼니 채우기 + 넘겨 볼 후보 + 이유
  const meals: PlanMeal[] = [];
  for (const slot of slots) {
    if (slot.status !== 'planned') {
      meals.push(slot);
      continue;
    }
    if (remainingKcal <= 0) continue; // 오늘은 충분 — 짤 칸 없음
    const pick = placed.get(slot.mealType);
    if (!pick) {
      meals.push({ ...slot, status: 'empty' });
      continue;
    }
    const budget = slot.budgetKcal ?? 0;
    const options = optionList(rankSlot(scoredBy.get(slot.mealType)!, takenExcept(slot.mealType)), pick.c);
    const extra = pickExtra(pick.c, pool, budget, slot.mealType, idx, requests);
    meals.push({
      ...slot,
      main: pick.c,
      ...(extra ? { extra } : {}),
      totalKcal: Math.round(pick.c.kcal + (extra?.kcal ?? 0)),
      group: pick.g,
      options,
      optionIndex: Math.max(0, options.findIndex((o) => o.menu.id === pick.c.menu.id)),
    });
  }
  // 이유는 앞 끼니를 알아야 해서 다 놓은 뒤에
  let prev: PlanMeal | undefined;
  /** "매운 건 빼고 골랐어요"는 하루에 한 번만 (여러 끼니에 같은 말을 되풀이하지 않게) */
  const avoidSaid = new Set<string>();
  for (const m of meals) {
    if (m.status === 'planned' && m.main) {
      const trait = traitPhrase(m.main, m.budgetKcal ?? 0, emphasis);
      m.reason = planReason(m, prev, idx, trait);
      if (m.reason !== trait && !m.reason.endsWith(trait)) m.detail = trait;
      const byRequest = requests.length ? requestReason(m, requests, scoredBy.get(m.mealType) ?? [], excludedBy.get(m.mealType) ?? [], avoidSaid) : undefined;
      if (byRequest) {
        m.detail = m.reason;
        m.reason = byRequest;
      }
    }
    if ((m.status === 'planned' && m.main) || m.status === 'done') prev = m;
  }

  const planned = meals.filter((m) => m.status === 'planned');
  const plannedKcal = planned.reduce((s, m) => s + (m.totalKcal ?? 0), 0);
  const status: MealPlan['status'] = remainingKcal <= 0 ? 'full' : planned.length > 0 ? 'ok' : open.length ? 'noCandidates' : 'none';
  const storeCount = new Set(planned.map((m) => m.main?.store.id).filter(Boolean)).size;
  return { status, meals, remainingKcal: Math.max(0, remainingKcal), plannedKcal, storeCount };
}

/** 요청을 반영한 이유 — 이 끼니 후보(적정량에 맞고 빼지 않은 것) 중에 요청에 맞는 게 있었는지 보고 고른다 */
function requestReason(m: PlanMeal, requests: readonly PrefTag[], slotList: readonly Scored[], excluded: readonly Scored[], avoidSaid: Set<string>): string | undefined {
  const budget = m.budgetKcal ?? 0;
  const main = m.main!;
  return prefReason({
    slot: m.mealType,
    label: m.label,
    tags: requests,
    main: subjectOf(main, m.group ?? candidateGroup(main)),
    budgetKcal: budget,
    hadMatch: (tag) =>
      slotList.some((x) => {
        const sub = subjectOf(x.c, x.g);
        return tagApplies(tag, m.mealType, sub) && targetMatches(tag.target, sub, budget);
      }),
    // 이 끼니에 들어갈 수 있었는데 요청 때문에 뺀 게 있을 때만, 같은 요청은 하루 한 번
    hadExcluded: (tag) => {
      const key = prefTagKey(tag);
      if (avoidSaid.has(key)) return false;
      const hit = excluded.some((x) => {
        const sub = subjectOf(x.c, x.g);
        return tagApplies(tag, m.mealType, sub) && targetMatches(tag.target, sub, budget);
      });
      if (hit) avoidSaid.add(key);
      return hit;
    },
  });
}

/**
 * 한 끼만 다른 후보로 넘길 때의 picks — 지금 보이는 끼니를 전부 고정하고 그 끼니만 dir(±1) 칸 옮긴다.
 * 후보 목록이 이미 다른 끼니와 겹치지 않는 것만이라 다른 끼니는 그대로 남는다.
 */
export function cyclePicks(plan: MealPlan, mealType: MealType, dir: 1 | -1): PlanPicks {
  const out: PlanPicks = {};
  for (const m of plan.meals) {
    if (m.status !== 'planned' || !m.main) continue;
    out[m.mealType] = m.main.menu.id;
    if (m.mealType === mealType && m.options && m.options.length > 1) {
      const n = m.options.length;
      out[m.mealType] = m.options[(((m.optionIndex ?? 0) + dir) % n + n) % n].menu.id;
    }
  }
  return out;
}

// ── "이 식단이면 오늘은" 요약 ──────────────────────────────────────────

export type OutlookKey = 'carbs' | 'protein' | 'fat';

export interface OutlookRow {
  key: OutlookKey;
  label: string;
  /** 짠 끼니 합계 (g) — 정보가 있는 메뉴만 더한 값. 전부 정보가 없으면 null */
  planned: number | null;
  /** 이 영양소 정보가 없는 메뉴 수 (있으면 planned 는 '이상'으로 읽는다) */
  missing: number;
  /** 오늘 남은 목표량 (g) */
  remaining: number;
  /** 남은 목표보다 더 되는 양 (g) — 단백질은 많을수록 좋아 늘 0 */
  over: number;
}

export interface PlanOutlook {
  plannedKcal: number;
  remainingKcal: number;
  /** 식단대로 먹고도 남는 kcal (0 하한) */
  leftKcal: number;
  /** 남은 kcal 보다 더 되는 양 */
  overKcal: number;
  rows: OutlookRow[];
  /** 한 줄 ("단백질 62g 채워요 · 180kcal 여유 있어요") */
  line: string;
}

const OUTLOOK_LABEL: Record<OutlookKey, string> = { carbs: '탄수화물', protein: '단백질', fat: '지방' };

/** 짠 끼니(주 메뉴 + 곁들임) 합계를 오늘 남은 목표량과 견준다 */
export function planOutlook(meals: readonly PlanMeal[], remaining: Pick<DailyTargets, 'kcal' | 'carbs' | 'protein' | 'fat'>): PlanOutlook {
  const parts = meals.filter((m) => m.status === 'planned' && m.main).flatMap((m) => [m.main!, ...(m.extra ? [m.extra] : [])]);
  const plannedKcal = Math.round(parts.reduce((s, p) => s + p.kcal, 0));
  const remainingKcal = Math.max(0, Math.round(remaining.kcal));
  const rows: OutlookRow[] = (['carbs', 'protein', 'fat'] as OutlookKey[]).map((key) => {
    const known = parts.filter((p) => typeof p.nutrients[key] === 'number');
    const planned = known.length ? Math.round(known.reduce((s, p) => s + (p.nutrients[key] ?? 0), 0)) : null;
    const missing = parts.length - known.length;
    const rem = Math.max(0, Math.round(remaining[key]));
    const over = planned !== null && key !== 'protein' ? Math.max(0, planned - rem) : 0;
    return { key, label: OUTLOOK_LABEL[key], planned, missing, remaining: rem, over };
  });
  const leftKcal = Math.max(0, remainingKcal - plannedKcal);
  const overKcal = Math.max(0, plannedKcal - remainingKcal);
  const protein = rows[1];
  const bits: string[] = [];
  if (protein.planned !== null && protein.planned > 0) {
    bits.push(
      protein.remaining > 0 && protein.planned >= protein.remaining
        ? '단백질은 오늘 목표를 다 채워요'
        : `단백질 ${formatNumber(protein.planned)}g${protein.missing ? ' 넘게' : ''} 채워요`,
    );
  }
  if (overKcal > 0) bits.push(`남은 양보다 ${formatNumber(overKcal)}kcal 더 돼요`);
  else if (leftKcal > 0) bits.push(`${formatNumber(leftKcal)}kcal 여유 있어요`);
  else bits.push('남은 양에 딱 맞아요');
  return { plannedKcal, remainingKcal, leftKcal, overKcal, rows, line: bits.join(' · ') };
}

// ── 내일 아침 미리 보기 ────────────────────────────────────────────────

/** 내일 아침 8시 (로컬) — 미리 보기 판정·식단 기준 시각 */
export function tomorrowMorning(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0, 0, 0);
}

export interface TomorrowInput {
  /** 내일 아침 기준(하루 목표 전부·남은 끼니 3)으로 판정한 후보 */
  candidates: PlanCandidate[];
  /** 하루 목표 kcal */
  targetKcal: number;
  now: Date;
  /** 오늘까지의 최근 기록 (날짜는 오늘 기준 그대로) */
  recentLogs: readonly RecentEaten[];
  /** 오늘 식단에서 아직 안 먹은 끼니 — 내일 아침이 오늘 저녁과 같은 메뉴·갈래가 되지 않게 "오늘 먹을 것"으로 친다 */
  todayPlan?: readonly PlanMeal[];
  /** 밀리에게 한 요청 */
  requests?: readonly PrefTag[];
}

/** 내일 식단 미리 보기 — 하루 목표를 세 끼로 나눈 몫, 오늘 먹은(먹을) 것과 겹치지 않게. 짠 끼니만 (아침부터) */
export function tomorrowMeals(input: TomorrowInput): PlanMeal[] {
  const morning = tomorrowMorning(input.now);
  const today = `${input.now.getFullYear()}-${String(input.now.getMonth() + 1).padStart(2, '0')}-${String(input.now.getDate()).padStart(2, '0')}`;
  const planned: RecentEaten[] = (input.todayPlan ?? [])
    .filter((m) => m.status === 'planned' && m.main)
    .map((m) => ({ date: today, name: m.main!.menu.name, menuId: m.main!.menu.id, brandId: m.main!.menu.brandId, storeName: m.main!.store.name }));
  const plan = buildMealPlan({
    candidates: input.candidates,
    remainingKcal: input.targetKcal,
    now: morning,
    todayLogs: [],
    recentLogs: [...input.recentLogs, ...planned],
    seed: daySeed(morning),
    requests: input.requests,
  });
  return plan.meals.filter((m) => m.status === 'planned' && m.main);
}

/** 내일 아침 한 끼 (tomorrowMeals 의 첫 끼). 못 고르면 undefined */
export function tomorrowBreakfast(input: TomorrowInput): PlanMeal | undefined {
  const first = tomorrowMeals(input)[0];
  return first?.mealType === 'breakfast' ? first : undefined;
}

/** 오늘 짤 끼니 수 → 내일 미리 보기 끼니 수 */
export function tomorrowPreviewCount(plan: MealPlan): number {
  if (plan.status === 'full' || plan.status === 'none') return 3;
  if (plan.status !== 'ok') return 0;
  const planned = plan.meals.filter((m) => m.status === 'planned').length;
  return planned >= 3 ? 0 : planned === 2 ? 1 : 3;
}
