import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';

export interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 안쪽 여백 (기본 20) */
  padding?: number;
  /**
   * plain   : 흰 바탕 + 헤어라인 테두리 (기본)
   * section : 섹션 배경색(#F7F8FA), 테두리 없음
   * tint    : 그린 틴트 바탕 (여유분 미니카드 등)
   */
  tone?: 'plain' | 'section' | 'tint';
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** 카드 — radius 20, 그림자 없이 헤어라인·배경색 차이로 구획 */
export function Card({ children, style, padding = 20, tone = 'plain', onPress, accessibilityLabel }: CardProps) {
  const s = [styles.card, styles[tone], { padding }, style];
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [s, pressed && styles.pressed]}>
        {children}
      </Pressable>
    );
  }
  return <View style={s}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card },
  plain: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  section: { backgroundColor: colors.section },
  tint: { backgroundColor: colors.primaryTint },
  pressed: { opacity: 0.9 },
});

export const cardGap = spacing.lg;
