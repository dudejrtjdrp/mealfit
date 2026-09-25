import { Ionicons } from '@expo/vector-icons';
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
import { Segmented } from '@/components/Segmented';
import { getBrand, getMenusByBrand, getMockStores } from '@/data';
import { MENU_CATEGORY_LABEL } from '@/data/labels';
import { YEOKSAM_CENTER } from '@/data/mockStores';
import { applyOptions, rankMenus } from '@/domain/judge';
import { formatNumber } from '@/domain/summary';
import type { Judgement, MenuCategory, MenuItem, Store, Verdict } from '@/domain/types';
import { judgeProfile } from '@/state/bootstrap';
import { useDay } from '@/state/day';
import { groupByVerdict, useNearby } from '@/state/nearby';
import { useProfile } from '@/state/profile';
import { colors, fonts, radius, spacing } from '@/theme';

type Sort = 'rank' | 'kcal';
type Cat = 'all' | MenuCategory;
type Section = Verdict | 'unknown';
const CAT_ORDER: MenuCategory[] = ['drink', 'meal', 'snack', 'salad', 'side'];
const SORTS: { id: Sort; label: string }[] = [
  { id: 'rank', label: '추천 순' },
  { id: 'kcal', label: '칼로리 낮은 순' },
];

/** 판정별 묶음 — 색 + 아이콘 + 말 세 겹 */
const SECTION_META: Record<Section, { title: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  good: { title: '지금 먹기 좋아요', icon: 'checkmark-circle', color: colors.good },
  ok: { title: '괜찮아요', icon: 'ellipse', color: colors.ok },
  pass: { title: '오늘은 패스', icon: 'pause-circle', color: colors.pass },
  unknown: { title: '아직 정보가 없는 메뉴', icon: 'help-circle-outline', color: colors.ink3 },
};
/** 처음엔 접어 두는 묶음 (눌러서 펼친다) */
const COLLAPSED_BY_DEFAULT: Section[] = ['pass', 'unknown'];

/** D3 매장 메뉴 판정 — 출처 배지 헤더 · 남은 양 미니카드 · 카테고리 칩 · 정렬 세그먼트 · 판정별 묶음(좋아요/괜찮아요/패스) */
export default function StoreMenu() {
  const params = useLocalSearchParams<{ id: string; brandId?: string }>();
  const nearbyStore = useNearby((s) => s.stores.find((x) => x.id === params.id));
  const source = useNearby((s) => s.source);
  const store: Store | undefined = nearbyStore ?? getMockStores(YEOKSAM_CENTER).find((s) => s.id === params.id);
  const brandId = store?.brandId ?? (params.brandId || undefined);
  const brand = brandId ? getBrand(brandId) : undefined;

  const profile = useProfile((s) => s.profile);
  const targets = useProfile((s) => s.targets);
  const summary = useDay((s) => s.summary);

  const [cat, setCat] = useState<Cat>('all');
  const [sort, setSort] = useState<Sort>('rank');
  const [open, setOpen] = useState<Record<Section, boolean>>({ good: true, ok: true, pass: false, unknown: false });

  const menus = useMemo(() => (brandId ? getMenusByBrand(brandId) : []), [brandId]);
  const remaining = summary?.remaining ?? targets;
  const ranked = useMemo(() => (remaining ? rankMenus(menus, remaining, { profile: judgeProfile(profile) }) : null), [menus, remaining, profile]);

  const cats = CAT_ORDER.filter((c) => menus.some((m) => m.category === c));
  const groups = useMemo(() => {
    if (!ranked) return null;
    const filtered = cat === 'all' ? ranked : ranked.filter((r) => r.menu.category === cat);
    const sorted = sort === 'kcal' ? [...filtered].sort((a, b) => (applyOptions(a.menu)?.kcal ?? 0) - (applyOptions(b.menu)?.kcal ?? 0)) : filtered;
    return groupByVerdict(sorted);
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
        <StackHeader title={title} right={<TrustBadge trust={noInfo ? 'none' : trust} size="sm" />} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {noInfo ? (
          <NoInfoState
            reason={!brand ? '아직 데이터가 없는 매장이에요. 확인된 정보만 보여드려요.' : undefined}
            requestTarget={{ name: title, brandId, placeId: store && source === 'kakao' ? store.id : undefined }}
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

            <Segmented options={SORTS} value={sort} onChange={setSort} accessibilityLabel="정렬" style={styles.sort} />

            {!groups ? (
              <View style={styles.list}>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={80} borderRadius={radius.lg} />
                ))}
              </View>
            ) : (
              (['good', 'ok', 'pass', 'unknown'] as Section[]).map((sec) => {
                const items = groups[sec];
                if (items.length === 0) return null;
                // 위에 보여줄 묶음이 하나도 없으면 접지 않는다 (빈 화면에 접힌 줄만 남지 않게)
                const above = sec === 'pass' ? groups.good.length + groups.ok.length : sec === 'unknown' ? groups.good.length + groups.ok.length + groups.pass.length : 1;
                const collapsible = COLLAPSED_BY_DEFAULT.includes(sec) && above > 0;
                const expanded = !collapsible || open[sec];
                return (
                  <View key={sec} style={styles.section}>
                    <SectionHeader section={sec} count={items.length} collapsible={collapsible} expanded={expanded} onToggle={() => setOpen((o) => ({ ...o, [sec]: !o[sec] }))} />
                    {expanded ? (
                      <View style={styles.list}>
                        {items.map(({ menu, judgement }, i) => (
                          <MenuRow
                            key={menu.id}
                            menu={menu}
                            judgement={judgement}
                            rank={sec === 'good' && sort === 'rank' ? i + 1 : undefined}
                            sub={sub}
                            onPress={() => router.push({ pathname: '/menu/[id]', params: { id: menu.id, store: title } })}
                          />
                        ))}
                      </View>
                    ) : null}
                  </View>
                );
              })
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

function SectionHeader({ section, count, collapsible, expanded, onToggle }: { section: Section; count: number; collapsible: boolean; expanded: boolean; onToggle: () => void }) {
  const m = SECTION_META[section];
  const body = (
    <>
      <Ionicons name={m.icon} size={16} color={m.color} />
      <Text variant="h3" style={section === 'unknown' ? { color: colors.ink2 } : { color: m.color }}>
        {m.title}
      </Text>
      <Text variant="h3" color="ink3">
        {count}
      </Text>
      {collapsible ? (
        <View style={expanded ? styles.chevUp : undefined}>
          <ChevronDownIcon size={18} color={colors.ink3} />
        </View>
      ) : null}
    </>
  );
  if (!collapsible) {
    return (
      <View style={styles.sectionHead} accessibilityRole="header">
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`${m.title} ${count}개, ${expanded ? '접기' : '펼치기'}`}
      onPress={onToggle}
      style={({ pressed }) => [styles.sectionHead, styles.sectionToggle, pressed && { opacity: 0.6 }]}
    >
      {body}
    </Pressable>
  );
}

function MenuRow({ menu, judgement, rank, sub, onPress }: { menu: MenuItem; judgement: Judgement; rank?: number; sub: NutrientKey; onPress: () => void }) {
  const n = applyOptions(menu);
  const unknown = judgement.unknown || !n;
  const subValue = n ? n[sub] : undefined;
  const meta = n
    ? `${formatNumber(n.kcal)} kcal${typeof subValue === 'number' ? ` · ${NUTRIENT_META[sub].short} ${formatNutrient(sub, subValue)}${NUTRIENT_META[sub].unit}` : ''}`
    : '아직 추가되지 않은 정보입니다';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${rank ? `${rank}위 ` : ''}${menu.name}, ${meta}`} onPress={onPress} style={({ pressed }) => [styles.menuCard, pressed && { opacity: 0.8 }]}>
      {rank ? <Text style={styles.rank}>{rank}</Text> : null}
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
  sort: { marginTop: spacing.md },
  section: { marginTop: spacing.xl },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  sectionToggle: { minHeight: 44, alignSelf: 'flex-start' },
  chevUp: { transform: [{ rotate: '180deg' }] },
  list: { marginTop: spacing.sm, gap: 10 },
  menuCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
  rank: { width: 16, textAlign: 'center', fontFamily: fonts.bold, fontSize: 18, lineHeight: 20, color: colors.primaryText },
  menuBody: { flex: 1, minWidth: 0, gap: 4 },
  links: { marginTop: spacing.xxl, borderTopWidth: 1, borderTopColor: colors.line },
  linkRow: { paddingVertical: spacing.sm },
  sep: { height: 1, backgroundColor: colors.line },
});
