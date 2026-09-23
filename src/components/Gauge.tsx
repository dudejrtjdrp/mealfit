import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, fonts, radius, spacing } from '@/theme';

import { Text } from './Text';

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
export const formatNumber = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function Ring({ size, stroke, progress, color = colors.primary }: { size: number; stroke: number; progress: number; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = clamp01(progress);
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={stroke} fill="none" />
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
  /** 가운데 큰 숫자 (예: 여유 kcal 또는 목표 kcal) */
  value: number;
  /** 링 채움 비율 0~1 — 오늘 채운 만큼 */
  progress: number;
  /** 숫자 아래 작은 단위 (기본 "kcal 여유") */
  caption?: string;
  /** 링 아래 "목표 1,800 kcal" — 없으면 숨김 */
  target?: number;
  size?: number;
  stroke?: number;
  /** @deprecated 링은 항상 포인트 그린 */
  color?: string;
  /** 가운데 숫자 크기 (기본 30) */
  numberSize?: number;
  style?: StyleProp<ViewStyle>;
}

/** 칼로리 도넛 링 (C1·E1·B7) — 트랙 헤어라인색, 채움 그린, 가운데 큰 Bold 숫자 + 작은 단위 */
export function KcalRing({ value, progress, caption = 'kcal 여유', target, size = 130, stroke = 12, numberSize, style }: KcalRingProps) {
  return (
    <View style={[styles.ringWrap, style]}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Ring size={size} stroke={stroke} progress={progress} />
        <Text variant="number" style={numberSize ? { fontSize: numberSize, lineHeight: Math.round(numberSize * 1.15) } : null}>
          {formatNumber(value)}
        </Text>
        <Text variant="small" color="ink3" style={styles.ringUnit}>
          {caption}
        </Text>
      </View>
      {target != null ? (
        <Text variant="caption" color="ink3" style={styles.ringTarget}>
          목표 {formatNumber(target)} kcal
        </Text>
      ) : null}
    </View>
  );
}

export interface RoomBarProps {
  /** 오늘 더 먹을 수 있는 kcal */
  remaining: number;
  /** 오늘 채운 비율 0~1 */
  progress: number;
  /** 목표를 넘겼을 때 — 비난 없는 문구로 */
  over?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** 여유분 미니카드 (D3) — 틴트 바탕 + "오늘 여유 540 kcal" + 흰 트랙 바 */
export function RoomBar({ remaining, progress, over, style }: RoomBarProps) {
  return (
    <View style={[styles.room, style]} accessibilityRole="summary">
      {over ? (
        <Text variant="caption" color="ink2" style={styles.roomText}>
          오늘은 여기까지, 내일 다시 채워져요
        </Text>
      ) : (
        <Text variant="caption" color="ink2" style={styles.roomText}>
          오늘 여유{' '}
          <Text variant="h3" color="primaryText">
            {formatNumber(remaining)}
          </Text>{' '}
          kcal
        </Text>
      )}
      <View style={styles.roomTrack}>
        <View style={[styles.roomFill, { width: `${clamp01(progress) * 100}%` }]} />
      </View>
    </View>
  );
}

/** @deprecated RoomBar 를 쓴다 */
export function MiniKcalGauge({ remaining, progress, style }: { remaining: number; progress: number; caption?: string; color?: string; style?: StyleProp<ViewStyle> }) {
  return <RoomBar remaining={remaining} progress={1 - clamp01(progress)} style={style} />;
}

export type NutrientKey = 'kcal' | 'carbs' | 'protein' | 'fat' | 'sugar' | 'sodium';

export const NUTRIENT_META: Record<NutrientKey, { label: string; short: string; unit: string; icon: keyof typeof Ionicons.glyphMap | 'fire' | 'barley' }> = {
  kcal: { label: '칼로리', short: '칼로리', unit: 'kcal', icon: 'fire' },
  carbs: { label: '탄수화물', short: '탄수', unit: 'g', icon: 'barley' },
  protein: { label: '단백질', short: '단백질', unit: 'g', icon: 'egg-outline' },
  fat: { label: '지방', short: '지방', unit: 'g', icon: 'water-outline' },
  sugar: { label: '당', short: '당', unit: 'g', icon: 'cube-outline' },
  sodium: { label: '나트륨', short: '나트륨', unit: 'g', icon: 'flask-outline' },
};

/**
 * 영양소 값 표기 — 나트륨은 저장 단위(mg)를 시안처럼 g(소수 1자리)로 보여준다.
 * 1200 mg → "1.2" / 단위는 NUTRIENT_META[k].unit
 */
export function formatNutrient(k: NutrientKey, v: number): string {
  if (k === 'sodium') return (Math.round(v / 100) / 10).toFixed(1);
  return formatNumber(v);
}

/** 회색 원 안 영양소 아이콘 (D4 비교 행) */
export function NutrientIcon({ nutrient, size = 36 }: { nutrient: NutrientKey; size?: number }) {
  const m = NUTRIENT_META[nutrient];
  const iconSize = Math.round(size * 0.5);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
      {m.icon === 'fire' || m.icon === 'barley' ? (
        <MaterialCommunityIcons name={m.icon} size={iconSize} color={colors.ink2} />
      ) : (
        <Ionicons name={m.icon} size={iconSize} color={colors.ink2} />
      )}
    </View>
  );
}

export interface NutrientBarProps {
  nutrient: NutrientKey;
  /** 현재 값 (섭취량). 없으면 목표만 표시 */
  value?: number;
  max: number;
  /** 라벨 교체 */
  label?: string;
  /** @deprecated 항상 컴팩트 */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** 영양소 미니바 (C1 링 옆) — 라벨 · 6px 바 · "42 / 80g" (값만 Bold) */
export function NutrientBar({ nutrient, value, max, label, style }: NutrientBarProps) {
  const m = NUTRIENT_META[nutrient];
  const progress = value == null ? 1 : max > 0 ? value / max : 0;
  return (
    <View style={[styles.nb, style]} accessibilityLabel={`${label ?? m.label} ${value != null ? `${formatNutrient(nutrient, value)} / ` : ''}${formatNutrient(nutrient, max)}${m.unit}`}>
      <Text variant="small" color="ink3">
        {label ?? m.label}
      </Text>
      <View style={styles.nbTrack}>
        <View style={[styles.nbFill, { width: `${clamp01(progress) * 100}%` }]} />
      </View>
      <Text variant="small" color="ink2" numberOfLines={1}>
        {value != null ? (
          <>
            <Text variant="label" color="ink" style={styles.nbStrong}>
              {formatNutrient(nutrient, value)}
            </Text>{' '}
            / {formatNutrient(nutrient, max)}
            {m.unit}
          </>
        ) : (
          <>
            <Text variant="label" color="ink" style={styles.nbStrong}>
              {formatNutrient(nutrient, max)}
            </Text>
            {m.unit}
          </>
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ringWrap: { alignItems: 'center' },
  ringUnit: { marginTop: 2 },
  ringTarget: { marginTop: spacing.md },
  room: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, backgroundColor: colors.primaryTint, borderRadius: radius.md, padding: 14 },
  roomText: { flexShrink: 1 },
  roomTrack: { width: 120, height: 6, borderRadius: radius.pill, backgroundColor: colors.surface, overflow: 'hidden', flexShrink: 0 },
  roomFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.primary },
  nb: { gap: 6 },
  nbTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden' },
  nbFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.primary },
  nbStrong: { fontFamily: fonts.bold },
});
