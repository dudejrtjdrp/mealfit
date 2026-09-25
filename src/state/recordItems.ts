import { getBrand, getMenu } from '@/data';
import { judgeMenu } from '@/domain/judge';
import { clampLogDate, editedLogTime, logTimeFor, recordedText } from '@/domain/logDate';
import { scaleNutrients } from '@/domain/qty';
import { overToastSuffix, summarizeDay, toDateKey } from '@/domain/summary';
import type { DailyTargets, MealLog, MealType, MenuItem, Nutrients, Profile, Trust, Verdict } from '@/domain/types';
import { showToast } from '@/components/Toast';
import { newId } from '@/services/id';
import { getCachedRemoteProduct } from '@/services/products';
import { getRepos } from '@/services/repo';

import { defaultMealType, useDay } from './day';
import { judgeContext } from './judgeContext';
import { useProfile } from './profile';

/**
 * 여러 음식을 한 끼로 한 번에 기록 (매장 담기·메뉴 상세·기록 추가 시트·직접 입력·AI 기록·밀리 공통).
 * base 는 1(개·인분·조각) 기준 영양, qty 를 곱해 저장한다. 되돌리기 토스트는 한 번에 전부 지운다.
 * 날짜를 넘기면 그날로 기록한다 (지난 날은 그날 끼니 시각 — domain/logDate).
 */
export interface RecordItem {
  name: string;
  base: Nutrients;
  qty: number;
  trust: Trust;
  menu?: MenuItem;
  /** 매장 이름 — 주면 메뉴의 브랜드 이름보다 먼저 쓴다 (매장 상세에서 온 "스타벅스 역삼점" 등) */
  storeName?: string;
  optionLabels?: string[];
  /** 메뉴를 찾을 수 없을 때(전에 남긴 기록의 서버 제품) 그대로 옮겨 적을 참조 */
  menuId?: string;
  brandId?: string;
  /** 판정을 붙이지 않는다 — AI 기록에서 같은 이름 메뉴가 아닌 '비슷한 메뉴'로 채운 경우 */
  noVerdict?: boolean;
}

export interface RecordOptions {
  /** 기록할 날짜 YYYY-MM-DD (기본 오늘, 미래면 오늘) */
  date?: string;
  /** 되돌리기를 누르면 추가로 할 일 (화면의 ✓ 해제 등) */
  onUndo?: () => void;
}

interface JudgeEnv {
  /** 그날의 다른 기록 (판정 기준: 목표 - 이 기록들 = 남은 양, 먹은 끼니) */
  dayLogs: readonly MealLog[];
  targets: DailyTargets | null;
  profile: Profile | null;
}

/**
 * 먹은 양 그대로의 판정 — 메뉴를 기록한 영양(옵션·수량 반영)으로 바꿔 끼워 판정한다.
 * 기준은 그날의 다른 기록을 뺀 남은 양, 시각은 기록 시각(그 끼니의 적정량). 판정할 수 없으면 undefined.
 */
export function judgeEaten(menu: MenuItem, nutrients: Nutrients, date: string, at: Date, env: JudgeEnv): Verdict | undefined {
  if (!env.targets) return undefined;
  const remaining = summarizeDay(date, [...env.dayLogs], env.targets).remaining;
  const eaten: MenuItem = { ...menu, nutrients, options: undefined };
  const j = judgeMenu(eaten, remaining, { ...judgeContext(env.profile, env.dayLogs), now: at });
  return j.unknown ? undefined : j.verdict;
}

function envFor(dayLogs: readonly MealLog[]): JudgeEnv {
  const p = useProfile.getState();
  return { dayLogs, targets: p.targets, profile: p.profile };
}

/** 그날 기록 — 스토어가 보고 있는 날이면 스토어에서, 아니면 저장소에서 (못 읽으면 빈 목록) */
async function logsOn(date: string): Promise<MealLog[]> {
  const day = useDay.getState();
  if (day.date === date && day.status !== 'error') return day.logs;
  try {
    return await getRepos().logs.listByDate(date);
  } catch {
    return [];
  }
}

export function buildLogs(
  items: RecordItem[],
  mealType: MealType,
  opts: { date?: string; now?: Date; dayLogs?: readonly MealLog[]; env?: JudgeEnv } = {},
): MealLog[] {
  const now = opts.now ?? new Date();
  const date = clampLogDate(opts.date, now);
  const env = opts.env ?? envFor(opts.dayLogs ?? (useDay.getState().date === date ? useDay.getState().logs : []));
  return items.map((x, i) => {
    const at = logTimeFor(date, mealType, now, i);
    const iso = at.toISOString();
    const nutrients = scaleNutrients(x.base, x.qty);
    const log: MealLog = {
      id: newId(),
      date,
      mealType,
      time: iso,
      createdAt: new Date(now.getTime() + i).toISOString(),
      qty: x.qty,
      name: x.name,
      nutrients,
      trust: x.trust,
    };
    if (x.menu) {
      log.brandId = x.menu.brandId;
      log.menuId = x.menu.id;
      log.storeName = x.storeName || x.menu.maker || getBrand(x.menu.brandId)?.name;
    } else {
      if (x.storeName) log.storeName = x.storeName;
      if (x.menuId) log.menuId = x.menuId;
      if (x.brandId) log.brandId = x.brandId;
    }
    if (x.optionLabels?.length) log.optionLabels = x.optionLabels;
    if (x.menu && x.trust !== 'user' && !x.noVerdict) {
      const v = judgeEaten(x.menu, nutrients, date, at, env);
      if (v) log.verdict = v;
    }
    return log;
  });
}

/** 기록 + "점심으로 3개 기록했어요 · 되돌리기" (지난 날이면 "어제 점심으로 기록했어요") 토스트. 저장한 기록을 돌려준다 */
export async function recordItems(items: RecordItem[], mealType: MealType = defaultMealType(), opts: RecordOptions = {}): Promise<MealLog[]> {
  if (!items.length) return [];
  const now = new Date();
  const date = clampLogDate(opts.date, now);
  const logs = buildLogs(items, mealType, { date, now, dayLogs: await logsOn(date) });
  const day = useDay.getState();
  let ok = true;
  for (const l of logs) ok = (await day.addLog(l)) && ok;
  const after = useDay.getState();
  const suffix = date === toDateKey(now) && date === after.date ? overToastSuffix(after.summary) : '';
  const head = recordedText(date, mealType, logs.length, now);
  showToast(ok ? head + suffix : `${head} · 저장은 다음에 다시 시도할게요`, ok ? 'success' : 'info', {
    label: '되돌리기',
    onPress: () => {
      logs.forEach((l) => void useDay.getState().removeLog(l.id));
      opts.onUndo?.();
    },
  });
  return logs;
}

// ── 기록 고치기 (기록 탭·오늘 탭의 같은 시트) ──

export interface LogEdit {
  qty?: number;
  mealType?: MealType;
  date?: string;
  /** 직접 입력한 기록(trust 'user')만 */
  name?: string;
  /** 1(인분) 기준 kcal — 직접 입력한 기록(trust 'user')만 */
  baseKcal?: number;
}

/** 기록의 메뉴 (앱 데이터 → 서버 제품 세션 캐시) */
export function logMenu(log: Pick<MealLog, 'menuId'>): MenuItem | undefined {
  return log.menuId ? getMenu(log.menuId) ?? getCachedRemoteProduct(log.menuId) : undefined;
}

/**
 * 고친 기록 — 수량이 바뀌면 영양을 다시 곱하고, 판정도 먹은 양·끼니 기준으로 다시 낸다.
 * 메뉴를 찾을 수 없어 다시 판정할 수 없으면 수량·kcal 이 바뀐 경우 판정을 지운다 (예전 양의 판정을 남기지 않는다).
 */
export function applyLogEdit(log: MealLog, edit: LogEdit, env: JudgeEnv & { menu?: MenuItem; now?: Date }): MealLog {
  const now = env.now ?? new Date();
  const prevQty = log.qty > 0 ? log.qty : 1;
  const qty = edit.qty ?? log.qty;
  const date = clampLogDate(edit.date ?? log.date, now);
  const mealType = edit.mealType ?? log.mealType;
  const manual = log.trust === 'user';

  let base = scaleNutrients(log.nutrients, 1 / prevQty);
  if (manual && edit.baseKcal != null && Number.isFinite(edit.baseKcal) && edit.baseKcal >= 0) base = { ...base, kcal: edit.baseKcal };
  const nutrients = qty === prevQty && base.kcal === scaleNutrients(log.nutrients, 1 / prevQty).kcal ? log.nutrients : scaleNutrients(base, qty);
  const amountChanged = nutrients !== log.nutrients;

  const next: MealLog = {
    ...log,
    qty,
    date,
    mealType,
    nutrients,
    time: editedLogTime(log, { date, mealType }, now),
  };
  if (manual && edit.name != null && edit.name.trim()) next.name = edit.name.trim();

  const changed = amountChanged || date !== log.date || mealType !== log.mealType;
  if (changed && !manual) {
    const v = env.menu ? judgeEaten(env.menu, nutrients, date, new Date(next.time), { ...env, dayLogs: env.dayLogs.filter((l) => l.id !== log.id) }) : amountChanged ? undefined : log.verdict;
    if (v) next.verdict = v;
    else delete next.verdict;
  }
  return next;
}

/** 고친 기록 저장 + "기록을 고쳤어요 · 되돌리기" 토스트 */
export async function saveLogEdit(log: MealLog, edit: LogEdit): Promise<MealLog> {
  const date = clampLogDate(edit.date ?? log.date);
  const next = applyLogEdit(log, edit, { ...envFor(await logsOn(date)), menu: logMenu(log) });
  const ok = await useDay.getState().updateLog(next);
  showToast(ok ? '기록을 고쳤어요' : '기록을 고쳤어요 · 저장은 다음에 다시 시도할게요', ok ? 'success' : 'info', {
    label: '되돌리기',
    onPress: () => void useDay.getState().updateLog(log),
  });
  return next;
}

/** 지우기 — 확인창 대신 토스트의 되돌리기(지운 기록을 그대로 다시 추가) */
export async function removeLogWithUndo(log: MealLog): Promise<void> {
  await useDay.getState().removeLog(log.id);
  showToast('기록을 지웠어요', 'info', {
    label: '되돌리기',
    onPress: () => void useDay.getState().addLog(log),
  });
}
