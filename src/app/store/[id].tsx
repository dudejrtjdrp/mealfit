import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandTile, Card, Chip, IconButton, MenuTile, MiniKcalGauge, NoInfoState, Skeleton, StackHeader, Text, VerdictBadge, showToast } from '@/components';
import { getBrand, getMenusByBrand, getMockStores } from '@/data';
import { MENU_CATEGORY_LABEL } from '@/data/labels';
import { YEOKSAM_CENTER } from '@/data/mockStores';
import { applyOptions, rankMenus } from '@/domain/judge';
import { formatNumber, remainingMessage } from '@/domain/summary';
import type { Judgement, MenuCategory, MenuItem, Store } from '@/domain/types';
import { judgeProfile } from '@/state/bootstrap';
import { useDay } from '@/state/day';
import { useNearby } from '@/state/nearby';
import { useProfile } from '@/state/profile';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

type Sort = 'rank' | 'kcal';
type Cat = 'all' | MenuCategory;
const CAT_ORDER: MenuCategory[] = ['drink', 'meal', 'snack', 'salad', 'side'];

/** D3 매장 메뉴 판정 — 시안 docs/design/D3-store-menu.png */
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
  const msg = summary ? remainingMessage(summary) : null;
  const over = summary?.status === 'over';

  const openInfo = () => {
    if (store?.placeUrl) Linking.openURL(store.placeUrl).catch(() => showToast(store.address ?? '주소 정보가 없어요', 'info'));
    else showToast(store?.address ?? '주소 정보가 아직 없어요', 'info');
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.pad}>
        <StackHeader
          right={
            <>
              <IconButton name="search-outline" label="메뉴 검색" onPress={() => router.push('/log/add?tab=search')} />
              <IconButton name="heart-outline" label="찜하기" onPress={() => showToast('곧 열려요', 'info')} />
            </>
          }
        />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.storeRow}>
          <BrandTile brandId={brandId} category={store?.category} size={56} shape="circle" />
          <View style={styles.storeText}>
            <Text numberOfLines={1} style={styles.storeName}>
              {title}
            </Text>
            <Text variant="caption" color="ink2" numberOfLines={1} style={styles.storeBlurb}>
              {brand?.blurb ?? '영양 정보를 모으고 있는 매장이에요.'}
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={openInfo} style={({ pressed }) => [styles.infoBtn, pressed && { opacity: 0.8 }]}>
            <Ionicons name="location-outline" size={16} color={colors.ink2} />
            <Text variant="captionMedium" color="ink2">
              매장 정보
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.ink2} />
          </Pressable>
        </View>

        {noInfo ? (
          <Card style={styles.noInfoCard}>
            <NoInfoState
              reason={!brand ? '아직 데이터가 없는 매장이에요. 확인된 정보만 보여드려요.' : undefined}
              onOtherStores={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/nearby'))}
              onManualLog={() => router.push({ pathname: '/log/add', params: { name: '', store: title } })}
            />
          </Card>
        ) : (
          <>
            <Card padding={16} style={styles.gaugeCard}>
              {summary && targets ? (
                <View style={styles.gaugeRow}>
                  <MiniKcalGauge remaining={summary.remaining.kcal} progress={over ? 1 : summary.remaining.kcal / Math.max(1, targets.kcal)} color={over ? colors.ok : undefined} style={styles.gauge} />
                  <View style={styles.vline} />
                  <View style={styles.msg}>
                    <MaterialCommunityIcons name="sprout" size={22} color={colors.gaugeFill} style={styles.msgSprout} />
                    <Text variant="caption" color="ink2" numberOfLines={3}>
                      {over ? '오늘은 여기까지,\n내일 다시 채워져요' : msg?.title}
                    </Text>
                  </View>
                </View>
              ) : (
                <Skeleton height={64} />
              )}
            </Card>

            {cats.length > 1 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsWrap}>
                {(['all', ...cats] as Cat[]).map((c) => (
                  <Chip key={c} label={c === 'all' ? '전체' : MENU_CATEGORY_LABEL[c]} selected={cat === c} onPress={() => setCat(c)} style={styles.chip} />
                ))}
              </ScrollView>
            ) : null}

            <View style={styles.sectionRow}>
              <Text variant="h2" style={styles.sectionTitle}>
                메뉴 추천
              </Text>
              <Text variant="caption" color="ink2" style={styles.sectionSub}>
                건강한 선택을 도와드려요.
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="정렬 바꾸기" onPress={() => setSort((s) => (s === 'rank' ? 'kcal' : 'rank'))} style={styles.sortBtn}>
                <Text variant="captionMedium" color="ink2">
                  {sort === 'rank' ? '추천순' : '칼로리 낮은순'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={colors.ink2} />
              </Pressable>
            </View>

            {!ranked ? (
              <View style={styles.list}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={92} borderRadius={radius.lg} />
                ))}
              </View>
            ) : (
              <View style={styles.list}>
                {list.map(({ menu, judgement, rank }) => (
                  <MenuRow key={menu.id} menu={menu} judgement={judgement} rank={rank} onPress={() => router.push({ pathname: '/menu/[id]', params: { id: menu.id, store: title } })} />
                ))}
              </View>
            )}
          </>
        )}

        <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/nearby'))} style={({ pressed }) => [styles.banner, pressed && { opacity: 0.9 }]}>
          <View style={styles.bannerText}>
            <View style={styles.bannerTop}>
              <Ionicons name="location" size={16} color={colors.primary} />
              <Text variant="caption" color="primaryText">
                이 매장 근처에도 있어요
              </Text>
            </View>
            <Text variant="h3" style={styles.bannerTitle}>
              다른 매장의 메뉴도 살펴보세요
            </Text>
            <Text variant="caption" color="primaryText" style={styles.bannerSub}>
              더 다양한 선택지가 기다리고 있어요.
            </Text>
          </View>
          <View style={styles.bannerArrow}>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuRow({ menu, judgement, rank, onPress }: { menu: MenuItem; judgement: Judgement; rank: number; onPress: () => void }) {
  const n = applyOptions(menu);
  const unknown = judgement.unknown || !n;
  const tag = menu.tags?.[0];
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.menuCard, unknown && styles.dim, pressed && { opacity: 0.85 }]}>
      <View style={styles.rank}>
        <Text style={styles.rankText}>{rank}</Text>
      </View>
      <MenuTile menu={menu} size={72} style={styles.menuTile} />
      <View style={styles.menuBody}>
        <View style={styles.menuTop}>
          <Text variant="h3" numberOfLines={1} style={styles.menuName}>
            {menu.name}
          </Text>
        </View>
        <Text variant="caption" color="ink3" numberOfLines={1} style={styles.serving}>
          {menu.serving}
        </Text>
        <View style={styles.facts}>
          {n ? (
            <>
              <MaterialCommunityIcons name="fire" size={17} color={colors.kcal} />
              <Text variant="bodyMedium" style={styles.factText}>
                {formatNumber(n.kcal)} kcal
              </Text>
              {tag || typeof n.protein === 'number' ? (
                <>
                  <View style={styles.factDivider} />
                  {tag ? (
                    <Ionicons name={/카페인/.test(tag) ? 'cafe-outline' : 'pricetag-outline'} size={15} color={colors.ink2} />
                  ) : (
                    <MaterialCommunityIcons name="barley" size={15} color={colors.ink2} />
                  )}
                  <Text variant="caption" color="ink2" numberOfLines={1} style={styles.factText}>
                    {tag ?? `단백질 ${formatNumber(n.protein ?? 0)} g`}
                  </Text>
                </>
              ) : null}
            </>
          ) : (
            <Text variant="caption" color="ink3">
              아직 추가되지 않은 정보입니다
            </Text>
          )}
        </View>
      </View>
      <View style={styles.badgeBox}>
        {unknown ? (
          <View style={styles.unknownPill}>
            <Text variant="label" color="coverNone">
              정보 없음
            </Text>
          </View>
        ) : (
          <VerdictBadge verdict={judgement.verdict} size="sm" style={styles.verdict} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: spacing.page },
  scroll: { paddingHorizontal: spacing.page, paddingBottom: spacing.xxxl },
  storeRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
  storeText: { flex: 1, marginLeft: spacing.md, marginRight: spacing.sm },
  storeName: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, color: colors.ink },
  storeBlurb: { marginTop: 2 },
  infoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 38, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface, ...shadow.card },
  noInfoCard: { marginTop: spacing.xl },
  gaugeCard: { marginTop: spacing.lg },
  gaugeRow: { flexDirection: 'row', alignItems: 'center' },
  gauge: { flexShrink: 0 },
  vline: { width: 1, alignSelf: 'stretch', backgroundColor: colors.line, marginHorizontal: spacing.md },
  msg: { flex: 1 },
  msgSprout: { alignSelf: 'flex-end', marginBottom: -4 },
  chipsWrap: { marginTop: spacing.lg, flexGrow: 0, marginHorizontal: -spacing.page },
  chips: { paddingHorizontal: spacing.page, gap: spacing.sm },
  chip: { minWidth: 64 },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xl },
  sectionTitle: {},
  sectionSub: { marginLeft: spacing.sm, flex: 1 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  list: { marginTop: spacing.md, gap: spacing.sm },
  menuCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, paddingVertical: spacing.sm, paddingLeft: spacing.sm, paddingRight: spacing.md, ...shadow.card },
  dim: { opacity: 0.6 },
  rank: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18, color: colors.primaryText },
  menuTile: { marginLeft: spacing.sm },
  menuBody: { flex: 1, marginLeft: spacing.md },
  menuTop: { flexDirection: 'row', alignItems: 'center', paddingRight: 78 },
  menuName: {},
  serving: { marginTop: 0 },
  facts: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 },
  factText: { flexShrink: 1 },
  factDivider: { width: 1, height: 14, backgroundColor: colors.line, marginHorizontal: 6 },
  badgeBox: { position: 'absolute', top: 12, right: 12 },
  verdict: { height: 28, paddingHorizontal: 10 },
  unknownPill: { height: 26, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.coverNoneBg, justifyContent: 'center' },
  banner: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: spacing.lg + 2 },
  bannerText: { flex: 1 },
  bannerTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  bannerTitle: { marginTop: 4, fontFamily: fonts.bold },
  bannerSub: { marginTop: 2 },
  bannerArrow: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
});
