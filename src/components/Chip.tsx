import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** 앞에 붙는 이모지(문자열) 또는 아이콘 노드 */
  left?: ReactNode;
  /**
   * tab    : D3 카테고리 탭 — 기본 회색, 선택 시 연초록 배경
   * option : D4 옵션칩 — 선택 시 연초록 배경 + 초록 테두리
   * soft   : B5 예시 칩 — 연초록 바탕 + 검정 글자
   * outline: D1 카테고리 — 흰 바탕
   */
  variant?: 'tab' | 'option' | 'soft' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

const HEIGHT = { sm: 32, md: 38, lg: 46 } as const;

/** 알약형 칩 */
export function Chip({ label, selected, onPress, left, variant = 'tab', size = 'md', style, disabled }: ChipProps) {
  const bg =
    variant === 'soft'
      ? colors.primarySoft
      : selected
        ? colors.primarySoft
        : variant === 'outline'
          ? colors.surface
          : variant === 'option'
            ? colors.lineSoft
            : colors.gaugeTrack;
  const border = variant === 'option' && selected ? colors.primaryBorder : 'transparent';
  const fg = variant === 'soft' ? 'ink' : selected ? 'primaryText' : 'ink2';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { height: HEIGHT[size], backgroundColor: bg, borderColor: border, paddingHorizontal: size === 'lg' ? 18 : size === 'md' ? 16 : 12 },
        pressed && styles.pressed,
        style,
      ]}
    >
      {left != null ? (
        <View style={styles.left}>{typeof left === 'string' ? <Text style={styles.emoji}>{left}</Text> : left}</View>
      ) : null}
      <Text variant={variant === 'soft' ? 'body' : selected || size !== 'sm' ? 'bodyMedium' : 'captionMedium'} color={fg} style={variant === 'soft' ? styles.softLabel : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1 },
  left: { marginRight: spacing.sm },
  emoji: { fontSize: 18, lineHeight: 22 },
  softLabel: {},
  pressed: { opacity: 0.8 },
});
