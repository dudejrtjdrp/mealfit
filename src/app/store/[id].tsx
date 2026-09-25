import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ChevronDownIcon,
  Chip,
  ListRow,
  MenuTile,
  NUTRIENT_META,
  NoInfoState,
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
import { RecordSheet, type RecordSheetItem } from '@/components/RecordSheet';
import { Segmented } from '@/components/Segmented';
import { StoreCartBar } from '@/components/StoreCartBar';
import { getBrand, getMenusByBrand, getMockStores, normalizeName } from '@/data';
import { MENU_CATEGORY_LABEL } from '@/data/labels';
import { YEOKSAM_CENTER } from '@/data/mockStores';
import { cartKcal, cartQty, cartRemove, cartSetQty, cartStep, type Cart } from '@/domain/cart';
import { applyOptions, rankMenus } from '@/domain/judge';
import { menuQtyUnit, qtyLabel } from '@/domain/qty';
import { formatNumber } from '@/domain/summary';
import type { Judgement, MealType, MenuCategory, MenuItem, Store, Verdict } from '@/domain/types';
import { useJudgeContext } from '@/state/judgeContext';
import { defaultMealType, useDay } from '@/state/day';
import { groupByVerdict, useNearby } from '@/state/nearby';
import { useProfile } from '@/state/profile';
import { recordItems } from '@/state/recordItems';
import { colors, fonts, radius, size, spacing, type } from '@/theme';

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

/**
 * D3 매장 메뉴 판정 — 출처 배지 헤더 + 메뉴 검색(둘 다 위에 고정) · 카테고리 칩 · 정렬 세그먼트 · 판정별 묶음(좋아요/괜찮아요/패스)
 * · 메뉴마다 −/+ 담기 · 아래 고정 "오늘 더 먹을 수 있는 양"(담은 kcal 실시간 반영) + "먹기" → 기록 시트.
 * 담은 메뉴는 이 화면 상태로만 둔다(나가면 비워짐).
 */
export default function StoreMenu() {
  const params = useLocalSearchParams<{ id: string; brandId?: string }>();
  const nearbyStore = useNearby((s) => s.stores.find((x) => x.id === params.id));
  const source = useNearby((s) => s.source);
  const store: Store | undefined = nearbyStore ?? getMockStores(YEOKSAM_CENTER).find((s) => s.id === params.id);
  const brandId = store?.brandId ?? (params.brandId || undefined);
  const brand = brandId ? getBrand(brandId) : undefined;

  const targets = useProfile((s) => s.targets);
  const summary = useDay((s) => s.summary);

  const [cat, setCat] = useState<Cat>('all');
  const [sort, setSort] = useState<Sort>('rank');
  const [open, setOpen] = useState<Record<Section, boolean>>({ good: true, ok: true, pass: false, unknown: false });
  const [query, setQuery] = useState('');
  /** 담은 메뉴 — 행의 −/+ 와 기록 시트 수량의 단일 출처 */
  const [cart, setCart] = useState<Cart>([]);
  const [sheet, setSheet] = useState(false);
  const [meal, setMeal] = useState<MealType>(() => defaultMealType());
  const [saving, setSaving] = useState(false);

  const menus = useMemo(() => (brandId ? getMenusByBrand(brandId) : []), [brandId]);
  const remaining = summary?.remaining ?? targets;
  const jctx = useJudgeContext();
  const ranked = useMemo(() => (remaining ? rankMenus(menus, remaining, jctx) : null), [menus, remaining, jctx]);

  const cats = CAT_ORDER.filter((c) => menus.some((m) => m.category === c));
  const q = normalizeName(query);
  const groups = useMemo(() => {
    if (!ranked) return null;
    const byCat = cat === 'all' ? ranked : ranked.filter((r) => r.menu.category === cat);
    const filtered = q ? byCat.filter((r) => normalizeName(r.menu.name).includes(q)) : byCat;
    const sorted = sort === 'kcal' ? [...filtered].sort((a, b) => (applyOptions(a.menu)?.kcal ?? 0) - (applyOptions(b.menu)?.kcal ?? 0)) : filtered;
    return groupByVerdict(sorted);
  }, [ranked, cat, sort, q]);
  const shownCount = groups ? groups.good.length + groups.ok.length + groups.pass.length + groups.unknown.length : 0;

  // 담기 — 메뉴 id → 메뉴 · 1(개·인분·조각) 기준 영양
  const menuById = useMemo(() => new Map(menus.map((m) => [m.id, m])), [menus]);
  const baseOf = useCallback((id: string) => {
    const m = menuById.get(id);
    return m ? applyOptions(m) : null;
  }, [menuById]);
  const pendingKcal = useMemo(() => cartKcal(cart, baseOf), [cart, baseOf]);
  const stepCart = (menu: MenuItem, dir: 1 | -1) => setCart((c) => cartStep(c, menu.id, dir, menuQtyUnit(menu)));

  const title = store?.name ?? brand?.name ?? '매장';
  const noInfo = !brand || brand.coverage === 'none' || menus.length === 0 || menus.every((m) => m.trust === 'none');
  const trust = summarizeTrust(menus.map((m) => m.trust));
  /** 메뉴 카드 보조 수치 — 내 목적의 첫 강조 영양소 (없으면 단백질) */
  const sub: NutrientKey = ((targets?.emphasis ?? []).find((k) => k !== 'kcal') as NutrientKey | undefined) ?? 'protein';

  const openInfo = () => {
    if (store?.placeUrl) Linking.openURL(store.placeUrl).catch(() => showToast(store.address ?? '주소 정보가 없어요', 'info'));
    else showToast(store?.address ?? '주소 정보가 아직 없어요', 'info');
  };
  const otherStores = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/nearby'));
  const manualLog = (name: string) => router.push({ pathname: '/log/add', params: { name, store: title } });

  const sheetItems: RecordSheetItem[] = cart.flatMap((l) => {
    const m = menuById.get(l.id);
    const base = m ? applyOptions(m) : null;
    return m && base ? [{ key: m.id, name: m.name, sub: title, base, unit: menuQtyUnit(m), qty: l.qty }] : [];
  });
  const openSheet = () => {
    setMeal(defaultMealType());
    setSheet(true);
  };
  const removeFromCart = (id: string) => {
    const next = cartRemove(cart, id);
    setCart(next);
    if (next.length === 0) setSheet(false);
  };
  const save = async () => {
    const items = cart.flatMap((l) => {
      const m = menuById.get(l.id);
      const base = m ? applyOptions(m) : null;
      return m && base ? [{ name: m.name, base, qty: l.qty, trust: m.trust, menu: m }] : [];
    });
    if (!items.length || saving) return;
    setSaving(true);
    try {
      await recordItems(items, meal);
      setCart([]);
      setSheet(false);
    } catch {
      showToast('기록을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요', 'info');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      {/* 헤더 + 검색창은 스크롤 밖 — 늘 위에 붙어 있다 */}
      <View style={styles.pad}>
        <StackHeader title={title} right={<TrustBadge trust={noInfo ? 'none' : trust} size="sm" />} />
        {noInfo ? null : (
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.ink3} />
            <TextInput
              accessibilityLabel="이 매장 메뉴 검색"
              value={query}
              onChangeText={setQuery}
              placeholder="이 매장 메뉴 검색"
              placeholderTextColor={colors.ink3}
              returnKeyType="search"
              style={styles.searchInput}
            />
            {query ? (
              <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" hitSlop={12} onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={18} color={colors.ink3} />
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {noInfo ? (
          <NoInfoState
            reason={!brand ? '아직 데이터가 없는 매장이에요. 확인된 정보만 보여드려요.' : undefined}
            requestTarget={{ name: title, brandId, placeId: store && source === 'kakao' ? store.id : undefined }}
            onOtherStores={otherStores}
            onManualLog={() => manualLog('')}
          />
        ) : (
          <>
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
            ) : shownCount === 0 ? (
              <View style={styles.empty}>
                <Text variant="bodyMedium" color="ink2" style={styles.center}>
                  {q ? `‘${query.trim()}’에 맞는 메뉴가 없어요` : '이 분류에는 메뉴가 없어요'}
                </Text>
                {q ? (
                  <Pressable accessibilityRole="link" accessibilityLabel={`${query.trim()} 직접 입력으로 기록`} hitSlop={8} onPress={() => manualLog(query.trim())} style={({ pressed }) => [styles.emptyLink, pressed && { opacity: 0.6 }]}>
                    <Text variant="captionMedium" color="primaryText">
                      직접 입력으로 기록
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              (['good', 'ok', 'pass', 'unknown'] as Section[]).map((sec) => {
                const items = groups[sec];
                if (items.length === 0) return null;
                // 위에 보여줄 묶음이 하나도 없으면 접지 않는다 (빈 화면에 접힌 줄만 남지 않게)
                const above = sec === 'pass' ? groups.good.length + groups.ok.length : sec === 'unknown' ? groups.good.length + groups.ok.length + groups.pass.length : 1;
                // 검색 중에는 찾은 메뉴가 가려지지 않게 다 펼친다
                const collapsible = !q && COLLAPSED_BY_DEFAULT.includes(sec) && above > 0;
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
                            qty={cartQty(cart, menu.id)}
                            onStep={(dir) => stepCart(menu, dir)}
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

      {noInfo ? null : (
        <StoreCartBar
          room={summary && targets ? { remaining: summary.remaining.kcal, progress: targets.kcal > 0 ? summary.consumed.kcal / targets.kcal : 0, over: summary.over.kcal ?? 0, target: targets.kcal } : null}
          count={cart.length}
          pendingKcal={pendingKcal}
          onEat={openSheet}
        />
      )}

      <RecordSheet
        visible={sheet && sheetItems.length > 0}
        onClose={() => setSheet(false)}
        items={sheetItems}
        onQty={(id, qty) => setCart((c) => cartSetQty(c, id, qty))}
        onRemove={removeFromCart}
        meal={meal}
        onMeal={setMeal}
        remainingKcal={summary ? summary.remaining.kcal - (summary.over.kcal ?? 0) : null}
        saving={saving}
        onSave={() => void save()}
      />
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

function MenuRow({
  menu,
  judgement,
  rank,
  sub,
  qty,
  onStep,
  onPress,
}: {
  menu: MenuItem;
  judgement: Judgement;
  rank?: number;
  sub: NutrientKey;
  /** 담은 수량 (0 = 안 담음) */
  qty: number;
  onStep: (dir: 1 | -1) => void;
  onPress: () => void;
}) {
  const n = applyOptions(menu);
  const unknown = judgement.unknown || !n;
  const subValue = n ? n[sub] : undefined;
  const meta = n
    ? `${formatNumber(n.kcal)} kcal${typeof subValue === 'number' ? ` · ${NUTRIENT_META[sub].short} ${formatNutrient(sub, subValue)}${NUTRIENT_META[sub].unit}` : ''}`
    : '아직 추가되지 않은 정보입니다';
  // 카드 본문(누르면 메뉴 상세)과 담기 버튼을 형제로 둔다 — 버튼을 안에 겹치면 스크린리더가 안쪽 버튼을 못 찾는다
  return (
    <View style={[styles.menuCard, qty > 0 && styles.menuCardOn]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${rank ? `${rank}위 ` : ''}${menu.name}, ${meta}`} onPress={onPress} style={({ pressed }) => [styles.menuMain, pressed && { opacity: 0.7 }]}>
        {rank ? <Text style={styles.rank}>{rank}</Text> : null}
        <MenuTile menu={menu} size={48} />
        <View style={styles.menuBody}>
          <Text variant="h3" numberOfLines={2}>
            {menu.name}
          </Text>
          <Text variant="small" color="ink3" numberOfLines={1}>
            {meta}
          </Text>
        </View>
      </Pressable>
      <View style={styles.menuSide}>
        {unknown ? <UnknownBadge /> : <VerdictBadge verdict={judgement.verdict} />}
        {unknown ? null : <CartControl name={menu.name} unit={menuQtyUnit(menu)} qty={qty} onStep={onStep} />}
      </View>
    </View>
  );
}

/** 담기 −/+ — 안 담았으면 + 하나, 담았으면 [− 1개 +]. 가장 작은 단계에서 − 는 빼기 */
function CartControl({ name, unit, qty, onStep }: { name: string; unit: string; qty: number; onStep: (dir: 1 | -1) => void }) {
  if (qty <= 0) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`${name} 담기`} hitSlop={4} onPress={() => onStep(1)} style={({ pressed }) => [styles.stepBtn, styles.addBtn, pressed && styles.stepPressed]}>
        <Ionicons name="add" size={20} color={colors.primaryText} />
      </Pressable>
    );
  }
  const label = qtyLabel(qty, unit);
  return (
    <View style={styles.stepper} accessibilityLabel={`${name} ${label} 담음`}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${name} 덜 담기`} hitSlop={4} onPress={() => onStep(-1)} style={({ pressed }) => [styles.stepBtn, pressed && styles.stepPressed]}>
        <Ionicons name="remove" size={18} color={colors.ink} />
      </Pressable>
      <Text variant="label" style={styles.stepValue} numberOfLines={1}>
        {label}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${name} 더 담기`} hitSlop={4} onPress={() => onStep(1)} style={({ pressed }) => [styles.stepBtn, pressed && styles.stepPressed]}>
        <Ionicons name="add" size={18} color={colors.ink} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  pad: { paddingHorizontal: spacing.page, paddingBottom: spacing.sm },
  search: { flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: radius.button, backgroundColor: colors.section, paddingHorizontal: spacing.lg, gap: spacing.sm },
  searchInput: { flex: 1, height: '100%', ...type.body, color: colors.ink, outlineStyle: 'none' } as never,
  // 아래 고정 바는 스크롤 밖(형제)이라 마지막 줄이 가려지지 않는다 — 여백만 조금
  scroll: { paddingHorizontal: spacing.page, paddingBottom: spacing.xxl },
  empty: { marginTop: spacing.xxxl, alignItems: 'center', gap: spacing.sm },
  center: { textAlign: 'center' },
  emptyLink: { minHeight: size.touch, justifyContent: 'center', paddingHorizontal: spacing.md },
  chipsWrap: { marginTop: spacing.md, flexGrow: 0, marginHorizontal: -spacing.page },
  chips: { paddingHorizontal: spacing.page, gap: spacing.sm },
  chipsGap: { height: spacing.md },
  sort: { marginTop: spacing.md },
  section: { marginTop: spacing.xl },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 },
  sectionToggle: { minHeight: 44, alignSelf: 'flex-start' },
  chevUp: { transform: [{ rotate: '180deg' }] },
  list: { marginTop: spacing.sm, gap: 10 },
  menuCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.lg, paddingRight: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
  menuCardOn: { borderColor: colors.primary },
  menuMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  menuSide: { alignItems: 'flex-end', gap: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, backgroundColor: colors.surface },
  stepBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  addBtn: { borderWidth: 1, borderColor: colors.border },
  stepPressed: { backgroundColor: colors.section },
  stepValue: { minWidth: 40, textAlign: 'center', color: colors.ink },
  rank: { width: 16, textAlign: 'center', fontFamily: fonts.bold, fontSize: 18, lineHeight: 20, color: colors.primaryText },
  menuBody: { flex: 1, minWidth: 0, gap: 4 },
  links: { marginTop: spacing.xxl, borderTopWidth: 1, borderTopColor: colors.line },
  linkRow: { paddingVertical: spacing.sm },
  sep: { height: 1, backgroundColor: colors.line },
});
