import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackIcon, BrandTile, Chip, EmptyState, IconButton, MenuTile, Text, UnknownBadge, VerdictBadge } from '@/components';
import { getBrand, getBrands, getMenus } from '@/data';
import { STORE_CATEGORY_LABEL, formatDistance } from '@/data/labels';
import { applyOptions, judgeMenu } from '@/domain/judge';
import { formatNumber } from '@/domain/summary';
import type { Brand, DailyTargets, MenuItem } from '@/domain/types';
import { judgeProfile } from '@/state/bootstrap';
import { useDay } from '@/state/day';
import { nearestOfBrand, searchBrands, searchStoreMenus, useNearby } from '@/state/nearby';
import { useProfile } from '@/state/profile';
import { colors, radius, size, spacing, type } from '@/theme';

const BRAND_LIMIT = 6;
const MENU_LIMIT = 30;

/** D2 매장·메뉴 검색 — 브랜드를 고르면 가장 가까운 그 매장(없으면 브랜드 메뉴), 메뉴를 고르면 메뉴 상세 */
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
  const menus = useMemo(() => (q ? searchStoreMenus(getMenus(), q, { limit: MENU_LIMIT, preferBrandIds: nearbyBrandIds }) : []), [q, nearbyBrandIds]);

  /** 빈 검색창 아래 — 지금 주변에 있는 브랜드를 바로 누를 수 있게 */
  const nearbyBrands = useMemo(() => [...nearbyBrandIds].map((id) => getBrand(id)).filter((b): b is Brand => !!b), [nearbyBrandIds]);

  const openBrand = (b: Brand) => {
    const s = nearestOfBrand(stores, b.id);
    if (s) router.push({ pathname: '/store/[id]', params: { id: s.id, brandId: b.id } });
    else router.push({ pathname: '/store/[id]', params: { id: b.id, brandId: b.id } });
  };
  const openMenu = (m: MenuItem) => {
    const s = nearestOfBrand(stores, m.brandId);
    router.push({ pathname: '/menu/[id]', params: { id: m.id, store: s?.name ?? getBrand(m.brandId)?.name ?? '' } });
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
  } else if (brands.length === 0 && menus.length === 0) {
    body = <EmptyState pose="sleep" title={`'${q}'와 맞는 매장·메뉴가 없어요`} description="다른 이름이나 더 짧게 찾아보세요." style={styles.empty} />;
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
              <MenuResult key={m.id} menu={m} remaining={remaining} profile={profile} nearby={nearbyBrandIds.has(m.brandId)} onPress={() => openMenu(m)} />
            ))}
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

function MenuResult({
  menu,
  remaining,
  profile,
  nearby,
  onPress,
}: {
  menu: MenuItem;
  remaining: DailyTargets | null | undefined;
  profile: ReturnType<typeof useProfile.getState>['profile'];
  nearby: boolean;
  onPress: () => void;
}) {
  const judgement = useMemo(() => (remaining ? judgeMenu(menu, remaining, { profile: judgeProfile(profile) }) : null), [menu, remaining, profile]);
  const kcal = applyOptions(menu)?.kcal;
  const brand = getBrand(menu.brandId);
  const meta = `${brand?.name ?? ''}${nearby ? ' · 주변에 있어요' : ''}${kcal != null ? ` · ${formatNumber(kcal)}kcal` : ''}`;
  const unknown = !judgement || judgement.unknown || kcal == null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${menu.name}, ${meta}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
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
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  pressed: { opacity: 0.7 },
});
