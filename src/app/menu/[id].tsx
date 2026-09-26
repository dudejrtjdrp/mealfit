import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { Animated, LayoutAnimation, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  MenuTile,
  hasMenuImage,
  NUTRIENT_META,
  NoInfoState,
  SproutIcon,
  StackHeader,
  Text,
  TrustBadge,
  UnknownBadge,
  VerdictBadge,
  formatNutrient,
  showToast,
  type NutrientKey,
} from '@/components';
import { RecordSheet } from '@/components/RecordSheet';
import { getBrand, getMenu, getMenusByBrand } from '@/data';
import { GENERIC_BRAND_ID } from '@/data/ingest/nutrition';
import { STORE_CATEGORY_LABEL, formatPrice } from '@/data/labels';
import { applyOptions, judgeMenu, suggestAlternatives } from '@/domain/judge';
import { clampLogDate } from '@/domain/logDate';
import { menuQtyUnit } from '@/domain/qty';
import { formatNumber } from '@/domain/summary';
import { VERDICT_LABEL, type DailyTargets, type DaySummary, type MealType, type MenuItem, type Nutrients, type OptionGroup } from '@/domain/types';
import { getCachedRemoteProduct } from '@/services/products';
import { useJudgeContext } from '@/state/judgeContext';
import { defaultMealType, useDay } from '@/state/day';
import { ensureFavoritesLoaded, useFavorites, useIsFavorite } from '@/state/favorites';
import { useProfile } from '@/state/profile';
import { recordItems } from '@/state/recordItems';
import { colors, fonts, radius, spacing, type ColorKey } from '@/theme';

function defaultSelection(menu?: MenuItem): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of menu?.options ?? []) {
    const d = g.choices.find((c) => c.isDefault) ?? g.choices[0];
    if (d) out[g.id] = d.label;
  }
  return out;
}

/** 옵션 칩 라벨: 기본값 대비 kcal 변화(0이면 생략) + 추가 금액 — "시럽 빼기 −60kcal" */
function choiceLabel(menu: MenuItem, g: OptionGroup, label: string, selected: Record<string, string>, priceDelta?: number): string {
  const def = (g.choices.find((c) => c.isDefault) ?? g.choices[0])?.label;
  const withChoice = applyOptions(menu, { ...selected, [g.id]: label })?.kcal;
  const withDefault = def != null ? applyOptions(menu, { ...selected, [g.id]: def })?.kcal : undefined;
  const d = withChoice != null && withDefault != null ? Math.round(withChoice - withDefault) : 0;
  const parts = [label];
  if (d !== 0) parts[0] += ` ${d > 0 ? '+' : '−'}${formatNumber(Math.abs(d))}kcal`;
  if (priceDelta && g.id !== 'size' && g.id !== 'bread') parts.push(`+${formatNumber(priceDelta)}원`);
  return parts.join(' · ');
}

/** D4 메뉴 상세·구매 가이드 — 판정 배지 + 이유 한 줄 · "먹으면 N kcal 남아요" · 옵션(kcal 변화) · 대안 · 기록(양·날짜·끼니 시트) */
export default function MenuDetail() {
  const params = useLocalSearchParams<{ id: string; store?: string; date?: string }>();
  // 서버 검색(E2)에서 고른 시판 제품은 로컬 카탈로그에 없을 수 있다 → 세션 캐시에서 찾는다
  // 즐겨찾기에 담아 둔 서버 제품은 다음 실행에도 열 수 있게 스냅샷으로 찾는다
  const favSnapshot = useFavorites((s) => s.items.find((x) => x.menuId === params.id)?.menu);
  const menu = getMenu(params.id) ?? getCachedRemoteProduct(params.id) ?? favSnapshot;
  const favorite = useIsFavorite(menu?.id);
  useEffect(ensureFavoritesLoaded, []);
  const brand = menu ? getBrand(menu.brandId) : undefined;

  const targets = useProfile((s) => s.targets);
  const summary = useDay((s) => s.summary);

  const [selected, setSelected] = useState<Record<string, string>>(() => defaultSelection(menu));
  const [sheet, setSheet] = useState(false);
  const [meal, setMeal] = useState<MealType>(() => defaultMealType());
  const [date, setDate] = useState(() => clampLogDate(params.date));
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(false);

  useEffect(() => {
    setSelected(defaultSelection(menu));
  }, [menu]);

  const remaining: DailyTargets | null = summary?.remaining ?? targets;
  const jctx = useJudgeContext();
  const ctx = useMemo(() => ({ ...jctx, selectedOptions: selected }), [jctx, selected]);
  const nutrients = menu ? applyOptions(menu, selected) : null;
  const judgement = menu && remaining ? judgeMenu(menu, remaining, ctx) : null;
  const alternatives = useMemo(
    // 본 판정과 같은 끼니 기준(먹은 끼니·시각). 옵션 선택은 빼고 기본 옵션끼리 비교
    // 일반 음식(대표 음식 1.7천 개)은 한 가게 메뉴판이 아니라 대안을 고르지 않는다 (반찬·국만 권하게 될 수 있어서)
    () => (menu && remaining && menu.brandId !== GENERIC_BRAND_ID ? suggestAlternatives(menu, getMenusByBrand(menu.brandId), remaining, jctx, 2) : []),
    [menu, remaining, jctx],
  );

  // 판정이 바뀌면 배지를 살짝 튀게
  const pop = useRef(new Animated.Value(1)).current;
  const lastVerdict = useRef(judgement?.verdict);
  useEffect(() => {
    if (!judgement || lastVerdict.current === judgement.verdict) return;
    lastVerdict.current = judgement.verdict;
    pop.setValue(0.85);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 120, useNativeDriver: false }).start();
  }, [judgement, pop]);

  if (!menu) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.pad}>
          <StackHeader />
        </View>
        <EmptyState pose="sorry" title="메뉴를 찾지 못했어요" description="목록에서 다시 골라 주세요." actionLabel="주변으로 가기" onAction={() => router.replace('/(tabs)/nearby')} />
      </SafeAreaView>
    );
  }

  const unknown = menu.trust === 'none' || !nutrients || judgement?.unknown;
  const price = menu.price != null ? menu.price + (menu.options ?? []).reduce((s, g) => s + (g.choices.find((c) => c.label === selected[g.id])?.priceDelta ?? 0), 0) : undefined;
  const categoryLabel = brand ? STORE_CATEGORY_LABEL[brand.category] : '';
  const storeName = params.store || menu.maker || brand?.name;
  const unit = menuQtyUnit(menu);

  const toggleFavorite = async () => {
    // 앱 번들에 없는 메뉴(서버 검색 제품)는 다음 실행에 다시 찾을 수 있게 통째로 적어 둔다
    const snapshot = getMenu(menu.id) ? undefined : menu;
    const on = await useFavorites.getState().toggle({ menuId: menu.id, name: menu.name, storeName, menu: snapshot });
    showToast(on ? '자주 먹는 메뉴에 담았어요' : '자주 먹는 메뉴에서 뺐어요', on ? 'success' : 'info');
  };

  const share = () => {
    const verdict = unknown ? '정보 없음' : judgement ? VERDICT_LABEL[judgement.verdict] : '';
    Share.share({ message: `${menu.name} — ${verdict}` }).catch(() => {});
  };

  /** 기본값이 아닌 옵션 라벨 ("시럽 빼기") — 기록·시트에 함께 */
  const optionLabels = (menu.options ?? [])
    .map((g) => {
      const label = selected[g.id];
      const def = g.choices.find((c) => c.isDefault)?.label;
      return label && label !== def ? label : undefined;
    })
    .filter((x): x is string => !!x);

  /** 기록 — 매장 담기·기록 추가와 같은 시트(양·날짜·끼니)에서. 고른 옵션을 반영한 영양으로 저장, 되돌리기 토스트 후 이전 화면으로 */
  const record = async () => {
    if (!nutrients || saving) return;
    setSaving(true);
    try {
      await recordItems([{ name: menu.name, base: nutrients, qty, trust: menu.trust, menu, storeName, optionLabels }], meal, { date });
      setSheet(false);
      if (router.canGoBack()) router.back();
    } catch {
      showToast('기록을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요', 'info');
    } finally {
      setSaving(false);
    }
  };

  const openSheet = () => {
    setMeal(defaultMealType());
    setDate(clampLogDate(params.date));
    setQty(1);
    setSheet(true);
  };

  const toggleDetail = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setDetail((d) => !d);
  };

  const rows: NutrientKey[] = ['kcal', ...((targets?.emphasis ?? ['carbs', 'protein', 'fat']).filter((k) => k !== 'kcal') as NutrientKey[])];
  /** 펼치면 강조 영양소 뒤로 나머지 영양소까지 (값이 없는 영양소는 '정보 없음') */
  const allRows: NutrientKey[] = [...rows, ...ALL_NUTRIENTS.filter((k) => !rows.includes(k))];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <View style={styles.pad}>
        <StackHeader
          right={
            <>
              <IconButton
                name={favorite ? 'heart' : 'heart-outline'}
                color={favorite ? colors.primary : undefined}
                label={favorite ? '자주 먹는 메뉴에서 빼기' : '자주 먹는 메뉴에 담기'}
                onPress={() => void toggleFavorite()}
              />
              <IconButton name="share-outline" label="공유하기" onPress={share} />
            </>
          }
        />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* 1. 사진 + 메뉴명·가격·판정 (시안 D4: 왼쪽 큰 사진, 오른쪽 정보) */}
        <View style={styles.hero}>
          <View style={styles.heroMedia}>
            <MenuTile menu={menu} size={HERO_PHOTO} style={styles.heroPhoto} />
            {hasMenuImage(menu) ? (
              <Text variant="small" color="ink3" style={styles.aiPhoto}>
                AI로 만든 예시 사진
              </Text>
            ) : null}
          </View>
          <View style={styles.heroBody}>
            {storeName || categoryLabel ? (
              <Text variant="small" color="ink3" numberOfLines={1}>
                {[storeName, categoryLabel].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
            <Text style={styles.name} numberOfLines={3}>
              {menu.name}
            </Text>
            {price != null ? (
              <Text variant="bodyMedium" color="ink2" style={styles.price}>
                {formatPrice(price)}
              </Text>
            ) : null}
            <View style={styles.badges}>
              {!unknown && judgement ? (
                <Animated.View style={{ transform: [{ scale: pop }] }}>
                  <VerdictBadge verdict={judgement.verdict} size="md" />
                </Animated.View>
              ) : (
                <UnknownBadge />
              )}
              <TrustBadge trust={menu.trust} generic={menu.brandId === GENERIC_BRAND_ID} />
            </View>
            {menu.blurb ? (
              <Text variant="small" color="ink2" numberOfLines={3} style={styles.blurb}>
                {menu.blurb}
              </Text>
            ) : null}
          </View>
        </View>

        {unknown ? (
          <NoInfoState
            requestTarget={{ name: storeName ? `${storeName} ${menu.name}` : menu.name }}
            onOtherStores={() => router.replace('/(tabs)/nearby')}
            onManualLog={() => router.push({ pathname: '/log/add', params: { name: menu.name, store: storeName ?? '' } })}
          />
        ) : (
          <>
            {/* 2. 영양 vs 여유 — 영양소마다 이 메뉴 값 · 하루 막대(먹은 양 + 이 메뉴) · 먹은 양/목표 · 먹으면 남는 양 */}
            <Card style={styles.card}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: detail }}
                accessibilityLabel={detail ? '영양소 접기' : '영양소 모두 보기'}
                onPress={toggleDetail}
                style={({ pressed }) => [styles.cardHead, pressed && styles.pressed]}
                hitSlop={6}
              >
                <View style={styles.cardHeadLeft}>
                  <Text variant="h2">영양 vs 여유</Text>
                  <Text variant="small" color="ink3">
                    {servingLabel(menu, selected)}
                  </Text>
                </View>
                <Ionicons name={detail ? 'chevron-up' : 'chevron-down'} size={18} color={colors.ink3} />
              </Pressable>
              {targets && nutrients
                ? (detail ? allRows : rows.slice(0, 2)).map((k) => (
                    <NutrientRow
                      key={k}
                      nutrient={k}
                      nutrients={nutrients}
                      consumed={summary?.consumed[k] ?? 0}
                      target={targets[k]}
                      remaining={remaining?.[k] ?? targets[k]}
                      overNow={k === 'protein' ? 0 : (summary?.over?.[k as keyof DaySummary['over']] ?? 0)}
                    />
                  ))
                : null}
              {menu.servingNote ? (
                <Text variant="small" color="ink3" style={styles.servingNote}>
                  {menu.servingNote}
                </Text>
              ) : null}
              {judgement?.reasons[0] ? (
                <View style={styles.reason}>
                  <View style={styles.reasonIcon}>
                    <SproutIcon size={16} color={colors.primaryText} />
                  </View>
                  <View style={styles.reasonText}>
                    <Text variant="captionMedium" color="ink">
                      {judgement.reasons[0]}
                    </Text>
                    {judgement.reasons[1] ? (
                      <Text variant="small" color="ink3" style={styles.reasonSub}>
                        {judgement.reasons[1]}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </Card>

            {/* 3. 옵션 — 칩마다 kcal 변화 */}
            {menu.options?.length ? (
              <Card style={styles.card}>
                <Text variant="h2">옵션 선택</Text>
                {judgement?.guide ? (
                  <View style={styles.guide}>
                    <Ionicons name="bulb-outline" size={14} color={colors.primaryText} />
                    <Text variant="small" color="primaryText" style={styles.guideText}>
                      {judgement.guide}
                    </Text>
                  </View>
                ) : null}
                {menu.options.map((g) => (
                  <View key={g.id} style={styles.optRow}>
                    <Text variant="caption" color="ink3" style={styles.optLabel}>
                      {g.label}
                    </Text>
                    <View style={styles.optChips}>
                      {g.choices.map((c) => (
                        <Chip
                          key={c.label}
                          variant="option"
                          size="sm"
                          label={choiceLabel(menu, g, c.label, selected, c.priceDelta)}
                          selected={selected[g.id] === c.label}
                          onPress={() => setSelected((s) => ({ ...s, [g.id]: c.label }))}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}

            {/* 4. 대안 추천 — 가로 카드 2개 (사진 · 이름 · 가격 · 판정) */}
            {alternatives.length > 0 ? (
              <Card style={styles.card}>
                <View style={styles.cardHead}>
                  <Text variant="h2">대안 추천</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/nearby'))}
                    style={styles.more}
                    hitSlop={8}
                  >
                    <Text variant="caption" color="ink3">
                      다른 메뉴 보기
                    </Text>
                    <Ionicons name="chevron-forward" size={14} color={colors.ink3} />
                  </Pressable>
                </View>
                <View style={styles.alts}>
                  {alternatives.map(({ menu: alt, judgement: aj }) => {
                    const an = applyOptions(alt);
                    const sub = alt.price != null ? formatPrice(alt.price) : an ? `${formatNumber(an.kcal)} kcal` : undefined;
                    return (
                      <Pressable
                        key={alt.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${alt.name} 보기`}
                        onPress={() => router.replace({ pathname: '/menu/[id]', params: { id: alt.id, store: params.store ?? '' } })}
                        style={({ pressed }) => [styles.alt, pressed && styles.pressed]}
                      >
                        <MenuTile menu={alt} size={44} style={styles.altPhoto} />
                        <View style={styles.altBody}>
                          <Text variant="captionMedium" color="ink" numberOfLines={2}>
                            {alt.name}
                          </Text>
                          {sub ? (
                            <Text variant="small" color="ink3" numberOfLines={1}>
                              {sub}
                            </Text>
                          ) : null}
                          <VerdictBadge verdict={aj.verdict} size="sm" style={styles.altBadge} />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* 6. 하단 CTA — 양·날짜·끼니를 고르는 기록 시트 (매장 담기·기록 추가와 같은 모양) */}
      {!unknown ? (
        <View style={styles.footer}>
          <Button title="이걸로 기록" onPress={openSheet} accessibilityLabel={`${menu.name} 양·끼니 정해서 기록`} />
        </View>
      ) : null}

      <RecordSheet
        visible={sheet && !!nutrients}
        onClose={() => setSheet(false)}
        items={nutrients ? [{ key: menu.id, name: menu.name, sub: [storeName, ...optionLabels].filter(Boolean).join(' · ') || undefined, base: nutrients, unit, qty }] : []}
        onQty={(_k, q) => setQty(q)}
        meal={meal}
        onMeal={setMeal}
        date={date}
        onDate={setDate}
        dateExtra={params.date}
        remainingKcal={summary ? summary.remaining.kcal - (summary.over.kcal ?? 0) : targets?.kcal ?? null}
        saving={saving}
        onSave={() => void record()}
      />
    </SafeAreaView>
  );
}

/** 사이즈를 바꿨으면 기본 용량 대신 고른 사이즈를 보여준다 */
function servingLabel(menu: MenuItem, selected: Record<string, string>): string {
  const size = menu.options?.find((g) => g.id === 'size');
  const def = size?.choices.find((c) => c.isDefault)?.label;
  const cur = size ? selected[size.id] : undefined;
  return cur && cur !== def ? `${cur} 사이즈` : menu.serving;
}

/**
 * 영양소 한 줄 (시안 D4 '영양 vs 여유'): 아이콘 · 이 메뉴 값 · 하루 막대 · "먹은 양 / 목표" + 먹으면 남는 양.
 * 막대 = 오늘 먹은 양(회색) + 이 메뉴(그린). 목표를 넘는 부분은 빨강(theme.over, 2026-09-25 효님 결정).
 * 단백질은 많을수록 좋은 쪽이라 넘어도 빨강이 아니다
 */
function afterCopy(k: NutrientKey, value: number, left: number, overNow: number): { text: string; over: boolean } {
  const unit = NUTRIENT_META[k].unit;
  if (k === 'protein') return { text: value >= left ? '오늘 필요한 만큼 채워요' : `먹고 나서 ${formatNutrient(k, left - value)}${unit} 더 채워요`, over: false };
  const after = left - overNow - value;
  if (after >= 0) return { text: `먹으면 ${formatNutrient(k, after)}${unit} 남아요`, over: false };
  return { text: `먹으면 ${formatNutrient(k, -after)}${unit} 넘어요`, over: true };
}

function NutrientRow({
  nutrient,
  nutrients,
  consumed,
  target,
  remaining,
  overNow,
}: {
  nutrient: NutrientKey;
  nutrients: Nutrients;
  consumed: number;
  target: number;
  remaining: number;
  overNow: number;
}) {
  const meta = NUTRIENT_META[nutrient];
  const icon = NUTRIENT_ICON[nutrient];
  const value = nutrients[nutrient];
  const has = typeof value === 'number';
  const left = Math.max(0, remaining);
  const copy = has ? afterCopy(nutrient, value, left, overNow) : null;

  // 막대: 전체 = max(목표, 먹은 양 + 이 메뉴). 목표 안쪽/바깥쪽을 나눠 바깥은 빨강(단백질 제외)
  const v = has ? value : 0;
  const total = Math.max(target, consumed + v, 1);
  const canOver = nutrient !== 'protein';
  const eatenIn = canOver ? Math.min(consumed, target) : consumed;
  const eatenOver = canOver ? Math.max(0, consumed - target) : 0;
  const menuIn = canOver ? Math.max(0, Math.min(v, target - consumed)) : v;
  const menuOver = Math.max(0, v - menuIn);
  const menuW = v / total;
  const anim = useRef(new Animated.Value(menuW)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: menuW, duration: 260, useNativeDriver: false }).start();
  }, [menuW, anim]);

  return (
    <View style={styles.nRow} accessibilityLabel={`${meta.label} ${has ? `${formatNutrient(nutrient, v)}${meta.unit}` : '정보 없음'}. ${copy?.text ?? ''}`}>
      <View style={[styles.nIcon, { backgroundColor: colors[icon.bg] }]}>
        <Ionicons name={icon.name} size={18} color={colors[icon.fg]} />
      </View>
      <View style={styles.nValueCol}>
        <Text variant="small" color="ink3">
          {meta.label}
        </Text>
        {has ? (
          <Text variant="caption" color="ink2" numberOfLines={1}>
            <Text style={styles.nValue}>{formatNutrient(nutrient, v)}</Text> {meta.unit}
          </Text>
        ) : (
          <Text variant="small" color="ink3">
            정보 없음
          </Text>
        )}
      </View>
      <View style={styles.nMain}>
        <View style={styles.nBarRow}>
          <View style={styles.nTrack}>
            {eatenIn > 0 ? <View style={[styles.nEaten, { width: `${(eatenIn / total) * 100}%` }]} /> : null}
            {eatenOver > 0 ? <View style={[styles.nEaten, styles.nEatenOver, { width: `${(eatenOver / total) * 100}%` }]} /> : null}
            {v > 0 ? (
              <Animated.View style={[styles.nMenuWrap, { width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}>
                {menuIn > 0 ? <View style={[styles.nMenu, { flex: menuIn }]} /> : null}
                {menuOver > 0 ? <View style={[styles.nMenu, styles.nMenuOver, { flex: menuOver }]} /> : null}
              </Animated.View>
            ) : null}
          </View>
          <Text variant="small" color="ink3" numberOfLines={1} style={styles.nTotal}>
            <Text variant="small" color={eatenOver > 0 ? 'over' : 'ink'} style={styles.bold}>
              {formatNutrient(nutrient, consumed)}
            </Text>{' '}
            / {formatNutrient(nutrient, target)} {meta.unit}
          </Text>
        </View>
        {copy ? (
          <Text variant="small" color={copy.over ? 'over' : 'ink3'} numberOfLines={1} style={styles.nCopy}>
            {copy.text}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const HERO_PHOTO = 132;
const ALL_NUTRIENTS: NutrientKey[] = ['kcal', 'carbs', 'protein', 'fat', 'sugar', 'sodium'];
type IonName = ComponentProps<typeof Ionicons>['name'];
/** 영양소 아이콘 — 원 바탕 + 아이콘 (색은 theme 토큰만) */
const NUTRIENT_ICON: Record<NutrientKey, { name: IonName; fg: ColorKey; bg: ColorKey }> = {
  kcal: { name: 'flame', fg: 'ok', bg: 'okBg' },
  carbs: { name: 'nutrition', fg: 'primaryText', bg: 'primaryTint' },
  protein: { name: 'egg', fg: 'primaryText', bg: 'primaryTint' },
  fat: { name: 'water', fg: 'ink2', bg: 'line' },
  sugar: { name: 'cube', fg: 'ink2', bg: 'line' },
  sodium: { name: 'flask', fg: 'ink2', bg: 'line' },
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: spacing.page },
  scroll: { paddingHorizontal: spacing.page, paddingBottom: spacing.xxl },
  pressed: { opacity: 0.7 },
  bold: { fontFamily: fonts.bold },

  // 1. 사진 + 정보
  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg, paddingTop: spacing.sm },
  heroMedia: { alignItems: 'center' },
  heroPhoto: { borderRadius: radius.card },
  aiPhoto: { marginTop: 6 },
  heroBody: { flex: 1, minWidth: 0, paddingTop: 2 },
  name: { fontFamily: fonts.bold, fontSize: 21, lineHeight: 28, letterSpacing: -0.4, color: colors.ink, marginTop: 2 },
  price: { marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: spacing.sm },
  blurb: { marginTop: spacing.sm },

  // 카드 공통
  card: { marginTop: spacing.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32, marginBottom: spacing.xs },
  cardHeadLeft: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexShrink: 1 },

  // 2. 영양 vs 여유
  nRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  nIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  nValueCol: { width: 64 },
  nValue: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, color: colors.ink },
  nMain: { flex: 1, minWidth: 0 },
  nBarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nTotal: { flexShrink: 0 },
  nTrack: { flex: 1, minWidth: 40, flexDirection: 'row', height: 6, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden' },
  nEaten: { height: 6, backgroundColor: colors.border },
  nEatenOver: { backgroundColor: colors.over, opacity: 0.45 },
  nMenuWrap: { flexDirection: 'row', height: 6 },
  nMenu: { height: 6, backgroundColor: colors.primary },
  nMenuOver: { backgroundColor: colors.over },
  nCopy: { marginTop: 4, textAlign: 'right' },
  servingNote: { marginTop: spacing.xs },
  reason: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primaryTint },
  reasonIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  reasonText: { flex: 1 },
  reasonSub: { marginTop: 2 },

  // 3. 옵션
  guide: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: spacing.sm, backgroundColor: colors.primaryTint, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 },
  guideText: { fontFamily: fonts.semibold },
  optRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  optLabel: { width: 56 },
  optChips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  // 4. 대안 추천
  more: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 },
  alts: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  alt: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line },
  altPhoto: { borderRadius: radius.md },
  altBody: { flex: 1, minWidth: 0 },
  altBadge: { alignSelf: 'flex-start', marginTop: 4 },

  footer: { paddingHorizontal: spacing.page, paddingTop: spacing.md, paddingBottom: spacing.lg, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line },
});
