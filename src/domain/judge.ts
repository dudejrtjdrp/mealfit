import { emphasisFor } from './targets';
import type { DailyTargets, Judgement, MenuItem, Nutrients, Profile, Verdict } from './types';
import { VERDICT_LABEL } from './types';

export interface JudgeContext {
  profile: Pick<Profile, 'primaryGoal' | 'secondaryGoals' | 'diet'>;
  /** groupId → 선택한 choice.label */
  selectedOptions?: Record<string, string>;
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
  nutrients: Nutrients | null;
}

function ratio(value: number, remaining: number): number {
  if (remaining <= 0) return value > 0 ? Infinity : 0;
  return value / remaining;
}

function score(menu: MenuItem, remaining: DailyTargets, ctx: JudgeContext, selected?: Record<string, string>): Scored {
  const n = applyOptions(menu, selected);
  if (menu.trust === 'none' || !n || typeof n.kcal !== 'number' || !Number.isFinite(n.kcal)) {
    return { unknown: true, score: -1, verdict: 'pass', factors: [], overKcal: false, nutrients: null };
  }

  const factors: Factor[] = [];

  // ① 칼로리 비중
  const r = ratio(n.kcal, remaining.kcal);
  factors.push({ key: 'kcal', points: r <= 0.35 ? 40 : r <= 0.6 ? 25 : r <= 1.0 ? 10 : -30 });

  // ② 강조 영양소
  const emphasis = emphasisFor(ctx.profile.primaryGoal, ctx.profile.secondaryGoals ?? []);
  for (const key of emphasis) {
    if (key === 'kcal') continue;
    const v = n[key];
    if (typeof v !== 'number') continue;
    const share = ratio(v, remaining[key]);
    if (key === 'protein') {
      // 단백질은 많을수록 좋다
      factors.push({ key, points: share >= 0.2 ? 10 : 0 });
    } else {
      factors.push({ key, points: share <= 0.4 ? 15 : share <= 0.8 ? 5 : -20 });
    }
  }

  // ③ 식단 유형 보정
  switch (ctx.profile.diet?.type) {
    case 'low_sugar':
      if ((n.sugar ?? 0) >= 15) factors.push({ key: 'sugar', points: -15 });
      break;
    case 'low_carb_high_protein':
      if ((n.carbs ?? 0) >= 40) factors.push({ key: 'carbs', points: -10 });
      break;
    case 'low_sodium':
      if ((n.sodium ?? 0) >= 800) factors.push({ key: 'sodium', points: -15 });
      break;
    case 'high_protein_bulk':
      if ((n.protein ?? 0) >= 20) factors.push({ key: 'protein', points: 10 });
      break;
    default:
      break;
  }

  const raw = 50 + factors.reduce((s, f) => s + f.points, 0);
  let total = Math.max(0, Math.min(100, raw));
  const overKcal = n.kcal > remaining.kcal;
  let verdict: Verdict = total >= 65 ? 'good' : total >= 40 ? 'ok' : 'pass';
  if (overKcal) {
    verdict = 'pass';
    total = Math.min(total, 39); // 순위에서도 패스 구간 아래로
  }
  return { unknown: false, score: total, verdict, factors, overKcal, nutrients: n };
}

/** 요인별로 합친 점수 */
function byKey(factors: Factor[]): Map<FactorKey, number> {
  const m = new Map<FactorKey, number>();
  for (const f of factors) m.set(f.key, (m.get(f.key) ?? 0) + f.points);
  return m;
}

const GOOD_TITLE: Record<FactorKey, string> = {
  kcal: '여유분 안에서 가볍게 들어가요',
  protein: '단백질을 든든하게 챙길 수 있어요',
  sugar: '당이 적어 가볍게 즐기기 좋아요',
  sodium: '나트륨이 적어 담백하게 드실 수 있어요',
  carbs: '탄수화물 부담이 적어 가볍게 들어가요',
  fat: '지방 부담이 적어 산뜻하게 드실 수 있어요',
};

const OK_TITLE: Record<FactorKey, string> = {
  kcal: '전체 여유분 안에서 무난해요',
  protein: '전체 여유분 안에서 무난해요',
  sugar: '당이 조금 있지만 전체 여유분 안에서 무난해요',
  sodium: '나트륨이 조금 있지만 전체 여유분 안에서 무난해요',
  carbs: '탄수화물이 조금 있지만 전체 여유분 안에서 무난해요',
  fat: '지방이 조금 있지만 전체 여유분 안에서 무난해요',
};

const PASS_TITLE: Record<FactorKey, string> = {
  kcal: '오늘 남은 여유보다 조금 커요',
  protein: '오늘 남은 여유보다 조금 커요',
  sugar: '당이 오늘 남은 여유보다 많은 편이에요',
  sodium: '나트륨이 오늘 남은 여유보다 많은 편이에요',
  carbs: '탄수화물이 오늘 남은 여유보다 많은 편이에요',
  fat: '지방이 오늘 남은 여유보다 많은 편이에요',
};

function hasMilk(menu: MenuItem): boolean {
  return (
    menu.category === 'drink' &&
    (/라떼|우유|밀크|마키아또|모카|카푸치노/.test(menu.name) || (menu.options ?? []).some((g) => g.id === 'milk'))
  );
}

function buildReasons(menu: MenuItem, s: Scored, remaining: DailyTargets): string[] {
  const sums = [...byKey(s.factors).entries()];
  const most = (pick: (a: number, b: number) => boolean) =>
    sums.reduce<[FactorKey, number] | undefined>((best, cur) => (!best || pick(cur[1], best[1]) ? cur : best), undefined);

  if (s.verdict === 'good') {
    const top = most((a, b) => a > b);
    const key = top && top[1] > 0 ? top[0] : 'kcal';
    const proteinPts = sums.find(([k]) => k === 'protein')?.[1] ?? 0;
    const second = key !== 'protein' && proteinPts > 0 ? '단백질도 챙길 수 있어요' : '지금 드시기 좋은 메뉴예요';
    return [GOOD_TITLE[key], second];
  }

  if (s.verdict === 'ok') {
    const low = most((a, b) => a < b);
    if (low && low[1] < 0 && low[0] !== 'kcal' && low[0] !== 'protein') {
      return [OK_TITLE[low[0]], '평소처럼 드셔도 좋아요'];
    }
    if (hasMilk(menu)) return ['우유가 들어가지만 전체 여유분 안에서 무난해요', '평소처럼 드셔도 좋아요'];
    return [OK_TITLE.kcal, '평소처럼 드셔도 좋아요'];
  }

  // pass
  if (remaining.kcal <= 0) return ['오늘은 여기까지 채웠어요', '내일 다시 채워져요'];
  if (s.overKcal) return [PASS_TITLE.kcal, '다른 메뉴가 더 잘 맞아요'];
  const low = most((a, b) => a < b);
  const key = low && low[1] < 0 ? low[0] : 'kcal';
  return [PASS_TITLE[key], '다른 메뉴가 더 잘 맞아요'];
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

function buildGuide(menu: MenuItem, remaining: DailyTargets, ctx: JudgeContext, current: Scored): string | undefined {
  if (current.unknown || !menu.options?.length) return undefined;
  const selected = ctx.selectedOptions ?? {};
  let best: { label: string; s: Scored } | undefined;
  for (const group of menu.options) {
    const currentLabel = selected[group.id] ?? group.choices.find((c) => c.isDefault)?.label;
    for (const choice of group.choices) {
      if (choice.label === currentLabel) continue;
      const s = score(menu, remaining, ctx, { ...selected, [group.id]: choice.label });
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

/** 메뉴 하나 판정 — 규칙·템플릿만, AI 없음 */
export function judgeMenu(menu: MenuItem, remaining: DailyTargets, ctx: JudgeContext): Judgement {
  const s = score(menu, remaining, ctx, ctx.selectedOptions);
  if (s.unknown) {
    return { unknown: true, verdict: 'pass', score: -1, reasons: [...UNKNOWN_REASONS] };
  }
  const judgement: Judgement = {
    unknown: false,
    verdict: s.verdict,
    score: s.score,
    reasons: buildReasons(menu, s, remaining),
  };
  const guide = buildGuide(menu, remaining, ctx, s);
  if (guide) judgement.guide = guide;
  return judgement;
}

/** 매장 메뉴 순위 (score 내림차순, unknown은 맨 뒤) */
export function rankMenus(
  menus: MenuItem[],
  remaining: DailyTargets,
  ctx: JudgeContext,
): { menu: MenuItem; judgement: Judgement }[] {
  const judged = menus.map((menu, i) => ({ menu, judgement: judgeMenu(menu, remaining, ctx), i }));
  judged.sort((a, b) => {
    if (a.judgement.unknown !== b.judgement.unknown) return a.judgement.unknown ? 1 : -1;
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
  const base = judgeMenu(menu, remaining, ctx).score;
  // 대안은 기본 옵션 기준으로 판정 (대상 메뉴의 옵션 선택을 끌고 오지 않음)
  const altCtx: JudgeContext = { profile: ctx.profile };
  const better = rankMenus(
    candidates.filter((c) => c.id !== menu.id),
    remaining,
    altCtx,
  ).filter((x) => !x.judgement.unknown && x.judgement.verdict !== 'pass' && x.judgement.score > base);
  const same = better.filter((x) => x.menu.category === menu.category);
  const other = better.filter((x) => x.menu.category !== menu.category);
  return [...same, ...other].slice(0, n);
}
