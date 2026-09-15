import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, type ReactNode } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandTile, Chip, CoverageBadge, EmptyState, Skeleton, Text, showToast } from '@/components';
import { getBrand } from '@/data';
import { STORE_CATEGORY_LABEL, formatDistance } from '@/data/labels';
import type { Store, StoreCategory } from '@/domain/types';
import { filterStores, useNearby, type CategoryFilter } from '@/state/nearby';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

const CATS: { id: CategoryFilter; label: string; icon?: (c: string) => ReactNode }[] = [
  { id: 'all', label: '전체' },
  { id: 'convenience', label: '편의점', icon: (c) => <MaterialCommunityIcons name="store-outline" size={20} color={c} /> },
  { id: 'cafe', label: '카페', icon: (c) => <MaterialCommunityIcons name="coffee-outline" size={20} color={c} /> },
  { id: 'salad', label: '샐러드', icon: () => <Ionicons name="leaf" size={18} color={colors.primary} /> },
  { id: 'korean', label: '한식', icon: (c) => <MaterialCommunityIcons name="rice" size={20} color={c} /> },
  { id: 'bakery', label: '베이커리', icon: (c) => <MaterialCommunityIcons name="baguette" size={20} color={c} /> },
];

/** D1 주변 매장 목록 — 시안 docs/design/D1-nearby.png */
export default function Nearby() {
  const { areaName, radiusM, category, stores, status, source, loadedAt, setRadius, setCategory, refresh } = useNearby();

  // 처음 들어오거나 5분이 지났으면 새로 찾는다
  useFocusEffect(
    useCallback(() => {
      const s = useNearby.getState();
      if (s.status === 'idle' || (s.status === 'ready' && s.loadedAt && Date.now() - s.loadedAt > 5 * 60 * 1000)) void s.refresh();
    }, []),
  );

  const visible = useMemo(() => filterStores(stores, category), [stores, category]);
  const busy = status === 'locating' || status === 'loading';

  let body: ReactNode;
  if (status === 'denied') {
    body = (
      <EmptyState
        emoji="📍"
        title="위치를 허용하면 주변 매장을 보여드려요"
        description="지금 계신 곳 근처 매장의 메뉴를 먼저 판정해 드릴게요."
        actionLabel="위치 허용하기"
        onAction={() => Linking.openSettings().catch(() => showToast('설정에서 위치 권한을 켜 주세요', 'info'))}
      />
    );
  } else if (status === 'error') {
    body = <EmptyState emoji="🧭" title="주변 매장을 불러오지 못했어요" description="잠시 후 다시 시도해 주세요." actionLabel="다시 찾기" onAction={() => void refresh()} />;
  } else if (busy && stores.length === 0) {
    body = (
      <View style={styles.list}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.card}>
            <Skeleton width={96} height={96} borderRadius={20} />
            <View style={styles.skelBody}>
              <Skeleton width="70%" height={18} />
              <Skeleton width="40%" height={14} />
              <Skeleton width="85%" height={14} />
              <Skeleton width={96} height={26} borderRadius={radius.pill} />
            </View>
          </View>
        ))}
      </View>
    );
  } else if (status === 'ready' && visible.length === 0) {
    body =
      radiusM === 500 ? (
        <EmptyState emoji="🌱" title="아직 주변에 아는 매장이 없어요" description="반경을 1km로 넓혀 볼까요?" actionLabel="1km로 넓혀 보기" onAction={() => setRadius(1000)} />
      ) : category !== 'all' ? (
        <EmptyState emoji="🌱" title={`주변에 ${STORE_CATEGORY_LABEL[category as StoreCategory]} 매장이 없어요`} description="다른 카테고리를 살펴보세요." actionLabel="전체 보기" onAction={() => setCategory('all')} />
      ) : (
        <EmptyState emoji="🌱" title="아직 주변에 아는 매장이 없어요" description="데이터가 있는 매장을 계속 늘려가고 있어요." />
      );
  } else {
    body = (
      <View style={styles.list}>
        {visible.map((s) => (
          <StoreCard key={s.id} store={s} onPress={() => router.push({ pathname: '/store/[id]', params: { id: s.id, brandId: s.brandId ?? '' } })} />
        ))}
        {source === 'mock' ? (
          <Text variant="caption" color="ink3" align="center" style={styles.sourceNote}>
            예시 매장 목록이에요
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={busy && stores.length > 0} onRefresh={() => void refresh()} tintColor={colors.primary} />}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text variant="h1" style={styles.title}>
              주변
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="위치 다시 찾기" onPress={() => void refresh()} style={styles.area}>
              <Ionicons name="location" size={20} color={colors.ink2} />
              <Text variant="body" color="ink2" numberOfLines={1} style={styles.areaText}>
                {areaName || (status === 'locating' ? '위치 찾는 중' : '현재 위치')}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.ink2} />
            </Pressable>
          </View>
          <View style={styles.segment} accessibilityRole="radiogroup">
            {([500, 1000] as const).map((r) => {
              const on = radiusM === r;
              return (
                <Pressable key={r} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setRadius(r)} style={[styles.segItem, on && styles.segOn]}>
                  <Text variant="bodyMedium" color={on ? 'primaryText' : 'ink2'} style={on ? styles.segTextOn : undefined}>
                    {r === 500 ? '500m' : '1km'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsWrap}>
          {CATS.map((c) => {
            const on = category === c.id;
            return (
              <Chip
                key={c.id}
                label={c.label}
                variant="outline"
                selected={on}
                onPress={() => setCategory(c.id)}
                left={c.icon?.(on ? colors.primaryText : colors.ink2)}
                style={[styles.chip, c.id === 'all' && styles.chipAll]}
              />
            );
          })}
        </ScrollView>

        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

function StoreCard({ store, onPress }: { store: Store; onPress: () => void }) {
  const brand = store.brandId ? getBrand(store.brandId) : undefined;
  const dim = store.coverage === 'none';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${store.name}, ${store.distanceM}미터`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, dim && styles.dim, pressed && styles.pressed]}
    >
      <BrandTile brandId={store.brandId} category={store.category} size={96} />
      <View style={styles.cardBody}>
        <Text variant="h3" numberOfLines={1} style={styles.storeName}>
          {store.name}
        </Text>
        <Text variant="body" color="ink2" style={styles.meta}>
          {formatDistance(store.distanceM)}  ·  {STORE_CATEGORY_LABEL[store.category]}
        </Text>
        {brand?.blurb ? (
          <Text variant="caption" color="ink2" numberOfLines={1} style={styles.blurb}>
            {brand.blurb}
          </Text>
        ) : null}
        <CoverageBadge coverage={store.coverage} style={styles.badge} />
      </View>
      <View style={styles.chev}>
        <Ionicons name="chevron-forward" size={18} color={colors.ink2} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: spacing.page, paddingTop: spacing.xxl },
  headerLeft: { flex: 1, marginRight: spacing.md },
  title: { fontSize: 30, lineHeight: 38 },
  area: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  areaText: { flexShrink: 1, marginLeft: 2, marginRight: 2 },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 3, marginBottom: 6, ...shadow.card },
  segItem: { height: 34, minWidth: 64, paddingHorizontal: spacing.md, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.primarySoft },
  segTextOn: {},
  chipsWrap: { marginTop: spacing.xl, flexGrow: 0 },
  chips: { paddingHorizontal: spacing.page - 4, gap: spacing.sm },
  chip: { height: 38, ...shadow.card, shadowOpacity: 0.03 },
  chipAll: { paddingHorizontal: 18 },
  list: { paddingHorizontal: spacing.page - 8, marginTop: spacing.lg, gap: spacing.md },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadow.card },
  dim: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
  cardBody: { flex: 1, marginLeft: spacing.lg, marginRight: spacing.sm },
  storeName: { fontSize: 18, lineHeight: 24, fontFamily: fonts.bold },
  meta: { marginTop: 2 },
  blurb: { marginTop: 3 },
  badge: { marginTop: 7, height: 26, paddingHorizontal: 11 },
  chev: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.lineSoft, alignItems: 'center', justifyContent: 'center' },
  skelBody: { flex: 1, marginLeft: spacing.lg, gap: spacing.sm },
  sourceNote: { marginTop: spacing.sm },
});
