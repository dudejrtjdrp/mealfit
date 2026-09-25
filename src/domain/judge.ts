import { mealBudget, type MealBudget } from './mealBudget';
import { isMealCandidate } from './nonMeal';
import { emphasisFor } from './targets';
import type { DailyTargets, Judgement, MealType, MenuItem, Nutrients, Profile, Verdict } from './types';
import { VERDICT_LABEL } from './types';

export { mealBudget, mealTypeAt, type MealBudget, type MealBudgetOptions } from './mealBudget';
export { isMealCandidate, nonMealKind, type NonMealKind } from './nonMeal';

export interface RankOptions {
  /**
   * 조리용 식재료·대용량 포장(nonMealKind)도 순위에 넣는다. 기본 false —
   * 매장 순위·홈 추천·주변 카드·대안 추천은 "지금 한 끼로 먹을 메뉴"만 본다(검색·기록은 rankMenus 를 쓰지 않아 그대로 찾아진다).
   * true 면 판정된 메뉴 뒤, 정보 없음 앞에 둔다.
   */
  includeNonMeal?: boolean;
}

export interface JudgeContext {
  profile: Pick<Profile, 'primaryGoal' | 'secondaryGoals' | 'diet'>;
  /** groupId → 선택한 choice.label */
  selectedOptions?: Record<string, string>;
  /** 판정 기준 시각 — 이번 끼니(남은 끼니 수)를 정한다. 없으면 지금 */
  now?: Date;
  /** 남은 주 끼니 수를 직접 지정 (1 이상). 주면 now·eatenMeals 보다 우선 */
  mealSlotsLeft?: number;
  /** 오늘 이미 기록한 끼니 — 지금 끼니를 이미 먹었으면 다음 끼니 기준으로 본다 */
  eatenMeals?: MealType[];
}

/** 판정에 쓰는 이번 끼니 적정량 (JudgeContext 의 now·mealSlotsLeft·eatenMeals 반영) */
export function judgeBudget(remaining: DailyTargets, ctx: Pick<JudgeContext, 'now' | 'mealSlotsLeft' | 'eatenMeals'>): MealBudget {
  return mealBudget(remaining.kcal, ctx.now ?? new Date(), { slotsLeft: ctx.mealSlotsLeft, eatenMeals: ctx.eatenMeals });
}

const NUTRIENT_KEYS = ['kcal', 'carbs', 'protein', 'fat', 'satFat', 'sugar', 'sodium', 'caffeine'] as const;
type FactorKey = 'kcal' | 'carbs' | 'protein' | 'fat' | 'sugar' | 'sodium';

const VERDICT_RANK: Record<Verdict, number> = { pass: 0, ok: 1, good: 2 };

export const UNKNOWN_REASONS = ['아직 추가되지 않은 정보입니다', '영양표시 의무가 없는 메뉴예요'];

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * 옵션 선택을 반영한 최종 영양. 영양 정보가 없는 메뉴(nutrients null)는 null.
 * 기본값이 없는 영양소(undefined)에는 차이를 더하지 않는다 — 없는 숫자를 만들지 않기 위해.
 */
export function applyOptions(menu: MenuItem, selected?: Record<string, string>): Nutrients | null {
  if (!menu.nutrients) return null;
  const out: Nutrients = { ...menu.nutrients };
  for (const group of menu.options ?? []) {
    const wanted = selected?.[group.id];
    const choice =
      (wanted !== undefined ? group.choices.find((c) => c.label === wanted) : undefined) ??
      group.choices.find((c) => c.isDefault);
    if (!choice) continue;
    for (const k of NUTRIENT_KEYS) {
      const d = choice.delta[k];
      if (typeof d !== 'number') continue;
      const base = out[k];
      if (k !== 'kcal' && base === undefined) continue;
      out[k] = base === undefined ? d : base + d;
    }
  }
  for (const k of NUTRIENT_KEYS) {
    const v = out[k];
    if (typeof v === 'number') out[k] = Math.max(0, round1(v));
  }
  return out;
}

interface Factor {
  key: FactorKey;
  points: number;
}

interface Scored {
  unknown: boolean;
  score: number;
  verdict: Verdict;
  factors: Factor[];
  overKcal: boolean;
  /** 음료 칼로리 상한(69) 적용 여부 */
  drinkCapped: boolean;
  nutrients: Nutrients | null;
}

/** 구간 선형 보간: x 가 [x0,x1] 일 때 y0→y1 */
function lerp(x: number, x0: number, x1: number, y0: number, y1: number): number {
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

/**
 * 칼로리 점수 0~100. r = 메뉴 kcal ÷ 이번 끼니 적정량 (mealBudget)
 * r ≤ 0.5 → 100, 0.5~0.8 → 100→70, 0.8~1.1 → 70→30, 1.1~1.5 → 30→0, 1.5 초과 → 0.
 * 강조 영양소(보통 80~100점)와 섞으면 대략 적정량 80% 이하 좋음 · ~110% 괜찮음 · 그 위 패스 쪽이 된다.
 */
export function kcalScore(r: number): number {
  if (r <= 0.5) return 100;
  if (r <= 0.8) return lerp(r, 0.5, 0.8, 100, 70);
  if (r <= 1.1) return lerp(r, 0.8, 1.1, 70, 30);
  if (r <= 1.5) return lerp(r, 1.1, 1.5, 30, 0);
  return 0;
}

/**
 * 영양소 점수 0~100. share = 메뉴 값 ÷ (하루 남은 값 ÷ 남은 끼니 수) — 이번 끼니 몫 대비.
 * 단백질은 많을수록 높다(몫의 75% 이상 100). 나머지는 몫의 75% 이하 100 → 200% 에서 0.
 * (세 끼 남았을 때 예전 하루 기준 곡선 0.25/0.8 과 거의 같다)
 */
export function nutrientShareScore(key: FactorKey, share: number): number {
  if (key === 'protein') return share >= 0.75 ? 100 : lerp(Math.max(0, share), 0, 0.75, 40, 100);
  if (share <= 0.75) return 100;
  if (share <= 2) return lerp(share, 0.75, 2, 100, 0);
  return 0;
}

/** 이유 문구 선택용 기준선 — 요인 점수에서 빼서 +/− 기여로 본다 */
const NEUTRAL = 70;
export const DRINK_KCAL_CAP_FROM = 80;
export const DRINK_SCORE_CAP = 69;
export const PROTEIN_DRINK_G = 12;
export const TINY_KCAL = 30;
export const TINY_SCORE_CAP = 85;
export const KCAL_WEIGHT = 0.7;
export const NUTRIENT_WEIGHT = 0.3;

function score(
  menu: MenuItem,
  remaining: DailyTargets,
  ctx: JudgeContext,
  selected: Record<string, string> | undefined,
  budget: MealBudget,
): Scored {
  const n = applyOptions(menu, selected);
  if (menu.trust === 'none' || !n || typeof n.kcal !== 'number' || !Number.isFinite(n.kcal)) {
    return { unknown: true, score: -1, verdict: 'pass', factors: [], overKcal: false, drinkCapped: false, nutrients: null };
  }

  const factors: Factor[] = [];

  // ① 이번 끼니 적정량 대비 칼로리 (가중치 0.7)
  const r = n.kcal / Math.max(budget.kcal, 1);
  const kScore = kcalScore(r);
  factors.push({ key: 'kcal', points: kScore - NEUTRAL });

  // ② 강조 영양소 평균 (가중치 0.3) — 값이 없는 영양소는 평균에서 제외
  const emphasis = emphasisFor(ctx.profile.primaryGoal, ctx.profile.secondaryGoals ?? []);
  const nutrientScores: number[] = [];
  for (const key of emphasis) {
    if (key === 'kcal') continue;
    const v = n[key];
    if (typeof v !== 'number') continue;
    const share = remaining[key] > 0 ? v / Math.max(remaining[key] / budget.slotsLeft, 1) : v > 0 ? Infinity : 0;
    const sc = nutrientShareScore(key, share);
    nutrientScores.push(sc);
    factors.push({ key, points: sc - NEUTRAL });
  }
  // 강조 영양소 값이 하나도 없으면 칼로리 점수만으로 본다
  const nScore = nutrientScores.length ? nutrientScores.reduce((a, b) => a + b, 0) / nutrientScores.length : kScore;
  let total = KCAL_WEIGHT * kScore + NUTRIENT_WEIGHT * nScore;

  // ③ 식단 유형 보정 (총점에 가감)
  const adjust = (key: FactorKey, points: number) => {
    total += points;
    factors.push({ key, points });
  };
  switch (ctx.profile.diet?.type) {
    case 'low_sugar':
      if ((n.sugar ?? 0) >= 15) adjust('sugar', -15);
      break;
    case 'low_carb_high_protein':
      if ((n.carbs ?? 0) >= 40) adjust('carbs', -10);
      break;
    case 'low_sodium':
      if ((n.sodium ?? 0) >= 800) adjust('sodium', -15);
      break;
    case 'high_protein_bulk':
      if ((n.protein ?? 0) >= 20) adjust('protein', 10);
      break;
    default:
      break;
  }

  // ④ 목적 보정 (값이 있을 때만)
  const goals = [ctx.profile.primaryGoal, ...(ctx.profile.secondaryGoals ?? [])];
  if (goals.includes('blood_sugar') && typeof n.sugar === 'number' && n.sugar >= 20) adjust('sugar', -15);
  if (goals.includes('cholesterol') && typeof n.satFat === 'number' && n.satFat >= 5) adjust('fat', -10);

  total = Math.round(Math.max(0, Math.min(100, total)));
  // ⑤ 상한
  // 음료 80 kcal 이상은 최대 '괜찮음'(69). 단백질 10 g 이상 음료는 예외
  let drinkCapped = false;
  if (menu.category === 'drink' && n.kcal >= DRINK_KCAL_CAP_FROM && (n.protein ?? 0) < PROTEIN_DRINK_G && total > DRINK_SCORE_CAP) {
    total = DRINK_SCORE_CAP;
    drinkCapped = true;
  }
  // 30 kcal 미만(제로 음료·아메리카노)은 실제 식사보다 위에 서지 않게 85 상한
  if (n.kcal < TINY_KCAL) total = Math.min(total, TINY_SCORE_CAP);

  const overKcal = n.kcal > remaining.kcal;
  let verdict: Verdict = total >= 70 ? 'good' : total >= 45 ? 'ok' : 'pass';
  if (overKcal) {
    verdict = 'pass';
    total = Math.min(total, 44); // 순위에서도 ok 구간 아래로
  }
  return { unknown: false, score: total, verdict, factors, overKcal, drinkCapped, nutrients: n };
}

/** 요인별로 합친 점수 */
function byKey(factors: Factor[]): Map<FactorKey, number> {
  const m = new Map<FactorKey, number>();
  for (const f of factors) m.set(f.key, (m.get(f.key) ?? 0) + f.points);
  return m;
}

const GOOD_TITLE: Record<FactorKey, string> = {
  kcal: '이번 끼니로 가볍게 들어가요',
  protein: '단백질을 든든하게 챙길 수 있어요',
  sugar: '당이 적어 가볍게 즐기기 좋아요',
  sodium: '나트륨이 적어 담백하게 드실 수 있어요',
  carbs: '탄수화물 부담이 적어 가볍게 들어가요',
  fat: '지방 부담이 적어 산뜻하게 드실 수 있어요',
};

const GOOD_SECOND: Record<FactorKey, string> = {
  kcal: '양도 부담 없이 들어가요',
  protein: '지금 드시기 좋은 메뉴예요',
  sugar: '당 부담도 적어요',
  sodium: '나트륨 부담도 적어요',
  carbs: '탄수화물 부담도 적어요',
  fat: '지방 부담도 적어요',
};

const OK_TITLE: Record<FactorKey, string> = {
  kcal: '오늘 남은 양 안에서 무난해요',
  protein: '오늘 남은 양 안에서 무난해요',
  sugar: '당이 조금 있지만 오늘 남은 양 안에서 무난해요',
  sodium: '나트륨이 조금 있지만 오늘 남은 양 안에서 무난해요',
  carbs: '탄수화물이 조금 있지만 오늘 남은 양 안에서 무난해요',
  fat: '지방이 조금 있지만 오늘 남은 양 안에서 무난해요',
};

const PASS_TITLE: Record<FactorKey, string> = {
  kcal: '지금 한 번에 드시기엔 조금 커요',
  protein: '지금 한 번에 드시기엔 조금 커요',
  sugar: '당이 한 끼로는 많은 편이에요',
  sodium: '나트륨이 한 끼로는 많은 편이에요',
  carbs: '탄수화물이 한 끼로는 많은 편이에요',
  fat: '지방이 한 끼로는 많은 편이에요',
};

export const MILK_DRINK_REASON = '우유가 들어가지만 오늘 남은 양 안에서 무난해요';
export const SWEET_DRINK_REASON = '달콤한 음료는 한 잔 가볍게 즐겨요';

function hasMilk(menu: MenuItem): boolean {
  return (
    menu.category === 'drink' &&
    (/라떼|우유|밀크|마키아또|모카|카푸치노|프라푸치노/.test(menu.name) || (menu.options ?? []).some((g) => g.id === 'milk'))
  );
}

/** 이 퍼센트를 넘으면 "이번 끼니엔 조금 커요" */
export const BUDGET_BIG_PCT = 110;

/**
 * 근거 숫자 한 줄 — "점심 적정량의 60%예요" · 마지막 끼니면 "오늘 남은 양의 60%예요".
 * 적정량을 넘으면 "…의 150%라 이번 끼니엔 조금 커요". 남은 양이 없으면 undefined.
 * 간식·야식 슬롯은 퍼센트 대신 말로: "야식으로 알맞아요" · "야식으로는 조금 커요".
 */
export function budgetReason(kcal: number, budget: MealBudget, remainingKcal: number): string | undefined {
  if (!(remainingKcal > 0) || !(budget.kcal > 0) || !Number.isFinite(kcal)) return undefined;
  const pctOf = (base: number) => Math.round((kcal / base) * 100);
  if (kcal > remainingKcal) return `오늘 남은 양의 ${pctOf(remainingKcal)}%라 조금 커요`;
  if (budget.isSnack) {
    // 야식·간식 모두 받침(ㄱ)이 있어 '으로'
    return pctOf(budget.kcal) > BUDGET_BIG_PCT ? `${budget.label}으로는 조금 커요` : `${budget.label}으로 알맞아요`;
  }
  const who = budget.isLast ? '오늘 남은 양' : `${budget.label} 적정량`;
  const pct = pctOf(budget.isLast ? remainingKcal : budget.kcal);
  if (pct < 1) return `${who}의 1%도 안 돼요`;
  if (pct > BUDGET_BIG_PCT) return `${who}의 ${pct}%라 이번 끼니엔 조금 커요`;
  return `${who}의 ${pct}%예요`;
}

/** 규칙 문구 2줄 + 첫 줄이 칼로리 이야기인지 (근거 숫자 줄로 대신할 수 있는지) */
function buildReasons(menu: MenuItem, s: Scored, remaining: DailyTargets): { lines: string[]; kcalTitle: boolean } {
  const sums = [...byKey(s.factors).entries()];
  const most = (pick: (a: number, b: number) => boolean) =>
    sums.reduce<[FactorKey, number] | undefined>((best, cur) => (!best || pick(cur[1], best[1]) ? cur : best), undefined);

  const protein = s.nutrients?.protein ?? 0;

  if (s.verdict === 'good') {
    // 단백질 문구는 10 g 이상일 때만
    const positives = sums
      .filter(([k, v]) => v > 0 && (k !== 'protein' || protein >= PROTEIN_DRINK_G))
      .sort((a, b) => b[1] - a[1]);
    const key = positives[0]?.[0] ?? 'kcal';
    let second = '지금 드시기 좋은 메뉴예요';
    if (key !== 'protein' && protein >= PROTEIN_DRINK_G) second = '단백질도 챙길 수 있어요';
    else {
      const next = positives.find(([k]) => k !== key && k !== 'protein');
      if (next) second = GOOD_SECOND[next[0]];
    }
    return { lines: [GOOD_TITLE[key], second], kcalTitle: key === 'kcal' };
  }

  if (s.verdict === 'ok') {
    if (s.drinkCapped) {
      return { lines: [hasMilk(menu) ? MILK_DRINK_REASON : SWEET_DRINK_REASON, '평소처럼 드셔도 좋아요'], kcalTitle: false };
    }
    const low = most((a, b) => a < b);
    if (low && low[1] < 0 && low[0] !== 'kcal' && low[0] !== 'protein') {
      return { lines: [OK_TITLE[low[0]], '평소처럼 드셔도 좋아요'], kcalTitle: false };
    }
    if (hasMilk(menu)) return { lines: [MILK_DRINK_REASON, '평소처럼 드셔도 좋아요'], kcalTitle: false };
    return { lines: [OK_TITLE.kcal, '평소처럼 드셔도 좋아요'], kcalTitle: true };
  }

  // pass
  if (remaining.kcal <= 0) return { lines: ['오늘은 여기까지 채웠어요', '내일 다시 채워져요'], kcalTitle: false };
  if (s.overKcal) return { lines: ['오늘 남은 양보다 조금 커요', '다른 메뉴가 더 잘 맞아요'], kcalTitle: true };
  const low = sums
    .filter(([k]) => k !== 'protein')
    .reduce<[FactorKey, number] | undefined>((best, cur) => (!best || cur[1] < best[1] ? cur : best), undefined);
  const key = low && low[1] < 0 ? low[0] : 'kcal';
  return { lines: [PASS_TITLE[key], '다른 메뉴가 더 잘 맞아요'], kcalTitle: key === 'kcal' };
}

/** 한글 마지막 글자에 받침이 있는지 (ㄹ 받침은 '로'를 쓰므로 false) */
function needsEuro(word: string): boolean {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  const jong = (code - 0xac00) % 28;
  return jong !== 0 && jong !== 8;
}

/** 옵션 라벨 → 가이드 앞부분. "시럽 빼기" → "시럽 빼면", "Tall" → "Tall로 하면" */
export function optionPhrase(label: string): string {
  const clean = label.replace(/\s*\(.*?\)\s*/g, '').trim();
  if (clean === '면 반만') return '면을 반만 드시면';
  if (clean.endsWith('빼기')) return `${clean.slice(0, -2)}빼면`;
  if (clean.endsWith('적게')) return `${clean} 하면`;
  if (clean.endsWith('추가')) return `${clean.slice(0, -2).trim()} 추가하면`;
  return `${clean}${needsEuro(clean) ? '으로' : '로'} 하면`;
}

function buildGuide(menu: MenuItem, remaining: DailyTargets, ctx: JudgeContext, current: Scored, budget: MealBudget): string | undefined {
  if (current.unknown || !menu.options?.length) return undefined;
  const selected = ctx.selectedOptions ?? {};
  let best: { label: string; s: Scored } | undefined;
  for (const group of menu.options) {
    const currentLabel = selected[group.id] ?? group.choices.find((c) => c.isDefault)?.label;
    for (const choice of group.choices) {
      if (choice.label === currentLabel) continue;
      const s = score(menu, remaining, ctx, { ...selected, [group.id]: choice.label }, budget);
      if (s.unknown || VERDICT_RANK[s.verdict] <= VERDICT_RANK[current.verdict]) continue;
      if (
        !best ||
        VERDICT_RANK[s.verdict] > VERDICT_RANK[best.s.verdict] ||
        (s.verdict === best.s.verdict && s.score > best.s.score)
      ) {
        best = { label: choice.label, s };
      }
    }
  }
  if (!best) return undefined;
  return `${optionPhrase(best.label)} ${VERDICT_LABEL[best.s.verdict]}이 돼요`;
}

/**
 * 메뉴 하나 판정 — 규칙·템플릿만, AI 없음.
 * 칼로리는 "이번 끼니 적정량"(하루 남은 kcal ÷ 남은 끼니 수, ctx.now 기준) 대비로 본다.
 * reasons[0] 은 근거 숫자 한 줄("점심 적정량의 60%예요"), 이어서 규칙 문구.
 */
export function judgeMenu(menu: MenuItem, remaining: DailyTargets, ctx: JudgeContext): Judgement {
  const budget = judgeBudget(remaining, ctx);
  const s = score(menu, remaining, ctx, ctx.selectedOptions, budget);
  if (s.unknown || !s.nutrients) {
    return { unknown: true, verdict: 'pass', score: -1, reasons: [...UNKNOWN_REASONS] };
  }
  const { lines, kcalTitle } = buildReasons(menu, s, remaining);
  const numberLine = budgetReason(s.nutrients.kcal, budget, remaining.kcal);
  // 칼로리 이야기인 첫 줄은 숫자 줄로 대신하고, 나머지는 숫자 줄 뒤에 둔다 (최대 3줄)
  const reasons = numberLine ? [numberLine, ...(kcalTitle ? lines.slice(1) : lines)] : lines;
  const judgement: Judgement = {
    unknown: false,
    verdict: s.verdict,
    score: s.score,
    reasons,
  };
  const guide = buildGuide(menu, remaining, ctx, s, budget);
  if (guide) judgement.guide = guide;
  return judgement;
}

/** 매장 메뉴 순위 (score 내림차순, unknown은 맨 뒤). 조리용 식재료·대용량은 기본으로 뺀다(RankOptions) */
export function rankMenus(
  menus: MenuItem[],
  remaining: DailyTargets,
  ctx: JudgeContext,
  opts: RankOptions = {},
): { menu: MenuItem; judgement: Judgement }[] {
  // 목록 전체를 같은 시각(같은 끼니)으로 판정
  const c: JudgeContext = { ...ctx, now: ctx.now ?? new Date() };
  const pool = opts.includeNonMeal ? menus : menus.filter(isMealCandidate);
  const judged = pool.map((menu, i) => ({ menu, judgement: judgeMenu(menu, remaining, c), i, meal: !opts.includeNonMeal || isMealCandidate(menu) }));
  judged.sort((a, b) => {
    if (a.judgement.unknown !== b.judgement.unknown) return a.judgement.unknown ? 1 : -1;
    if (a.meal !== b.meal) return a.meal ? -1 : 1;
    if (a.judgement.unknown) return a.i - b.i;
    // 동점(100점 포화가 흔함)이면 옵션 반영 kcal 이 낮은 순 → 원래 순서
    const ka = applyOptions(a.menu, ctx.selectedOptions)?.kcal ?? 0;
    const kb = applyOptions(b.menu, ctx.selectedOptions)?.kcal ?? 0;
    return b.judgement.score - a.judgement.score || ka - kb || a.i - b.i;
  });
  return judged.map(({ menu, judgement }) => ({ menu, judgement }));
}

/** 같은 매장 안에서 더 잘 맞는 대안 n개 — 같은 카테고리 우선, 모자라면 다른 카테고리에서 채움 */
export function suggestAlternatives(
  menu: MenuItem,
  candidates: MenuItem[],
  remaining: DailyTargets,
  ctx: JudgeContext,
  n = 2,
): { menu: MenuItem; judgement: Judgement }[] {
  const now = ctx.now ?? new Date();
  const base = judgeMenu(menu, remaining, { ...ctx, now }).score;
  // 대안은 기본 옵션 기준으로 판정 (대상 메뉴의 옵션 선택을 끌고 오지 않음). 끼니 기준은 같게
  const altCtx: JudgeContext = { profile: ctx.profile, now, mealSlotsLeft: ctx.mealSlotsLeft, eatenMeals: ctx.eatenMeals };
  const better = rankMenus(
    candidates.filter((c) => c.id !== menu.id),
    remaining,
    altCtx,
  ).filter((x) => !x.judgement.unknown && x.judgement.verdict !== 'pass' && x.judgement.score > base);
  const same = better.filter((x) => x.menu.category === menu.category);
  const other = better.filter((x) => x.menu.category !== menu.category);
  return [...same, ...other].slice(0, n);
}
