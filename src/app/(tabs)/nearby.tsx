import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, type ReactNode } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandTile, ChevronRightIcon, Chip, CoverageBadge, EmptyState, PinIcon, Skeleton, Text, showToast } from '@/components';
import { getBrand } from '@/data';
import { STORE_CATEGORY_LABEL, formatDistance } from '@/data/labels';
import type { Store, StoreCategory } from '@/domain/types';
import { filterStores, useNearby, type CategoryFilter } from '@/state/nearby';
import { colors, radius, size, spacing } from '@/theme';

const CATS: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'convenience', label: '편의점' },
  { id: 'cafe', label: '카페' },
  { id: 'salad', label: '샐러드' },
  { id: 'korean', label: '한식' },
  { id: 'bakery', label: '베이커리' },
];

/** D1 주변 매장 목록 — 위치 헤더(탭 → 위치 설정) · 반경/카테고리 칩 · 매장 카드(커버리지 아웃라인 배지) */
export default function Nearby() {
  const { areaName, pinned, radiusM, category, stores, status, source, setRadius, setCategory, refresh } = useNearby();

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
        pose="base"
        title="위치를 허용하면 주변 매장을 보여드려요"
        description="지금 계신 곳 근처 매장의 메뉴를 먼저 판정해 드릴게요."
        actionLabel="위치 허용하기"
        onAction={() => Linking.openSettings().catch(() => showToast('설정에서 위치 권한을 켜 주세요', 'info'))}
      />
    );
  } else if (status === 'error') {
    body = <EmptyState pose="sorry" title="주변 매장을 불러오지 못했어요" description="잠시 후 다시 시도해 주세요." actionLabel="다시 찾기" onAction={() => void refresh()} />;
  } else if (busy && stores.length === 0) {
    body = (
      <View style={styles.list}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.card}>
            <Skeleton width={48} height={48} borderRadius={24} />
            <View style={styles.skelBody}>
              <Skeleton width="60%" height={16} />
              <Skeleton width="40%" height={12} />
            </View>
          </View>
        ))}
      </View>
    );
  } else if (status === 'ready' && visible.length === 0) {
    body =
      radiusM === 500 ? (
        <EmptyState pose="sleep" title="아직 주변에 아는 매장이 없어요" description="반경을 1km로 넓혀 볼까요?" actionLabel="1km로 넓혀 보기" onAction={() => setRadius(1000)} />
      ) : category !== 'all' ? (
        <EmptyState pose="sleep" title={`주변에 ${STORE_CATEGORY_LABEL[category as StoreCategory]} 매장이 없어요`} description="다른 카테고리를 살펴보세요." actionLabel="전체 보기" onAction={() => setCategory('all')} />
      ) : (
        <EmptyState pose="sleep" title="아직 주변에 아는 매장이 없어요" description="데이터가 있는 매장을 계속 늘려가고 있어요." />
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
          <Text variant="h1" accessibilityRole="header">
            주변
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`검색 위치 설정, 지금 ${areaName || '현재 위치'}`}
            accessibilityHint="지도에서 검색 기준 위치를 바꿀 수 있어요"
            onPress={() => router.push('/nearby/location')}
            style={styles.area}
          >
            <PinIcon size={18} color={pinned ? colors.primary : colors.ink2} />
            <Text variant="caption" color={pinned ? 'primaryText' : 'ink2'} numberOfLines={1} style={styles.areaText}>
              {areaName || (status === 'locating' ? '위치 찾는 중' : '현재 위치')}
            </Text>
            <ChevronRightIcon size={16} color={colors.ink3} />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsWrap}>
          {([500, 1000] as const).map((r) => (
            <Chip key={r} label={r === 500 ? '500m' : '1km'} variant="option" selected={radiusM === r} onPress={() => setRadius(r)} />
          ))}
          <View style={styles.chipDivider} />
          {CATS.map((c) => (
            <Chip key={c.id} label={c.label} selected={category === c.id} onPress={() => setCategory(c.id)} />
          ))}
        </ScrollView>

        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

function StoreCard({ store, onPress }: { store: Store; onPress: () => void }) {
  const brand = store.brandId ? getBrand(store.brandId) : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${store.name}, ${formatDistance(store.distanceM)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <BrandTile brandId={store.brandId} category={store.category} size={48} />
      <View style={styles.cardBody}>
        <Text variant="h3" numberOfLines={1}>
          {store.name}
        </Text>
        <Text variant="small" color="ink3" numberOfLines={1}>
          {formatDistance(store.distanceM)} · {STORE_CATEGORY_LABEL[store.category]}
          {brand?.blurb ? ` · ${brand.blurb}` : ''}
        </Text>
        <CoverageBadge coverage={store.coverage} size="sm" style={styles.badge} />
      </View>
      <ChevronRightIcon size={18} color={colors.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.xxxl },
  header: { paddingHorizontal: spacing.page, paddingTop: spacing.lg, minHeight: size.header },
  area: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, minHeight: 32, alignSelf: 'flex-start' },
  areaText: { flexShrink: 1 },
  chipsWrap: { marginTop: spacing.md, flexGrow: 0 },
  chips: { paddingHorizontal: spacing.page, gap: spacing.sm, alignItems: 'center' },
  chipDivider: { width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: spacing.xs },
  list: { paddingHorizontal: spacing.page, marginTop: spacing.lg, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.lg },
  pressed: { opacity: 0.8 },
  cardBody: { flex: 1, minWidth: 0, gap: 4 },
  badge: { marginTop: 4, alignSelf: 'flex-start' },
  skelBody: { flex: 1, gap: spacing.sm },
  sourceNote: { marginTop: spacing.sm },
});
