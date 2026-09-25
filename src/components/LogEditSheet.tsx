import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { menuQtyUnit, scaleNutrients } from '@/domain/qty';
import type { MealLog, MealType } from '@/domain/types';
import { logMenu, removeLogWithUndo, saveLogEdit } from '@/state/recordItems';
import { spacing } from '@/theme';

import { Input } from './Input';
import { RecordSheet } from './RecordSheet';

const num = (s: string): number | undefined => {
  const v = Number(s);
  return s.trim() !== '' && Number.isFinite(v) ? v : undefined;
};

/**
 * 기록 고치기 — 기록 추가와 같은 RecordSheet(edit 모드): 양 · 날짜 · 끼니, 직접 입력한 기록은 이름·kcal 도.
 * 저장하면 판정도 먹은 양 기준으로 다시 낸다(state/recordItems applyLogEdit). 기록 탭·오늘 탭 공통.
 */
export function LogEditSheet({ log, onClose }: { log: MealLog | null; onClose: () => void }) {
  // 닫히는 동안에도 내용이 남아 있게 마지막 기록을 들고 있고, 새로 열 때마다 입력을 새로 시작한다
  const last = useRef<MealLog | null>(null);
  const seq = useRef(0);
  if (log && log !== last.current) seq.current += 1;
  if (log) last.current = log;
  const cur = log ?? last.current;
  return cur ? <Editor key={`${cur.id}:${seq.current}`} log={cur} visible={!!log} onClose={onClose} /> : null;
}

function Editor({ log, visible, onClose }: { log: MealLog; visible: boolean; onClose: () => void }) {
  const manual = log.trust === 'user';
  const prevQty = log.qty > 0 ? log.qty : 1;
  const base = scaleNutrients(log.nutrients, 1 / prevQty);
  const [qty, setQty] = useState(log.qty);
  const [meal, setMeal] = useState<MealType>(log.mealType);
  const [date, setDate] = useState(log.date);
  const [name, setName] = useState(log.name);
  const [kcal, setKcal] = useState(String(Math.round(base.kcal)));
  const [saving, setSaving] = useState(false);

  const kcalNum = num(kcal);
  const kcalChanged = manual && kcalNum != null && kcalNum !== Math.round(base.kcal);
  const shownBase = kcalChanged ? { ...base, kcal: kcalNum } : base;
  const valid = !manual || (name.trim().length > 0 && kcalNum != null && kcalNum >= 0);

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    await saveLogEdit(log, {
      qty,
      mealType: meal,
      date,
      ...(manual ? { name, baseKcal: kcalChanged ? kcalNum : undefined } : {}),
    });
    setSaving(false);
    onClose();
  };

  const remove = () => {
    onClose();
    void removeLogWithUndo(log);
  };

  return (
    <RecordSheet
      visible={visible}
      onClose={onClose}
      mode="edit"
      header={
        manual ? (
          <View style={styles.fields}>
            <Input label="메뉴 이름" kind="text" value={name} onChangeText={setName} autoCapitalize="sentences" />
            <Input label="칼로리 (1인분)" value={kcal} onChangeText={setKcal} unit="kcal" maxLength={5} />
          </View>
        ) : undefined
      }
      items={[
        {
          key: log.id,
          name: manual ? name.trim() || log.name : log.name,
          sub: [log.storeName, ...(log.optionLabels ?? [])].filter(Boolean).join(' · ') || undefined,
          base: shownBase,
          unit: menuQtyUnit(logMenu(log)),
          qty,
        },
      ]}
      onQty={(_k, q) => setQty(q)}
      meal={meal}
      onMeal={setMeal}
      date={date}
      onDate={setDate}
      dateExtra={log.date}
      saving={saving}
      saveDisabled={!valid}
      onSave={() => void save()}
      onDelete={remove}
    />
  );
}

const styles = StyleSheet.create({
  fields: { gap: spacing.md },
});
