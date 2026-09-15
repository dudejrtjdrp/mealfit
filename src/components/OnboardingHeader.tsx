import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, hit, spacing } from '@/theme';

import { ProgressSteps, StepLabel } from './ProgressSteps';

export interface OnboardingHeaderProps {
  step: number;
  total?: number;
  /**
   * intro   : B1 — 뒤로가기 없음, 가운데 짧은 칸 + 우측 라벨
   * bar     : B2 — 뒤로가기 줄 아래 얇은 연속 바 + 라벨
   * stacked : B5 — 뒤로가기·라벨 한 줄, 아래 전체 폭 칸
   * inline  : B6 — 뒤로가기 · 칸 · 라벨 한 줄
   */
  layout?: 'intro' | 'bar' | 'stacked' | 'inline';
  onBack?: () => void;
}

/** 온보딩 상단: 뒤로가기 chevron + 진행 표시 */
export function OnboardingHeader({ step, total = 7, layout = 'stacked', onBack }: OnboardingHeaderProps) {
  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="뒤로 가기"
      hitSlop={hit}
      onPress={onBack ?? (() => (router.canGoBack() ? router.back() : undefined))}
      style={styles.back}
    >
      <Ionicons name="chevron-back" size={28} color={colors.ink} />
    </Pressable>
  );

  if (layout === 'intro') {
    return (
      <View style={styles.introRow}>
        <View style={styles.introCenter}>
          <ProgressSteps step={step} total={total} segmentWidth={18} showLabel={false} />
        </View>
        <View style={styles.introLabel}>
          <StepLabel step={step} total={total} />
        </View>
      </View>
    );
  }
  if (layout === 'bar') {
    return (
      <View style={styles.wrap}>
        {back}
        <ProgressSteps step={step} total={total} variant="bar" style={styles.barBelow} />
      </View>
    );
  }
  if (layout === 'inline') {
    return (
      <View style={[styles.wrap, styles.inline]}>
        {back}
        <ProgressSteps step={step} total={total} style={styles.inlineBar} />
      </View>
    );
  }
  return (
    <View style={styles.wrap}>
      <View style={styles.stackRow}>
        {back}
        <StepLabel step={step} total={total} />
      </View>
      <ProgressSteps step={step} total={total} showLabel={false} style={styles.segBelow} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 6 },
  back: { width: 32, height: 32, justifyContent: 'center', marginLeft: -6 },
  introRow: { height: 56, justifyContent: 'center', paddingTop: spacing.md },
  introCenter: { alignItems: 'center' },
  introLabel: { position: 'absolute', right: 0, top: spacing.md + 17 },
  barBelow: { marginTop: spacing.lg },
  stackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  segBelow: { marginTop: spacing.xl },
  inline: { flexDirection: 'row', alignItems: 'center' },
  inlineBar: { flex: 1, marginLeft: 38 },
});
