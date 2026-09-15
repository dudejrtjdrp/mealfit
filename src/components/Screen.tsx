import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

export interface ScreenProps {
  children: ReactNode;
  /** 내용 스크롤 여부 */
  scroll?: boolean;
  /** 하단 고정 영역(주 버튼 등) — 스크롤 밖에 붙는다 */
  footer?: ReactNode;
  /** 좌우 padding 20 적용 (기본 true) */
  padded?: boolean;
  edges?: Edge[];
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** 헤더처럼 스크롤 위에 고정할 영역 */
  header?: ReactNode;
}

/** 페이지 틀: SafeArea + 배경색 + 좌우 여백 20 */
export function Screen({ children, scroll, footer, padded = true, edges = ['top', 'bottom'], style, contentStyle, header }: ScreenProps) {
  const pad = padded ? { paddingHorizontal: spacing.page } : null;
  return (
    <SafeAreaView edges={edges} style={[styles.root, style]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {header ? <View style={pad}>{header}</View> : null}
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[pad, styles.scrollContent, contentStyle]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, pad, contentStyle]}>{children}</View>
        )}
        {footer ? <View style={[pad, styles.footer]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: spacing.xxl },
  footer: { paddingTop: spacing.sm, paddingBottom: spacing.sm },
});
