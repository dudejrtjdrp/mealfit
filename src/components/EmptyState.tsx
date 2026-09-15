import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, spacing } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  /** 원 안 이모지 */
  emoji?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** 빈 상태·정보 없음·오류 공용 */
export function EmptyState({ emoji = '🌱', title, description, actionLabel, onAction, style }: EmptyStateProps) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.circle}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <Text variant="h2" align="center" style={styles.title}>
        {title}
      </Text>
      {description ? (
        <Text variant="body" color="ink2" align="center" style={styles.desc}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button title={actionLabel} variant="outline" height={48} onPress={onAction} style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  circle: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 40, lineHeight: 48 },
  title: { marginTop: spacing.lg },
  desc: { marginTop: spacing.sm },
  action: { marginTop: spacing.xl, alignSelf: 'center', paddingHorizontal: spacing.xxl },
});
