import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Input, Screen, SelectCard, StackHeader, Text, showToast } from '@/components';
import { ACTIVITY_LABEL } from '@/data/labels';
import { computeTargets } from '@/domain/targets';
import { formatNumber } from '@/domain/summary';
import type { ActivityLevel, Sex } from '@/domain/types';
import { useProfile } from '@/state/profile';
import { spacing } from '@/theme';

const THIS_YEAR = new Date().getFullYear();
const inRange = (v: string, min: number, max: number) => {
  const n = Number(v);
  return v.length > 0 && Number.isFinite(n) && n >= min && n <= max;
};

/** F2 신체 정보·활동량 수정 (B2·B3 재사용) */
export default function BodyEdit() {
  const profile = useProfile((s) => s.profile);
  const updateProfile = useProfile((s) => s.updateProfile);
  const [sex, setSex] = useState<Sex>(profile?.sex ?? 'female');
  const [birth, setBirth] = useState(String(profile?.birthYear ?? ''));
  const [height, setHeight] = useState(String(profile?.heightCm ?? ''));
  const [weight, setWeight] = useState(String(profile?.weightKg ?? ''));
  const [activity, setActivity] = useState<ActivityLevel>(profile?.activity ?? 3);
  const [saving, setSaving] = useState(false);

  // 딥링크로 들어와 프로필이 늦게 불러와지면 한 번 채운다
  const filled = useRef(!!profile);
  useEffect(() => {
    if (filled.current || !profile) return;
    filled.current = true;
    setSex(profile.sex);
    setBirth(String(profile.birthYear));
    setHeight(String(profile.heightCm));
    setWeight(String(profile.weightKg));
    setActivity(profile.activity);
  }, [profile]);

  const okBirth = inRange(birth, 1930, THIS_YEAR - 10);
  const okHeight = inRange(height, 100, 250);
  const okWeight = inRange(weight, 25, 250);
  const canSave = !!profile && okBirth && okHeight && okWeight;

  const save = async () => {
    if (!profile || !canSave) return;
    setSaving(true);
    const patch = { sex, birthYear: Number(birth), heightCm: Number(height), weightKg: Number(weight), activity };
    const ok = await updateProfile(patch);
    setSaving(false);
    let kcal: number | undefined;
    try {
      kcal = computeTargets({ ...profile, ...patch }).kcal;
    } catch {
      kcal = undefined;
    }
    showToast(kcal ? `목표량을 다시 계산했어요 · 하루 ${formatNumber(kcal)} kcal` : ok ? '저장했어요' : '저장은 다음에 다시 시도할게요', ok ? 'success' : 'info');
    if (router.canGoBack()) router.back();
  };

  return (
    <Screen scroll header={<StackHeader title="신체 정보" />} footer={<Button title="저장" disabled={!canSave} loading={saving} onPress={save} />}>
      <Text variant="caption" color="ink3" style={styles.sub}>
        바꾸면 오늘 목표량을 바로 다시 계산해요.
      </Text>
      <View style={styles.cards}>
        <View>
          <Text variant="captionMedium" color="ink2" style={styles.label}>
            성별
          </Text>
          <View style={styles.sexRow}>
            <SelectCard layout="tile" title="남성" selected={sex === 'male'} onPress={() => setSex('male')} icon={(c) => <Ionicons name="man-outline" size={22} color={c} />} />
            <SelectCard layout="tile" title="여성" selected={sex === 'female'} onPress={() => setSex('female')} icon={(c) => <Ionicons name="woman-outline" size={22} color={c} />} />
          </View>
        </View>
        <Input label="출생 연도" icon="calendar-clear-outline" unit="년" value={birth} onChangeText={setBirth} maxLength={4} error={birth.length >= 4 && !okBirth ? `1930~${THIS_YEAR - 10}년 사이로 입력해주세요.` : undefined} />
        <Input label="키" icon="body-outline" unit="cm" value={height} onChangeText={setHeight} maxLength={5} error={height.length >= 3 && !okHeight ? '100~250cm 사이로 입력해주세요.' : undefined} />
        <Input label="몸무게" icon="speedometer-outline" unit="kg" value={weight} onChangeText={setWeight} maxLength={5} error={weight.length >= 2 && !okWeight ? '25~250kg 사이로 입력해주세요.' : undefined} />
        <Text variant="h3" style={styles.section}>
          활동량
        </Text>
        {([1, 2, 3, 4, 5] as ActivityLevel[]).map((lv) => (
          <SelectCard key={lv} layout="row" title={ACTIVITY_LABEL[lv].title} description={ACTIVITY_LABEL[lv].description} selected={activity === lv} onPress={() => setActivity(lv)} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sub: { marginTop: spacing.xs },
  cards: { marginTop: spacing.xl, gap: spacing.lg },
  label: { marginBottom: spacing.sm },
  sexRow: { flexDirection: 'row', gap: spacing.sm },
  section: { marginTop: spacing.sm, marginBottom: -spacing.xs },
});
