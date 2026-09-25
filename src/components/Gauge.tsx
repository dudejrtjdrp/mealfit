import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, fonts, radius, spacing } from '@/theme';

import { Text } from './Text';

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
export const formatNumber = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** progress 가 1 을 넘으면(목표 초과) 초록 한 바퀴 위에 넘은 비율만큼 빨강 호를 12시부터 겹쳐 그린다 */
function Ring({ size, stroke, progress, overflow }: { size: number; stroke: number; progress: number; overflow: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = clamp01(progress);
  const extra = overflow ? Math.max(0.02, clamp01(progress - 1)) : 0;
  const arc = (frac: number, color: string) => (
    <Circle
      cx={size / 2}
      cy={size / 2}
      r={r}
      stroke={color}
      strokeWidth={stroke}
      fill="none"
      strokeLinecap={frac >= 1 ? 'butt' : 'round'}
      strokeDasharray={`${c * frac} ${c}`}
      transform={`rotate(-90 ${size / 2} ${size / 2})`}
    />
  );
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={stroke} fill="none" />
      {p > 0 ? arc(overflow ? 1 : p, colors.primary) : null}
      {extra > 0 ? arc(extra, colors.over) : null}
    </Svg>
  );
}

export interface KcalRingProps {
  /** 가운데 큰 숫자 (예: 남은 kcal 또는 목표 kcal) */
  value: number;
  /** 링 채움 비율 — 오늘 채운 만큼 (1 = 목표) */
  progress: number;
  /**
   * 목표보다 더 먹은 kcal (DaySummary.over.kcal). 0 보다 크면 가운데에 "+320 / kcal 넘었어요"(빨강),
   * 링은 초록 한 바퀴 + 넘은 비율만큼 빨강 호
   */
  over?: number;
  /** 숫자 아래 작은 단위 (기본 "kcal 남았어요") */
  caption?: string;
  /** 링 아래 "목표 1,800 kcal" — 없으면 숨김 */
  target?: number;
  size?: number;
  stroke?: number;
  /** 가운데 숫자 크기 (기본 30) */
  numberSize?: number;
  style?: StyleProp<ViewStyle>;
}

/** 칼로리 도넛 링 (C1·E1·B7) — 트랙 헤어라인색, 채움 그린, 가운데 큰 Bold 숫자 + 작은 단위. 목표를 넘으면 넘은 양을 빨강으로 */
export function KcalRing({ value, progress, over = 0, caption = 'kcal 남았어요', target, size = 130, stroke = 12, numberSize, style }: KcalRingProps) {
  const isOver = over > 0;
  const shown = isOver ? `+${formatNumber(over)}` : formatNumber(value);
  const fs = numberSize ?? (isOver && shown.length >= 6 ? 24 : undefined);
  return (
    <View style={[styles.ringWrap, style]}>
      <View
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
        accessible
        accessibilityLabel={isOver ? `목표보다 ${formatNumber(over)}kcal 더 드셨어요` : `${formatNumber(value)} ${caption}`}
      >
        <Ring size={size} stroke={stroke} progress={progress} overflow={isOver} />
        <Text variant="number" color={isOver ? 'over' : 'ink'} style={fs ? { fontSize: fs, lineHeight: Math.round(fs * 1.15) } : null}>
          {shown}
        </Text>
        <Text variant="small" color={isOver ? 'over' : 'ink3'} style={styles.ringUnit}>
          {isOver ? 'kcal 넘었어요' : caption}
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
  /** 목표보다 더 먹은 kcal (DaySummary.over.kcal) — 0 보다 크면 "오늘 목표보다 320kcal 더 드셨어요"(빨강) */
  over?: number;
  style?: StyleProp<ViewStyle>;
}

/** 남은 양 미니카드 (D3) — 틴트 바탕 + "오늘 더 먹을 수 있는 양 540 kcal" + 흰 트랙 바. 넘었으면 연한 빨강 바탕 + 넘은 양 */
export function RoomBar({ remaining, progress, over = 0, style }: RoomBarProps) {
  const isOver = over > 0;
  const done = !isOver && remaining <= 0;
  const a11y = isOver ? `오늘 목표보다 ${formatNumber(over)}kcal 더 드셨어요` : done ? '오늘은 여기까지, 내일 다시 채워져요' : `오늘 더 먹을 수 있는 양 ${formatNumber(remaining)} kcal`;
  const p = clamp01(progress);
  // 넘었으면 바를 꽉 채우고 넘은 비율(목표 대비)만큼 오른쪽을 빨강으로
  const overW = isOver && progress > 0 ? Math.min(0.5, Math.max(0.08, 1 - 1 / progress)) : 0;
  return (
    <View style={[styles.room, isOver && styles.roomOver, style]} accessibilityRole="summary" accessibilityLabel={a11y}>
      {isOver ? (
        <Text variant="caption" color="ink2" style={styles.roomText}>
          오늘 목표보다{' '}
          <Text variant="h3" color="over">
            {formatNumber(over)}
          </Text>
          <Text variant="caption" color="over">
            kcal
          </Text>{' '}
          더 드셨어요
        </Text>
      ) : done ? (
        <Text variant="caption" color="ink2" style={styles.roomText}>
          오늘은 여기까지, 내일 다시 채워져요
        </Text>
      ) : (
        <Text variant="caption" color="ink2" style={styles.roomText}>
          오늘 더 먹을 수 있는 양{' '}
          <Text variant="h3" color="primaryText">
            {formatNumber(remaining)}
          </Text>{' '}
          kcal
        </Text>
      )}
      <View style={[styles.roomTrack, isOver && styles.rowTrack]}>
        <View style={[styles.roomFill, isOver ? styles.flat : null, { width: `${(isOver ? 1 - overW : p) * 100}%` }]} />
        {isOver ? <View style={[styles.roomFill, styles.overFill, { width: `${overW * 100}%` }]} /> : null}
      </View>
    </View>
  );
}

export type NutrientKey = 'kcal' | 'carbs' | 'protein' | 'fat' | 'sugar' | 'sodium';

export const NUTRIENT_META: Record<NutrientKey, { label: string; short: string; unit: string }> = {
  kcal: { label: '칼로리', short: '칼로리', unit: 'kcal' },
  carbs: { label: '탄수화물', short: '탄수', unit: 'g' },
  protein: { label: '단백질', short: '단백질', unit: 'g' },
  fat: { label: '지방', short: '지방', unit: 'g' },
  sugar: { label: '당', short: '당', unit: 'g' },
  sodium: { label: '나트륨', short: '나트륨', unit: 'g' },
};

/**
 * 영양소 값 표기 — 나트륨은 저장 단위(mg)를 시안처럼 g(소수 1자리)로 보여준다.
 * 1200 mg → "1.2" / 단위는 NUTRIENT_META[k].unit
 */
export function formatNutrient(k: NutrientKey, v: number): string {
  if (k === 'sodium') return (Math.round(v / 100) / 10).toFixed(1);
  return formatNumber(v);
}

export interface NutrientBarProps {
  nutrient: NutrientKey;
  /** 현재 값 (섭취량). 없으면 목표만 표시 */
  value?: number;
  max: number;
  /** 라벨 교체 */
  label?: string;
  /**
   * 목표보다 더 먹은 양 (DaySummary.over[k]). 0 보다 크면 바를 꽉 채우고 넘은 쪽을 빨강, 수치 빨강 + "+12g".
   * 단백질처럼 넘어도 괜찮은 영양소는 넘기지 않는다(초록으로 꽉 참)
   */
  over?: number;
  style?: StyleProp<ViewStyle>;
}

/** 영양소 미니바 (C1 링 옆) — 라벨 · 6px 바 · "42 / 80g" (값만 Bold). 넘었으면 "92 / 80g +12g" 빨강 */
export function NutrientBar({ nutrient, value, max, label, over = 0, style }: NutrientBarProps) {
  const m = NUTRIENT_META[nutrient];
  const progress = value == null ? 1 : max > 0 ? value / max : 0;
  const isOver = value != null && over > 0;
  // 넘은 쪽 폭 = 넘은 양 / 먹은 양 (예: 92g 중 12g) — 너무 가늘거나 굵지 않게
  const overW = isOver && value ? Math.min(0.5, Math.max(0.08, over / value)) : 0;
  const overText = isOver ? `+${formatNutrient(nutrient, over)}${m.unit}` : '';
  return (
    <View
      style={[styles.nb, style]}
      accessibilityLabel={`${label ?? m.label} ${value != null ? `${formatNutrient(nutrient, value)} / ` : ''}${formatNutrient(nutrient, max)}${m.unit}${isOver ? `, 목표보다 ${overText.slice(1)} 더 드셨어요` : ''}`}
    >
      <Text variant="small" color="ink3">
        {label ?? m.label}
      </Text>
      <View style={[styles.nbTrack, isOver && styles.rowTrack]}>
        <View style={[styles.nbFill, isOver ? styles.flat : null, { width: `${(isOver ? 1 - overW : clamp01(progress)) * 100}%` }]} />
        {isOver ? <View style={[styles.nbFill, styles.overFill, { width: `${overW * 100}%` }]} /> : null}
      </View>
      <Text variant="small" color="ink2" numberOfLines={1}>
        {value != null ? (
          <>
            <Text variant="label" color={isOver ? 'over' : 'ink'} style={styles.nbStrong}>
              {formatNutrient(nutrient, value)}
            </Text>{' '}
            / {formatNutrient(nutrient, max)}
            {m.unit}
            {isOver ? (
              <Text variant="label" color="over">
                {' '}
                {overText}
              </Text>
            ) : null}
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
  roomOver: { backgroundColor: colors.overBg },
  rowTrack: { flexDirection: 'row' },
  /** 넘은 쪽과 맞닿는 초록 끝은 둥글리지 않는다 — 트랙 overflow:hidden 이 바깥 끝을 둥글린다 */
  flat: { borderRadius: 0 },
  overFill: { borderRadius: 0, backgroundColor: colors.over },
  roomTrack: { width: 88, height: 6, borderRadius: radius.pill, backgroundColor: colors.surface, overflow: 'hidden', flexShrink: 0 },
  roomFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.primary },
  nb: { gap: 6 },
  nbTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden' },
  nbFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.primary },
  nbStrong: { fontFamily: fonts.bold },
});
