import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { Text } from './Text';

export interface SelectCardProps {
  title: string;
  description?: string;
  selected?: boolean;
  onPress?: () => void;
  /** 아이콘 렌더 함수 — 선택 상태에 맞는 색을 받는다 */
  icon?: (color: string) => ReactNode;
  /**
   * tile : 성별 — 가로 타일, 아이콘+글자
   * row  : 활동량 — 세로 리스트, 제목+설명+우측 체크
   * grid : 목적 — 2열 카드, 위 아이콘 아래 제목
   */
  layout?: 'tile' | 'row' | 'grid';
  style?: StyleProp<ViewStyle>;
}

/** 단일/복수 선택 카드 (F2 신체 정보·목표) — 선택 시 틴트 바탕 + 그린 테두리 */
export function SelectCard({ title, description, selected, onPress, icon, layout = 'row', style }: SelectCardProps) {
  const accent = selected ? colors.primaryText : colors.ink2;
  const frame = [styles.base, selected ? styles.selected : styles.unselected];

  if (layout === 'tile') {
    return (
      <Pressable accessibilityRole="radio" accessibilityState={{ selected: !!selected }} onPress={onPress} style={[frame, styles.tile, style]}>
        {icon?.(accent)}
        <Text variant="h3" style={{ color: selected ? colors.primaryText : colors.ink, marginLeft: spacing.sm }}>
          {title}
        </Text>
      </Pressable>
    );
  }

  if (layout === 'grid') {
    return (
      <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={onPress} style={[frame, styles.grid, style]}>
        {icon ? <View style={[styles.iconCircle, { backgroundColor: selected ? colors.surface : colors.line }]}>{icon(accent)}</View> : null}
        <Text variant="h3" style={{ color: selected ? colors.primaryText : colors.ink, marginTop: spacing.md }}>
          {title}
        </Text>
        {description ? (
          <Text variant="small" color="ink3" style={{ marginTop: 2 }}>
            {description}
          </Text>
        ) : null}
        {selected ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} style={styles.gridCheck} /> : null}
      </Pressable>
    );
  }

  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected: !!selected }} onPress={onPress} style={[frame, styles.row, style]}>
      {icon ? <View style={[styles.iconCircle, { backgroundColor: selected ? colors.surface : colors.line }]}>{icon(accent)}</View> : null}
      <View style={[styles.rowBody, !icon && { marginLeft: 0 }]}>
        <Text variant="h3" style={{ color: selected ? colors.primaryText : colors.ink }}>
          {title}
        </Text>
        {description ? (
          <Text variant="caption" color="ink3" style={{ marginTop: 2 }}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Ionicons name="checkmark" size={14} color={colors.inkOnPrimary} /> : null}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.lg },
  selected: { backgroundColor: colors.primaryTint, borderWidth: 1.5, borderColor: colors.primary },
  unselected: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tile: { flex: 1, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  grid: { flex: 1, padding: spacing.lg, minHeight: 112 },
  gridCheck: { position: 'absolute', top: 12, right: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: spacing.lg },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, marginLeft: spacing.md, marginRight: spacing.md },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
