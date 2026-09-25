import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, MenuTile, Skeleton, Text, VerdictBadge } from '@/components';
import { MillyHero } from '@/components/MillyHero';
import { PlanMealSheet } from '@/components/PlanMealSheet';
import { RecordSheet, type RecordSheetItem } from '@/components/RecordSheet';
import { formatDistance } from '@/data/labels';
import type { PlanMeal } from '@/domain/mealPlan';
import { menuQtyUnit } from '@/domain/qty';
import { formatNumber } from '@/domain/summary';
import { VERDICT_LABEL, type MealType } from '@/domain/types';
import * as location from '@/services/location';
import { useDay } from '@/state/day';
import { useMealPlan, useMealPlanReroll } from '@/state/mealPlan';
import { useNearby } from '@/state/nearby';
import { useProfile } from '@/state/profile';
import { recordItems, type RecordItem } from '@/state/recordItems';
import { colors, radius, spacing } from '@/theme';

/** 시트를 닫고 다음 모달·화면을 열 때 기다리는 시간 (iOS 는 모달 두 개가 겹쳐 열리지 않는다) */
const SHEET_SWAP_MS = Platform.OS === 'ios' ? 350 : 0;

/** 위치 허용 — 아직 안 물었으면 묻고, 이미 거절했으면 설정으로 (오늘 탭과 같은 흐름) */
async function allowLocation() {
  const status = await location.requestPermission();
  if (status === 'granted') void useNearby.getState().refresh();
  else Linking.openSettings().catch(() => undefined);
}

/** 기록 확인 시트에 넘길 항목 — 주 메뉴 + 곁들임 */
interface Pending {
  meal: MealType;
  items: (RecordSheetItem & { record: Omit<RecordItem, 'qty'> })[];
}

function toPending(m: PlanMeal): Pending | null {
  if (!m.main) return null;
  const parts = [m.main, ...(m.extra ? [m.extra] : [])];
  return {
    meal: m.mealType,
    items: parts.map((c) => ({
      key: c.menu.id,
      name: c.menu.name,
      sub: c.store.name,
      base: c.nutrients,
      unit: menuQtyUnit(c.menu),
      qty: 1,
      record: { name: c.menu.name, base: c.nutrients, trust: c.menu.trust, menu: c.menu, storeName: c.store.name },
    })),
  };
}

/** 밀리 탭 — 큰 밀리 + "오늘은 이렇게 어때요?" + 남은 끼니 식단 (규칙 기반, 최근 2일 먹은 메뉴는 빼고 근처 매장에서) */
export default function MillyScreen() {
  const targets = useProfile((s) => s.targets);
  const summary = useDay((s) => s.summary);
  const dayStatus = useDay((s) => s.status);
  const nearbyStatus = useNearby((s) => s.status);
  const stores = useNearby((s) => s.stores);
  const reroll = useMealPlanReroll((s) => s.reroll);
  const { plan, recentLoading } = useMealPlan();

  const [selected, setSelected] = useState<PlanMeal | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [saving, setSaving] = useState(false);

  // 들어올 때 아직 한 번도 안 찾았으면 주변 매장을 찾는다
  useFocusEffect(
    useCallback(() => {
      const s = useNearby.getState();
      if (s.status === 'idle') void s.refresh();
    }, []),
  );

  const nearbyBusy = nearbyStatus === 'idle' || nearbyStatus === 'locating' || nearbyStatus === 'loading';
  const dayLoading = !summary && (dayStatus === 'idle' || dayStatus === 'loading');
  /** 오늘 기록·최근 기록을 읽는 중 */
  const loading = dayLoading || recentLoading;
  /** 주변 매장을 처음 찾는 중 — 오늘 충분히 드신 날(full·none)엔 매장이 필요 없어 기다리지 않는다 */
  const storesLoading = nearbyBusy && stores.length === 0;
  const overKcal = summary?.over.kcal ?? 0;

  const openStore = (storeId: string) => {
    setSelected(null);
    setTimeout(() => router.push({ pathname: '/store/[id]', params: { id: storeId } }), SHEET_SWAP_MS);
  };
  const openRecord = (m: PlanMeal) => {
    setSelected(null);
    const next = toPending(m);
    setTimeout(() => setPending(next), SHEET_SWAP_MS);
  };

  const save = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      await recordItems(
        pending.items.map((x) => ({ ...x.record, qty: x.qty })),
        pending.meal,
      );
      setPending(null);
    } finally {
      setSaving(false);
    }
  };

  let body;
  if (!targets) {
    body = (
      <MillyHero pose="sorry" title="목표량을 먼저 계산해 볼게요" sub="신체 정보를 확인하면 오늘 식단을 짜 드릴게요.">
        <Button title="신체 정보 보기" variant="tint" height={44} onPress={() => router.push('/my/body')} style={styles.heroBtn} />
      </MillyHero>
    );
  } else if (loading || !plan || (storesLoading && plan.status !== 'full' && plan.status !== 'none')) {
    body = (
      <>
        <MillyHero pose="thinking" title="오늘 식단을 짜고 있어요" sub="근처 메뉴를 살펴보는 중이에요" />
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <PlanRowSkeleton key={i} />
          ))}
        </View>
      </>
    );
  } else if (plan.status === 'full') {
    body = (
      <>
        <MillyHero
          pose="sleep"
          title="오늘은 충분히 드셨어요"
          sub={
            <Text variant="caption" color="ink2">
              {overKcal > 0 ? (
                <>
                  목표보다{' '}
                  <Text variant="captionMedium" color="over">
                    {formatNumber(overKcal)}kcal
                  </Text>{' '}
                  더 드셨어요{'\n'}내일 다시 채워져요
                </>
              ) : (
                '내일 아침에 새 식단을 짜 드릴게요'
              )}
            </Text>
          }
        />
        <MealList meals={plan.meals} />
      </>
    );
  } else if (plan.status === 'none') {
    body = (
      <>
        <MillyHero pose="sleep" title="오늘 식사는 다 챙기셨어요" sub="내일 아침에 새 식단을 짜 드릴게요" />
        <MealList meals={plan.meals} />
      </>
    );
  } else if (nearbyStatus === 'denied' && stores.length === 0) {
    body = (
      <MillyHero pose="sorry" title="어디 계신지 알려 주세요" sub="위치를 허용하면 지금 계신 곳 근처 메뉴로 식단을 짜 드려요.">
        <Button title="위치 허용" variant="tint" height={44} onPress={() => void allowLocation()} style={styles.heroBtn} />
      </MillyHero>
    );
  } else if (nearbyStatus === 'error' && stores.length === 0) {
    body = (
      <MillyHero pose="sorry" title="근처 메뉴를 불러오지 못했어요" sub="잠시 뒤에 다시 찾아볼게요.">
        <Button
          title="다시 찾기"
          variant="tint"
          height={44}
          left={<Ionicons name="refresh" size={16} color={colors.primaryText} />}
          onPress={() => void useNearby.getState().refresh()}
          style={styles.heroBtn}
        />
      </MillyHero>
    );
  } else if (plan.status === 'noCandidates') {
    body = (
      <>
        <MillyHero pose="sorry" title="근처에서 맞는 메뉴를 찾지 못했어요" sub="주변 탭에서 반경을 넓히거나 위치를 바꿔 보시면 다시 짜 드릴게요.">
          <Button title="주변 보기" variant="tint" height={44} onPress={() => router.navigate('/(tabs)/nearby')} style={styles.heroBtn} />
        </MillyHero>
        <MealList meals={plan.meals.filter((m) => m.status === 'done')} />
      </>
    );
  } else {
    const planned = plan.meals.filter((m) => m.status === 'planned');
    body = (
      <>
        <MillyHero
          pose="cheer"
          title={'오늘은 이렇게\n어때요?'}
          sub={`오늘 남은 ${formatNumber(plan.remainingKcal)}kcal 기준 · 근처 ${plan.storeCount}곳`}
        />
        <View style={styles.listHead}>
          <Text variant="h3">밀리가 고른 {planned.length === 1 ? '한 끼' : `${planned.length}끼`}</Text>
          <Text variant="caption" color="ink3">
            합계 <Text variant="captionMedium" color="ink2">{formatNumber(Math.round(plan.plannedKcal))}kcal</Text>
          </Text>
        </View>
        <MealList meals={plan.meals} onOpen={setSelected} style={styles.listTight} />
        <Button
          title="다른 조합 보기"
          variant="tint"
          height={48}
          left={<Ionicons name="refresh" size={18} color={colors.primaryText} />}
          onPress={reroll}
          style={styles.reroll}
        />
        <Text variant="small" color="ink3" align="center" style={styles.footnote}>
          어제·그저께 드신 메뉴는 빼고, 끼니마다 다른 매장으로 골랐어요
        </Text>
      </>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {body}
      </ScrollView>

      <PlanMealSheet meal={selected} onClose={() => setSelected(null)} onStore={openStore} onRecord={openRecord} />

      <RecordSheet
        visible={!!pending}
        onClose={() => setPending(null)}
        items={pending?.items ?? []}
        onQty={(key, qty) => setPending((p) => (p ? { ...p, items: p.items.map((x) => (x.key === key ? { ...x, qty } : x)) } : p))}
        onRemove={pending && pending.items.length > 1 ? (key) => setPending((p) => (p ? { ...p, items: p.items.filter((x) => x.key !== key) } : p)) : undefined}
        meal={pending?.meal ?? 'lunch'}
        onMeal={(meal) => setPending((p) => (p ? { ...p, meal } : p))}
        remainingKcal={summary?.remaining.kcal ?? targets?.kcal ?? null}
        saving={saving}
        onSave={() => void save()}
      />
    </SafeAreaView>
  );
}

function MealList({ meals, onOpen, style }: { meals: PlanMeal[]; onOpen?: (m: PlanMeal) => void; style?: StyleProp<ViewStyle> }) {
  if (!meals.length) return null;
  const skipped = meals.filter((m) => m.status === 'skipped');
  const rest = meals.filter((m) => m.status !== 'skipped');
  return (
    <View style={[styles.list, style]}>
      {skipped.length ? (
        <Text variant="small" color="ink3" style={styles.skipped}>
          {skipped.map((m) => m.label).join('·')} 시간은 지나갔어요
        </Text>
      ) : null}
      {rest.map((m) =>
        m.status === 'planned' && m.main ? (
          <PlanRow key={m.mealType} meal={m} onPress={onOpen ? () => onOpen(m) : undefined} />
        ) : (
          <MealRow key={m.mealType} meal={m} />
        ),
      )}
    </View>
  );
}

/** 기록한 끼니 · 맞는 메뉴가 없는 끼니 — 한 줄로 접어 둔다 */
function MealRow({ meal }: { meal: PlanMeal }) {
  const done = meal.status === 'done';
  const text = done ? `${meal.label}은 기록했어요 · ${formatNumber(meal.loggedKcal ?? 0)}kcal` : `${meal.label}에 맞는 메뉴를 근처에서 찾지 못했어요`;
  const sub = done ? meal.loggedNames?.join(', ') : meal.budgetKcal ? `${meal.label} 적정량 ${formatNumber(meal.budgetKcal)}kcal` : undefined;
  return (
    <View style={styles.row} accessibilityLabel={sub ? `${text}. ${sub}` : text}>
      <Ionicons name={done ? 'checkmark-circle' : 'search-outline'} size={20} color={done ? colors.primary : colors.ink3} />
      <Text variant="captionMedium" color={done ? 'ink' : 'ink3'} numberOfLines={1}>
        {text}
      </Text>
      {sub ? (
        <Text variant="small" color="ink3" numberOfLines={1} style={styles.flex}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/** 짠 끼니 한 줄 — 누르면 자세히(매장 보기·이걸로 기록) */
function PlanRow({ meal, onPress }: { meal: PlanMeal; onPress?: () => void }) {
  const main = meal.main!;
  const extra = meal.extra;
  const verdict = main.judgement.verdict;
  const kcal = meal.totalKcal ?? main.kcal;
  const names = extra ? `${main.menu.name} + ${extra.menu.name}` : main.menu.name;
  return (
    <Card
      padding={spacing.lg}
      onPress={onPress}
      style={styles.planCard}
      accessibilityLabel={`${meal.label} 추천: ${names}, ${main.store.name}, ${formatNumber(Math.round(kcal))}kcal, ${VERDICT_LABEL[verdict]}. 누르면 자세히 볼 수 있어요`}
    >
      <MenuTile menu={main.menu} size={56} />
      <View style={styles.flex}>
        <View style={styles.headRow}>
          <View style={styles.mealPill}>
            <Text variant="label" color="primaryText">
              {meal.label}
            </Text>
          </View>
          <Text variant="small" color="ink3" numberOfLines={1} style={styles.flex}>
            {meal.timeHint}
          </Text>
        </View>
        <Text variant="h3" numberOfLines={2} style={styles.name}>
          {main.menu.name}
          {extra ? (
            <Text variant="caption" color="ink2">
              {'  '}+ {extra.menu.name}
            </Text>
          ) : null}
        </Text>
        <Text variant="small" color="ink3" numberOfLines={1}>
          {main.store.name} · {formatDistance(main.store.distanceM)}
        </Text>
      </View>
      <View style={styles.right}>
        <Text variant="small" color="ink3">
          <Text variant="h2">{formatNumber(Math.round(kcal))}</Text> kcal
        </Text>
        <VerdictBadge verdict={verdict} size="sm" />
      </View>
    </Card>
  );
}

function PlanRowSkeleton() {
  return (
    <Card padding={spacing.lg} style={styles.planCard}>
      <Skeleton width={56} height={56} borderRadius={28} />
      <View style={[styles.flex, styles.skelLines]}>
        <Skeleton width={44} height={20} borderRadius={radius.pill} />
        <Skeleton width="75%" height={16} />
        <Skeleton width="50%" height={12} />
      </View>
      <View style={[styles.right, styles.skelLines]}>
        <Skeleton width={56} height={20} />
        <Skeleton width={48} height={22} borderRadius={radius.pill} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.page, paddingTop: spacing.xl, paddingBottom: spacing.xxl },
  flex: { flex: 1, minWidth: 0 },
  heroBtn: { alignSelf: 'flex-start', paddingHorizontal: spacing.xl },
  list: { marginTop: spacing.xl, gap: spacing.md },
  listHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: spacing.xl, paddingHorizontal: spacing.xs },
  listTight: { marginTop: spacing.md },
  skipped: { marginLeft: spacing.xs },
  planCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mealPill: { height: 20, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  name: { marginTop: 4 },
  right: { alignItems: 'flex-end', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, paddingHorizontal: spacing.md + 2, borderRadius: radius.lg, backgroundColor: colors.section },
  reroll: { marginTop: spacing.xl },
  footnote: { marginTop: spacing.sm },
  skelLines: { gap: 6 },
});
