import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { recentDateChoices } from '@/domain/logDate';
import { scaleNutrients } from '@/domain/qty';
import { formatNumber, toDateKey } from '@/domain/summary';
import { MEAL_LABEL, type MealType, type Nutrients } from '@/domain/types';
import { colors, spacing } from '@/theme';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Chip } from './Chip';
import { QtyStepper } from './QtyStepper';
import { Text } from './Text';

export const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export interface RecordSheetItem {
  key: string;
  name: string;
  /** 매장·브랜드 등 한 줄 */
  sub?: string;
  /** 1(개·인분·조각) 기준 영양 */
  base: Nutrients;
  unit: string;
  qty: number;
}

/** 끼니 칩 한 줄 (아침·점심·저녁·간식) — 기록 시트·직접 입력·AI 확인 화면 공통 */
export function MealChips({ value, onChange, style }: { value: MealType; onChange: (m: MealType) => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Text variant="captionMedium" color="ink2">
        끼니
      </Text>
      <View style={styles.chips}>
        {MEALS.map((m) => (
          <Chip key={m} label={MEAL_LABEL[m]} variant="option" selected={value === m} onPress={() => onChange(m)} style={styles.mealChip} />
        ))}
      </View>
    </View>
  );
}

/**
 * 날짜 칩 한 줄 — 오늘·어제·그제 (+ 기록 탭에서 고른 그 밖의 지난 날). 미래는 고를 수 없다.
 * 고른 값(value)이 목록 밖 지난 날이어도 칩으로 보인다.
 */
export function DateChips({ value, onChange, extra, style }: { value: string; onChange: (d: string) => void; extra?: string; style?: StyleProp<ViewStyle> }) {
  const choices = recentDateChoices(new Date(), [extra, value]);
  return (
    <View style={style}>
      <Text variant="captionMedium" color="ink2">
        날짜
      </Text>
      <View style={styles.chips}>
        {choices.map((c) => (
          <Chip key={c.key} label={c.label} variant="option" selected={value === c.key} onPress={() => onChange(c.key)} style={styles.dateChip} />
        ))}
      </View>
    </View>
  );
}

/**
 * 기록 확인 시트 — 음식마다 먹은 양(0.5~2 · 조각 1~6) + 날짜(오늘·어제·그제…) + 끼니 → 기록하기.
 * 매장 담기(D3)·메뉴 상세(D4)·기록 추가(E2)·밀리가 같은 모양을 쓴다.
 * mode 'edit' 은 기록 고치기(기록 탭·오늘 탭): 제목 "기록 고치기", 버튼 지우기 + 저장.
 */
export function RecordSheet({
  visible,
  onClose,
  title,
  mode = 'record',
  header,
  items,
  onQty,
  onRemove,
  meal,
  onMeal,
  date,
  onDate,
  dateExtra,
  remainingKcal,
  saving,
  onSave,
  onDelete,
  saveDisabled,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  mode?: 'record' | 'edit';
  /** 목록 위에 넣을 칸 (기록 고치기의 이름·kcal 입력 등) */
  header?: ReactNode;
  items: RecordSheetItem[];
  onQty: (key: string, qty: number) => void;
  onRemove?: (key: string) => void;
  meal: MealType;
  onMeal: (m: MealType) => void;
  /** 기록할 날짜 YYYY-MM-DD — 주지 않으면 날짜 줄을 그리지 않는다(오늘) */
  date?: string;
  onDate?: (d: string) => void;
  /** 칩에 더 보여줄 지난 날짜 (기록 탭에서 고른 날·고치는 기록의 원래 날짜) */
  dateExtra?: string;
  /** 기록 전 오늘 더 먹을 수 있는 kcal (없거나 오늘이 아닌 날이면 안내 줄 생략) */
  remainingKcal?: number | null;
  saving?: boolean;
  onSave: () => void;
  onDelete?: () => void;
  saveDisabled?: boolean;
}) {
  const edit = mode === 'edit';
  const total = items.reduce((s, x) => s + scaleNutrients(x.base, x.qty).kcal, 0);
  const isToday = !date || date === toDateKey();
  const after = remainingKcal == null || !isToday || edit ? null : remainingKcal - total;
  const saveTitle = edit ? '저장' : items.length > 1 ? `${items.length}개 기록하기` : '기록하기';
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title ?? (edit ? '기록 고치기' : '얼마나, 언제 드셨어요?')}
      footer={
        <View style={styles.footer}>
          <View style={styles.totalRow}>
            <Text variant="bodyMedium">합계 {formatNumber(Math.round(total))} kcal</Text>
            {after == null ? null : after >= 0 ? (
              <Text variant="caption" color="ink2">
                기록하면 {formatNumber(Math.round(after))} kcal 남아요
              </Text>
            ) : (
              <Text variant="caption" color="over">
                목표보다 {formatNumber(Math.round(-after))} kcal 넘어요
              </Text>
            )}
          </View>
          {edit ? (
            <View style={styles.editButtons}>
              {onDelete ? <Button title="지우기" variant="ghost" onPress={onDelete} style={styles.flex} /> : null}
              <Button title={saveTitle} disabled={saveDisabled || !items.length} loading={saving} onPress={onSave} style={styles.flex} />
            </View>
          ) : (
            <Button title={saveTitle} disabled={saveDisabled || !items.length} loading={saving} onPress={onSave} />
          )}
        </View>
      }
    >
      {header}
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {items.map((x, i) => (
          <View key={x.key} style={[styles.row, i > 0 && styles.rowLine]}>
            <View style={styles.rowHead}>
              <View style={styles.flex}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {x.name}
                </Text>
                {x.sub ? (
                  <Text variant="small" color="ink3" numberOfLines={1}>
                    {x.sub}
                  </Text>
                ) : null}
              </View>
              {onRemove ? (
                <Pressable accessibilityRole="button" accessibilityLabel={`${x.name} 빼기`} hitSlop={8} onPress={() => onRemove(x.key)}>
                  <Ionicons name="close" size={20} color={colors.ink3} />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.rowBottom}>
              <QtyStepper value={x.qty} onChange={(q) => onQty(x.key, q)} unit={x.unit} />
              <Text variant="caption" color="ink2">
                <Text variant="bodyMedium">{formatNumber(Math.round(scaleNutrients(x.base, x.qty).kcal))}</Text> kcal
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
      {date && onDate ? <DateChips value={date} onChange={onDate} extra={dateExtra} style={styles.section} /> : null}
      <MealChips value={meal} onChange={onMeal} style={styles.section} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  list: { maxHeight: 340, marginTop: spacing.md },
  row: { paddingVertical: spacing.md, gap: spacing.sm },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { marginTop: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  mealChip: { flex: 1 },
  dateChip: { flexGrow: 1 },
  footer: { gap: spacing.sm },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  editButtons: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
});
