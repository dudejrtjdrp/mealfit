import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { ChevronRightIcon } from './icons';
import { Text } from './Text';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** 아이콘 원 안 내용 (아이콘 노드) */
  icon?: ReactNode;
  /** 아이콘 원 배경색 (기본 헤어라인 회색) */
  iconBg?: string;
  iconSize?: number;
  onPress?: () => void;
  chevron?: boolean;
  /** plain: 카드 안 줄 / filled: 섹션 배경 행 */
  variant?: 'plain' | 'filled';
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** 아이콘 원 + 제목 + 부제 + chevron 행 (F1·F4·B6) */
export function ListRow({ title, subtitle, icon, iconBg = colors.line, iconSize = 40, onPress, chevron = true, variant = 'plain', right, style }: ListRowProps) {
  const content = (
    <>
      {icon != null ? <View style={[styles.icon, { width: iconSize, height: iconSize, borderRadius: iconSize / 2, backgroundColor: iconBg }]}>{icon}</View> : null}
      <View style={styles.body}>
        <Text variant="h3" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="ink3" numberOfLines={2} style={styles.sub}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <ChevronRightIcon size={18} color={colors.ink3} /> : null}
    </>
  );
  const s = [styles.row, variant === 'filled' && styles.filled, style];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.7 }]}>
      {content}
    </Pressable>
  ) : (
    <View style={s}>{content}</View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, minHeight: 56 },
  filled: { backgroundColor: colors.section, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  icon: { alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  body: { flex: 1, marginRight: spacing.sm },
  sub: { marginTop: 2 },
});
