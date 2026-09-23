import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  IconButton,
  MenuTile,
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
import { getBrand, getMenu, getMenusByBrand } from '@/data';
import { STORE_CATEGORY_LABEL, formatPrice } from '@/data/labels';
import { applyOptions, judgeMenu, suggestAlternatives } from '@/domain/judge';
import { formatNumber } from '@/domain/summary';
import { MEAL_LABEL, VERDICT_LABEL, type DailyTargets, type MealLog, type MealType, type MenuItem, type Nutrients } from '@/domain/types';
import { newId } from '@/services/id';
import { getCachedRemoteProduct } from '@/services/products';
import { judgeProfile } from '@/state/bootstrap';
import { defaultMealType, useDay } from '@/state/day';
import { useProfile } from '@/state/profile';
import { colors, fonts, radius, spacing } from '@/theme';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

function defaultSelection(menu?: MenuItem): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of menu?.options ?? []) {
    const d = g.choices.find((c) => c.isDefault) ?? g.choices[0];
    if (d) out[g.id] = d.label;
  }
  return out;
}

/** D4 메뉴 상세·구매 가이드 — 판정 배지 대형 · 영양 vs 여유 비교 바 · 판정 이유 · 옵션 칩 즉시 갱신 · 대안 · CTA "이걸로 기록" */
export default function MenuDetail() {
  const params = useLocalSearchParams<{ id: string; store?: string }>();
  // 서버 검색(E2)에서 고른 시판 제품은 로컬 카탈로그에 없을 수 있다 → 세션 캐시에서 찾는다
  const menu = getMenu(params.id) ?? getCachedRemoteProduct(params.id);
  const brand = menu ? getBrand(menu.brandId) : undefined;

  const profile = useProfile((s) => s.profile);
  const targets = useProfile((s) => s.targets);
  const summary = useDay((s) => s.summary);
  const addLog = useDay((s) => s.addLog);

  const [selected, setSelected] = useState<Record<string, string>>(() => defaultSelection(menu));
  const [sheet, setSheet] = useState(false);
  const [meal, setMeal] = useState<MealType>(() => defaultMealType());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(defaultSelection(menu));
  }, [menu]);

  const remaining: DailyTargets | null = summary?.remaining ?? targets;
  const ctx = useMemo(() => ({ profile: judgeProfile(profile), selectedOptions: selected }), [profile, selected]);
  const nutrients = menu ? applyOptions(menu, selected) : null;
  const judgement = menu && remaining ? judgeMenu(menu, remaining, ctx) : null;
  const alternatives = useMemo(
    () => (menu && remaining ? suggestAlternatives(menu, getMenusByBrand(menu.brandId), remaining, { profile: ctx.profile }, 2) : []),
    [menu, remaining, ctx.profile],
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

  const share = () => {
    const verdict = unknown ? '정보 없음' : judgement ? VERDICT_LABEL[judgement.verdict] : '';
    Share.share({ message: `${menu.name} — ${verdict}` }).catch(() => {});
  };

  const save = async () => {
    if (!nutrients) return;
    setSaving(true);
    const now = new Date();
    const optionLabels = (menu.options ?? [])
      .map((g) => {
        const label = selected[g.id];
        const def = g.choices.find((c) => c.isDefault)?.label;
        return label && label !== def ? label : undefined;
      })
      .filter((x): x is string => !!x);
    const log: MealLog = {
      id: newId(),
      date: useDay.getState().date,
      mealType: meal,
      time: now.toISOString(),
      name: menu.name,
      brandId: menu.brandId,
      storeName,
      menuId: menu.id,
      optionLabels: optionLabels.length ? optionLabels : undefined,
      nutrients,
      trust: menu.trust,
      qty: 1,
      verdict: judgement && !judgement.unknown ? judgement.verdict : undefined,
      createdAt: now.toISOString(),
    };
    const ok = await addLog(log);
    setSaving(false);
    setSheet(false);
    showToast(ok ? '기록했어요' : '기록했어요 · 저장은 다음에 다시 시도할게요', ok ? 'success' : 'info');
    if (router.canGoBack()) router.back();
  };

  const rows: NutrientKey[] = ['kcal', ...((targets?.emphasis ?? ['carbs', 'protein', 'fat']).filter((k) => k !== 'kcal') as NutrientKey[])];

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <View style={styles.pad}>
        <StackHeader
          right={
            <>
              <IconButton name="heart-outline" label="찜하기" onPress={() => showToast('곧 열려요', 'info')} />
              <IconButton name="share-outline" label="공유하기" onPress={share} />
            </>
          }
        />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.top}>
          <MenuTile menu={menu} size={64} />
          <Text variant="caption" color="ink3" style={styles.category}>
            {[storeName, categoryLabel].filter(Boolean).join(' · ')}
          </Text>
          <Text style={styles.name}>{menu.name}</Text>
          {price != null ? (
            <Text variant="bodyMedium" color="ink2" style={styles.price}>
              {formatPrice(price)}
            </Text>
          ) : null}
          <View style={styles.badges}>
            {!unknown && judgement ? (
              <Animated.View style={{ transform: [{ scale: pop }] }}>
                <VerdictBadge verdict={judgement.verdict} size="lg" />
              </Animated.View>
            ) : (
              <UnknownBadge />
            )}
            <TrustBadge trust={menu.trust} />
          </View>
          {menu.blurb ? (
            <Text variant="caption" color="ink2" style={styles.blurb}>
              {menu.blurb}
            </Text>
          ) : null}
        </View>

        {unknown ? (
          <NoInfoState
            onOtherStores={() => router.replace('/(tabs)/nearby')}
            onManualLog={() => router.push({ pathname: '/log/add', params: { name: menu.name, store: storeName ?? '' } })}
          />
        ) : (
          <>
            <Card style={styles.card}>
              <View style={styles.cardHead}>
                <Text variant="h3">영양 vs 오늘 여유</Text>
                <Text variant="small" color="ink3">
                  {servingLabel(menu, selected)}
                </Text>
              </View>
              {remaining && targets && nutrients
                ? rows.map((k) => <CompareRow key={k} nutrient={k} nutrients={nutrients} remaining={remaining} targets={targets} />)
                : null}
              {judgement ? (
                <View style={styles.reason}>
                  <View style={styles.reasonIcon}>
                    <SproutIcon size={18} color={colors.primaryText} />
                  </View>
                  <View style={styles.reasonText}>
                    <Text variant="captionMedium" color="ink">
                      {judgement.reasons[0]}
                    </Text>
                    {judgement.reasons[1] ? (
                      <Text variant="small" color="ink2" style={styles.reasonSub}>
                        {judgement.reasons[1]}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </Card>

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
                          label={c.priceDelta && g.id !== 'size' && g.id !== 'bread' ? `${c.label} (+${formatNumber(c.priceDelta)}원)` : c.label}
                          selected={selected[g.id] === c.label}
                          onPress={() => setSelected((s) => ({ ...s, [g.id]: c.label }))}
                        />
                      ))}
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}

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
                        style={({ pressed }) => [styles.alt, pressed && { opacity: 0.8 }]}
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

      {!unknown ? (
        <View style={styles.footer}>
          <Button title="이걸로 기록" onPress={() => setSheet(true)} />
        </View>
      ) : null}

      <BottomSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="어느 끼니로 기록할까요?"
        subtitle={nutrients ? `${menu.name} · ${formatNumber(nutrients.kcal)} kcal` : menu.name}
        footer={<Button title="기록하기" loading={saving} onPress={save} />}
      >
        <View style={styles.meals}>
          {MEALS.map((m) => (
            <Chip key={m} label={MEAL_LABEL[m]} variant="option" size="lg" selected={meal === m} onPress={() => setMeal(m)} style={styles.mealChip} />
          ))}
        </View>
      </BottomSheet>
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

function rowCaption(k: NutrientKey, value: number, left: number): string {
  if (k === 'protein') return value >= left ? '오늘 필요한 만큼 채워요' : '조금씩 채워보세요';
  if (value <= left * 0.5) return '지금도 여유가 있어요';
  if (value <= left) return '여유 안에 들어가요';
  return '오늘 여유보다 조금 커요';
}

/** 한 줄: 라벨 · 이 메뉴 값(Bold) · 그린 바(오늘 여유 대비) · "여유 / 목표" */
function CompareRow({ nutrient, nutrients, remaining, targets }: { nutrient: NutrientKey; nutrients: Nutrients; remaining: DailyTargets; targets: DailyTargets }) {
  const meta = NUTRIENT_META[nutrient];
  const value = nutrients[nutrient];
  const left = remaining[nutrient];
  const share = typeof value === 'number' ? (left > 0 ? Math.min(1, value / left) : value > 0 ? 1 : 0) : 0;
  const anim = useRef(new Animated.Value(share)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: share, duration: 260, useNativeDriver: false }).start();
  }, [share, anim]);

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
        <Text variant="small" color="ink3">
          여유 {formatNutrient(nutrient, left)} / {formatNutrient(nutrient, targets[nutrient])}
          {meta.unit}
        </Text>
      </View>
      <View style={styles.cmpTrack}>
        {typeof value === 'number' ? <Animated.View style={[styles.cmpFill, { width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} /> : null}
      </View>
      {typeof value === 'number' ? (
        <Text variant="small" color="ink3" numberOfLines={1}>
          {rowCaption(nutrient, value, left)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  pad: { paddingHorizontal: spacing.page },
  scroll: { paddingHorizontal: spacing.page, paddingBottom: spacing.xxl },
  top: { alignItems: 'flex-start', paddingTop: spacing.sm },
  category: { marginTop: spacing.lg },
  name: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 30, letterSpacing: -0.4, color: colors.ink, marginTop: 2 },
  price: { marginTop: 2 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  blurb: { marginTop: spacing.md },
  card: { marginTop: spacing.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  cmpRow: { paddingVertical: spacing.sm + 2, gap: 6 },
  cmpTop: { flexDirection: 'row', alignItems: 'baseline' },
  cmpLabel: { width: 56 },
  cmpValueWrap: { flex: 1 },
  cmpValue: { fontFamily: fonts.bold, fontSize: 17, lineHeight: 22, color: colors.ink },
  cmpTrack: { height: 6, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden' },
  cmpFill: { height: 6, borderRadius: radius.pill, backgroundColor: colors.primary },
  reason: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md, backgroundColor: colors.section, borderRadius: radius.md, padding: 14 },
  reasonIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  reasonText: { flex: 1, marginLeft: spacing.md },
  reasonSub: { marginTop: 2 },
  guide: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: spacing.sm, backgroundColor: colors.primaryTint, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 5 },
  guideText: { fontFamily: fonts.semibold },
  optRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  optLabel: { width: 56 },
  optChips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  more: { minHeight: 32, justifyContent: 'center' },
  alts: { marginTop: spacing.xs },
  alt: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  altBody: { flex: 1, minWidth: 0 },
  footer: { paddingHorizontal: spacing.page, paddingTop: spacing.sm, paddingBottom: spacing.lg, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.line },
  meals: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mealChip: { flexGrow: 1, flexBasis: '45%' },
});
