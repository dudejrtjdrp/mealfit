import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius, spacing } from '@/theme';

import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** 앞에 붙는 아이콘 노드 (이모지 문자열은 쓰지 않는다) */
  left?: ReactNode;
  /**
   * filter : D1·D3 카테고리 — 선택 시 그린 채움 + 흰 글자, 기본 흰 바탕 + 회색 테두리
   * option : D4 옵션·끼니·선택지 — 선택 시 틴트 바탕 + 그린 테두리 + 그린 글자
   * soft   : 예시 칩 — 섹션 배경 + 검정 글자 (선택 개념 없음)
   */
  variant?: 'filter' | 'option' | 'soft' | LegacyChipVariant;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

/** @deprecated 리스타일 전 이름 — filter 와 같다 */
type LegacyChipVariant = 'tab' | 'outline';

const HEIGHT = { sm: 32, md: 36, lg: 44 } as const;

/** 알약형 칩 */
export function Chip({ label, selected, onPress, left, variant: v = 'filter', size = 'md', style, disabled }: ChipProps) {
  const variant = v === 'tab' || v === 'outline' ? 'filter' : v;
  let bg: string = colors.surface;
  let border: string = colors.border;
  let fg: 'ink' | 'ink2' | 'primaryText' | 'inkOnPrimary' = 'ink2';
  if (variant === 'soft') {
    bg = colors.section;
    border = colors.section;
    fg = 'ink';
  } else if (variant === 'filter' && selected) {
    bg = colors.primary;
    border = colors.primary;
    fg = 'inkOnPrimary';
  } else if (variant === 'option' && selected) {
    bg = colors.primaryTint;
    border = colors.primary;
    fg = 'primaryText';
  } else if (variant === 'option') {
    fg = 'ink';
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          height: HEIGHT[size],
          backgroundColor: bg,
          borderColor: border,
          borderWidth: variant === 'option' && selected ? 1.5 : 1,
          paddingHorizontal: size === 'lg' ? 18 : size === 'md' ? 16 : 12,
        },
        pressed && styles.pressed,
        style,
      ]}
    >
      {left != null ? <View style={styles.left}>{left}</View> : null}
      <Text variant={size === 'sm' ? 'captionMedium' : 'bodyMedium'} color={fg} style={[size !== 'sm' && styles.label, selected && variant !== 'soft' && styles.selected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  left: { marginRight: spacing.xs + 2 },
  label: { fontSize: 14, lineHeight: 20 },
  selected: { fontFamily: fonts.semibold },
  pressed: { opacity: 0.8 },
});
