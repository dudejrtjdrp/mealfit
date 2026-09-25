/**
 * 밀리 탭 "오늘은 이렇게 어때요?" — 오늘 남은 끼니 식단을 주변 매장 메뉴로 대략 짜 준다.
 * 전부 규칙·템플릿 (AI 없음). React·데이터 로더 의존 없음 — 후보(판정 끝난 주변 메뉴)는 호출한 쪽이 넘긴다.
 *
 * 규칙
 * - 끼니: 아침·점심·저녁 고정(mealBudget 과 같은 경계 10:30·15:00·21:00). 오늘 기록한 끼니(200kcal 이상)는 "기록했어요",
 *   지나간 빈 끼니는 "지나갔어요", 남은 끼니만 짠다. 주 끼니가 남지 않았고 남은 양이 있으면 간식 하나.
 * - 끼니별 적정량: 오늘 남은 kcal ÷ 남은 주 끼니 수 (간식은 mealBudget 의 간식 상한)
 * - 다양성: 최근 기록(오늘·어제·그저께)의 같은 메뉴(menuId·정규화 이름)는 뺀다. 최근 먹은 브랜드·음식 종류(샌드위치·김밥…)는
 *   뒤로 미룬다. 같은 날 끼니끼리는 매장(브랜드)을 겹치지 않는다.
 * - 결정적: 같은 입력·seed → 같은 식단. "다른 조합 보기"는 seed+1 — 끼니마다 상위 후보 안에서 한 칸씩 돌린다.
 */
import { mealBudget, mealsLeftAt, mealTypeAt, eatenMealsFromLogs, MAIN_MEALS } from './mealBudget';
import { MEAL_LABEL, type Judgement, type MealLog, type MealType, type MenuItem, type Nutrients, type Store } from './types';

/** 식단 후보 — state/recommend 의 RecommendCandidate 와 같은 모양 */
export interface PlanCandidate {
  menu: MenuItem;
  judgement: Judgement;
  store: Store;
  /** 기본 옵션 기준 kcal */
  kcal: number;
  nutrients: Nutrients;
}

/** 최근에 먹은 것 — 기록(MealLog)에서 필요한 것만. category 는 호출한 쪽이 메뉴 데이터로 채울 수 있다 */
export type RecentEaten = Pick<MealLog, 'name' | 'date'> & Partial<Pick<MealLog, 'menuId' | 'brandId' | 'storeName'>>;

export interface MealPlanInput {
  candidates: PlanCandidate[];
  /** 오늘 남은 kcal (목표 - 먹은 양). 0 이하면 오늘은 충분 */
  remainingKcal: number;
  now: Date;
  /** 오늘 기록 */
  todayLogs: readonly Pick<MealLog, 'mealType' | 'nutrients' | 'name'>[];
  /** 최근 기록 (오늘·어제·그저께 — 이보다 오래된 건 무시) */
  recentLogs: readonly RecentEaten[];
  /** 날짜 seed + 다시 짜기 횟수 */
  seed: number;
  /** 목적별 강조 영양소 (DailyTargets.emphasis) — 이유 문구 고를 때만 */
  emphasis?: readonly string[];
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
  reason?: string;
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
/** 주 메뉴 뒤 남은 적정량이 이 이상이고, 주 메뉴가 적정량의 이 비율 미만일 때만 같은 매장 음료·사이드를 곁들인다 */
export const EXTRA_MIN_ROOM = 80;
export const EXTRA_MAIN_MAX_RATIO = 0.75;
/** 간식 슬롯은 남은 양이 이 이상일 때만 */
export const SNACK_PLAN_MIN_KCAL = 150;
/** 최근 N일(오늘 포함 3일 = 오늘·어제·그저께) */
export const RECENT_DAYS = 3;

const TIME_HINT: Record<MealType, string> = {
  breakfast: '오전 10시 반까지',
  lunch: '오후 3시까지',
  dinner: '밤 9시까지',
  snack: '출출할 때',
};

/** 음식 종류 — 이름 키워드로 가른다 (같은 종류를 이틀 연속 권하지 않으려고). 앞에 있는 것이 우선 */
const FOOD_KINDS: { kind: string; words: string[] }[] = [
  { kind: '삼각김밥', words: ['삼각김밥', '주먹밥'] },
  { kind: '김밥', words: ['김밥'] },
  { kind: '샌드위치', words: ['샌드위치', '샌드', '토스트', '파니니', '베이글', '서브웨이'] },
  { kind: '버거', words: ['버거', '맥도날드', '롯데리아', '맘스터치'] },
  { kind: '샐러드', words: ['샐러드', '포케', '볼'] },
  { kind: '도시락', words: ['도시락'] },
  { kind: '덮밥', words: ['덮밥', '비빔밥', '볶음밥', '컵밥', '라이스'] },
  { kind: '면', words: ['라면', '우동', '국수', '파스타', '면', '쌀국수', '짬뽕', '짜장'] },
  { kind: '랩', words: ['랩', '브리또', '부리또', '타코'] },
  { kind: '피자', words: ['피자'] },
  { kind: '치킨', words: ['치킨', '닭강정'] },
  { kind: '떡볶이', words: ['떡볶이'] },
  { kind: '죽', words: ['죽'] },
  { kind: '요거트', words: ['요거트', '요구르트', '그릭'] },
  { kind: '빵', words: ['빵', '크루아상', '머핀', '스콘', '케이크'] },
];

// ── 작은 도우미 ───────────────────────────────────────────────────────

/** 대소문자·공백·기호 무시 (data/normalizeName 과 같은 규칙) */
export function normalizeMenuName(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

/** 이름 → 음식 종류 (모르면 undefined). 메뉴 이름으로 모르면 매장 이름으로 한 번 더 본다 (서브웨이 "에그마요" → 샌드위치) */
export function foodKind(name: string, storeName?: string): string | undefined {
  for (const text of storeName ? [name, storeName] : [name]) {
    const n = normalizeMenuName(text);
    for (const k of FOOD_KINDS) if (k.words.some((w) => n.includes(w))) return k.kind;
  }
  return undefined;
}

const candKind = (c: PlanCandidate) => foodKind(c.menu.name, c.store.name);

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

/** 받침 있으면 a, 없으면 b ("샌드위치는" / "김밥은") */
function josa(word: string, withFinal: string, without: string): string {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return without;
  return (c - 0xac00) % 28 ? withFinal : without;
}

/** 카페인 음료 (수치가 있거나 이름이 커피류) — 저녁·간식 곁들임에서 뺀다 */
const COFFEE_WORDS = /커피|아메리카노|에스프레소|콜드브루|코르타도|카푸치노|마키아또|샷|녹차|말차|홍차|에너지/;
const hasCaffeine = (c: PlanCandidate) => (c.nutrients.caffeine ?? 0) > 0 || COFFEE_WORDS.test(c.menu.name);

const isDrinkish = (c: PlanCandidate) => c.menu.category === 'drink' || c.menu.category === 'side';

// ── 끼니 칸 ───────────────────────────────────────────────────────────

export interface PlanSlots {
  /** 아침·점심·저녁 (+ 간식) 순서의 칸 — 아직 메뉴는 없음 */
  meals: PlanMeal[];
  /** 짜야 하는 주 끼니 수 (판정 컨텍스트 mealSlotsLeft 로 쓴다) */
  upcoming: number;
}

/** 오늘 끼니 칸 나누기 — 기록한 끼니 · 지나간 끼니 · 짤 끼니 + 끼니별 적정량 */
export function planSlots(remainingKcal: number, now: Date, todayLogs: MealPlanInput['todayLogs']): PlanSlots {
  const rem = Number.isFinite(remainingKcal) ? Math.max(0, remainingKcal) : 0;
  const eaten = eatenMealsFromLogs(todayLogs);
  const left = mealsLeftAt(now);
  const upcomingTypes = left.filter((m) => !eaten.includes(m));
  const perMeal = upcomingTypes.length ? Math.round(rem / upcomingTypes.length) : 0;

  const meals: PlanMeal[] = MAIN_MEALS.map((mealType) => {
    const base = { mealType, label: MEAL_LABEL[mealType], timeHint: TIME_HINT[mealType] };
    if (eaten.includes(mealType)) {
      const mine = todayLogs.filter((l) => l.mealType === mealType);
      return {
        ...base,
        status: 'done' as const,
        loggedKcal: Math.round(mine.reduce((s, l) => s + (Number.isFinite(l.nutrients?.kcal) ? l.nutrients.kcal : 0), 0)),
        loggedNames: mine.map((l) => l.name),
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
  /** 음식 종류 → 가장 최근 며칠 전 */
  kinds: Map<string, number>;
}

function indexRecent(recent: readonly RecentEaten[], now: Date): RecentIndex {
  const idx: RecentIndex = { ids: new Set(), names: new Set(), brands: new Map(), kinds: new Map() };
  for (const r of recent) {
    const ago = daysAgo(r.date, now);
    if (ago < 0 || ago >= RECENT_DAYS) continue;
    if (r.menuId) idx.ids.add(r.menuId);
    idx.names.add(normalizeMenuName(r.name));
    if (r.brandId) idx.brands.set(r.brandId, Math.min(ago, idx.brands.get(r.brandId) ?? 99));
    const k = foodKind(r.name, r.storeName);
    if (k) idx.kinds.set(k, Math.min(ago, idx.kinds.get(k) ?? 99));
  }
  return idx;
}

function isRecent(c: PlanCandidate, idx: RecentIndex): boolean {
  return idx.ids.has(c.menu.id) || idx.names.has(normalizeMenuName(c.menu.name));
}

/** 주 메뉴 점수 (클수록 앞). 적정량 밖이면 null */
function mainScore(c: PlanCandidate, budget: number, mealType: MealType, idx: RecentIndex, planKinds: Set<string>): number | null {
  if (budget <= 0 || c.kcal > budget * PLAN_OVER_RATIO) return null;
  if (isDrinkish(c)) return null;
  // 아침·간식은 가벼운 것도 괜찮다 — 최소 비율을 낮춘다
  const minRatio = mealType === 'snack' ? 0.15 : mealType === 'breakfast' ? PLAN_MIN_RATIO * 0.7 : PLAN_MIN_RATIO;
  if (c.kcal < budget * minRatio) return null;
  const ratio = c.kcal / budget;
  let s = 100 - Math.abs(ratio - PLAN_SWEET_RATIO) * 60; // 적정량 80% 근처가 가장 좋다
  s += c.judgement.verdict === 'good' ? 20 : 0;
  s += Math.max(0, Math.min(100, c.judgement.score)) * 0.3; // 목적·식단 성향이 반영된 판정 점수
  // 끼니다운 메뉴 우선: 점심·저녁엔 식사·샐러드, 아침엔 빵·간식도 무난
  if (c.menu.category === 'meal' || c.menu.category === 'salad') s += 10;
  else if (c.menu.category === 'snack' && mealType !== 'breakfast' && mealType !== 'snack') s -= 15;
  const brandAgo = idx.brands.get(c.menu.brandId);
  if (brandAgo !== undefined) s -= brandAgo <= 1 ? 20 : 10;
  const kind = candKind(c);
  if (kind) {
    const kindAgo = idx.kinds.get(kind);
    if (kindAgo !== undefined) s -= kindAgo <= 1 ? 25 : 12;
    if (planKinds.has(kind)) s -= 20;
  }
  return s;
}

/**
 * 같은 매장에서 곁들일 사이드·음료 — 남은 적정량 안, 최근에 안 먹은 것.
 * 사이드 → 단백질 있는 음료(우유·두유류) → 그 밖의 음료 순. 저녁·간식엔 카페인 음료는 권하지 않는다.
 */
function pickExtra(main: PlanCandidate, pool: PlanCandidate[], budget: number, mealType: MealType, idx: RecentIndex): PlanCandidate | undefined {
  const room = budget - main.kcal;
  if (room < EXTRA_MIN_ROOM || main.kcal >= budget * EXTRA_MAIN_MAX_RATIO) return undefined;
  const late = mealType === 'dinner' || mealType === 'snack';
  const tier = (c: PlanCandidate) => (c.menu.category === 'side' ? 0 : (c.nutrients.protein ?? 0) >= 5 ? 1 : 2);
  const opts = pool
    .filter(
      (c) =>
        c.menu.brandId === main.menu.brandId &&
        c.menu.id !== main.menu.id &&
        isDrinkish(c) &&
        c.kcal >= 30 &&
        c.kcal <= room &&
        !(late && hasCaffeine(c)) &&
        !isRecent(c, idx),
    )
    .sort((a, b) => tier(a) - tier(b) || (b.judgement.verdict === 'good' ? 1 : 0) - (a.judgement.verdict === 'good' ? 1 : 0) || b.judgement.score - a.judgement.score || a.kcal - b.kcal || a.menu.id.localeCompare(b.menu.id));
  return opts[0];
}

// ── 이유 문구 (템플릿) ────────────────────────────────────────────────

function traitPhrase(c: PlanCandidate, budget: number, emphasis: readonly string[]): string {
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

/** "어제 드신 샌드위치는 빼고, 단백질이 든든한 메뉴로 골랐어요" */
export function planReason(c: PlanCandidate, budget: number, idx: RecentIndex, emphasis: readonly string[] = []): string {
  const trait = traitPhrase(c, budget, emphasis);
  const myKind = candKind(c);
  // 최근 먹은 종류 중 이번 메뉴와 다른 것 — 가장 최근 것
  let skipped: { kind: string; ago: number } | undefined;
  for (const [kind, ago] of idx.kinds) {
    if (kind === myKind) continue;
    if (!skipped || ago < skipped.ago || (ago === skipped.ago && kind < skipped.kind)) skipped = { kind, ago };
  }
  if (skipped) return `${DAY_WORD[skipped.ago] ?? '최근'} 드신 ${skipped.kind}${josa(skipped.kind, '은', '는')} 빼고, ${trait}`;
  return trait;
}

// ── 식단 짜기 ─────────────────────────────────────────────────────────

/** 오늘 식단. 같은 입력·seed 면 늘 같은 결과 */
export function buildMealPlan(input: MealPlanInput): MealPlan {
  const { candidates, now, todayLogs, recentLogs, seed, emphasis = [] } = input;
  const remainingKcal = Number.isFinite(input.remainingKcal) ? Math.round(input.remainingKcal) : 0;
  const { meals: slots } = planSlots(remainingKcal, now, todayLogs);
  const idx = indexRecent(recentLogs, now);
  const pool = candidates.filter((c) => !isRecent(c, idx) && Number.isFinite(c.kcal) && !c.judgement.unknown && c.judgement.verdict !== 'pass');

  const usedBrands = new Set<string>();
  const usedStores = new Set<string>();
  const planKinds = new Set<string>();
  const meals: PlanMeal[] = [];
  let plannedIdx = 0;

  for (const slot of slots) {
    if (slot.status !== 'planned') {
      meals.push(slot);
      continue;
    }
    if (remainingKcal <= 0) continue; // 오늘은 충분 — 짤 칸 없음
    const budget = slot.budgetKcal ?? 0;
    const scored = pool
      .filter((c) => !usedBrands.has(c.menu.brandId) && !usedStores.has(c.store.id))
      .map((c) => ({ c, s: mainScore(c, budget, slot.mealType, idx, planKinds) }))
      .filter((x): x is { c: PlanCandidate; s: number } => x.s !== null)
      .sort((a, b) => b.s - a.s || a.c.store.distanceM - b.c.store.distanceM || a.c.menu.id.localeCompare(b.c.menu.id));
    if (!scored.length) {
      meals.push({ ...slot, status: 'empty' });
      plannedIdx += 1;
      continue;
    }
    // 상위 후보(최고 점수와 PLAN_TOP_MARGIN 안, 최대 PLAN_TOP_K개) 안에서 seed 로 돌린다
    const top = scored.filter((x) => x.s >= scored[0].s - PLAN_TOP_MARGIN).slice(0, PLAN_TOP_K);
    const pick = top[(((seed + plannedIdx) % top.length) + top.length) % top.length].c;
    plannedIdx += 1;

    const extra = pickExtra(pick, pool, budget, slot.mealType, idx);
    usedBrands.add(pick.menu.brandId);
    usedStores.add(pick.store.id);
    const kind = candKind(pick);
    if (kind) planKinds.add(kind);
    meals.push({
      ...slot,
      main: pick,
      ...(extra ? { extra } : {}),
      totalKcal: Math.round(pick.kcal + (extra?.kcal ?? 0)),
      reason: planReason(pick, budget, idx, emphasis),
    });
  }

  const planned = meals.filter((m) => m.status === 'planned');
  const plannedKcal = planned.reduce((s, m) => s + (m.totalKcal ?? 0), 0);
  const hasOpen = slots.some((m) => m.status === 'planned');
  const status: MealPlan['status'] =
    remainingKcal <= 0 ? 'full' : planned.length > 0 ? 'ok' : hasOpen ? 'noCandidates' : 'none';
  return { status, meals, remainingKcal: Math.max(0, remainingKcal), plannedKcal, storeCount: usedStores.size };
}
