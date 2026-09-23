import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { spacing } from '@/theme';

import { Button } from './Button';
import { MillyAvatar, type MillyPose } from './MillyAvatar';
import { Text } from './Text';

export interface EmptyStateProps {
  /** 밀리 포즈 — 빈 상태 base/sleep, 오류 sorry (기본 base) */
  pose?: MillyPose;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** 빈 상태·오류 공용 — 밀리 + 제목 + 설명 + 보조 버튼 */
export function EmptyState({ pose = 'base', title, description, actionLabel, onAction, style }: EmptyStateProps) {
  return (
    <View style={[styles.wrap, style]}>
      <MillyAvatar pose={pose} size={72} />
      <Text variant="h3" align="center" style={styles.title}>
        {title}
      </Text>
      {description ? (
        <Text variant="caption" color="ink3" align="center" style={styles.desc}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? <Button title={actionLabel} variant="outline" height={44} onPress={onAction} style={styles.action} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  title: { marginTop: spacing.lg },
  desc: { marginTop: spacing.xs },
  action: { marginTop: spacing.lg, alignSelf: 'center', paddingHorizontal: spacing.xl },
});
