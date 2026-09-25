import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components';
import { useProfile } from '@/state/profile';
import { useSession } from '@/state/session';
import { colors } from '@/theme';

/**
 * 진입 게이트 — 로그인은 온보딩 뒤로 (가치=첫 판정을 먼저 보여주고 계정은 그 뒤에).
 * - 온보딩을 마친 프로필이 있으면(로그인 사용자든 이 기기의 게스트든) → 오늘 탭
 * - 없으면 → B1 온보딩 (첫 화면의 "이미 계정이 있어요"로 로그인할 수 있다)
 * 세션이 없으면 getRepos() 가 로컬 저장소를 쓰므로 게스트는 이 기기에 저장된 프로필로 이어 쓴다.
 * 로그인 계정의 프로필을 못 읽으면(오프라인 등) 온보딩 대신 '다시 시도'.
 */
export default function Index() {
  const profile = useProfile((s) => s.profile);
  const failed = useProfile((s) => s.status === 'error');
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setReady(false);
    (async () => {
      // 세션을 먼저 확정해야 저장소(계정/이 기기)가 정해진다
      await useSession.getState().load();
      await useProfile.getState().load();
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (!ready) return <View style={styles.root} />;
  // 로그인한 계정의 프로필을 못 읽었다(오프라인 등) — 온보딩으로 보내면 새 프로필이 계정 것을 덮으니 다시 시도만
  if (failed) {
    return (
      <View style={[styles.root, styles.center]}>
        <EmptyState
          pose="sorry"
          title="내 정보를 불러오지 못했어요"
          description="인터넷 연결을 확인하고 다시 시도해 주세요."
          actionLabel="다시 시도"
          onAction={() => setAttempt((n) => n + 1)}
        />
      </View>
    );
  }
  if (!profile?.onboardingDone) return <Redirect href="/(onboarding)/step1" />;
  return <Redirect href="/(tabs)/today" />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { justifyContent: 'center' },
});
