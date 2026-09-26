import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { afterEating, formatNumber } from '@/domain/summary';
import { VERDICT_LABEL, type DailyTargets, type DaySummary, type MealType, type MenuItem, type Nutrients, type OptionGroup } from '@/domain/types';
import { getCachedRemoteProduct } from '@/services/products';
import { useJudgeContext } from '@/state/judgeContext';
import { defaultMealType, useDay } from '@/state/day';
import { ensureFavoritesLoaded, useFavorites, useIsFavorite } from '@/state/favorites';
import { useProfile } from '@/state/profile';
import { recordItems } from '@/state/recordItems';
import { colors, fonts, radius, spacing } from '@/theme';

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
        {/* 1. 메뉴명·가격 */}
        <View style={styles.top}>
          <MenuTile menu={menu} size={64} />
          {hasMenuImage(menu) ? (
            <Text variant="small" color="ink3" style={styles.aiPhoto}>
              AI로 만든 예시 사진이에요
            </Text>
          ) : null}
          <Text variant="caption" color="ink3" style={styles.category}>
            {[storeName, categoryLabel].filter(Boolean).join(' · ')}
          </Text>
          <Text style={styles.name}>{menu.name}</Text>
          {price != null ? (
            <Text variant="bodyMedium" color="ink2" style={styles.price}>
              {formatPrice(price)}
            </Text>
          ) : null}

          {/* 2. 판정 배지 + 이유 한 줄 */}
          <View style={styles.badges}>
            {!unknown && judgement ? (
              <Animated.View style={{ transform: [{ scale: pop }] }}>
                <VerdictBadge verdict={judgement.verdict} size="lg" />
              </Animated.View>
            ) : (
              <UnknownBadge />
            )}
            <TrustBadge trust={menu.trust} generic={menu.brandId === GENERIC_BRAND_ID} />
          </View>
          {!unknown && judgement?.reasons[0] ? (
            <View style={styles.reason}>
              <SproutIcon size={16} color={colors.primaryText} />
              <View style={styles.reasonText}>
                <Text variant="bodyMedium" color="ink">
                  {judgement.reasons[0]}
                </Text>
                {judgement.reasons[1] ? (
                  <Text variant="caption" color="ink3" style={styles.reasonSub}>
                    {judgement.reasons[1]}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}
          {menu.blurb ? (
            <Text variant="caption" color="ink2" style={styles.blurb}>
              {menu.blurb}
            </Text>
          ) : null}
        </View>

        {unknown ? (
          <NoInfoState
            requestTarget={{ name: storeName ? `${storeName} ${menu.name}` : menu.name }}
            onOtherStores={() => router.replace('/(tabs)/nearby')}
            onManualLog={() => router.push({ pathname: '/log/add', params: { name: menu.name, store: storeName ?? '' } })}
          />
        ) : (
          <>
            {/* 3. 먹으면 얼마 남는지 — 막대 하나 + 영양 자세히(접힘) */}
            <Card style={styles.card}>
              <View style={styles.cardHead}>
                <Text variant="h3">이 메뉴를 먹으면</Text>
                <Text variant="small" color="ink3">
                  {servingLabel(menu, selected)}
                </Text>
              </View>
              {remaining && targets && nutrients ? <AfterBar menuKcal={nutrients.kcal} consumed={summary?.consumed.kcal ?? 0} target={targets.kcal} /> : null}
              {menu.servingNote ? (
                <Text variant="small" color="ink3" style={styles.servingNote}>
                  {menu.servingNote}
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: detail }}
                onPress={toggleDetail}
                style={({ pressed }) => [styles.detailToggle, pressed && styles.pressed]}
              >
                <Text variant="captionMedium" color="ink2">
                  영양 정보 자세히
                </Text>
                <Ionicons name={detail ? 'chevron-up' : 'chevron-down'} size={16} color={colors.ink3} />
              </Pressable>
              {detail && remaining && nutrients ? (
                <View>
                  {rows.map((k) => (
                    <CompareRow key={k} nutrient={k} nutrients={nutrients} remaining={remaining} over={summary?.over} />
                  ))}
                </View>
              ) : null}
            </Card>

            {/* 4. 옵션 — 칩마다 kcal 변화 */}
            {menu.options?.length ? (
              <Card style={styles.card}>
                <Text variant="h3">옵션 선택</Text>
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

            {/* 5. 대안 */}
            {alternatives.length > 0 ? (
              <Card style={styles.card}>
                <View style={styles.cardHead}>
                  <Text variant="h3">이런 메뉴는 어때요?</Text>
                  <Pressable accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/nearby'))} style={styles.more} hitSlop={8}>
                    <Text variant="caption" color="ink3">
                      다른 메뉴 보기
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.alts}>
                  {alternatives.map(({ menu: alt, judgement: aj }) => {
                    const an = applyOptions(alt);
                    return (
                      <Pressable
                        key={alt.id}
                        accessibilityRole="button"
                        onPress={() => router.replace({ pathname: '/menu/[id]', params: { id: alt.id, store: params.store ?? '' } })}
                        style={({ pressed }) => [styles.alt, pressed && styles.pressed]}
                      >
                        <MenuTile menu={alt} size={40} />
                        <View style={styles.altBody}>
                          <Text variant="captionMedium" color="ink" numberOfLines={1}>
                            {alt.name}
                          </Text>
                          <Text variant="small" color="ink3" numberOfLines={1}>
                            {[an ? `${formatNumber(an.kcal)} kcal` : undefined, alt.price != null ? formatPrice(alt.price) : undefined].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                        <VerdictBadge verdict={aj.verdict} size="sm" />
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
          <Button title="기록하기" onPress={openSheet} accessibilityLabel={`${menu.name} 양·끼니 정해서 기록`} />
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
 * "먹으면 358kcal 남아요" + 하루 막대(먹은 양 · 이 메뉴 · 남는 양).
 * 목표를 넘기면 "먹으면 목표보다 120kcal 넘어요"(빨강) + 막대의 목표 밖 부분 빨강,
 * 이미 넘었으면 "이미 목표보다 N kcal 더 드셨어요 · 먹으면 +M kcal" (2026-09-25 효님 결정)
 */
function AfterBar({ menuKcal, consumed, target }: { menuKcal: number; consumed: number; target: number }) {
  const a = afterEating(consumed, target, menuKcal);
  const total = Math.max(target, consumed + menuKcal, 1);
  const eatenIn = Math.min(consumed, target);
  const eatenOver = Math.max(0, consumed - target);
  const menuIn = Math.max(0, Math.min(menuKcal, target - consumed));
  const menuOver = Math.max(0, menuKcal - menuIn);
  const menuW = menuKcal / total;
  const anim = useRef(new Animated.Value(menuW)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: menuW, duration: 260, useNativeDriver: false }).start();
  }, [menuW, anim]);
  const isOver = a.kind !== 'left';

  return (
    <View style={styles.after} accessibilityLabel={a.text}>
      {a.kind === 'left' ? (
        <Text style={styles.afterTitle}>
          먹으면 <Text style={[styles.afterTitle, styles.afterNum]}>{formatNumber(a.left)}kcal</Text> 남아요
        </Text>
      ) : a.kind === 'crosses' ? (
        <Text style={styles.afterTitle}>
          먹으면 목표보다 <Text style={[styles.afterTitle, styles.afterOverNum]}>{formatNumber(a.overBy)}kcal</Text> 넘어요
        </Text>
      ) : (
        <View>
          <Text style={styles.afterTitle}>
            이미 목표보다 <Text style={[styles.afterTitle, styles.afterOverNum]}>{formatNumber(a.alreadyOver)}kcal</Text> 더 드셨어요
          </Text>
          <Text variant="captionMedium" color="ink2">
            먹으면{' '}
            <Text variant="captionMedium" color="over" style={styles.bold}>
              +{formatNumber(a.adds)}kcal
            </Text>
          </Text>
        </View>
      )}
      <View style={styles.afterTrack}>
        <View style={[styles.afterEaten, { width: `${(eatenIn / total) * 100}%` }]} />
        {eatenOver > 0 ? <View style={[styles.afterEaten, styles.afterEatenOver, { width: `${(eatenOver / total) * 100}%` }]} /> : null}
        <Animated.View style={[styles.afterMenuWrap, { width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}>
          {menuIn > 0 ? <View style={[styles.afterMenu, { flex: menuIn }]} /> : null}
          {menuOver > 0 ? <View style={[styles.afterMenu, styles.afterMenuOver, { flex: menuOver }]} /> : null}
        </Animated.View>
      </View>
      <View style={styles.afterLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: menuIn > 0 ? colors.primary : colors.over }]} />
          <Text variant="small" color="ink2">
            이 메뉴 {formatNumber(menuKcal)}kcal
          </Text>
        </View>
        {consumed > 0 ? (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.border }]} />
            <Text variant="small" color="ink3">
              먹은 양 {formatNumber(consumed)}kcal
            </Text>
          </View>
        ) : null}
        {isOver ? (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.over }]} />
            <Text variant="small" color="over">
              목표보다 넘는 양
            </Text>
          </View>
        ) : null}
        <Text variant="small" color="ink3" style={styles.legendRight}>
          하루 {formatNumber(target)}kcal
        </Text>
      </View>
    </View>
  );
}

/**
 * 영양소 한 줄: 라벨 · 이 메뉴 값 · 바(남은 양 대비) · "먹으면 N 남아요".
 * 목표를 넘기면 "먹으면 목표보다 N 넘어요"(빨강). 단백질은 많을수록 좋은 쪽이라 넘어도 빨강이 아니다
 */
function afterCopy(k: NutrientKey, value: number, left: number, overNow: number): { text: string; over: boolean } {
  const unit = NUTRIENT_META[k].unit;
  if (k === 'protein') return { text: value >= left ? '오늘 필요한 만큼 채워요' : `먹고 나서 ${formatNutrient(k, left - value)}${unit} 더 채우면 돼요`, over: false };
  const after = left - overNow - value;
  if (after >= 0) return { text: `먹으면 ${formatNutrient(k, after)}${unit} 남아요`, over: false };
  return { text: `먹으면 목표보다 ${formatNutrient(k, -after)}${unit} 넘어요`, over: true };
}

function CompareRow({ nutrient, nutrients, remaining, over }: { nutrient: NutrientKey; nutrients: Nutrients; remaining: DailyTargets; over?: DaySummary['over'] }) {
  const meta = NUTRIENT_META[nutrient];
  const value = nutrients[nutrient];
  const left = Math.max(0, remaining[nutrient]);
  const overNow = nutrient === 'protein' ? 0 : (over?.[nutrient] ?? 0);
  const copy = typeof value === 'number' ? afterCopy(nutrient, value, left, overNow) : null;
  const share = typeof value === 'number' ? (left > 0 ? Math.min(1, value / left) : value > 0 ? 1 : 0) : 0;
  // 넘기면 바를 꽉 채우고 남은 양 밖으로 나가는 쪽을 빨강
  const inW = copy?.over && typeof value === 'number' && value > 0 ? Math.min(1, left / value) : share;

  return (
    <View style={styles.cmpRow}>
      <View style={styles.cmpTop}>
        <Text variant="small" color="ink3" style={styles.cmpLabel}>
          {meta.label}
        </Text>
        {typeof value === 'number' ? (
          <Text variant="caption" color="ink2" style={styles.cmpValueWrap}>
            <Text style={styles.cmpValue}>{formatNutrient(nutrient, value)}</Text> {meta.unit}
          </Text>
        ) : (
          <Text variant="small" color="ink3" style={styles.cmpValueWrap}>
            정보 없음
          </Text>
        )}
        {copy ? (
          <Text variant="small" color={copy.over ? 'over' : 'ink3'} numberOfLines={1} style={styles.cmpRight}>
            {copy.text}
          </Text>
        ) : null}
      </View>
      <View style={[styles.cmpTrack, styles.row]}>
        {typeof value === 'number' ? (
          <>
            {inW > 0 ? <View style={[styles.cmpFill, copy?.over ? styles.flat : null, { width: `${inW * 100}%` }]} /> : null}
            {copy?.over ? <View style={[styles.cmpFill, styles.cmpFillOver, { width: `${(1 - inW) * 100}%` }]} /> : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  aiPhoto: { marginTop: 4 },
  servingNote: { marginTop: 8 },
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: spacing.page },
  scroll: { paddingHorizontal: spacing.page, paddingBottom: spacing.xxl },
  pressed: { opacity: 0.7 },
  top: { alignItems: 'flex-start', paddingTop: spacing.sm },
  category: { marginTop: spacing.lg },
  name: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 30, letterSpacing: -0.4, color: colors.ink, marginTop: 2 },
  price: { marginTop: 2 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.sm },
  reasonText: { flex: 1 },
  reasonSub: { marginTop: 2 },
  blurb: { marginTop: spacing.md },
  card: { marginTop: spacing.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  after: { marginTop: spacing.sm, gap: spacing.sm },
  afterTitle: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 28, letterSpacing: -0.4, color: colors.ink },
  afterNum: { color: colors.primaryText },
  afterOverNum: { color: colors.over },
  bold: { fontFamily: fonts.bold },
  row: { flexDirection: 'row' },
  flat: { borderRadius: 0 },
  afterTrack: { flexDirection: 'row', height: 10, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden' },
  afterEaten: { height: 10, backgroundColor: colors.border },
  afterEatenOver: { backgroundColor: colors.over, opacity: 0.45 },
  afterMenuWrap: { flexDirection: 'row', height: 10 },
  afterMenu: { height: 10, backgroundColor: colors.primary },
  afterMenuOver: { backgroundColor: colors.over },
  afterLegend: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendRight: { marginLeft: 'auto' },
  detailToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.line },
  cmpRow: { paddingVertical: spacing.sm, gap: 6 },
  cmpTop: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  cmpLabel: { width: 52 },
  cmpValueWrap: { flexShrink: 0, minWidth: 64 },
  cmpValue: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, color: colors.ink },
  cmpRight: { flex: 1, textAlign: 'right' },
  cmpTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden' },
  cmpFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.primary },
  cmpFillOver: { borderRadius: 0, backgroundColor: colors.over },
  guide: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: spacing.sm, backgroundColor: colors.primaryTint, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 },
  guideText: { fontFamily: fonts.semibold },
  optRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  optLabel: { width: 56 },
  optChips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  more: { minHeight: 32, justifyContent: 'center' },
  alts: { marginTop: spacing.xs },
  alt: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  altBody: { flex: 1, minWidth: 0 },
  footer: { paddingHorizontal: spacing.page, paddingTop: spacing.md, paddingBottom: spacing.lg, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line },
});
