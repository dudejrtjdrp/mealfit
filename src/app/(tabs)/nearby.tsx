import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheet, BrandTile, ChevronDownIcon, ChevronRightIcon, Chip, CoverageBadge, EmptyState, IconButton, PinIcon, Skeleton, Text, TrustBadge, showToast } from '@/components';
import { getBrand, menusForStore } from '@/data';
import { STORE_CATEGORY_LABEL, formatDistance } from '@/data/labels';
import { applyOptions, rankMenus } from '@/domain/judge';
import { formatNumber } from '@/domain/summary';
import { VERDICT_LABEL, type Store, type StoreCategory } from '@/domain/types';
import { useJudgeContext } from '@/state/judgeContext';
import { useDay } from '@/state/day';
import type { Radius } from '@/services/kakao';
import { filterStores, shortAreaName, splitByInfo, summarizeRanked, useNearby, type CategoryFilter, type StorePick } from '@/state/nearby';
import { useProfile } from '@/state/profile';
import { colors, fonts, radius, size, spacing } from '@/theme';

const RADII: { value: Radius; label: string; hint: string }[] = [
  { value: 500, label: '500m', hint: '걸어서 7분 안팎' },
  { value: 1000, label: '1km', hint: '걸어서 15분 안팎' },
];
const radiusLabel = (r: Radius) => (r === 500 ? '500m' : '1km');

const CATS: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'convenience', label: '편의점' },
  { id: 'cafe', label: '카페' },
  { id: 'salad', label: '샐러드' },
  { id: 'korean', label: '한식' },
  { id: 'bakery', label: '베이커리' },
];

/** D1 주변 매장 목록 — 위치 헤더("역삼동 · 500m ▾": 동네 탭 → 위치 설정, 반경 탭 → 시트) · 카테고리 칩 · 매장 카드(판정 요약) */
export default function Nearby() {
  const { areaName, pinned, radiusM, category, stores, status, source, setRadius, setCategory, refresh } = useNearby();
  const [radiusOpen, setRadiusOpen] = useState(false);

  // 처음 들어오거나 5분이 지났으면 새로 찾는다
  useFocusEffect(
    useCallback(() => {
      const s = useNearby.getState();
      if (s.status === 'idle' || (s.status === 'ready' && s.loadedAt && Date.now() - s.loadedAt > 5 * 60 * 1000)) void s.refresh();
    }, []),
  );

  const visible = useMemo(() => filterStores(stores, category), [stores, category]);

  // 매장 카드 판정 요약 — 브랜드별로 한 번만 판정한다 (남은 양·프로필이 바뀌면 다시)
  const targets = useProfile((s) => s.targets);
  const remaining = useDay((s) => s.summary?.remaining) ?? targets;
  const jctx = useJudgeContext();
  const pickCache = useMemo(() => new Map<string, StorePick>(), [remaining, jctx]);
  const pickFor = (s: Store): StorePick | null => {
    if (s.coverage === 'none' || !remaining) return null;
    // 브랜드 매장은 브랜드별로, 브랜드 아닌 동네 식당(대표 음식 추정)은 이름·분류별로 한 번만 판정
    const key = s.brandId ?? `place:${s.name}|${s.placeCategory ?? ''}`;
    let p = pickCache.get(key);
    if (!p) {
      const menus = menusForStore(s);
      if (menus.length === 0) return null;
      p = summarizeRanked(rankMenus(menus, remaining, jctx));
      pickCache.set(key, p);
    }
    return p;
  };
  const busy = status === 'locating' || status === 'loading';
  // 정보 없는 매장은 목록 맨 아래 "정보 준비 중 N곳" 한 줄로 접는다
  const { known, noInfo } = useMemo(() => splitByInfo(visible), [visible]);
  const [showNoInfo, setShowNoInfo] = useState(false);
  const openStore = (s: Store) => router.push({ pathname: '/store/[id]', params: { id: s.id, brandId: s.brandId ?? '' } });

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
        {known.map((s) => (
          <StoreCard key={s.id} store={s} pick={pickFor(s)} onPress={() => openStore(s)} />
        ))}
        {noInfo.length > 0 && known.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showNoInfo }}
            accessibilityLabel={`정보 준비 중인 매장 ${noInfo.length}곳, ${showNoInfo ? '접기' : '펼치기'}`}
            onPress={() => setShowNoInfo((v) => !v)}
            style={({ pressed }) => [styles.foldRow, pressed && styles.pressed]}
          >
            <Ionicons name="time-outline" size={16} color={colors.ink3} />
            <Text variant="captionMedium" color="ink2" style={styles.foldText}>
              정보 준비 중 {noInfo.length}곳
            </Text>
            <View style={showNoInfo ? styles.flip : undefined}>
              <ChevronDownIcon size={18} color={colors.ink3} />
            </View>
          </Pressable>
        ) : null}
        {showNoInfo || known.length === 0 ? noInfo.map((s) => <StoreCard key={s.id} store={s} pick={null} onPress={() => openStore(s)} />) : null}
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
          <View style={styles.titleRow}>
            <Text variant="h1" accessibilityRole="header">
              주변
            </Text>
            <IconButton name="search" label="매장·메뉴 검색" onPress={() => router.push('/nearby/search')} color={colors.ink} />
          </View>
          <View style={styles.locRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`검색 위치 설정, 지금 ${areaName || '현재 위치'}`}
              accessibilityHint="지도에서 검색 기준 위치를 바꿀 수 있어요"
              onPress={() => router.push('/nearby/location')}
              style={({ pressed }) => [styles.area, pressed && styles.pressed]}
            >
              <PinIcon size={18} color={pinned ? colors.primary : colors.ink2} />
              <Text variant="captionMedium" color={pinned ? 'primaryText' : 'ink'} numberOfLines={1} style={styles.areaText}>
                {areaName ? shortAreaName(areaName) : status === 'locating' ? '위치 찾는 중' : '현재 위치'}
              </Text>
            </Pressable>
            <Text variant="caption" color="ink3">
              ·
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`검색 반경 ${radiusLabel(radiusM)}, 바꾸기`}
              hitSlop={6}
              onPress={() => setRadiusOpen(true)}
              style={({ pressed }) => [styles.radiusBtn, pressed && styles.pressed]}
            >
              <Text variant="captionMedium" color="ink">
                {radiusLabel(radiusM)}
              </Text>
              <ChevronDownIcon size={16} color={colors.ink3} />
            </Pressable>
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsWrap}>
          {CATS.map((c) => (
            <Chip key={c.id} label={c.label} selected={category === c.id} onPress={() => setCategory(c.id)} />
          ))}
        </ScrollView>

        {body}
      </ScrollView>

      <BottomSheet visible={radiusOpen} onClose={() => setRadiusOpen(false)} title="얼마나 멀리까지 찾을까요?">
        {RADII.map((r, i) => {
          const selected = r.value === radiusM;
          return (
            <Pressable
              key={r.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${r.label}, ${r.hint}`}
              onPress={() => {
                setRadiusOpen(false);
                setRadius(r.value);
              }}
              style={({ pressed }) => [styles.radiusRow, i > 0 && styles.radiusRowSep, pressed && styles.pressed]}
            >
              <View style={styles.radiusBody}>
                <Text variant="h3" color={selected ? 'primaryText' : 'ink'}>
                  {r.label}
                </Text>
                <Text variant="caption" color="ink3">
                  {r.hint}
                </Text>
              </View>
              {selected ? <Ionicons name="checkmark" size={22} color={colors.primary} /> : null}
            </Pressable>
          );
        })}
      </BottomSheet>
    </SafeAreaView>
  );
}

function StoreCard({ store, pick, onPress }: { store: Store; pick: StorePick | null; onPress: () => void }) {
  const brand = store.brandId ? getBrand(store.brandId) : undefined;
  const top = pick?.top;
  const topKcal = top ? applyOptions(top.menu)?.kcal : undefined;
  // 좋음이 있으면 좋음 수, 없으면 괜찮음 수 — 오늘은 패스뿐이면 요약 없이 조용히
  const lead = pick && pick.good > 0 ? ({ verdict: 'good', n: pick.good } as const) : pick && pick.ok > 0 ? ({ verdict: 'ok', n: pick.ok } as const) : null;
  const pickLabel = lead && top ? `${VERDICT_LABEL[lead.verdict]} ${lead.n}개, 추천 ${top.menu.name}${topKcal != null ? ` ${formatNumber(topKcal)}kcal` : ''}` : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${store.name}, ${formatDistance(store.distanceM)}${pickLabel ? `, ${pickLabel}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <BrandTile brandId={store.brandId} category={store.category} name={store.name} placeCategory={store.placeCategory} size={48} />
      <View style={styles.cardBody}>
        <Text variant="h3" numberOfLines={1}>
          {store.name}
        </Text>
        <Text variant="small" color="ink3" numberOfLines={1}>
          {formatDistance(store.distanceM)} · {STORE_CATEGORY_LABEL[store.category]}
          {brand?.blurb ? ` · ${brand.blurb}` : !store.brandId && store.coverage !== 'none' ? ' · 일반 식당 기준 대표 음식' : ''}
        </Text>
        {lead && top ? (
          <View style={styles.pickWrap}>
            <View style={styles.pick}>
              <Ionicons name={lead.verdict === 'good' ? 'checkmark-circle' : 'ellipse'} size={14} color={colors[lead.verdict]} />
              <Text variant="captionMedium" numberOfLines={1} style={[styles.pickLead, { color: colors[lead.verdict] }]}>
                {VERDICT_LABEL[lead.verdict]} {lead.n}개
              </Text>
            </View>
            <Text variant="caption" color="ink2" numberOfLines={1}>
              추천 {top.menu.name}
              {topKcal != null ? <Text variant="caption" color="ink3">{` · ${formatNumber(topKcal)}kcal`}</Text> : null}
            </Text>
          </View>
        ) : null}
        {/* 브랜드 아닌 동네 식당은 "확인된" 메뉴가 아니라 일반 식당 기준 추정 — 추정 배지로 */}
        {!store.brandId && store.coverage !== 'none' ? (
          <TrustBadge trust="estimated" size="sm" generic explain={false} style={styles.badge} />
        ) : (
          <CoverageBadge coverage={store.coverage} menuCount={pick?.known} size="sm" style={styles.badge} />
        )}
      </View>
      <ChevronRightIcon size={18} color={colors.ink3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.xxxl },
  header: { paddingHorizontal: spacing.page, paddingTop: spacing.lg, minHeight: size.header },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginRight: -10 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  area: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, flexShrink: 1 },
  areaText: { flexShrink: 1 },
  radiusBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 36 },
  radiusRow: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingVertical: spacing.md },
  radiusRowSep: { borderTopWidth: 1, borderTopColor: colors.line },
  radiusBody: { flex: 1, gap: 2 },
  chipsWrap: { marginTop: spacing.md, flexGrow: 0 },
  chips: { paddingHorizontal: spacing.page, gap: spacing.sm, alignItems: 'center' },
  list: { paddingHorizontal: spacing.page, marginTop: spacing.lg, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: spacing.lg },
  pressed: { opacity: 0.8 },
  cardBody: { flex: 1, minWidth: 0, gap: 4 },
  badge: { marginTop: 4, alignSelf: 'flex-start' },
  pickWrap: { marginTop: 2, gap: 2 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pickLead: { fontFamily: fonts.semibold, flexShrink: 0 },
  foldRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, paddingHorizontal: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.section },
  foldText: { flex: 1 },
  flip: { transform: [{ rotate: '180deg' }] },
  skelBody: { flex: 1, gap: spacing.sm },
  sourceNote: { marginTop: spacing.sm },
});
