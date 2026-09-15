import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, KcalRing, NutrientBar, OnboardingHeader, Screen, Skeleton, Text, showToast, type NutrientKey } from '@/components';
import { useOnboarding } from '@/state/onboarding';
import { useProfile } from '@/state/profile';
import { useSession } from '@/state/session';
import { colors, radius, spacing } from '@/theme';

type Perm = 'idle' | 'asking' | 'granted' | 'denied' | 'later';
const BAR_KEYS: NutrientKey[] = ['carbs', 'protein', 'fat', 'sugar', 'sodium'];

/** B7 오늘 목표량 첫 소개 + 위치 권한 프라이밍 */
export default function Step7() {
  const draft = useOnboarding((s) => s.draft);
  const nickname = useSession((s) => s.session?.nickname);
  const { targets, completeOnboarding } = useProfile();
  const [done, setDone] = useState(false);
  const [perm, setPerm] = useState<Perm>('idle');

  useEffect(() => {
    let alive = true;
    (async () => {
      const { saved } = await completeOnboarding(draft, nickname);
      if (!saved) console.warn('[B7] 프로필 저장 실패 — 이번 실행 동안 메모리로 유지');
      if (alive) setDone(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const askLocation = async () => {
    setPerm('asking');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPerm(status === 'granted' ? 'granted' : 'denied');
      if (status === 'granted') showToast('위치를 허용했어요');
    } catch {
      setPerm('denied');
    }
  };

  const start = () => {
    useOnboarding.getState().reset();
    router.replace('/(tabs)/today');
  };

  // 강조 영양소 순서대로 바 3개 (emphasis에 kcal이 있으면 링이 대신하므로 제외)
  const bars = targets ? (targets.emphasis.filter((k) => k !== 'kcal') as NutrientKey[]).filter((k) => BAR_KEYS.includes(k)).slice(0, 3) : [];

  return (
    <Screen scroll header={<OnboardingHeader step={7} layout="stacked" />} footer={<Button title="시작하기" trailingChevron disabled={!done} onPress={start} />}>
      <Text variant="display" style={styles.title}>
        오늘 이만큼{'\n'}드실 수 있어요
      </Text>
      <Text variant="body" color="ink2" style={styles.sub}>
        알려주신 정보로 계산한 하루 목표량이에요.{'\n'}먹을 때마다 여유분이 줄어드는 걸 보여드려요.
      </Text>

      <Card padding={20} style={styles.card}>
        {!done ? (
          <View style={styles.skel}>
            <Skeleton width={150} height={150} borderRadius={75} />
            <View style={styles.skelBars}>
              <Skeleton height={14} />
              <Skeleton height={14} />
              <Skeleton height={14} />
            </View>
          </View>
        ) : targets ? (
          <>
            <KcalRing value={targets.kcal} progress={1} size={160} />
            <Text variant="bodyMedium" color="ink2" align="center" style={styles.ringCaption}>
              하루 목표 칼로리
            </Text>
            <View style={styles.bars}>
              {bars.map((k) => (
                <NutrientBar key={k} nutrient={k} max={targets[k]} />
              ))}
            </View>
          </>
        ) : (
          <EmptyState emoji="🧮" title="목표량을 아직 계산하지 못했어요" description="오늘 탭에서 다시 계산해 보여드릴게요." style={styles.empty} />
        )}
      </Card>

      <Card padding={18} style={styles.permCard}>
        <View style={styles.permRow}>
          <View style={styles.permIcon}>
            <Ionicons name="location" size={22} color={colors.primary} />
          </View>
          <View style={styles.permBody}>
            <Text variant="h3">주변 매장을 찾으려면 위치가 필요해요</Text>
            <Text variant="caption" color="ink2" style={styles.permSub}>
              {perm === 'granted'
                ? '허용했어요. 주변 탭에서 가까운 매장부터 보여드려요.'
                : perm === 'denied'
                  ? '괜찮아요. 주변 탭에서 언제든 다시 허용할 수 있어요.'
                  : perm === 'later'
                    ? '나중에 주변 탭에서 허용할 수 있어요.'
                    : '현재 위치 근처 매장의 메뉴를 먼저 판정해 보여드려요.'}
            </Text>
          </View>
        </View>
        {perm === 'idle' || perm === 'asking' ? (
          <View style={styles.permActions}>
            <Button title="나중에" variant="ghost" onPress={() => setPerm('later')} style={styles.permBtn} />
            <Button title="허용하기" height={44} loading={perm === 'asking'} onPress={askLocation} style={styles.permBtn} />
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.xxxl, fontSize: 30, lineHeight: 40 },
  sub: { marginTop: spacing.xs, fontSize: 16, lineHeight: 23 },
  card: { marginTop: spacing.xxl, alignItems: 'stretch' },
  ringCaption: { marginTop: spacing.sm },
  bars: { marginTop: spacing.xl, gap: spacing.lg },
  skel: { alignItems: 'center', gap: spacing.xl },
  skelBars: { alignSelf: 'stretch', gap: spacing.md },
  empty: { paddingVertical: spacing.lg },
  permCard: { marginTop: spacing.md, backgroundColor: colors.primarySofter, borderRadius: radius.lg },
  permRow: { flexDirection: 'row', alignItems: 'center' },
  permIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  permBody: { flex: 1 },
  permSub: { marginTop: 2 },
  permActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  permBtn: { flex: 1 },
});
