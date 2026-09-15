import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Chip, ListRow, Screen, StackHeader, Text, TextArea, showToast } from '@/components';
import { DIET_TYPES, DIET_TYPE_IDS, normalizeDietText } from '@/domain/diet';
import type { DietClassification, DietType } from '@/domain/types';
import { classifyDiet } from '@/services/ai/classifyDiet';
import { getRepos } from '@/services/repo';
import { fallbackDiet, useProfile } from '@/state/profile';
import { colors, spacing } from '@/theme';

type Phase = 'edit' | 'loading' | 'result';

/** F3 식단 성향 수정 — 서술 다시 쓰기 → 분류 → 결과 확인 → 저장 (B5·B6 재사용) */
export default function DietEdit() {
  const profile = useProfile((s) => s.profile);
  const updateProfile = useProfile((s) => s.updateProfile);
  const [text, setText] = useState(profile?.dietDescription ?? '');
  const [phase, setPhase] = useState<Phase>('edit');
  const [result, setResult] = useState<DietClassification | null>(null);
  const [saving, setSaving] = useState(false);

  const filled = useRef(!!profile);
  useEffect(() => {
    if (filled.current || !profile) return;
    filled.current = true;
    setText(profile.dietDescription ?? '');
  }, [profile]);

  const analyze = async () => {
    // 같은 서술이면 지금 결과를 그대로 (재호출 없음)
    if (profile?.diet && normalizeDietText(text) === normalizeDietText(profile.dietDescription ?? '') && profile.diet.evidence.length > 0) {
      setResult(profile.diet);
      setPhase('result');
      return;
    }
    setPhase('loading');
    let res: DietClassification;
    try {
      res = text.trim() ? await classifyDiet(text, { repos: getRepos(), primaryGoal: profile?.primaryGoal }) : fallbackDiet('', profile?.primaryGoal);
    } catch {
      showToast('지금은 기본 분류로 정리했어요', 'info');
      res = fallbackDiet(text, profile?.primaryGoal);
    }
    setResult(res);
    setPhase('result');
  };

  const pick = (type: DietType) => setResult((r) => ({ type, evidence: r?.type === type ? r.evidence : [], source: 'manual' }));

  const save = async () => {
    if (!result) return;
    setSaving(true);
    const ok = await updateProfile({ diet: result, dietDescription: text.trim() || undefined });
    setSaving(false);
    showToast(ok ? '식단 성향을 바꿨어요' : '저장은 다음에 다시 시도할게요', ok ? 'success' : 'info');
    if (router.canGoBack()) router.back();
  };

  const info = result ? DIET_TYPES[result.type] : null;

  return (
    <Screen
      scroll
      header={<StackHeader title="식단 성향 수정" />}
      footer={
        phase === 'result' ? (
          <View style={styles.footer}>
            <Button title="다시 쓰기" variant="ghost" onPress={() => setPhase('edit')} />
            <Button title="이대로 저장" loading={saving} onPress={save} />
          </View>
        ) : (
          <Button title="분석하기" loading={phase === 'loading'} disabled={phase === 'loading'} onPress={analyze} />
        )
      }
    >
      {phase !== 'result' ? (
        <>
          <Text variant="h2" style={styles.title}>
            평소 식사는 어떤 편인가요?
          </Text>
          <Text variant="body" color="ink2" style={styles.sub}>
            자유롭게 적어주시면 성향 분류에 참고할게요.
          </Text>
          <TextArea value={text} onChangeText={setText} placeholder="예: 아침은 간단히 먹고, 점심은 편의점에서 자주 사 먹어요." style={styles.area} />
        </>
      ) : info && result ? (
        <>
          <Card padding={20} style={styles.resultCard}>
            <Text variant="caption" color="primaryText">
              {result.source === 'manual' ? '직접 고른 성향' : '분석 결과'}
            </Text>
            <Text variant="h1" style={styles.resultTitle}>
              {info.label}
            </Text>
            <Text variant="body" color="ink2" style={styles.sub}>
              {info.description}
            </Text>
            {result.evidence.length > 0 ? (
              <View style={styles.evidence}>
                {result.evidence.map((e, i) => (
                  <ListRow key={i} variant="filled" chevron={false} icon="🌱" iconSize={36} title={e.title} subtitle={e.detail} />
                ))}
              </View>
            ) : null}
          </Card>
          <Text variant="h3" style={styles.pickTitle}>
            다른 성향이 더 맞다면 골라주세요
          </Text>
          <View style={styles.chips}>
            {DIET_TYPE_IDS.map((t) => (
              <Chip key={t} label={DIET_TYPES[t].label} variant="option" size="sm" selected={result.type === t} onPress={() => pick(t)} />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.lg },
  sub: { marginTop: spacing.xs },
  area: { marginTop: spacing.lg },
  footer: { gap: spacing.xs },
  resultCard: { marginTop: spacing.lg, backgroundColor: colors.surface },
  resultTitle: { marginTop: spacing.xs },
  evidence: { marginTop: spacing.lg, gap: spacing.sm },
  pickTitle: { marginTop: spacing.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
});
