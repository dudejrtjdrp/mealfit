import { qtyOptionsFor } from './qty';
import type { MealType, Nutrients } from './types';

/**
 * AI 식사 기록 (사진·글·음성) — 순수 로직.
 * AI 는 "무엇을, 대략 얼마나"만 뽑고 칼로리는 앱 데이터(식약처·브랜드)에서 찾는다.
 * 데이터에서 못 찾을 때만 AI 추정값을 '추정'으로 쓴다 (숫자를 지어내지 않는 원칙).
 */

/** 하루 AI 정리 횟수 — 효님 결정(2026-09-25): 모두 무료, 하루 횟수 제한으로 비용 상한 */
export const AI_MEAL_DAILY_LIMIT = 15;
/** 프롬프트를 바꾸면 올려서 글 입력 캐시를 무효화한다 */
export const AI_MEAL_PROMPT_VERSION = 'meal-v2';
/** 한 번에 정리하는 음식 수 상한 */
export const AI_MEAL_MAX_ITEMS = 8;

export interface ParsedFood {
  /** 음식 이름 — 데이터 검색에 쓴다 */
  name: string;
  /** 먹은 양. unit 이 조각이면 조각 수, 그 밖엔 보통 1인분(1개·1잔·1그릇) 대비 배수 */
  amount: number;
  /** 사용자가 말한 단위 (그릇·공기·개·조각…) */
  unit?: string;
  /** 사용자가 말한 양 표현 그대로 ("반 공기") — 확인 화면에 보여준다 */
  portion?: string;
  /** AI 추정 영양(1인분 기준) — 데이터에서 못 찾을 때만 쓴다 */
  guess?: Nutrients;
}

export interface ParsedMeal {
  mealType?: MealType;
  items: ParsedFood[];
  /** ai: 방금 AI 정리 · cache: 같은 글을 전에 정리한 결과 · rules: AI 없이 규칙으로 나눔 */
  source: 'ai' | 'cache' | 'rules';
}

// ── 수량 맞추기 ──

/** 먹은 양 → 기록 수량 단계(0.5~2 의 7단계, 조각은 1~6) 중 가장 가까운 값. 범위를 넘으면 끝 값 */
export function snapQty(amount: number, unit?: string): number {
  const opts = qtyOptionsFor(unit);
  if (!Number.isFinite(amount) || amount <= 0) return 1;
  let best = opts[0];
  for (const o of opts) if (Math.abs(o - amount) < Math.abs(best - amount) - 1e-9) best = o;
  return best;
}

// ── 하루 횟수 ──

export interface AIQuotaRecord {
  date: string;
  count: number;
}

/** 오늘 남은 횟수 — 날짜가 바뀌면 다시 채워진다 */
export function quotaLeft(rec: AIQuotaRecord | null | undefined, today: string, limit = AI_MEAL_DAILY_LIMIT): number {
  const used = rec && rec.date === today ? rec.count : 0;
  return Math.max(0, limit - used);
}

export function quotaConsume(rec: AIQuotaRecord | null | undefined, today: string): AIQuotaRecord {
  return { date: today, count: (rec && rec.date === today ? rec.count : 0) + 1 };
}

// ── 글 정규화 (캐시 키) ──

export function normalizeMealText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/[.!?~。]+$/g, '').trim().toLowerCase();
}

// ── 끼니 ──

const MEAL_WORDS: [RegExp, MealType][] = [
  [/아침|조식|브런치/, 'breakfast'],
  [/점심|중식|런치/, 'lunch'],
  [/저녁|석식|디너/, 'dinner'],
  [/야식|간식|디저트|후식/, 'snack'],
];

export function detectMealType(text: string): MealType | undefined {
  for (const [re, m] of MEAL_WORDS) if (re.test(text)) return m;
  return undefined;
}

const isMealType = (v: unknown): v is MealType => v === 'breakfast' || v === 'lunch' || v === 'dinner' || v === 'snack';

// ── 규칙 기반 나누기 (AI 키가 없거나 오늘 횟수를 다 쓴 경우) ──

const UNITS = '공기|그릇|인분|개|잔|조각|컵|병|캔|봉지|접시|줄|쪽|장|마리|판|팩|대접|숟가락|스푼';
const NUM_WORDS: Record<string, number> = { 한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 석: 3, 네: 4, 넷: 4, 다섯: 5, 여섯: 6 };

/** 끼니·동사 같은 군말 걷어내기 */
function stripFiller(s: string): string {
  return s
    .replace(/(오늘|아까|방금|어제)\s*/g, ' ')
    .replace(/(아침|점심|저녁|야식|간식|브런치|디저트|후식)\s*(으로는|으로|로는|로|에는|에|은|는)?(?=\s|$)/g, ' ')
    .replace(/(을|를)?\s*(먹었|마셨|먹음|마심|먹고|마시고|했|먹었다|먹어)[가-힣]*/g, ' ')
    .replace(/[.!?~]/g, ' ');
}

/** "김치찌개 한 그릇" → { name: 김치찌개, amount: 1, unit: 그릇, portion: "한 그릇" } */
export function parseFoodPhrase(raw: string): ParsedFood | null {
  let s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  let amount: number | undefined;
  let unit: string | undefined;
  let portion: string | undefined;

  const take = (m: RegExpMatchArray, value: number, u?: string) => {
    amount = value;
    unit = u;
    portion = m[0].trim();
    s = (s.slice(0, m.index) + ' ' + s.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').trim();
  };

  const numWords = Object.keys(NUM_WORDS).sort((a, b) => b.length - a.length).join('|');
  const patterns: [RegExp, (m: RegExpMatchArray) => [number, string | undefined]][] = [
    // "1.5 공기", "2개", "1/2 그릇"
    [new RegExp(`(\\d+)\\s*/\\s*(\\d+)\\s*(${UNITS})?`), (m) => [Number(m[1]) / Number(m[2]), m[3]]],
    [new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNITS})`), (m) => [Number(m[1]), m[2]]],
    // "한 개 반", "하나 반"
    [new RegExp(`(${numWords})\\s*(${UNITS})?\\s*반(?![가-힣])`), (m) => [NUM_WORDS[m[1]] + 0.5, m[2]]],
    // "반 공기", "반개"
    [new RegExp(`(?:^|\\s)반\\s*(${UNITS})`), (m) => [0.5, m[1]]],
    // "한 그릇", "두 조각"
    [new RegExp(`(?:^|\\s)(${numWords})\\s*(${UNITS})`), (m) => [NUM_WORDS[m[1]], m[2]]],
    // 뒤에 붙은 "반", "조금", "많이"
    [/(?:^|\s)(반)(?:\s|$)/, () => [0.5, undefined]],
    [/(?:^|\s)(조금|살짝|약간)(?:\s|$)/, () => [0.5, undefined]],
    [/(?:^|\s)(많이|곱빼기|듬뿍|왕창)(?:\s|$)/, () => [1.5, undefined]],
  ];
  for (const [re, f] of patterns) {
    const m = s.match(re);
    if (m) {
      const [v, u] = f(m);
      take(m, v, u);
      break;
    }
  }
  const name = s.replace(/(을|를|은|는|도|만|이랑|랑)$/g, '').trim();
  if (!name || name.length > 40) return null;
  return { name, amount: amount && amount > 0 ? amount : 1, ...(unit ? { unit } : {}), ...(portion ? { portion } : {}) };
}

/** 규칙 기반: "점심에 김치찌개 한 그릇이랑 밥 반 공기 먹었어" → 김치찌개 1그릇, 밥 0.5공기 */
export function parseMealTextByRules(text: string): ParsedMeal {
  const mealType = detectMealType(text);
  const body = stripFiller(text);
  const parts = body
    .split(/[,，\n+·/]|그리고|(?<=[가-힣])(?:이랑|랑|하고)(?=\s|$)|\s(?:이랑|랑|하고|와|과)\s/)
    .map((p) => (p ?? '').trim())
    .filter(Boolean);
  const items: ParsedFood[] = [];
  for (const p of parts) {
    const f = parseFoodPhrase(p);
    if (f) items.push(f);
    if (items.length >= AI_MEAL_MAX_ITEMS) break;
  }
  return { ...(mealType ? { mealType } : {}), items, source: 'rules' };
}

// ── AI 프롬프트 · 응답 ──

export function mealSystemPrompt(kind: 'text' | 'photo'): string {
  return [
    '당신은 한국 사용자가 먹은 음식을 기록용으로 정리하는 도우미입니다.',
    kind === 'photo'
      ? '사진 속 음식을 알아보고, 사진에 보이는 양을 보통 1인분과 비교해 먹은 양을 추정합니다. 사용자가 덧붙인 설명(예: 반쯤 먹었어요)이 있으면 그 양을 우선합니다.'
      : '사용자가 말하거나 적은 문장에서 먹은 음식과 양을 뽑습니다. 말투가 구어체이거나 음성 인식 오타가 있어도 뜻을 살려 읽습니다.',
    '',
    '규칙:',
    '- 반드시 JSON 한 개만 답합니다. 설명·코드블록 없이.',
    '- 형식: {"mealType":"breakfast|lunch|dinner|snack|null","items":[{"name":"김치찌개","amount":1,"unit":"그릇","portion":"한 그릇","kcal":450,"carbs":20,"protein":25,"fat":28}]}',
    '- name: 한국에서 흔히 쓰는 음식 이름. 반찬·밥·국은 따로 나눕니다(예: 공깃밥, 김치찌개). 브랜드 제품이면 "브랜드 제품명"(예: 스타벅스 카페라떼).',
    '- amount: 먹은 양. unit 이 조각이면 조각 수, 그 밖에는 보통 1인분(1개·1잔·1그릇) 대비 배수(0.5, 1, 1.5 …).',
    '- portion: 사용자가 말한 양 표현. 없으면 생략.',
    '- kcal·carbs·protein·fat: amount=1 일 때(unit 1개 기준, 단위가 없으면 보통 1인분)의 추정값. 모르면 생략.',
    '- mealType: 문장에 아침·점심·저녁·간식·야식이 드러날 때만. 없으면 null.',
    `- 음식이 아닌 것은 넣지 않습니다. 음식이 없으면 items 는 빈 배열. 최대 ${AI_MEAL_MAX_ITEMS}개.`,
  ].join('\n');
}

const finiteNonNeg = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);

/** AI 응답 문자열 → 정리 결과. 형식이 틀리면 null */
export function parseAIMealResult(raw: string): Omit<ParsedMeal, 'source'> | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let data: any;
  try {
    data = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!data || !Array.isArray(data.items)) return null;
  const items: ParsedFood[] = [];
  for (const it of data.items) {
    const name = typeof it?.name === 'string' ? it.name.replace(/\s+/g, ' ').trim() : '';
    if (!name || name.length > 40) continue;
    const amt = finiteNonNeg(typeof it.amount === 'string' ? Number(it.amount) : it.amount);
    const food: ParsedFood = { name, amount: amt && amt > 0 ? Math.min(amt, 10) : 1 };
    if (typeof it.unit === 'string' && it.unit.trim()) food.unit = it.unit.trim().slice(0, 6);
    if (typeof it.portion === 'string' && it.portion.trim()) food.portion = it.portion.trim().slice(0, 20);
    const kcal = finiteNonNeg(it.kcal);
    if (kcal !== undefined && kcal > 0 && kcal < 5000) {
      const g: Nutrients = { kcal: Math.round(kcal) };
      for (const k of ['carbs', 'protein', 'fat'] as const) {
        const v = finiteNonNeg(it[k]);
        if (v !== undefined && v < 1000) g[k] = Math.round(v * 10) / 10;
      }
      food.guess = g;
    }
    items.push(food);
    if (items.length >= AI_MEAL_MAX_ITEMS) break;
  }
  return { ...(isMealType(data.mealType) ? { mealType: data.mealType } : {}), items };
}
