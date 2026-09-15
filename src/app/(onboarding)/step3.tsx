import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, OnboardingHeader, Screen, SelectCard, Text } from '@/components';
import type { ActivityLevel } from '@/domain/types';
import { useOnboarding } from '@/state/onboarding';
import { spacing } from '@/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const LEVELS: { level: ActivityLevel; title: string; description: string; icon: IconName }[] = [
  { level: 1, title: '거의 앉아 있음', description: '대부분 앉아서 지내고 운동은 거의 안 해요.', icon: 'seat-outline' },
  { level: 2, title: '가벼운 활동', description: '주 1~3회 가볍게 걷거나 운동해요.', icon: 'walk' },
  { level: 3, title: '보통', description: '주 3~5회 운동하거나 자주 움직여요.', icon: 'bike' },
  { level: 4, title: '활발', description: '주 6~7회 운동하거나 몸 쓰는 일을 해요.', icon: 'run' },
  { level: 5, title: '매우 활발', description: '하루 두 번 운동하거나 강도 높은 일을 해요.', icon: 'weight-lifter' },
];

/** B3 활동량 (시안 없음 — B2·B5 톤 적용) */
export default function Step3() {
  const { draft, set } = useOnboarding();
  return (
    <Screen
      scroll
      header={<OnboardingHeader step={3} layout="stacked" />}
      footer={<Button title="다음" disabled={!draft.activity} onPress={() => router.push('/(onboarding)/step4')} />}
    >
      <Text variant="display" style={styles.title}>
        평소 활동량은{'\n'}어느 정도인가요?
      </Text>
      <Text variant="body" color="ink2" style={styles.sub}>
        하루 필요한 에너지를 계산하는 데 써요.
      </Text>
      <View style={styles.list}>
        {LEVELS.map((l) => (
          <SelectCard
            key={l.level}
            layout="row"
            title={l.title}
            description={l.description}
            selected={draft.activity === l.level}
            onPress={() => set({ activity: l.level })}
            icon={(c) => <MaterialCommunityIcons name={l.icon} size={24} color={c} />}
          />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.xxxl, fontSize: 30, lineHeight: 40 },
  sub: { marginTop: spacing.xs, fontSize: 16 },
  list: { marginTop: spacing.xxl, gap: 10 },
});
