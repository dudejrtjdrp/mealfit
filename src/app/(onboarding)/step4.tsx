import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Chip, Input, OnboardingHeader, Screen, SelectCard, Text } from '@/components';
import type { Goal } from '@/domain/types';
import { useOnboarding } from '@/state/onboarding';
import { spacing } from '@/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** 포지셔닝상 체중 항목이 맨 앞에 오지 않게: 건강관리 3종 → 체중 3종 */
const GOALS: { goal: Goal; label: string; icon: IconName }[] = [
  { goal: 'blood_sugar', label: '혈당 관리', icon: 'water-outline' },
  { goal: 'cholesterol', label: '콜레스테롤 관리', icon: 'heart-pulse' },
  { goal: 'slow_aging', label: '저속노화', icon: 'leaf' },
  { goal: 'lose', label: '체중 감량', icon: 'trending-down' },
  { goal: 'maintain', label: '체중 유지', icon: 'scale-balance' },
  { goal: 'gain', label: '체중 증량', icon: 'trending-up' },
];
const SECONDARY: Goal[] = ['blood_sugar', 'cholesterol', 'slow_aging'];
const LABEL = Object.fromEntries(GOALS.map((g) => [g.goal, g.label])) as Record<Goal, string>;

/** B4 목적 (시안 없음 — B2·F1 톤 적용) */
export default function Step4() {
  const { draft, set } = useOnboarding();
  const [tw, setTw] = useState(draft.targetWeightKg != null ? String(draft.targetWeightKg) : '');
  const [weeks, setWeeks] = useState(draft.targetWeeks != null ? String(draft.targetWeeks) : '');

  const primary = draft.primaryGoal;
  const needsTarget = primary === 'lose' || primary === 'gain';
  const twNum = Number(tw);
  const weeksNum = Number(weeks);
  const cur = draft.weightKg;
  const twValid = tw.length > 0 && twNum >= 25 && twNum <= 250 && (cur == null || (primary === 'lose' ? twNum < cur : twNum > cur));
  const weeksValid = weeks.length > 0 && weeksNum >= 1 && weeksNum <= 104;
  const twErr = tw.length >= 2 && !twValid ? (primary === 'lose' ? '지금 몸무게보다 낮게 입력해주세요.' : '지금 몸무게보다 높게 입력해주세요.') : undefined;
  const weeksErr = weeks.length > 0 && !weeksValid ? '1~104주 사이로 입력해주세요.' : undefined;
  const canNext = !!primary && (!needsTarget || (twValid && weeksValid));

  const pickPrimary = (g: Goal) => {
    // 주 목적은 부 목적 목록에서 뺀다
    set({ primaryGoal: g, secondaryGoals: draft.secondaryGoals.filter((s) => s !== g) });
  };
  const toggleSecondary = (g: Goal) => {
    const has = draft.secondaryGoals.includes(g);
    set({ secondaryGoals: has ? draft.secondaryGoals.filter((s) => s !== g) : [...draft.secondaryGoals, g] });
  };

  const next = () => {
    if (!canNext) return;
    set(needsTarget ? { targetWeightKg: twNum, targetWeeks: weeksNum } : { targetWeightKg: undefined, targetWeeks: undefined });
    router.push('/(onboarding)/step5');
  };

  const rows = [GOALS.slice(0, 2), GOALS.slice(2, 4), GOALS.slice(4, 6)];
  const secondaryOptions = SECONDARY.filter((g) => g !== primary);

  return (
    <Screen
      scroll
      header={<OnboardingHeader step={4} layout="stacked" />}
      footer={<Button title="다음" disabled={!canNext} onPress={next} />}
    >
      <Text variant="display" style={styles.title}>
        어떤 관리를{'\n'}하고 싶으세요?
      </Text>
      <Text variant="body" color="ink2" style={styles.sub}>
        가장 중요한 한 가지를 골라주세요.
      </Text>

      <View style={styles.grid}>
        {rows.map((row, i) => (
          <View key={i} style={styles.gridRow}>
            {row.map((g) => (
              <SelectCard
                key={g.goal}
                layout="grid"
                title={g.label}
                selected={primary === g.goal}
                onPress={() => pickPrimary(g.goal)}
                icon={(c) => <MaterialCommunityIcons name={g.icon} size={24} color={c} />}
              />
            ))}
          </View>
        ))}
      </View>

      {needsTarget ? (
        <View style={styles.target}>
          <Input label="목표 체중" icon="flag-outline" unit="kg" value={tw} onChangeText={setTw} placeholder={cur ? String(primary === 'lose' ? cur - 4 : cur + 4) : '60'} maxLength={5} error={twErr} />
          <Input label="기간" icon="calendar-clear-outline" unit="주" value={weeks} onChangeText={setWeeks} placeholder="12" maxLength={3} error={weeksErr} />
        </View>
      ) : null}

      {secondaryOptions.length > 0 ? (
        <>
          <Text variant="h3" style={styles.secTitle}>
            함께 신경 쓸 것 <Text variant="body" color="ink3">(선택)</Text>
          </Text>
          <View style={styles.chips}>
            {secondaryOptions.map((g) => (
              <Chip key={g} variant="option" size="lg" label={LABEL[g]} selected={draft.secondaryGoals.includes(g)} onPress={() => toggleSecondary(g)} />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.xxxl, fontSize: 30, lineHeight: 40 },
  sub: { marginTop: spacing.xs, fontSize: 16 },
  grid: { marginTop: spacing.xxl, gap: 10 },
  gridRow: { flexDirection: 'row', gap: 10 },
  target: { marginTop: spacing.lg, gap: spacing.md },
  secTitle: { marginTop: spacing.xxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
});
