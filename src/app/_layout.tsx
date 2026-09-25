import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Component, type ReactNode } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';

import { ToastHost } from '@/components';
import { prewarmCatalog } from '@/data';
import { addReminderTapListener, initNotifications, syncMealReminders } from '@/services/notifications';
import { useBootstrap } from '@/state/bootstrap';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
// 앱을 보고 있을 때 온 식사 알림도 배너로 (웹은 아무 일도 안 함)
initNotifications();

/**
 * 시작 중 JS 에러가 나면 스플래시가 영영 안 사라져 "베이지 화면 멈춤"이 된다 (2026-09-23 TestFlight 사고).
 * 어떤 에러든 스플래시를 내리고 메시지를 보여주는 최후 방어선. (theme 의존 최소화를 위해 RN Text 사용)
 */
class StartupErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch() {
    SplashScreen.hideAsync().catch(() => {});
  }

  render() {
    if (this.state.error) {
      return (
        <View style={bStyles.wrap}>
          <RNText style={bStyles.title}>앗, 문제가 생겼어요</RNText>
          <RNText style={bStyles.body}>앱을 완전히 종료했다가 다시 열어주세요.</RNText>
          <RNText style={bStyles.detail} numberOfLines={6}>
            {String(this.state.error?.message ?? this.state.error)}
          </RNText>
        </View>
      );
    }
    return this.props.children;
  }
}

const bStyles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', padding: 24, gap: 10 },
  title: { fontSize: 20, fontWeight: '700', color: '#191F28' },
  body: { fontSize: 15, color: '#4E5968', textAlign: 'center' },
  detail: { fontSize: 12, color: '#8B95A1', textAlign: 'center', marginTop: 8 },
});

export default function RootLayout() {
  const [loaded] = useFonts({
    'Pretendard-Regular': require('@/assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('@/assets/fonts/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('@/assets/fonts/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('@/assets/fonts/Pretendard-Bold.otf'),
  });

  useBootstrap();

  useEffect(() => {
    if (!loaded) return;
    SplashScreen.hideAsync().catch(() => {});
    // 메뉴 카탈로그(식약처 4.2MB·1만여 메뉴)는 첫 화면이 뜬 뒤 한가할 때 미리 만든다 — 시작 렌더를 막지 않게
    prewarmCatalog();
    // 식사 시간 알림: 저장된 설정대로 다시 걸고, 앱이 떠 있을 때 알림을 누르면 오늘(홈) 탭으로 (웹은 no-op)
    void syncMealReminders();
    return addReminderTapListener((route) => {
      try {
        if (router.canDismiss()) router.dismissAll();
        router.navigate(route);
      } catch {
        // 내비게이션이 아직 준비되지 않았으면 진입 게이트가 오늘 탭으로 보낸다
      }
    });
  }, [loaded]);

  if (!loaded) return null;

  return (
    <StartupErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(onboarding)" />
          <Stack.Screen name="login" />
          <Stack.Screen name="store/[id]" />
          <Stack.Screen name="menu/[id]" />
          <Stack.Screen name="log/add" options={{ presentation: 'modal' }} />
          {/* 지도 핀을 끌 때 시트가 같이 내려가지 않게 스와이프 닫기는 끈다 (닫기 버튼으로 닫는다) */}
          <Stack.Screen name="nearby/location" options={{ presentation: 'modal', gestureEnabled: false }} />
          <Stack.Screen name="my/body" />
          <Stack.Screen name="my/goal" />
          <Stack.Screen name="my/diet" />
          <Stack.Screen name="my/settings" />
          <Stack.Screen name="my/premium" />
        </Stack>
        <ToastHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </StartupErrorBoundary>
  );
}
