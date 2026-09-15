import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, shadow, spacing } from '@/theme';

export interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 안쪽 여백 (기본 18) */
  padding?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** 흰 카드 — radius 20, 그림자 theme.shadow.card */
export function Card({ children, style, padding = 18, onPress, accessibilityLabel }: CardProps) {
  const s = [styles.card, { padding }, style];
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
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.card },
  pressed: { opacity: 0.9 },
});

export const cardGap = spacing.md;
