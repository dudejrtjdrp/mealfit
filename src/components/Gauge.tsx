import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, radius, spacing } from '@/theme';

import { Text } from './Text';

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
export const formatNumber = (n: number) => Math.round(n).toLocaleString('ko-KR');

function Ring({ size, stroke, progress, color = colors.gaugeFill }: { size: number; stroke: number; progress: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = clamp01(progress);
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.gaugeTrack} strokeWidth={stroke} fill="none" />
      {p > 0 ? (
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ) : null}
    </Svg>
  );
}

export interface KcalRingProps {
  /** 가운데 큰 숫자 (예: 남은 kcal 또는 목표 kcal) */
  value: number;
  /** 링 채움 비율 0~1 */
  progress: number;
  /** 아래 "목표 1,800 kcal" — 없으면 숨김 */
  target?: number;
  size?: number;
  stroke?: number;
  style?: StyleProp<ViewStyle>;
}

/** E1 원형 칼로리 링 */
export function KcalRing({ value, progress, target, size = 150, stroke = 14, style }: KcalRingProps) {
  return (
    <View style={[styles.ringWrap, style]}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Ring size={size} stroke={stroke} progress={progress} />
        <MaterialCommunityIcons name="fire" size={22} color={colors.kcal} />
        <Text variant="number" style={styles.ringNumber}>
          {formatNumber(value)}
        </Text>
        <Text variant="h3" color="ink2" style={styles.ringUnit}>
          kcal
        </Text>
      </View>
      {target != null ? (
        <Text variant="bodyMedium" color="ink2" style={styles.ringTarget}>
          목표 {formatNumber(target)} kcal
        </Text>
      ) : null}
    </View>
  );
}

/** D3 상단 미니 링 + "842 kcal 남음" */
export function MiniKcalGauge({ remaining, progress, caption = '오늘 남은 칼로리', style }: { remaining: number; progress: number; caption?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.mini, style]}>
      <View style={styles.miniRing}>
        <Ring size={64} stroke={8} progress={progress} />
        <MaterialCommunityIcons name="fire" size={26} color={colors.kcal} />
      </View>
      <View style={styles.miniText}>
        <Text variant="caption" color="ink2">
          {caption}
        </Text>
        <View style={styles.miniValue}>
          <Text variant="number" style={styles.miniNumber}>
            {formatNumber(remaining)}
          </Text>
          <Text variant="h3" color="ink2" style={styles.miniUnit}>
            kcal 남음
          </Text>
        </View>
      </View>
    </View>
  );
}

export type NutrientKey = 'kcal' | 'carbs' | 'protein' | 'fat' | 'sugar' | 'sodium';

export const NUTRIENT_META: Record<NutrientKey, { label: string; unit: string; icon: keyof typeof Ionicons.glyphMap | 'fire' | 'barley' }> = {
  kcal: { label: '칼로리', unit: 'kcal', icon: 'fire' },
  carbs: { label: '탄수화물', unit: 'g', icon: 'barley' },
  protein: { label: '단백질', unit: 'g', icon: 'egg' },
  fat: { label: '지방', unit: 'g', icon: 'water' },
  sugar: { label: '당류', unit: 'g', icon: 'cube' },
  sodium: { label: '나트륨', unit: 'mg', icon: 'flask' },
};

export function NutrientIcon({ nutrient, size = 36 }: { nutrient: NutrientKey; size?: number }) {
  const m = NUTRIENT_META[nutrient];
  const fg = colors[nutrient];
  const bg = colors[`${nutrient}Bg` as const];
  const iconSize = Math.round(size * 0.5);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      {m.icon === 'fire' || m.icon === 'barley' ? (
        <MaterialCommunityIcons name={m.icon} size={iconSize} color={fg} />
      ) : (
        <Ionicons name={m.icon} size={iconSize} color={fg} />
      )}
    </View>
  );
}

export interface NutrientBarProps {
  nutrient: NutrientKey;
  /** 현재 값 (섭취량). 없으면 "목표"만 표시 */
  value?: number;
  max: number;
  /** 라벨 교체 */
  label?: string;
  style?: StyleProp<ViewStyle>;
}

/** 아이콘 원 + 라벨 + "122 / 250 g" + 바 (E1) */
export function NutrientBar({ nutrient, value, max, label, style }: NutrientBarProps) {
  const m = NUTRIENT_META[nutrient];
  const progress = value == null ? 1 : max > 0 ? value / max : 0;
  return (
    <View style={[styles.nbRow, style]}>
      <NutrientIcon nutrient={nutrient} size={36} />
      <View style={styles.nbBody}>
        <View style={styles.nbTop}>
          <Text variant="bodyMedium">{label ?? m.label}</Text>
          <Text variant="bodyMedium">
            {value != null ? (
              <>
                {formatNumber(value)}
                <Text variant="body" color="ink3">
                  {' '}/ {formatNumber(max)} {m.unit}
                </Text>
              </>
            ) : (
              <>
                {formatNumber(max)}
                <Text variant="body" color="ink3">
                  {' '}
                  {m.unit}
                </Text>
              </>
            )}
          </Text>
        </View>
        <View style={styles.nbTrack}>
          <View style={[styles.nbFill, { width: `${clamp01(progress) * 100}%`, backgroundColor: colors[nutrient] }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ringWrap: { alignItems: 'center' },
  ringNumber: { marginTop: 2 },
  ringUnit: { marginTop: -4 },
  ringTarget: { marginTop: spacing.md },
  mini: { flexDirection: 'row', alignItems: 'center' },
  miniRing: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  miniText: { marginLeft: spacing.lg },
  miniValue: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  miniNumber: { fontSize: 34, lineHeight: 40 },
  miniUnit: {},
  nbRow: { flexDirection: 'row', alignItems: 'center' },
  nbBody: { flex: 1, marginLeft: spacing.md },
  nbTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  nbTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.gaugeTrack, overflow: 'hidden' },
  nbFill: { height: 8, borderRadius: radius.pill },
});
