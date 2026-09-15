import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { VERDICT_LABEL, type Coverage, type Trust, type Verdict } from '@/domain/types';
import { colors, radius, spacing } from '@/theme';

import { Text } from './Text';

type Size = 'sm' | 'md' | 'lg';

const SIZE = {
  sm: { h: 24, px: 8, icon: 13, gap: 4, text: 'label' as const },
  md: { h: 32, px: 14, icon: 16, gap: 6, text: 'captionMedium' as const },
  lg: { h: 36, px: 16, icon: 18, gap: 6, text: 'h3' as const },
};

/** 판정 배지: 좋음(초록) · 괜찮음(호박) · 오늘은 패스(빨강) */
export function VerdictBadge({ verdict, size = 'md', style }: { verdict: Verdict; size?: Size; style?: StyleProp<ViewStyle> }) {
  const s = SIZE[size];
  const fg = colors[verdict];
  const bg = colors[`${verdict}Bg` as const];
  return (
    <View style={[styles.pill, { height: s.h, paddingHorizontal: s.px, backgroundColor: bg, gap: s.gap }, style]} accessibilityLabel={`판정 ${VERDICT_LABEL[verdict]}`}>
      {verdict === 'pass' ? (
        <Ionicons name="ban" size={s.icon} color={fg} />
      ) : (
        <MaterialCommunityIcons name="sprout" size={s.icon + 2} color={fg} />
      )}
      <Text variant={s.text} style={{ color: fg }}>
        {VERDICT_LABEL[verdict]}
      </Text>
    </View>
  );
}

const TRUST: Record<Trust, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  official: { label: '공식 영양표', icon: 'shield-checkmark-outline' },
  estimated: { label: '추정치', icon: 'analytics-outline' },
  none: { label: '정보 없음', icon: 'help-circle-outline' },
  user: { label: '내가 입력', icon: 'create-outline' },
};

/** 신뢰등급 배지 — 색이 아니라 테두리·아이콘으로 구분 (판정 색과 섞이지 않게) */
export function TrustBadge({ trust, size = 'sm', style }: { trust: Trust; size?: 'sm' | 'md'; style?: StyleProp<ViewStyle> }) {
  const s = SIZE[size];
  const t = TRUST[trust];
  return (
    <View style={[styles.pill, styles.outline, { height: s.h, paddingHorizontal: s.px, gap: s.gap }, style]} accessibilityLabel={`신뢰등급 ${t.label}`}>
      <Ionicons name={t.icon} size={s.icon} color={colors.ink2} />
      <Text variant={s.text} color="ink2">
        {t.label}
      </Text>
    </View>
  );
}

const COVERAGE: Record<Coverage, { label: string; fg: string; bg: string }> = {
  full: { label: '영양표 있음', fg: colors.coverFull, bg: colors.coverFullBg },
  partial: { label: '일부', fg: colors.coverPartial, bg: colors.coverPartialBg },
  none: { label: '정보 없음', fg: colors.coverNone, bg: colors.coverNoneBg },
};

/** 매장 커버리지 배지 (D1) */
export function CoverageBadge({ coverage, style }: { coverage: Coverage; style?: StyleProp<ViewStyle> }) {
  const c = COVERAGE[coverage];
  return (
    <View style={[styles.pill, { height: 30, paddingHorizontal: 14, backgroundColor: c.bg, gap: spacing.sm }, style]} accessibilityLabel={`영양 정보 ${c.label}`}>
      {coverage === 'none' ? (
        <Ionicons name="information-circle" size={18} color={c.fg} />
      ) : (
        <Ionicons name="leaf" size={15} color={c.fg} />
      )}
      <Text variant="captionMedium" style={{ color: coverage === 'none' ? colors.ink2 : c.fg }}>
        {c.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: radius.pill },
  outline: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
});
