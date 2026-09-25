import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackIcon, BrandTile, Chip, EmptyState, IconButton, MenuTile, Text, UnknownBadge, VerdictBadge } from '@/components';
import { FavoriteButton } from '@/components/FavoriteButton';
import { getBrand, getBrands, normalizeName, searchMenus } from '@/data';
import { STORE_CATEGORY_LABEL, formatDistance } from '@/data/labels';
import { applyOptions, judgeMenu } from '@/domain/judge';
import { formatNumber } from '@/domain/summary';
import type { Brand, DailyTargets, MenuItem } from '@/domain/types';
import { useJudgeContext } from '@/state/judgeContext';
import { useDay } from '@/state/day';
import { searchProductsRemote } from '@/services/products';
import { nearestOfBrand, searchBrands, useNearby } from '@/state/nearby';
import { useProfile } from '@/state/profile';
import { colors, radius, size, spacing, type } from '@/theme';

const BRAND_LIMIT = 6;
const MENU_LIMIT = 40;
const REMOTE_LIMIT = 20;

/**
 * D2 매장·메뉴 검색 — 브랜드를 고르면 가장 가까운 그 매장(없으면 브랜드 메뉴), 메뉴를 고르면 메뉴 상세.
 * 메뉴는 기록 추가(E2)와 같은 순위(searchMenus: 매장 메뉴 + 시판 제품) + 서버 제품 검색을 뒤에 합친다.
 */
export default function NearbySearch() {
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim());

  const stores = useNearby((s) => s.stores);
  const radiusM = useNearby((s) => s.radiusM);
  const profile = useProfile((s) => s.profile);
  const targets = useProfile((s) => s.targets);
  const remaining = useDay((s) => s.summary?.remaining) ?? targets;

  const nearbyBrandIds = useMemo(() => new Set(stores.flatMap((s) => (s.brandId && s.coverage !== 'none' ? [s.brandId] : []))), [stores]);
  const brands = useMemo(() => (q ? searchBrands(getBrands(), q).slice(0, BRAND_LIMIT) : []), [q]);

  // 서버 제품 검색 — 로컬 결과를 먼저 보여주고, 서버 결과가 오면 뒤에 합친다 (E2 와 같은 흐름)
  const [remote, setRemote] = useState<{ q: string; items: MenuItem[] } | null>(null);
  useEffect(() => {
    if (normalizeName(q) === '') {
      setRemote(null);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      const items = await searchProductsRemote(q, REMOTE_LIMIT).catch(() => null);
      if (alive) setRemote({ q, items: items ?? [] });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);
  const remoteLoading = normalizeName(q) !== '' && remote?.q !== q;

  const menus = useMemo(() => {
    if (!q) return [];
    const local = searchMenus(q, MENU_LIMIT);
    const seen = new Set(local.map((m) => m.id));
    const extra = remote?.q === q ? remote.items.filter((m) => !seen.has(m.id)) : [];
    return [...local, ...extra].slice(0, MENU_LIMIT + REMOTE_LIMIT);
  }, [q, remote]);

  /** 빈 검색창 아래 — 지금 주변에 있는 브랜드를 바로 누를 수 있게 */
  const nearbyBrands = useMemo(() => [...nearbyBrandIds].map((id) => getBrand(id)).filter((b): b is Brand => !!b), [nearbyBrandIds]);

  const openBrand = (b: Brand) => {
    const s = nearestOfBrand(stores, b.id);
    if (s) router.push({ pathname: '/store/[id]', params: { id: s.id, brandId: b.id } });
    else router.push({ pathname: '/store/[id]', params: { id: b.id, brandId: b.id } });
  };
  const openMenu = (m: MenuItem) => {
    const s = nearestOfBrand(stores, m.brandId);
    router.push({ pathname: '/menu/[id]', params: { id: m.id, store: storeNameOf(m, s?.name) } });
  };

  let body;
  if (!q) {
    body = (
      <View>
        <EmptyState pose="base" title="매장이나 메뉴 이름으로 찾아보세요" description="예: 스타벅스, 닭가슴살, 라떼" style={styles.empty} />
        {nearbyBrands.length > 0 ? (
          <View style={styles.quick}>
            <Text variant="captionMedium" color="ink3">
              지금 주변에 있어요
            </Text>
            <View style={styles.quickChips}>
              {nearbyBrands.map((b) => (
                <Chip key={b.id} label={b.name} size="sm" onPress={() => openBrand(b)} />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    );
  } else if (brands.length === 0 && menus.length === 0 && remoteLoading) {
    body = (
      <View style={styles.loading} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.ink3} />
        <Text variant="caption" color="ink3">
          찾고 있어요
        </Text>
      </View>
    );
  } else if (brands.length === 0 && menus.length === 0) {
    // E2 와 같은 다음 행동: 직접 입력으로 기록 · 밀리한테 정리 부탁
    body = (
      <View>
        <EmptyState
          pose="sleep"
          title={`‘${q}’에 맞는 매장·메뉴가 없어요`}
          description="이름을 조금 다르게 적어 보거나, 먹은 걸 바로 기록해 보세요."
          actionLabel="직접 입력으로 기록"
          onAction={() => router.push({ pathname: '/log/add', params: { name: q } })}
          style={styles.empty}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${q} 밀리한테 정리 부탁하기`}
          onPress={() => router.push({ pathname: '/log/ai', params: { mode: 'text', text: q } })}
          style={({ pressed }) => [styles.askMilly, pressed && styles.pressed]}
        >
          <Ionicons name="sparkles-outline" size={16} color={colors.primaryText} />
          <Text variant="captionMedium" color="primaryText">
            ‘{q}’ 밀리한테 정리 부탁하기
          </Text>
        </Pressable>
      </View>
    );
  } else {
    body = (
      <>
        {brands.length > 0 ? (
          <View style={styles.section}>
            <Text variant="captionMedium" color="ink3" style={styles.sectionTitle}>
              매장
            </Text>
            {brands.map((b) => {
              const s = nearestOfBrand(stores, b.id);
              const sub = s ? `${formatDistance(s.distanceM)} · ${s.name}` : `주변 ${radiusM >= 1000 ? '1km' : `${radiusM}m`} 안에는 없어요 · 메뉴 보기`;
              return (
                <Pressable
                  key={b.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${b.name}, ${sub}`}
                  onPress={() => openBrand(b)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <BrandTile brandId={b.id} category={b.category} size={40} />
                  <View style={styles.rowBody}>
                    <Text variant="h3" numberOfLines={1}>
                      {b.name}
                    </Text>
                    <Text variant="small" color="ink3" numberOfLines={1}>
                      {STORE_CATEGORY_LABEL[b.category]} · {sub}
                    </Text>
                  </View>
                  {s ? <Ionicons name="navigate-outline" size={16} color={colors.primaryText} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {menus.length > 0 ? (
          <View style={styles.section}>
            <Text variant="captionMedium" color="ink3" style={styles.sectionTitle}>
              메뉴
            </Text>
            {menus.map((m) => (
              <MenuResult
                key={m.id}
                menu={m}
                remaining={remaining}
                profile={profile}
                nearby={nearbyBrandIds.has(m.brandId)}
                storeName={storeNameOf(m, nearestOfBrand(stores, m.brandId)?.name)}
                onPress={() => openMenu(m)}
              />
            ))}
            {remoteLoading ? (
              <View style={styles.moreLoading}>
                <ActivityIndicator size="small" color={colors.ink3} />
                <Text variant="small" color="ink3">
                  시판 제품도 찾고 있어요
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.bar}>
        <IconButton icon={<BackIcon size={24} color={colors.ink} />} label="뒤로 가기" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/nearby'))} />
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.ink3} />
          <TextInput
            accessibilityLabel="매장·메뉴 검색"
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="매장이나 메뉴 이름"
            placeholderTextColor={colors.ink3}
            returnKeyType="search"
            style={styles.input}
          />
          {query ? <IconButton name="close-circle" size={18} color={colors.ink3} label="검색어 지우기" onPress={() => setQuery('')} style={styles.clear} /> : null}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

/** 메뉴 상세·즐겨찾기에 같이 넘길 매장 이름 — 가까운 매장 > 시판 제품 제조사 > 브랜드 */
function storeNameOf(m: MenuItem, nearestName?: string): string {
  return nearestName ?? m.maker ?? getBrand(m.brandId)?.name ?? '';
}

function MenuResult({
  menu,
  remaining,
  profile,
  nearby,
  storeName,
  onPress,
}: {
  menu: MenuItem;
  remaining: DailyTargets | null | undefined;
  profile: ReturnType<typeof useProfile.getState>['profile'];
  nearby: boolean;
  storeName: string;
  onPress: () => void;
}) {
  const jctx = useJudgeContext();
  const judgement = useMemo(() => (remaining ? judgeMenu(menu, remaining, jctx) : null), [menu, remaining, jctx]);
  const kcal = applyOptions(menu)?.kcal;
  const brand = getBrand(menu.brandId);
  const meta = `${menu.maker ?? brand?.name ?? ''}${nearby ? ' · 주변에 있어요' : ''}${kcal != null ? ` · ${formatNumber(kcal)}kcal` : ''}`;
  const unknown = !judgement || judgement.unknown || kcal == null;
  // 행 본문(누르면 메뉴 상세)과 하트를 형제로 — 겹치면 스크린리더가 안쪽 버튼을 못 찾는다
  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${menu.name}, ${meta}`} onPress={onPress} style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
        <MenuTile menu={menu} size={40} />
        <View style={styles.rowBody}>
          <Text variant="h3" numberOfLines={1}>
            {menu.name}
          </Text>
          <Text variant="small" color="ink3" numberOfLines={1}>
            {meta}
          </Text>
        </View>
        {judgement && !unknown ? <VerdictBadge verdict={judgement.verdict} size="sm" /> : menu.nutrients ? null : <UnknownBadge />}
      </Pressable>
      <FavoriteButton menu={menu} storeName={storeName} iconSize={20} box={36} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingLeft: spacing.page - 12, paddingRight: spacing.page, minHeight: size.header },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: radius.button, backgroundColor: colors.section, paddingLeft: spacing.md, gap: spacing.sm },
  input: { flex: 1, height: '100%', ...type.body, color: colors.ink, outlineStyle: 'none' } as never,
  clear: { width: 40, height: 44 },
  scroll: { paddingHorizontal: spacing.page, paddingBottom: spacing.xxxl },
  empty: { marginTop: spacing.xxl },
  quick: { marginTop: spacing.xxl, gap: spacing.sm },
  quickChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  section: { marginTop: spacing.lg },
  sectionTitle: { marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'stretch' },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  loading: { marginTop: spacing.xxxl, alignItems: 'center', gap: spacing.sm },
  moreLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  askMilly: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'center', minHeight: size.touch, paddingHorizontal: spacing.lg, marginTop: -spacing.xl },
  pressed: { opacity: 0.7 },
});
