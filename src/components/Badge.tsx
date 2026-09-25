import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { VERDICT_LABEL, type Coverage, type Trust, type Verdict } from '@/domain/types';
import { colors, fonts, radius } from '@/theme';

import { FileCheckIcon } from './icons';
import { Text } from './Text';
import { showToast } from './Toast';

type Size = 'sm' | 'md' | 'lg';

const SIZE = {
  sm: { h: 24, px: 8, icon: 13, gap: 4, text: 'label' as const },
  md: { h: 26, px: 10, icon: 14, gap: 4, text: 'label' as const },
  lg: { h: 32, px: 14, icon: 16, gap: 6, text: 'h3' as const },
};

/** 판정 배지: 좋음 · 괜찮음 · 오늘은 패스 — 연한 바탕 + 진한 글자, 아이콘 없음 (빨강 금지) */
export function VerdictBadge({ verdict, size = 'md', style }: { verdict: Verdict; size?: Size; style?: StyleProp<ViewStyle> }) {
  const s = SIZE[size];
  const fg = colors[verdict];
  const bg = colors[`${verdict}Bg` as const];
  return (
    <View style={[styles.pill, { height: s.h, paddingHorizontal: s.px, backgroundColor: bg }, style]} accessibilityLabel={`판정 ${VERDICT_LABEL[verdict]}`}>
      <Text variant={s.text} style={[{ color: fg }, size !== 'lg' && styles.bold]}>
        {VERDICT_LABEL[verdict]}
      </Text>
    </View>
  );
}

/** 신뢰등급 배지 문구 — 내부 용어(공식 영양표·추정치) 대신 "어디서 온 숫자인지"를 말한다. sm 은 좁은 자리용 짧은 말 */
export const TRUST_LABEL: Record<Trust, string> = {
  official: '브랜드 공개 수치',
  estimated: '비슷한 메뉴로 계산',
  none: '아직 정보 없음',
  user: '직접 입력',
};
const TRUST_LABEL_SHORT: Record<Trust, string> = {
  official: '브랜드 공개',
  estimated: '계산값',
  none: '정보 없음',
  user: '직접 입력',
};
/** 배지를 누르면 보여주는 한 줄 설명 */
export const TRUST_EXPLAIN: Record<Trust, string> = {
  official: '브랜드가 공개한 영양 정보를 그대로 옮겼어요',
  estimated: '공개된 비슷한 메뉴로 사이즈·옵션을 계산했어요',
  none: '아직 확인된 영양 정보가 없어서 판정하지 않아요',
  user: '직접 입력하신 값이에요',
};

function TrustIcon({ trust, size }: { trust: Trust; size: number }) {
  if (trust === 'official') return <FileCheckIcon size={size} color={colors.ink2} />;
  if (trust === 'estimated') return <MaterialCommunityIcons name="calculator-variant-outline" size={size} color={colors.ink2} />;
  if (trust === 'user') return <Ionicons name="create-outline" size={size} color={colors.ink2} />;
  return <Ionicons name="help-circle-outline" size={size} color={colors.ink2} />;
}

interface OutlinePillProps {
  icon?: ReactNode;
  label: string;
  size?: 'sm' | 'md';
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
  /** 있으면 눌리는 배지 — 끝에 작은 ⓘ 를 붙여 눌린다는 걸 보여준다 */
  onPress?: () => void;
  accessibilityHint?: string;
}

/** 아웃라인 배지 틀 — 색 채움 없이 1px 회색 테두리 + 아이콘 + 회색 글자 (판정 색과 분리) */
function OutlinePill({ icon, label, size = 'md', accessibilityLabel, style, onPress, accessibilityHint }: OutlinePillProps) {
  const h = size === 'sm' ? 24 : 28;
  const pill = [styles.pill, styles.outline, { height: h, paddingLeft: icon ? 8 : 10, paddingRight: onPress ? 7 : 10, gap: 4 }];
  const body = (
    <>
      {icon}
      <Text variant="small" color="ink2" style={styles.medium} numberOfLines={1}>
        {label}
      </Text>
      {onPress ? <Ionicons name="information-circle-outline" size={size === 'sm' ? 12 : 13} color={colors.ink3} /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={[...pill, style]} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [...pill, pressed && styles.pressed, style]}
    >
      {body}
    </Pressable>
  );
}

/**
 * 신뢰등급 배지 — 브랜드 공개 수치 · 비슷한 메뉴로 계산 · 아직 정보 없음 · 직접 입력.
 * 기본으로 눌리며, 누르면 한 줄 설명을 토스트로 보여준다 (explain={false} 면 그냥 배지).
 */
/**
 * 일반 음식(브랜드 없는 대표 음식 — 식약처 음식 데이터) 문구. 공식값이어도 "브랜드 공개"가 아니고,
 * 동네 식당 추정은 "이 가게 대신 일반 식당 1인분"이다.
 */
const GENERIC_TRUST: Partial<Record<Trust, { label: string; short: string; explain: string }>> = {
  official: { label: '식약처 대표 음식', short: '식약처', explain: '식약처 음식 데이터의 대표 음식 1인분이에요. 가게마다 양이 달라요' },
  estimated: { label: '비슷한 메뉴로 계산', short: '계산값', explain: '이 가게 정보가 없어 일반 식당 1인분(식약처 대표 음식)으로 계산했어요' },
};

export function TrustBadge({
  trust,
  size = 'md',
  style,
  explain = true,
  generic = false,
}: {
  trust: Trust;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
  explain?: boolean;
  /** 일반 음식(대표 음식) 메뉴면 true — 출처 문구를 식약처 대표 음식으로 */
  generic?: boolean;
}) {
  const g = generic ? GENERIC_TRUST[trust] : undefined;
  const full = g?.label ?? TRUST_LABEL[trust];
  const label = size === 'sm' ? (g?.short ?? TRUST_LABEL_SHORT[trust]) : full;
  const why = g?.explain ?? TRUST_EXPLAIN[trust];
  return (
    <OutlinePill
      icon={<TrustIcon trust={trust} size={size === 'sm' ? 13 : 14} />}
      label={label}
      size={size}
      accessibilityLabel={`영양 정보 출처: ${full}`}
      accessibilityHint={explain ? '누르면 무슨 뜻인지 알려드려요' : undefined}
      onPress={explain ? () => showToast(why, 'info') : undefined}
      style={style}
    />
  );
}

const COVERAGE_LABEL: Record<Coverage, string> = {
  full: '메뉴 정보 있음',
  partial: '일부 메뉴만',
  none: '아직 정보 없음',
};

/**
 * 매장 커버리지 배지 (D1) — 신뢰등급과 같은 아웃라인 계열.
 * menuCount 를 주면 "메뉴 32개 확인됨" 처럼 결과로 말한다 (없으면 짧은 기본 문구).
 */
export function CoverageBadge({ coverage, menuCount, size = 'md', style }: { coverage: Coverage; menuCount?: number; size?: 'sm' | 'md'; style?: StyleProp<ViewStyle> }) {
  const icon =
    coverage === 'full' ? (
      <FileCheckIcon size={14} color={colors.ink2} />
    ) : coverage === 'partial' ? (
      <MaterialCommunityIcons name="file-document-outline" size={14} color={colors.ink2} />
    ) : (
      <Ionicons name="help-circle-outline" size={14} color={colors.ink3} />
    );
  const label = coverage !== 'none' && typeof menuCount === 'number' && menuCount > 0 ? `메뉴 ${formatCount(menuCount)}개 확인됨` : COVERAGE_LABEL[coverage];
  return <OutlinePill icon={icon} label={label} size={size} accessibilityLabel={`영양 정보 ${label}`} style={style} />;
}

const formatCount = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 정보 없는 메뉴 자리 배지 (판정 배지 대신) */
export function UnknownBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  return <OutlinePill label="정보 없음" size="sm" accessibilityLabel="아직 영양 정보 없음" style={style} />;
}

/** 매장 메뉴들의 신뢰등급을 하나로 요약 (D3 헤더) — 정보 있는 메뉴 중 가장 많은 등급 (같으면 보수적으로 추정치) */
export function summarizeTrust(trusts: Trust[]): Trust {
  const official = trusts.filter((t) => t === 'official').length;
  const estimated = trusts.filter((t) => t === 'estimated').length;
  if (official === 0 && estimated === 0) return trusts.includes('user') ? 'user' : 'none';
  return official > estimated ? 'official' : 'estimated';
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill },
  outline: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  bold: { fontFamily: fonts.bold },
  medium: { fontFamily: fonts.medium },
  pressed: { opacity: 0.6 },
});
