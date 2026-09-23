import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { VERDICT_LABEL, type Coverage, type Trust, type Verdict } from '@/domain/types';
import { colors, fonts, radius } from '@/theme';

import { FileCheckIcon } from './icons';
import { Text } from './Text';

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

const TRUST_LABEL: Record<Trust, string> = {
  official: '공식 영양표',
  estimated: '추정치',
  none: '정보 없음',
  user: '내가 입력',
};

function TrustIcon({ trust, size }: { trust: Trust; size: number }) {
  if (trust === 'official') return <FileCheckIcon size={size} color={colors.ink2} />;
  if (trust === 'estimated') return <MaterialCommunityIcons name="calculator-variant-outline" size={size} color={colors.ink2} />;
  if (trust === 'user') return <Ionicons name="create-outline" size={size} color={colors.ink2} />;
  return <Ionicons name="help-circle-outline" size={size} color={colors.ink2} />;
}

/** 아웃라인 배지 틀 — 색 채움 없이 1px 회색 테두리 + 아이콘 + 회색 글자 (판정 색과 분리) */
function OutlinePill({ icon, label, size = 'md', accessibilityLabel, style }: { icon?: ReactNode; label: string; size?: 'sm' | 'md'; accessibilityLabel: string; style?: StyleProp<ViewStyle> }) {
  const h = size === 'sm' ? 24 : 28;
  return (
    <View style={[styles.pill, styles.outline, { height: h, paddingLeft: icon ? 8 : 10, paddingRight: 10, gap: 4 }, style]} accessibilityLabel={accessibilityLabel}>
      {icon}
      <Text variant="small" color="ink2" style={styles.medium}>
        {label}
      </Text>
    </View>
  );
}

/** 신뢰등급 배지 — 공식 영양표 · 추정치 · 정보 없음 · 내가 입력 */
export function TrustBadge({ trust, size = 'md', style }: { trust: Trust; size?: 'sm' | 'md'; style?: StyleProp<ViewStyle> }) {
  return (
    <OutlinePill
      icon={<TrustIcon trust={trust} size={size === 'sm' ? 13 : 14} />}
      label={TRUST_LABEL[trust]}
      size={size}
      accessibilityLabel={`신뢰등급 ${TRUST_LABEL[trust]}`}
      style={style}
    />
  );
}

const COVERAGE_LABEL: Record<Coverage, string> = {
  full: '영양표 있음',
  partial: '일부 있음',
  none: '정보 없음',
};

/** 매장 커버리지 배지 (D1) — 신뢰등급과 같은 아웃라인 계열 */
export function CoverageBadge({ coverage, size = 'md', style }: { coverage: Coverage; size?: 'sm' | 'md'; style?: StyleProp<ViewStyle> }) {
  const icon =
    coverage === 'full' ? (
      <FileCheckIcon size={14} color={colors.ink2} />
    ) : coverage === 'partial' ? (
      <MaterialCommunityIcons name="file-document-outline" size={14} color={colors.ink2} />
    ) : (
      <Ionicons name="help-circle-outline" size={14} color={colors.ink3} />
    );
  return <OutlinePill icon={icon} label={COVERAGE_LABEL[coverage]} size={size} accessibilityLabel={`영양 정보 ${COVERAGE_LABEL[coverage]}`} style={style} />;
}

/** 정보 없는 메뉴 자리 배지 (판정 배지 대신) */
export function UnknownBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  return <OutlinePill label="정보 없음" size="sm" accessibilityLabel="영양 정보 없음" style={style} />;
}

/** 매장 메뉴들의 신뢰등급을 하나로 요약 (D3 헤더) — 추정치가 섞이면 추정치, 공식만 있으면 공식 */
export function summarizeTrust(trusts: Trust[]): Trust {
  if (trusts.includes('estimated')) return 'estimated';
  if (trusts.includes('official')) return 'official';
  if (trusts.includes('user')) return 'user';
  return 'none';
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: radius.pill },
  outline: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  bold: { fontFamily: fonts.bold },
  medium: { fontFamily: fonts.medium },
});
