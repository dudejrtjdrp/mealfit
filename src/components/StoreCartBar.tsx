import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatNumber } from '@/domain/summary';
import { colors, radius, size, spacing } from '@/theme';

import { RoomBar } from './Gauge';
import { Skeleton } from './Skeleton';
import { Text } from './Text';

export interface StoreCartBarProps {
  /** 오늘 더 먹을 수 있는 kcal · 채운 비율 · 넘은 kcal · 목표 — 없으면 스켈레톤 */
  room: { remaining: number; progress: number; over: number; target: number } | null;
  /** 담은 메뉴 수 (0 이면 "먹기" 숨김) */
  count: number;
  /** 담은 메뉴 kcal 합 */
  pendingKcal: number;
  onEat: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * D3 하단 고정 바 — "오늘 더 먹을 수 있는 양"(RoomBar) + 담은 메뉴가 있으면 오른쪽 위 "먹기 · N".
 * 담은 kcal 은 RoomBar pending 으로 실시간 반영된다. 아래 여백 = 안전 영역 + spacing.lg.
 */
export function StoreCartBar({ room, count, pendingKcal, onEat, style }: StoreCartBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + spacing.lg }, style]}>
      {count > 0 ? (
        <View style={styles.head}>
          <Text variant="small" color="ink3" numberOfLines={1} style={styles.flex}>
            담은 메뉴 {count}개 · {formatNumber(Math.round(pendingKcal))} kcal
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`담은 메뉴 ${count}개 먹기`}
            onPress={onEat}
            hitSlop={4}
            style={({ pressed }) => [styles.eat, pressed && styles.pressed]}
          >
            <Text variant="h3" color="primaryText">
              먹기 · {count}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.primaryText} />
          </Pressable>
        </View>
      ) : null}
      {room ? (
        <RoomBar remaining={room.remaining} progress={room.progress} over={room.over} target={room.target} pending={pendingKcal} />
      ) : (
        <Skeleton height={48} borderRadius={radius.md} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.page, paddingTop: spacing.md, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  flex: { flex: 1, minWidth: 0 },
  eat: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: size.touch - 8, paddingHorizontal: spacing.sm, marginRight: -spacing.sm, borderRadius: radius.button },
  pressed: { backgroundColor: colors.section },
});
