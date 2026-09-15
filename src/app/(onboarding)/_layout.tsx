import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/state/session';
import { colors } from '@/theme';

export default function OnboardingLayout() {
  // 온보딩 중간에서 새로고침해도 닉네임(B6 "지은님만의")을 쓰도록 세션을 불러둔다
  useEffect(() => {
    if (useSession.getState().status === 'loading') useSession.getState().load();
  }, []);
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
