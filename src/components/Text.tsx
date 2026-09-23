import { Platform, Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

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

/** 한국어 줄바꿈을 어절 단위로 (웹 keep-all · iOS hangul-word) — "되\n세요" 처럼 끊기지 않게 */
const KEEP_ALL = Platform.OS === 'web' ? ({ wordBreak: 'keep-all' } as unknown as TextStyle) : null;

/** 앱의 모든 글자는 이 컴포넌트로 — 글꼴·크기·색은 theme 토큰에서만 */
export function Text({ variant = 'body', color = 'ink', align, style, ...rest }: TextProps) {
  return (
    <RNText
      lineBreakStrategyIOS="hangul-word"
      {...rest}
      style={[type[variant], { color: colors[color] }, KEEP_ALL, align ? { textAlign: align } : null, style]}
    />
  );
}
