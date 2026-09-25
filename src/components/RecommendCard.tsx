import { Pressable, StyleSheet, View } from 'react-native';

import { formatDistance } from '@/data/labels';
import { formatNumber } from '@/domain/summary';
import { VERDICT_LABEL, type MenuItem, type Verdict } from '@/domain/types';
import { colors, fonts, radius, spacing } from '@/theme';

import { VerdictBadge } from './Badge';
import { MenuTile } from './BrandTile';
import { Skeleton } from './Skeleton';
import { Text } from './Text';

/** 가로 스크롤 추천 카드 폭 — 390 폭에서 2장 반이 보이게 */
export const RECOMMEND_CARD_WIDTH = 152;

export interface RecommendCardProps {
  menu: Pick<MenuItem, 'name' | 'category'>;
  storeName: string;
  distanceM: number;
  kcal: number;
  verdict: Verdict;
  /** 칩에 맞춘 보조 수치 한 줄 ("단백질 25g") — 없으면 생략 */
  sub?: string;
  onPress: () => void;
}

/** C1 "지금 근처 추천" 카드 — 메뉴 타일 · 메뉴명 · 매장·거리 · kcal · 판정 배지 */
export function RecommendCard({ menu, storeName, distanceM, kcal, verdict, sub, onPress }: RecommendCardProps) {
  const distance = formatDistance(distanceM);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${menu.name}, ${storeName} ${distance}, ${formatNumber(kcal)}kcal, ${VERDICT_LABEL[verdict]}${sub ? `, ${sub}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <MenuTile menu={menu} size={44} />
      <Text variant="h3" numberOfLines={2} style={styles.name}>
        {menu.name}
      </Text>
      <Text variant="small" color="ink3" numberOfLines={1}>
        {storeName} · {distance}
      </Text>
      <View style={styles.bottom}>
        <View style={styles.nums}>
          <Text variant="caption" color="ink2" numberOfLines={1}>
            <Text variant="captionMedium" color="ink" style={styles.bold}>
              {formatNumber(kcal)}
            </Text>{' '}
            kcal
          </Text>
          {sub ? (
            <Text variant="small" color="ink3" numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
        <VerdictBadge verdict={verdict} size="sm" />
      </View>
    </Pressable>
  );
}

/** 찾는 중 자리 */
export function RecommendCardSkeleton() {
  return (
    <View style={styles.card}>
      <Skeleton width={44} height={44} borderRadius={22} />
      <Skeleton width="85%" height={16} style={styles.skelGap} />
      <Skeleton width="60%" height={12} />
      <View style={styles.bottom}>
        <Skeleton width={56} height={14} />
        <Skeleton width={44} height={24} borderRadius={radius.pill} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: RECOMMEND_CARD_WIDTH,
    minHeight: 184,
    padding: spacing.lg,
    gap: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.section },
  name: { marginTop: spacing.sm, minHeight: 44 },
  skelGap: { marginTop: spacing.sm },
  bottom: { marginTop: 'auto', paddingTop: spacing.sm, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.xs },
  nums: { flexShrink: 1 },
  bold: { fontFamily: fonts.bold },
});
