import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Input, OnboardingHeader, Screen, SelectCard, Text } from '@/components';
import { useOnboarding } from '@/state/onboarding';
import { spacing } from '@/theme';

const THIS_YEAR = new Date().getFullYear();
const RANGES = {
  birthYear: { min: 1930, max: THIS_YEAR - 10, msg: `1930~${THIS_YEAR - 10}년 사이로 입력해주세요.` },
  heightCm: { min: 100, max: 250, msg: '100~250cm 사이로 입력해주세요.' },
  weightKg: { min: 25, max: 250, msg: '25~250kg 사이로 입력해주세요.' },
} as const;

const toStr = (n?: number) => (n == null ? '' : String(n));
const inRange = (v: string, r: { min: number; max: number }) => {
  const n = Number(v);
  return v.length > 0 && Number.isFinite(n) && n >= r.min && n <= r.max;
};

/** B2 기본 정보 — 시안 docs/design/B2-basic-info.png */
export default function Step2() {
  const { draft, set } = useOnboarding();
  const [birth, setBirth] = useState(toStr(draft.birthYear));
  const [height, setHeight] = useState(toStr(draft.heightCm));
  const [weight, setWeight] = useState(toStr(draft.weightKg));

  const okBirth = inRange(birth, RANGES.birthYear);
  const okHeight = inRange(height, RANGES.heightCm);
  const okWeight = inRange(weight, RANGES.weightKg);
  // 연도는 4자리 다 쳤을 때만 안내, 키·몸무게는 3자리이거나 값이 넘칠 때 안내
  const birthErr = birth.length >= 4 && !okBirth ? RANGES.birthYear.msg : undefined;
  const heightErr = (height.length >= 3 || Number(height) > RANGES.heightCm.max) && !okHeight ? RANGES.heightCm.msg : undefined;
  const weightErr = (weight.length >= 3 || Number(weight) > RANGES.weightKg.max) && !okWeight ? RANGES.weightKg.msg : undefined;
  const canNext = !!draft.sex && okBirth && okHeight && okWeight;

  const next = () => {
    if (!canNext) return;
    set({ birthYear: Number(birth), heightCm: Number(height), weightKg: Number(weight) });
    router.push('/(onboarding)/step3');
  };

  return (
    <Screen
      scroll
      header={<OnboardingHeader step={2} layout="bar" />}
      footer={<Button title="다음" trailingChevron disabled={!canNext} onPress={next} style={styles.bleed} />}
    >
      <Text variant="h1" style={styles.title}>
        기본 정보를 알려주세요
      </Text>
      <Text variant="body" color="ink2" style={styles.sub}>
        더 정확한 식단 추천을 위해{'\n'}몇 가지 정보를 알려주세요.
      </Text>

      <View style={styles.cards}>
        <Card padding={16}>
          <Text variant="h3" style={styles.label}>
            성별
          </Text>
          <View style={styles.sexRow}>
            <SelectCard
              layout="tile"
              title="남성"
              selected={draft.sex === 'male'}
              onPress={() => set({ sex: 'male' })}
              icon={(c) => <Ionicons name="man-outline" size={30} color={c} />}
            />
            <SelectCard
              layout="tile"
              title="여성"
              selected={draft.sex === 'female'}
              onPress={() => set({ sex: 'female' })}
              icon={(c) => <Ionicons name="woman-outline" size={30} color={c} />}
            />
          </View>
        </Card>
        <Input label="출생 연도" icon="calendar-clear-outline" unit="년" value={birth} onChangeText={setBirth} placeholder="1990" maxLength={4} error={birthErr} />
        <Input label="키" icon="body-outline" unit="cm" value={height} onChangeText={setHeight} placeholder="170" maxLength={5} error={heightErr} />
        <Input label="몸무게" icon="speedometer-outline" unit="kg" value={weight} onChangeText={setWeight} placeholder="60" maxLength={5} error={weightErr} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.xl, fontSize: 28, lineHeight: 36 },
  sub: { marginTop: spacing.sm, fontSize: 16, lineHeight: 22 },
  cards: { marginTop: spacing.xl, gap: spacing.md, marginHorizontal: -spacing.sm },
  label: { marginBottom: spacing.md },
  bleed: { marginHorizontal: -spacing.sm },
  sexRow: { flexDirection: 'row', gap: spacing.sm },
});
