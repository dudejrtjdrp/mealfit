import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

export interface NoInfoStateProps {
  /** "근처 다른 매장 보기" */
  onOtherStores?: () => void;
  /** "직접 기록하기" */
  onManualLog?: () => void;
  /** 이유 한 줄 (기본: 영양표시 의무가 없는 매장) */
  reason?: string;
  style?: StyleProp<ViewStyle>;
}

/** D6 정보 없음 — 숫자를 지어내지 않고 이유 + 대안 행동 */
export function NoInfoState({ onOtherStores, onManualLog, reason = '영양표시 의무가 없는 매장이에요.\n확인된 정보만 보여드려요.', style }: NoInfoStateProps) {
  return (
    <View style={[styles.wrap, style]} accessibilityRole="summary">
      <View style={styles.outer}>
        <View style={styles.inner}>
          <Ionicons name="information" size={44} color={colors.coverNone} />
        </View>
      </View>
      <Text variant="h2" align="center" style={styles.title}>
        아직 추가되지 않은 정보입니다
      </Text>
      <Text variant="body" color="ink2" align="center" style={styles.desc}>
        {reason}
      </Text>
      <View style={styles.actions}>
        {onOtherStores ? <Button title="근처 다른 매장 보기" height={52} onPress={onOtherStores} /> : null}
        {onManualLog ? <Button title="직접 기록하기" variant="outline" height={52} onPress={onManualLog} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.lg },
  outer: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.coverNoneBg, alignItems: 'center', justifyContent: 'center' },
  inner: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colors.coverNone, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: spacing.xl },
  desc: { marginTop: spacing.sm },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.xxl },
});
