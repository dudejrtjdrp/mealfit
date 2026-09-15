import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useProfile } from '@/state/profile';
import { useSession } from '@/state/session';
import { colors } from '@/theme';

/** 진입 게이트: 세션 없음 → 로그인 / 온보딩 미완료 → B1 / 완료 → 오늘 탭 */
export default function Index() {
  const session = useSession((s) => s.session);
  const profile = useProfile((s) => s.profile);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await useSession.getState().load();
      if (s) await useProfile.getState().load();
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!session) return <Redirect href="/login" />;
  if (!profile || !profile.onboardingDone) return <Redirect href="/(onboarding)/step1" />;
  return <Redirect href="/(tabs)/today" />;
}
