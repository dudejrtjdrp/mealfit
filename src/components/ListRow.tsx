import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';

import { Text } from './Text';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** 아이콘 원 안 내용 (아이콘 노드 또는 이모지 문자열) */
  icon?: ReactNode;
  /** 아이콘 원 배경색 (theme.colors 값) */
  iconBg?: string;
  iconSize?: number;
  onPress?: () => void;
  chevron?: boolean;
  /** plain: F1 카드 안 줄 / filled: B6 연회색 바탕 행 */
  variant?: 'plain' | 'filled';
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** 아이콘 원 + 제목 + 부제 + chevron 행 (F1·B6) */
export function ListRow({ title, subtitle, icon, iconBg = colors.primarySoft, iconSize = 44, onPress, chevron = true, variant = 'plain', right, style }: ListRowProps) {
  const content = (
    <>
      {icon != null ? (
        <View style={[styles.icon, { width: iconSize, height: iconSize, borderRadius: iconSize / 2, backgroundColor: iconBg }]}>
          {typeof icon === 'string' ? <Text style={{ fontSize: iconSize * 0.5, lineHeight: iconSize * 0.62 }}>{icon}</Text> : icon}
        </View>
      ) : null}
      <View style={styles.body}>
        <Text variant="h3" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="ink2" numberOfLines={2} style={styles.sub}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={20} color={colors.ink2} /> : null}
    </>
  );
  const s = [styles.row, variant === 'filled' && styles.filled, style];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s, pressed && { opacity: 0.8 }]}>
      {content}
    </Pressable>
  ) : (
    <View style={s}>{content}</View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
  filled: { backgroundColor: colors.surfaceAlt, borderRadius: radius.md + 2, paddingHorizontal: spacing.md, paddingVertical: 7 },
  icon: { alignItems: 'center', justifyContent: 'center', marginRight: spacing.md + 2 },
  body: { flex: 1, marginRight: spacing.sm },
  sub: { marginTop: 1 },
});
