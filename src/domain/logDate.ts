/**
 * 기록 날짜 — 지난 날짜에 기록하기(기록 탭에서 고른 날 · 기록 시트의 오늘/어제/그제).
 * 미래 날짜는 기록하지 않는다. React 의존 없음.
 */
import { toDateKey } from './summary';
import { MEAL_LABEL, type MealType } from './types';

/** 오늘이 아닌 날에 기록할 때 끼니별 시각 (시, 분) — 아침 8:00 · 점심 12:30 · 저녁 18:30 · 간식 15:30 */
export const MEAL_DEFAULT_TIME: Record<MealType, [number, number]> = {
  breakfast: [8, 0],
  lunch: [12, 30],
  dinner: [18, 30],
  snack: [15, 30],
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 'YYYY-MM-DD' → 그날 0시(로컬). 형식이 틀리면 null */
export function parseDateKey(key: string | undefined | null): Date | null {
  const m = key ? DATE_RE.exec(key) : null;
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toDateKey(d) === key ? d : null;
}

/** 두 날짜 키 사이 일수 (b - a) */
function daysBetween(a: string, b: string): number {
  const da = parseDateKey(a);
  const db = parseDateKey(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/** 기록할 수 있는 날짜로 맞춘다: 형식이 틀리거나 미래면 오늘 */
export function clampLogDate(key: string | undefined | null, now: Date = new Date()): string {
  const today = toDateKey(now);
  if (!key || !parseDateKey(key) || key > today) return today;
  return key;
}

/** '오늘' · '어제' · '그제' · 그 밖엔 '9월 20일' (해가 다르면 '2025년 12월 30일') */
export function dateLabel(key: string, now: Date = new Date()): string {
  const diff = daysBetween(key, toDateKey(now));
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  if (diff === 2) return '그제';
  const d = parseDateKey(key);
  if (!d) return key;
  const md = `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return d.getFullYear() === now.getFullYear() ? md : `${d.getFullYear()}년 ${md}`;
}

/** 기록 시트의 날짜 칩: 오늘·어제·그제 + (그 밖의 지난 날짜를 넘겼으면) 그 날짜들(최근 순). 미래·잘못된 값·중복은 뺀다 */
export function recentDateChoices(now: Date = new Date(), extra?: string | null | readonly (string | null | undefined)[]): { key: string; label: string }[] {
  const keys = [0, 1, 2].map((n) => toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n)));
  const extras = (Array.isArray(extra) ? extra : [extra]) as (string | null | undefined)[];
  const more = extras.filter((e): e is string => !!e && !!parseDateKey(e) && e <= keys[0] && !keys.includes(e));
  const uniq = [...new Set(more)].sort().reverse();
  return [...keys, ...uniq].map((key) => ({ key, label: dateLabel(key, now) }));
}

/**
 * 기록 시각: 오늘이면 지금, 지난 날이면 그날의 끼니 시각(MEAL_DEFAULT_TIME).
 * offsetMs 는 여러 개를 한 번에 기록할 때 순서를 지키려고 더하는 밀리초.
 */
export function logTimeFor(date: string, mealType: MealType, now: Date = new Date(), offsetMs = 0): Date {
  if (date === toDateKey(now)) return new Date(now.getTime() + offsetMs);
  const d = parseDateKey(date) ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [h, m] = MEAL_DEFAULT_TIME[mealType];
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, offsetMs);
}

/**
 * 기록을 고칠 때의 시각: 날짜가 바뀌었거나, 지난 날 기록의 끼니가 바뀌었으면 새 끼니 시각. 오늘 기록의 끼니만 바꾸면 그대로
 */
export function editedLogTime(prev: { date: string; mealType: MealType; time: string }, next: { date: string; mealType: MealType }, now: Date = new Date()): string {
  if (prev.date === next.date && prev.mealType === next.mealType) return prev.time;
  if (prev.date === next.date && next.date === toDateKey(now)) return prev.time;
  return logTimeFor(next.date, next.mealType, now).toISOString();
}

/** 기록 토스트 머리말: "점심으로 기록했어요" · "어제 점심으로 3개 기록했어요" · "9월 20일 저녁으로 기록했어요" */
export function recordedText(date: string, mealType: MealType, count: number, now: Date = new Date()): string {
  const day = date === toDateKey(now) ? '' : `${dateLabel(date, now)} `;
  return `${day}${MEAL_LABEL[mealType]}으로 ${count > 1 ? `${count}개 ` : ''}기록했어요`;
}
