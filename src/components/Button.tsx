import { FontAwesome, Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, size, spacing } from '@/theme';

import { Text } from './Text';

/**
 * primary : 그린 채움 풀폭 CTA (비활성은 회색)
 * tint    : 틴트 바탕 + 그린 글자 (보조 강조)
 * outline : 흰 바탕 + 회색 테두리 + 검정 글자 (보조)
 * ghost   : 글자만 (건너뛰기·삭제·취소)
 * kakao · apple · google · email : 로그인 버튼
 */
export type ButtonVariant = 'primary' | 'tint' | 'outline' | 'ghost' | 'kakao' | 'apple' | 'google' | 'email';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  /** 높이 (기본 54) */
  height?: number;
  style?: StyleProp<ViewStyle>;
  left?: ReactNode;
  accessibilityLabel?: string;
}

const SOCIAL: ButtonVariant[] = ['kakao', 'apple', 'google', 'email'];

/** 버튼 — radius 12, 풀폭 높이 54. 비활성은 회색 바탕 + 연회색 글자 */
export function Button({ title, onPress, variant = 'primary', loading, disabled, height = size.button, style, left, accessibilityLabel }: ButtonProps) {
  const inactive = disabled || loading;
  const social = SOCIAL.includes(variant);
  const off = disabled && !loading && variant !== 'ghost';

  const bg: Record<ButtonVariant, string> = {
    primary: colors.primary,
    tint: colors.primaryTint,
    outline: colors.surface,
    ghost: 'transparent',
    kakao: colors.kakao,
    apple: colors.apple,
    google: colors.surface,
    email: colors.surface,
  };
  const fgMap: Record<ButtonVariant, string> = {
    primary: colors.inkOnPrimary,
    tint: colors.primaryText,
    outline: colors.ink,
    ghost: colors.ink2,
    kakao: colors.kakaoInk,
    apple: colors.inkOnPrimary,
    google: colors.ink,
    email: colors.ink,
  };
  const fg = off ? colors.disabledInk : fgMap[variant];

  const icon =
    variant === 'kakao' ? (
      <Ionicons name="chatbubble" size={20} color={colors.kakaoInk} />
    ) : variant === 'apple' ? (
      <FontAwesome name="apple" size={22} color={colors.inkOnPrimary} />
    ) : variant === 'google' ? (
      <Ionicons name="logo-google" size={20} color={colors.ink} />
    ) : variant === 'email' ? (
      <Ionicons name="mail-outline" size={20} color={colors.ink2} />
    ) : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { height: variant === 'ghost' ? size.touch : height, backgroundColor: off ? colors.disabledBg : bg[variant] },
        (variant === 'outline' || variant === 'google' || variant === 'email') && !off && styles.bordered,
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : social ? (
        <>
          <View style={styles.socialIcon}>{icon}</View>
          <Text variant="h3" style={[styles.socialLabel, { color: fg }]}>
            {title}
          </Text>
          <View style={styles.socialIcon} />
        </>
      ) : (
        <View style={styles.row}>
          {left}
          <Text variant={variant === 'ghost' ? 'bodyMedium' : height >= size.button ? 'button' : 'h3'} style={{ color: fg }}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', alignSelf: 'stretch', borderRadius: radius.button, paddingHorizontal: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bordered: { borderWidth: 1, borderColor: colors.border },
  socialIcon: { width: 28, alignItems: 'center' },
  socialLabel: { flex: 1, textAlign: 'center' },
  pressed: { opacity: 0.85 },
});
