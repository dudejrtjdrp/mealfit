import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/theme';

import { Text } from './Text';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** 하단 고정 영역 */
  footer?: ReactNode;
}

/** Modal 기반 바텀시트 — 상단 핸들, 바깥 탭하면 닫힘 */
export function BottomSheet({ visible, onClose, title, subtitle, children, footer }: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} accessibilityLabel="닫기" onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          {title ? (
            <Text variant="h2" style={styles.title}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text variant="body" color="ink2" style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(30, 36, 48, 0.4)' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.page, maxHeight: '88%' },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: radius.pill, backgroundColor: colors.line, marginTop: 10, marginBottom: spacing.lg },
  title: {},
  subtitle: { marginTop: spacing.xs },
  scroll: { marginTop: spacing.lg, flexGrow: 0 },
  footer: { marginTop: spacing.lg },
});
