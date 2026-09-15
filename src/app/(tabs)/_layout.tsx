import { Tabs } from 'expo-router';

import { TabBar } from '@/components';
import { colors } from '@/theme';

/** 하단 탭 4개: 오늘 · 주변 · 기록 · 마이 — 시안 탭바(TabBar) 사용 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="today" options={{ title: '오늘' }} />
      <Tabs.Screen name="nearby" options={{ title: '주변' }} />
      <Tabs.Screen name="log" options={{ title: '기록' }} />
      <Tabs.Screen name="my" options={{ title: '마이' }} />
    </Tabs>
  );
}
