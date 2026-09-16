import { FontAwesome, Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, shadow, spacing } from '@/theme';

import { Text } from './Text';

export type ButtonVariant = 'primary' | 'cta' | 'outline' | 'kakao' | 'apple' | 'google' | 'email' | 'ghost';

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  /** 글자 오른쪽 chevron (B1 "시작하기 >", B2 "다음 >") */
  trailingChevron?: boolean;
  /** 높이 (기본 56) */
  height?: number;
  style?: StyleProp<ViewStyle>;
  left?: ReactNode;
  accessibilityLabel?: string;
}

const SOCIAL: ButtonVariant[] = ['kakao', 'apple', 'google', 'email'];

/** 주 버튼·소셜 로그인·텍스트 버튼. 시안(A2·B1·B6)처럼 알약형 라운드 */
export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  trailingChevron,
  height = 56,
  style,
  left,
  accessibilityLabel,
}: ButtonProps) {
  const inactive = disabled || loading;
  const social = SOCIAL.includes(variant);

  const bg: Record<ButtonVariant, string> = {
    primary: colors.primary,
    cta: colors.primaryDark,
    outline: colors.surface,
    kakao: colors.kakao,
    apple: colors.surface,
    google: colors.surface,
    email: colors.surface,
    ghost: 'transparent',
  };
  const fg =
    variant === 'primary' || variant === 'cta'
      ? colors.inkOnPrimary
      : variant === 'outline'
        ? colors.primaryText
        : variant === 'ghost'
          ? colors.ink2
          : variant === 'kakao'
            ? colors.kakaoInk
            : colors.ink;

  const icon =
    variant === 'kakao' ? (
      <Ionicons name="chatbubble" size={24} color={colors.kakaoInk} />
    ) : variant === 'apple' ? (
      <FontAwesome name="apple" size={26} color={colors.apple} />
    ) : variant === 'google' ? (
      <Ionicons name="logo-google" size={24} color={colors.ink} />
    ) : variant === 'email' ? (
      <Ionicons name="mail-outline" size={24} color={colors.ink2} />
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
        { height: variant === 'ghost' ? 44 : height, borderRadius: height / 2, backgroundColor: bg[variant] },
        variant === 'outline' && styles.outline,
        (variant === 'apple' || variant === 'google' || variant === 'email') && shadow.card,
        social && styles.social,
        disabled && !loading && variant !== 'ghost' && styles.disabled,
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
          <Ionicons name="chevron-forward" size={20} color={colors.ink} />
        </>
      ) : (
        <View style={styles.row}>
          {left}
          <Text variant={variant === 'ghost' ? 'bodyMedium' : 'h3'} style={{ color: fg }}>
            {title}
          </Text>
          {trailingChevron ? <Ionicons name="chevron-forward" size={20} color={fg} style={styles.chevron} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  outline: { borderWidth: 1.5, borderColor: colors.primary },
  social: { justifyContent: 'flex-start', paddingLeft: spacing.xxl, paddingRight: spacing.xxl },
  socialIcon: { width: 36, alignItems: 'center', marginRight: spacing.lg },
  socialLabel: { flex: 1 },
  chevron: { marginLeft: spacing.xs },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.85 },
});
