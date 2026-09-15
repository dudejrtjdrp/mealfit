import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';

import { Text } from './Text';

export interface ProgressStepsProps {
  step: number;
  total?: number;
  /** segments: B1·B5·B6 칸 나눔 / bar: B2 얇은 연속 바 */
  variant?: 'segments' | 'bar';
  /** 우측 "5 / 7" 라벨 */
  showLabel?: boolean;
  /** 칸 하나의 고정 너비 (B1처럼 짧은 칸). 없으면 균등 분배 */
  segmentWidth?: number;
  style?: StyleProp<ViewStyle>;
}

/** 온보딩 진행 표시 */
export function ProgressSteps({ step, total = 7, variant = 'segments', showLabel = true, segmentWidth, style }: ProgressStepsProps) {
  return (
    <View style={[styles.row, style]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: step }}>
      {variant === 'bar' ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${(step / total) * 100}%` }]} />
        </View>
      ) : (
        <View style={[styles.segments, segmentWidth ? null : styles.flex]}>
          {Array.from({ length: total }, (_, i) => (
            <View
              key={i}
              style={[
                styles.segment,
                segmentWidth ? { width: segmentWidth } : styles.flex,
                { backgroundColor: i < step ? colors.primary : colors.line },
              ]}
            />
          ))}
        </View>
      )}
      {showLabel ? <StepLabel step={step} total={total} /> : null}
    </View>
  );
}

export function StepLabel({ step, total = 7 }: { step: number; total?: number }) {
  return (
    <Text variant="bodyMedium" color="ink2" style={styles.label}>
      {step} / {total}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  segments: { flexDirection: 'row', gap: 6 },
  segment: { height: 6, borderRadius: radius.pill },
  track: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.gaugeFill },
  label: { marginLeft: 14, minWidth: 34, textAlign: 'right' },
});
