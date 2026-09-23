import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, fonts } from '@/theme';

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

/** 로고 심볼 — 크림 라운드 사각 안 그릇·새싹 (assets/brand/logo.png) */
export function LogoMark({ size = 56, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Image
      accessibilityLabel="mealing 로고"
      source={require('@/assets/brand/logo.png')}
      style={[{ width: size, height: size }, style as never]}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  word: { fontFamily: fonts.bold, color: colors.primary },
});
