import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { scaleNutrients } from '@/domain/qty';
import { formatNumber } from '@/domain/summary';
import { MEAL_LABEL, type MealType, type Nutrients } from '@/domain/types';
import { colors, spacing } from '@/theme';

import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Chip } from './Chip';
import { QtyStepper } from './QtyStepper';
import { Text } from './Text';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

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

/**
 * 기록 확인 시트 — 음식마다 먹은 양(0.5~2 · 조각 1~6) + 끼니(아침·점심·저녁·간식) → 기록하기.
 * 매장 담기(D3)·기록 추가(E2)의 +·직접 입력이 같은 모양을 쓴다.
 */
export function RecordSheet({
  visible,
  onClose,
  title = '얼마나, 언제 드셨어요?',
  items,
  onQty,
  onRemove,
  meal,
  onMeal,
  remainingKcal,
  saving,
  onSave,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  items: RecordSheetItem[];
  onQty: (key: string, qty: number) => void;
  onRemove?: (key: string) => void;
  meal: MealType;
  onMeal: (m: MealType) => void;
  /** 기록 전 오늘 더 먹을 수 있는 kcal (없으면 안내 줄 생략) */
  remainingKcal?: number | null;
  saving?: boolean;
  onSave: () => void;
}) {
  const total = items.reduce((s, x) => s + scaleNutrients(x.base, x.qty).kcal, 0);
  const after = remainingKcal == null ? null : remainingKcal - total;
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={title}
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
          <Button title={items.length > 1 ? `${items.length}개 기록하기` : '기록하기'} disabled={!items.length} loading={saving} onPress={onSave} />
        </View>
      }
    >
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
      <Text variant="captionMedium" color="ink2" style={styles.mealLabel}>
        끼니
      </Text>
      <View style={styles.meals}>
        {MEALS.map((m) => (
          <Chip key={m} label={MEAL_LABEL[m]} variant="option" selected={meal === m} onPress={() => onMeal(m)} style={styles.mealChip} />
        ))}
      </View>
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
  mealLabel: { marginTop: spacing.lg },
  meals: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  mealChip: { flex: 1 },
  footer: { gap: spacing.sm },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
});
