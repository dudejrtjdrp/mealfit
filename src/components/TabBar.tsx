import type { BottomTabBarProps } from 'expo-router/tabs';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, fonts } from '@/theme';

import { BowlIcon, CalendarIcon, PersonIcon, PinIcon } from './icons';
import { Text } from './Text';

const TABS: Record<string, { label: string; icon: (color: string) => ReactNode }> = {
  today: { label: '오늘', icon: (c) => <BowlIcon color={c} /> },
  nearby: { label: '주변', icon: (c) => <PinIcon color={c} /> },
  log: { label: '기록', icon: (c) => <CalendarIcon color={c} /> },
  my: { label: '마이', icon: (c) => <PersonIcon color={c} /> },
};

/** 하단 탭 — 흰 바, 상단 헤어라인, 활성은 그린(#0E8A4D) · 비활성 회색 */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const meta = TABS[route.name];
        if (!meta) return null;
        const focused = state.index === index;
        const color = focused ? colors.primaryText : colors.ink3;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={meta.label} onPress={onPress} style={styles.item}>
            {meta.icon(color)}
            <Text variant="small" style={[styles.label, { color, fontFamily: focused ? fonts.semibold : fonts.medium }]}>
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  item: { flex: 1, height: 64, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { fontSize: 11, lineHeight: 13 },
});
