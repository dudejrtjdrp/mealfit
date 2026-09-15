import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { colors, type } from '@/theme';

export type TextVariant = keyof typeof type;
export type TextColor = keyof typeof colors;

export interface TextProps extends RNTextProps {
  /** theme.type 변형 (기본 body) */
  variant?: TextVariant;
  /** theme.colors 키 (기본 ink) */
  color?: TextColor;
  align?: TextStyle['textAlign'];
}

/** 앱의 모든 글자는 이 컴포넌트로 — 글꼴·크기·색은 theme 토큰에서만 */
export function Text({ variant = 'body', color = 'ink', align, style, ...rest }: TextProps) {
  return (
    <RNText
      {...rest}
      style={[type[variant], { color: colors[color] }, align ? { textAlign: align } : null, style]}
    />
  );
}
