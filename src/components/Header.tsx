import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, hit, size as sizes, spacing } from '@/theme';

import { BackIcon } from './icons';
import { Text } from './Text';

type IconName = keyof typeof Ionicons.glyphMap;

/** 아이콘 버튼 (헤더 우측 공유·하트·톱니) — 44×44 터치 영역, 회색 아이콘 */
export function IconButton({
  name,
  icon,
  onPress,
  label,
  size = 24,
  color = colors.ink2,
  style,
}: {
  name?: IconName;
  /** SVG 아이콘 노드 (name 대신) */
  icon?: ReactNode;
  onPress?: () => void;
  label: string;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={hit} onPress={onPress} style={({ pressed }) => [styles.icon, pressed && { opacity: 0.6 }, style]}>
      {icon ?? (name ? <Ionicons name={name} size={size} color={color} /> : null)}
    </Pressable>
  );
}

/**
 * 스택 화면 상단 (높이 56): 뒤로 + 제목(왼쪽 정렬, 17 Bold) + 우측 슬롯.
 * 화면 좌우 여백 20 안에 놓이며, 뒤로 버튼은 터치 영역만큼 왼쪽으로 당겨 시안(8px)과 맞춘다.
 */
export function StackHeader({ title, right, onBack, align = 'left', style }: { title?: string; right?: ReactNode; onBack?: () => void; align?: 'left' | 'center'; style?: StyleProp<ViewStyle> }) {
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/today')));
  return (
    <View style={[styles.row, style]}>
      <IconButton icon={<BackIcon size={24} color={colors.ink} />} label="뒤로 가기" onPress={back} style={styles.back} />
      <View style={[styles.center, align === 'center' && styles.centered]}>
        {title ? (
          <Text variant="h2" numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: sizes.header, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  back: { marginLeft: -12 },
  center: { flex: 1 },
  centered: { alignItems: 'center' },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minWidth: 32, justifyContent: 'flex-end', flexShrink: 0 },
  icon: { width: sizes.touch, height: sizes.touch, alignItems: 'center', justifyContent: 'center' },
});
