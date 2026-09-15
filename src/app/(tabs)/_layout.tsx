import { Tabs } from 'expo-router';

import { colors, fonts } from '@/theme';

/** 하단 탭 4개: 오늘 · 주변 · 기록 · 마이 (아이콘·스타일은 시안 기준으로 교체 예정) */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.ink3,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="today" options={{ title: '오늘' }} />
      <Tabs.Screen name="nearby" options={{ title: '주변' }} />
      <Tabs.Screen name="log" options={{ title: '기록' }} />
      <Tabs.Screen name="my" options={{ title: '마이' }} />
    </Tabs>
  );
}
