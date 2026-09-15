import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, hit, spacing } from '@/theme';

import { Text } from './Text';

type IconName = keyof typeof Ionicons.glyphMap;

/** 아이콘 버튼 (헤더 우측 검색·하트·공유·톱니) */
export function IconButton({ name, onPress, label, size = 26, color = colors.ink, style }: { name: IconName; onPress?: () => void; label: string; size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={hit} onPress={onPress} style={({ pressed }) => [styles.icon, pressed && { opacity: 0.6 }, style]}>
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

/** 스택 화면 상단: 뒤로가기 + (가운데 제목) + 우측 아이콘들 */
export function StackHeader({ title, right, onBack, style }: { title?: string; right?: ReactNode; onBack?: () => void; style?: StyleProp<ViewStyle> }) {
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/today')));
  return (
    <View style={[styles.row, style]}>
      <IconButton name="chevron-back" label="뒤로 가기" size={28} onPress={back} style={styles.back} />
      <View style={styles.center}>
        {title ? (
          <Text variant="h3" numberOfLines={1}>
            {title}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { height: 52, flexDirection: 'row', alignItems: 'center' },
  back: { marginLeft: -6 },
  center: { flex: 1, alignItems: 'center' },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, minWidth: 32, justifyContent: 'flex-end' },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
