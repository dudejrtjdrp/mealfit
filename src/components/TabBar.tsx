import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, fonts, radius, shadow, spacing } from '@/theme';

import { Text } from './Text';

type IconName = keyof typeof Ionicons.glyphMap;

const TABS: Record<string, { label: string; icon: IconName; active: IconName; circle?: boolean }> = {
  today: { label: '오늘', icon: 'home-outline', active: 'home' },
  nearby: { label: '주변', icon: 'location-outline', active: 'location', circle: true },
  log: { label: '기록', icon: 'add-circle-outline', active: 'add', circle: true },
  my: { label: '마이', icon: 'person-outline', active: 'person' },
};

/** 시안 하단 탭 — 흰 바, 상단 라운드 24, 활성은 검정(주변·기록은 검정 원) */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      {state.routes.map((route, index) => {
        const meta = TABS[route.name];
        if (!meta) return null;
        const focused = state.index === index;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={meta.label}
            onPress={onPress}
            style={styles.item}
          >
            <View style={styles.iconBox}>
              {focused && meta.circle ? (
                <View style={styles.circle}>
                  <Ionicons name={meta.active} size={meta.active === 'add' ? 22 : 17} color={colors.inkOnPrimary} />
                </View>
              ) : (
                <Ionicons name={focused ? meta.active : meta.icon} size={27} color={focused ? colors.ink : colors.ink2} />
              )}
            </View>
            <Text variant="label" style={[styles.label, { color: focused ? colors.ink : colors.ink2 }]}>
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.md,
    ...shadow.float,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
  },
  item: { flex: 1, alignItems: 'center' },
  iconBox: { height: 30, justifyContent: 'center', alignItems: 'center' },
  circle: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, lineHeight: 14, marginTop: 3, fontFamily: fonts.medium },
});
