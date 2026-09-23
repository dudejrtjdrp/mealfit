import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Chip, Input, Screen, SelectCard, StackHeader, Text, showToast } from '@/components';
import { GOAL_LABEL } from '@/data/labels';
import type { Goal } from '@/domain/types';
import { useProfile } from '@/state/profile';
import { spacing } from '@/theme';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
const GOALS: { goal: Goal; icon: IconName }[] = [
  { goal: 'blood_sugar', icon: 'water-outline' },
  { goal: 'cholesterol', icon: 'heart-pulse' },
  { goal: 'slow_aging', icon: 'leaf' },
  { goal: 'lose', icon: 'trending-down' },
  { goal: 'maintain', icon: 'scale-balance' },
  { goal: 'gain', icon: 'trending-up' },
];
const SECONDARY: Goal[] = ['blood_sugar', 'cholesterol', 'slow_aging'];

/** F2 목표 수정 — 목적·목표 체중·기간 (B4 재사용) */
export default function GoalEdit() {
  const profile = useProfile((s) => s.profile);
  const updateProfile = useProfile((s) => s.updateProfile);
  const [primary, setPrimary] = useState<Goal>(profile?.primaryGoal ?? 'maintain');
  const [secondary, setSecondary] = useState<Goal[]>(profile?.secondaryGoals ?? []);
  const [tw, setTw] = useState(profile?.targetWeightKg != null ? String(profile.targetWeightKg) : '');
  const [weeks, setWeeks] = useState(profile?.targetWeeks != null ? String(profile.targetWeeks) : '');
  const [saving, setSaving] = useState(false);

  const filled = useRef(!!profile);
  useEffect(() => {
    if (filled.current || !profile) return;
    filled.current = true;
    setPrimary(profile.primaryGoal);
    setSecondary(profile.secondaryGoals);
    setTw(profile.targetWeightKg != null ? String(profile.targetWeightKg) : '');
    setWeeks(profile.targetWeeks != null ? String(profile.targetWeeks) : '');
  }, [profile]);

  const needsTarget = primary === 'lose' || primary === 'gain';
  const cur = profile?.weightKg;
  const twNum = Number(tw);
  const weeksNum = Number(weeks);
  const twValid = tw.length > 0 && twNum >= 25 && twNum <= 250 && (cur == null || (primary === 'lose' ? twNum < cur : twNum > cur));
  const weeksValid = weeks.length > 0 && weeksNum >= 1 && weeksNum <= 104;
  const canSave = !!profile && (!needsTarget || (twValid && weeksValid));

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const ok = await updateProfile({
      primaryGoal: primary,
      secondaryGoals: secondary.filter((g) => g !== primary),
      targetWeightKg: needsTarget ? twNum : undefined,
      targetWeeks: needsTarget ? weeksNum : undefined,
    });
    setSaving(false);
    showToast(ok ? '목표를 바꿨어요 · 목표량도 다시 계산했어요' : '저장은 다음에 다시 시도할게요', ok ? 'success' : 'info');
    if (router.canGoBack()) router.back();
  };

  const rows = [GOALS.slice(0, 2), GOALS.slice(2, 4), GOALS.slice(4, 6)];

  return (
    <Screen scroll header={<StackHeader title="목표 수정" />} footer={<Button title="저장" disabled={!canSave} loading={saving} onPress={save} />}>
      <Text variant="h3" style={styles.section}>
        주 목적
      </Text>
      <View style={styles.grid}>
        {rows.map((row, i) => (
          <View key={i} style={styles.row}>
            {row.map((g) => (
              <SelectCard key={g.goal} layout="grid" title={GOAL_LABEL[g.goal]} selected={primary === g.goal} onPress={() => setPrimary(g.goal)} icon={(c) => <MaterialCommunityIcons name={g.icon} size={24} color={c} />} />
            ))}
          </View>
        ))}
      </View>

      {needsTarget ? (
        <View style={styles.targets}>
          <Input label="목표 체중" icon="flag-outline" unit="kg" value={tw} onChangeText={setTw} maxLength={5} error={tw.length >= 2 && !twValid ? (primary === 'lose' ? '지금 몸무게보다 낮게 입력해주세요.' : '지금 몸무게보다 높게 입력해주세요.') : undefined} />
          <Input label="기간" icon="calendar-outline" unit="주" value={weeks} onChangeText={setWeeks} maxLength={3} error={weeks.length > 0 && !weeksValid ? '1~104주 사이로 입력해주세요.' : undefined} />
        </View>
      ) : null}

      <Text variant="h3" style={styles.section}>
        함께 챙길 것 <Text variant="caption" color="ink3">(선택)</Text>
      </Text>
      <View style={styles.chips}>
        {SECONDARY.filter((g) => g !== primary).map((g) => {
          const on = secondary.includes(g);
          return <Chip key={g} label={GOAL_LABEL[g]} variant="option" selected={on} onPress={() => setSecondary((s) => (on ? s.filter((x) => x !== g) : [...s, g]))} />;
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: spacing.xl },
  grid: { marginTop: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  targets: { marginTop: spacing.lg, gap: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
});
