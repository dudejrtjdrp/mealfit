import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/state/session';
import { colors } from '@/theme';

/**
 * 온보딩 B1~B7 — 밀리와의 대화형. 단계마다 라우트(step1~7)는 그대로 두고,
 * 화면 전환은 페이드로 해서 대화가 한 줄로 이어지는 것처럼 보이게 한다 (지난 대화는 각 화면이 히스토리로 다시 그림).
 */
export default function OnboardingLayout() {
  // 온보딩 중간에서 새로고침해도 로그인 이름("성효님")을 쓰도록 세션을 불러둔다 (로그인은 온보딩 뒤라 보통은 게스트)
  useEffect(() => {
    if (useSession.getState().status === 'loading') useSession.getState().load();
  }, []);
  return <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.bg } }} />;
}
