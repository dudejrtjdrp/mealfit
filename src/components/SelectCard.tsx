import type { ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, shadow, spacing } from '@/theme';

import { Text } from './Text';

export interface SelectCardProps {
  title: string;
  description?: string;
  selected?: boolean;
  onPress?: () => void;
  /** 아이콘 렌더 함수 — 선택 상태에 맞는 색을 받는다 */
  icon?: (color: string) => ReactNode;
  /**
   * tile : B2 성별 — 회색/연초록 바탕 타일, 아이콘+글자 가로 배치
   * row  : B3 활동량 — 흰 카드 세로 리스트, 제목+설명+우측 체크
   * grid : B4 목적 — 흰 카드 2열, 위 아이콘 아래 제목
   */
  layout?: 'tile' | 'row' | 'grid';
  style?: StyleProp<ViewStyle>;
}

/** 단일/복수 선택 카드 (B2·B3·B4 공용) */
export function SelectCard({ title, description, selected, onPress, icon, layout = 'row', style }: SelectCardProps) {
  const accent = selected ? colors.primaryText : colors.ink2;

  if (layout === 'tile') {
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: !!selected }}
        onPress={onPress}
        style={[styles.tile, { backgroundColor: selected ? colors.primarySoft : colors.lineSoft }, style]}
      >
        {icon?.(accent)}
        <Text variant="h3" style={{ color: accent, marginLeft: spacing.lg }}>
          {title}
        </Text>
      </Pressable>
    );
  }

  if (layout === 'grid') {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: !!selected }}
        onPress={onPress}
        style={[styles.grid, selected ? styles.selected : styles.unselected, style]}
      >
        <View style={[styles.iconCircle, { backgroundColor: selected ? colors.surface : colors.primarySofter }]}>{icon?.(selected ? colors.primaryText : colors.primary)}</View>
        <Text variant="h3" style={{ color: selected ? colors.primaryText : colors.ink, marginTop: spacing.md }}>
          {title}
        </Text>
        {description ? (
          <Text variant="caption" color="ink2" style={{ marginTop: 2 }}>
            {description}
          </Text>
        ) : null}
        {selected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} style={styles.gridCheck} /> : null}
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.row, selected ? styles.selected : styles.unselected, style]}
    >
      {icon ? <View style={[styles.iconCircle, { backgroundColor: selected ? colors.surface : colors.primarySofter }]}>{icon(selected ? colors.primaryText : colors.primary)}</View> : null}
      <View style={styles.rowBody}>
        <Text variant="h3" style={{ color: selected ? colors.primaryText : colors.ink }}>
          {title}
        </Text>
        {description ? (
          <Text variant="caption" color="ink2" style={{ marginTop: 2 }}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Ionicons name="checkmark" size={16} color={colors.inkOnPrimary} /> : null}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { flex: 1, height: 64, borderRadius: radius.md + 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  grid: { flex: 1, borderRadius: radius.lg, padding: spacing.lg, minHeight: 118, borderWidth: 1.5 },
  gridCheck: { position: 'absolute', top: 12, right: 12 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, paddingVertical: 16, paddingHorizontal: 18, borderWidth: 1.5 },
  selected: { backgroundColor: colors.primarySofter, borderColor: colors.primaryBorder },
  unselected: { backgroundColor: colors.surface, borderColor: colors.surface, ...shadow.card },
  iconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, marginLeft: spacing.md, marginRight: spacing.md },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
