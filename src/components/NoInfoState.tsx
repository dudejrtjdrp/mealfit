import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { spacing } from '@/theme';

import { Button } from './Button';
import { MillyAvatar } from './MillyAvatar';
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
      <MillyAvatar pose="sorry" size={80} />
      <Text variant="h2" align="center" style={styles.title}>
        아직 추가되지 않은 정보입니다
      </Text>
      <Text variant="caption" color="ink2" align="center" style={styles.desc}>
        {reason}
      </Text>
      <View style={styles.actions}>
        {onOtherStores ? <Button title="근처 다른 매장 보기" onPress={onOtherStores} /> : null}
        {onManualLog ? <Button title="직접 기록하기" variant="outline" onPress={onManualLog} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xs },
  title: { marginTop: spacing.xl },
  desc: { marginTop: spacing.sm },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.xxl },
});
