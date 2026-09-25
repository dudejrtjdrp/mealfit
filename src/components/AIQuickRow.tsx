import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, size, spacing } from '@/theme';

import { Text } from './Text';

const ITEMS = [
  { mode: 'photo', icon: 'camera-outline', label: '사진으로' },
  { mode: 'voice', icon: 'mic-outline', label: '말로' },
  { mode: 'text', icon: 'create-outline', label: '글로' },
] as const;

/**
 * 먹은 걸 바로 알려주기 — [사진으로 · 말로 · 글로] (E4 AI로 기록). 오늘 탭·기록 탭 공통.
 * date 를 주면 그날로 기록한다 (기록 탭에서 고른 지난 날).
 */
export function AIQuickRow({ date, style }: { date?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.row, style]}>
      {ITEMS.map((it) => (
        <Pressable
          key={it.mode}
          accessibilityRole="button"
          accessibilityLabel={`${it.label} 기록하기`}
          onPress={() => router.push({ pathname: '/log/ai', params: date ? { mode: it.mode, date } : { mode: it.mode } })}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
        >
          <Ionicons name={it.icon} size={18} color={colors.primaryText} />
          <Text variant="captionMedium" color="primaryText">
            {it.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs, marginBottom: spacing.sm },
  btn: { flex: 1, minHeight: size.touch, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: colors.primaryTint },
  pressed: { opacity: 0.7 },
});
