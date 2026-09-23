import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts, radius } from '@/theme';

import { SproutIcon } from './icons';
import { Text } from './Text';

/** 앱 표시 이름 — app.json expo.name 과 같게 유지 (slug·scheme 은 mealfit 그대로) */
export const APP_NAME = 'mealing';

/** "mealing" 워드마크 — 그린 소문자 Bold 텍스트 */
export function Wordmark({ size = 20, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style} accessibilityRole="header" accessibilityLabel={APP_NAME}>
      <Text style={[styles.word, { fontSize: size, lineHeight: Math.round(size * 1.2), letterSpacing: -size * 0.02 }]}>{APP_NAME}</Text>
    </View>
  );
}

/**
 * 로고 심볼 자리 — 틴트 라운드 사각 + 새싹 스트로크 플레이스홀더.
 * 로고 이미지(ChatGPT 제작 예정)가 assets/brand/logo.png 로 들어오면
 * 이 컴포넌트 안을 <Image source={require('@/assets/brand/logo.png')} /> 로 바꾸면 된다 (require 는 파일이 생긴 뒤에).
 */
export function LogoMark({ size = 56, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessibilityLabel="mealing 로고 자리" style={[styles.mark, { width: size, height: size, borderRadius: Math.round(size * 0.28) }, style]}>
      <SproutIcon size={Math.round(size * 0.56)} color={colors.primaryText} />
    </View>
  );
}

const styles = StyleSheet.create({
  word: { fontFamily: fonts.bold, color: colors.primary },
  mark: { backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg },
});
