import { getBrand } from '@/data';
import { judgeMenu } from '@/domain/judge';
import { scaleNutrients } from '@/domain/qty';
import { overToastSuffix, toDateKey } from '@/domain/summary';
import { MEAL_LABEL, type MealLog, type MealType, type MenuItem, type Nutrients, type Trust } from '@/domain/types';
import { showToast } from '@/components/Toast';
import { newId } from '@/services/id';

import { defaultMealType, useDay } from './day';
import { judgeContext } from './judgeContext';
import { useProfile } from './profile';

/**
 * 여러 음식을 한 끼로 한 번에 기록 (매장 담기·기록 추가 시트·AI 기록 공통).
 * base 는 1(개·인분·조각) 기준 영양, qty 를 곱해 저장한다. 되돌리기 토스트는 한 번에 전부 지운다.
 */
export interface RecordItem {
  name: string;
  base: Nutrients;
  qty: number;
  trust: Trust;
  menu?: MenuItem;
  /** 매장 이름 (메뉴가 없을 때 — 직접 입력) */
  storeName?: string;
  optionLabels?: string[];
}

export function buildLogs(items: RecordItem[], mealType: MealType, now = new Date()): MealLog[] {
  const profile = useProfile.getState().profile;
  const summary = useDay.getState().summary;
  const remaining = summary?.remaining ?? useProfile.getState().targets;
  const ctx = judgeContext(profile, summary?.logs);
  return items.map((x, i) => {
    const at = new Date(now.getTime() + i).toISOString();
    const j = x.menu && x.trust !== 'user' && remaining ? judgeMenu(x.menu, remaining, ctx) : null;
    const log: MealLog = {
      id: newId(),
      date: toDateKey(now),
      mealType,
      time: at,
      createdAt: at,
      qty: x.qty,
      name: x.name,
      nutrients: scaleNutrients(x.base, x.qty),
      trust: x.trust,
    };
    if (x.menu) {
      log.brandId = x.menu.brandId;
      log.menuId = x.menu.id;
      log.storeName = x.menu.maker ?? getBrand(x.menu.brandId)?.name;
    } else if (x.storeName) log.storeName = x.storeName;
    if (x.optionLabels?.length) log.optionLabels = x.optionLabels;
    if (j && !j.unknown) log.verdict = j.verdict;
    return log;
  });
}

/** 기록 + "점심으로 3개 기록했어요 · 되돌리기" 토스트. 저장한 기록을 돌려준다 */
export async function recordItems(items: RecordItem[], mealType: MealType = defaultMealType(), onUndo?: () => void): Promise<MealLog[]> {
  if (!items.length) return [];
  const logs = buildLogs(items, mealType);
  const day = useDay.getState();
  let ok = true;
  for (const l of logs) ok = (await day.addLog(l)) && ok;
  const after = useDay.getState();
  const suffix = logs[0].date === after.date ? overToastSuffix(after.summary) : '';
  const head = `${MEAL_LABEL[mealType]}으로 ${logs.length === 1 ? '' : `${logs.length}개 `}기록했어요`;
  showToast(ok ? head + suffix : `${head} · 저장은 다음에 다시 시도할게요`, ok ? 'success' : 'info', {
    label: '되돌리기',
    onPress: () => {
      logs.forEach((l) => void useDay.getState().removeLog(l.id));
      onUndo?.();
    },
  });
  return logs;
}
