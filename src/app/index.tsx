import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useProfile } from '@/state/profile';
import { useSession } from '@/state/session';
import { colors } from '@/theme';

/**
 * 진입 게이트 — 로그인은 온보딩 뒤로 (가치=첫 판정을 먼저 보여주고 계정은 그 뒤에).
 * - 온보딩을 마친 프로필이 있으면(로그인 사용자든 이 기기의 게스트든) → 오늘 탭
 * - 없으면 → B1 온보딩 (첫 화면의 "이미 계정이 있어요"로 로그인할 수 있다)
 * 세션이 없으면 getRepos() 가 로컬 저장소를 쓰므로 게스트는 이 기기에 저장된 프로필로 이어 쓴다.
 */
export default function Index() {
  const profile = useProfile((s) => s.profile);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // 세션을 먼저 확정해야 저장소(계정/이 기기)가 정해진다
      await useSession.getState().load();
      await useProfile.getState().load();
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!profile?.onboardingDone) return <Redirect href="/(onboarding)/step1" />;
  return <Redirect href="/(tabs)/today" />;
}
