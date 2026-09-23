import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ChevronDownIcon,
  Chip,
  ListRow,
  MenuTile,
  NUTRIENT_META,
  NoInfoState,
  RoomBar,
  Skeleton,
  StackHeader,
  Text,
  TrustBadge,
  UnknownBadge,
  VerdictBadge,
  formatNutrient,
  showToast,
  summarizeTrust,
  type NutrientKey,
} from '@/components';
import { getBrand, getMenusByBrand, getMockStores } from '@/data';
import { MENU_CATEGORY_LABEL } from '@/data/labels';
import { YEOKSAM_CENTER } from '@/data/mockStores';
import { applyOptions, rankMenus } from '@/domain/judge';
import { formatNumber } from '@/domain/summary';
import type { Judgement, MenuCategory, MenuItem, Store } from '@/domain/types';
import { judgeProfile } from '@/state/bootstrap';
import { useDay } from '@/state/day';
import { useNearby } from '@/state/nearby';
import { useProfile } from '@/state/profile';
import { colors, fonts, radius, spacing } from '@/theme';

type Sort = 'rank' | 'kcal';
type Cat = 'all' | MenuCategory;
const CAT_ORDER: MenuCategory[] = ['drink', 'meal', 'snack', 'salad', 'side'];

/** D3 매장 메뉴 판정 — 신뢰등급 헤더 · 여유분 미니카드 · 카테고리 칩 · 정렬 · 메뉴 카드(순위·핵심수치·판정 배지) */
export default function StoreMenu() {
  const params = useLocalSearchParams<{ id: string; brandId?: string }>();
  const nearbyStore = useNearby((s) => s.stores.find((x) => x.id === params.id));
  const store: Store | undefined = nearbyStore ?? getMockStores(YEOKSAM_CENTER).find((s) => s.id === params.id);
  const brandId = store?.brandId ?? (params.brandId || undefined);
  const brand = brandId ? getBrand(brandId) : undefined;

  const profile = useProfile((s) => s.profile);
  const targets = useProfile((s) => s.targets);
  const summary = useDay((s) => s.summary);

  const [cat, setCat] = useState<Cat>('all');
  const [sort, setSort] = useState<Sort>('rank');

  const menus = useMemo(() => (brandId ? getMenusByBrand(brandId) : []), [brandId]);
  const remaining = summary?.remaining ?? targets;
  const ranked = useMemo(() => (remaining ? rankMenus(menus, remaining, { profile: judgeProfile(profile) }) : null), [menus, remaining, profile]);

  const cats = CAT_ORDER.filter((c) => menus.some((m) => m.category === c));
  const list = useMemo(() => {
    if (!ranked) return [];
    const withRank = ranked.map((r, i) => ({ ...r, rank: i + 1 }));
    const filtered = cat === 'all' ? withRank : withRank.filter((r) => r.menu.category === cat);
    if (sort === 'kcal') {
      return [...filtered].sort((a, b) => {
        if (a.judgement.unknown !== b.judgement.unknown) return a.judgement.unknown ? 1 : -1;
        return (applyOptions(a.menu)?.kcal ?? 0) - (applyOptions(b.menu)?.kcal ?? 0);
      });
    }
    return filtered;
  }, [ranked, cat, sort]);

  const title = store?.name ?? brand?.name ?? '매장';
  const noInfo = !brand || brand.coverage === 'none' || menus.length === 0 || menus.every((m) => m.trust === 'none');
  const trust = summarizeTrust(menus.map((m) => m.trust));
  const over = summary?.status === 'over' || (summary ? summary.remaining.kcal <= 0 : false);
  /** 메뉴 카드 보조 수치 — 내 목적의 첫 강조 영양소 (없으면 단백질) */
  const sub: NutrientKey = ((targets?.emphasis ?? []).find((k) => k !== 'kcal') as NutrientKey | undefined) ?? 'protein';

  const openInfo = () => {
    if (store?.placeUrl) Linking.openURL(store.placeUrl).catch(() => showToast(store.address ?? '주소 정보가 없어요', 'info'));
    else showToast(store?.address ?? '주소 정보가 아직 없어요', 'info');
  };
  const otherStores = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/nearby'));

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.pad}>
        <StackHeader title={title} right={noInfo ? <TrustBadge trust="none" /> : <TrustBadge trust={trust} />} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {noInfo ? (
          <NoInfoState
            reason={!brand ? '아직 데이터가 없는 매장이에요. 확인된 정보만 보여드려요.' : undefined}
            onOtherStores={otherStores}
            onManualLog={() => router.push({ pathname: '/log/add', params: { name: '', store: title } })}
          />
        ) : (
          <>
            {summary && targets ? (
              <RoomBar remaining={summary.remaining.kcal} progress={targets.kcal > 0 ? summary.consumed.kcal / targets.kcal : 0} over={over} />
            ) : (
              <Skeleton height={48} borderRadius={radius.md} />
            )}

            {cats.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsWrap} accessibilityRole="tablist">
                {(['all', ...cats] as Cat[]).map((c) => (
                  <Chip key={c} label={c === 'all' ? '전체' : MENU_CATEGORY_LABEL[c]} selected={cat === c} onPress={() => setCat(c)} />
                ))}
              </ScrollView>
            ) : (
              <View style={styles.chipsGap} />
            )}

            <Pressable accessibilityRole="button" accessibilityLabel="정렬 바꾸기" onPress={() => setSort((s) => (s === 'rank' ? 'kcal' : 'rank'))} style={styles.sortBtn}>
              <Text variant="caption" color="ink3">
                {sort === 'rank' ? '내게 맞는 순' : '칼로리 낮은 순'}
              </Text>
              <ChevronDownIcon size={20} color={colors.ink3} />
            </Pressable>

            {!ranked ? (
              <View style={styles.list}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={80} borderRadius={radius.lg} />
                ))}
              </View>
            ) : (
              <View style={styles.list}>
                {list.map(({ menu, judgement, rank }) => (
                  <MenuRow key={menu.id} menu={menu} judgement={judgement} rank={rank} sub={sub} onPress={() => router.push({ pathname: '/menu/[id]', params: { id: menu.id, store: title } })} />
                ))}
              </View>
            )}
          </>
        )}

        <View style={styles.links}>
          <ListRow title="매장 정보" subtitle={store?.address ?? brand?.blurb} onPress={openInfo} style={styles.linkRow} />
          <View style={styles.sep} />
          <ListRow title="근처 다른 매장 보기" onPress={otherStores} style={styles.linkRow} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuRow({ menu, judgement, rank, sub, onPress }: { menu: MenuItem; judgement: Judgement; rank: number; sub: NutrientKey; onPress: () => void }) {
  const n = applyOptions(menu);
  const unknown = judgement.unknown || !n;
  const subValue = n ? n[sub] : undefined;
  const meta = n
    ? `${formatNumber(n.kcal)} kcal${typeof subValue === 'number' ? ` · ${NUTRIENT_META[sub].short} ${formatNutrient(sub, subValue)}${NUTRIENT_META[sub].unit}` : ''}`
    : '아직 추가되지 않은 정보입니다';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${rank}위 ${menu.name}, ${meta}`} onPress={onPress} style={({ pressed }) => [styles.menuCard, pressed && { opacity: 0.8 }]}>
      <Text style={[styles.rank, unknown && { color: colors.ink3 }]}>{rank}</Text>
      <MenuTile menu={menu} size={48} />
      <View style={styles.menuBody}>
        <Text variant="h3" numberOfLines={1}>
          {menu.name}
        </Text>
        <Text variant="small" color="ink3" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {unknown ? <UnknownBadge /> : <VerdictBadge verdict={judgement.verdict} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: spacing.page },
  scroll: { paddingHorizontal: spacing.page, paddingTop: spacing.sm, paddingBottom: spacing.xxxl },
  chipsWrap: { marginTop: spacing.xl, flexGrow: 0, marginHorizontal: -spacing.page },
  chips: { paddingHorizontal: spacing.page, gap: spacing.sm },
  chipsGap: { height: spacing.md },
  sortBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2, minHeight: 44, marginTop: spacing.sm },
  list: { marginTop: spacing.xs, gap: 10 },
  menuCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
  rank: { width: 16, textAlign: 'center', fontFamily: fonts.bold, fontSize: 18, lineHeight: 20, color: colors.primaryText },
  menuBody: { flex: 1, minWidth: 0, gap: 4 },
  links: { marginTop: spacing.xxl, borderTopWidth: 1, borderTopColor: colors.line },
  linkRow: { paddingVertical: spacing.sm },
  sep: { height: 1, backgroundColor: colors.line },
});
