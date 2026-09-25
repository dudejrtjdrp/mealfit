import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, EmptyState, MenuTile, Skeleton, Text, VerdictBadge } from '@/components';
import { CHAT_INDENT, MillySay } from '@/components/Chat';
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
import { colors, radius, size, spacing } from '@/theme';

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
      record: { name: c.menu.name, base: c.nutrients, trust: c.menu.trust, menu: c.menu },
    })),
  };
}

/** 밀리 탭 — "오늘은 이렇게 어때요?" 오늘 남은 끼니 식단 (규칙 기반, 최근 2일 먹은 메뉴는 빼고 근처 매장에서) */
export default function MillyScreen() {
  const targets = useProfile((s) => s.targets);
  const summary = useDay((s) => s.summary);
  const dayStatus = useDay((s) => s.status);
  const nearbyStatus = useNearby((s) => s.status);
  const stores = useNearby((s) => s.stores);
  const reroll = useMealPlanReroll((s) => s.reroll);
  const { plan, recentLoading } = useMealPlan();

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
      <EmptyState
        pose="sorry"
        title="목표량을 아직 계산하지 못했어요"
        description="마이 탭에서 신체 정보를 확인하면 식단을 짜 드릴게요."
        actionLabel="신체 정보 보기"
        onAction={() => router.push('/my/body')}
      />
    );
  } else if (loading || !plan || (storesLoading && plan.status !== 'full' && plan.status !== 'none')) {
    body = (
      <>
        <MillySay pose="thinking" lines={['근처 메뉴를 살펴보면서 오늘 식단을 짜고 있어요']} />
        <View style={styles.list}>
          {[0, 1, 2].map((i) => (
            <PlanCardSkeleton key={i} />
          ))}
        </View>
      </>
    );
  } else if (plan.status === 'full') {
    body = (
      <>
        <MillySay pose="sleep" lines={['오늘은 충분히 드셨어요', '내일 다시 짜 드릴게요']} />
        {overKcal > 0 ? (
          <Text variant="caption" color="ink3" style={styles.overLine}>
            목표보다{' '}
            <Text variant="captionMedium" color="over">
              {formatNumber(overKcal)}kcal
            </Text>{' '}
            더 드셨어요 · 내일 다시 채워져요
          </Text>
        ) : null}
        <MealList meals={plan.meals} />
      </>
    );
  } else if (plan.status === 'none') {
    body = (
      <>
        <MillySay pose="cheer" lines={['오늘 식사는 다 챙기셨어요', '내일 아침에 새 식단을 짜 드릴게요']} />
        <MealList meals={plan.meals} />
      </>
    );
  } else if (nearbyStatus === 'denied' && stores.length === 0) {
    body = (
      <EmptyState
        pose="sorry"
        title="근처 매장을 알면 식단을 짜 드릴 수 있어요"
        description="위치를 허용하면 지금 계신 곳 근처에서 먹을 수 있는 메뉴로 골라 드려요."
        actionLabel="위치 허용"
        onAction={() => void allowLocation()}
      />
    );
  } else if (nearbyStatus === 'error' && stores.length === 0) {
    body = (
      <EmptyState
        pose="sorry"
        title="근처 메뉴를 불러오지 못했어요"
        description="잠시 뒤에 다시 찾아볼게요."
        actionLabel="다시 찾기"
        onAction={() => void useNearby.getState().refresh()}
      />
    );
  } else if (plan.status === 'noCandidates') {
    body = (
      <>
        <EmptyState
          pose="sorry"
          title="근처에서 식단에 맞는 메뉴를 찾지 못했어요"
          description="주변 탭에서 반경을 넓히거나 위치를 바꿔 보시면 다시 짜 드릴게요."
          actionLabel="주변 보기"
          onAction={() => router.navigate('/(tabs)/nearby')}
        />
        <MealList meals={plan.meals.filter((m) => m.status === 'done')} />
      </>
    );
  } else {
    const count = plan.meals.filter((m) => m.status === 'planned').length;
    body = (
      <>
        <MillySay
          pose="cheer"
          lines={[
            '오늘은 이렇게 어때요?',
            `오늘 남은 **${formatNumber(plan.remainingKcal)}kcal** 기준으로 근처 ${plan.storeCount}곳에서 ${count === 1 ? '한 끼를' : `${count}끼를`} 골라 봤어요`,
          ]}
        />
        <Text variant="caption" color="ink3" style={styles.note}>
          어제·그저께 드신 메뉴는 빼고, 끼니마다 다른 매장으로 짰어요
        </Text>
        <MealList meals={plan.meals} onRecord={(m) => setPending(toPending(m))} />
        <Button
          title="다른 조합 보기"
          variant="tint"
          height={48}
          left={<Ionicons name="refresh" size={18} color={colors.primaryText} />}
          onPress={reroll}
          style={styles.reroll}
        />
        <Text variant="small" color="ink3" align="center" style={styles.footnote}>
          끼니 양은 오늘 남은 양을 남은 끼니 수로 나눠 대략 잡았어요
        </Text>
      </>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text variant="h1" accessibilityRole="header">
            밀리
          </Text>
          <Text variant="caption" color="ink3">
            밀리가 오늘 식단을 짜 드려요.
          </Text>
        </View>
        {body}
      </ScrollView>

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

function MealList({ meals, onRecord }: { meals: PlanMeal[]; onRecord?: (m: PlanMeal) => void }) {
  if (!meals.length) return null;
  return (
    <View style={styles.list}>
      {meals.map((m) =>
        m.status === 'planned' && m.main ? (
          <PlanCard key={m.mealType} meal={m} onRecord={onRecord ? () => onRecord(m) : undefined} />
        ) : (
          <MealRow key={m.mealType} meal={m} />
        ),
      )}
    </View>
  );
}

/** 기록한 끼니 · 지나간 끼니 · 맞는 메뉴가 없는 끼니 — 한 줄로 접어 둔다 */
function MealRow({ meal }: { meal: PlanMeal }) {
  let icon: 'checkmark-circle' | 'time-outline' | 'search-outline' = 'time-outline';
  let text: string;
  let sub: string | undefined;
  if (meal.status === 'done') {
    icon = 'checkmark-circle';
    text = `${meal.label}은 기록했어요 · ${formatNumber(meal.loggedKcal ?? 0)}kcal`;
    sub = meal.loggedNames?.join(', ');
  } else if (meal.status === 'skipped') {
    text = `${meal.label} 시간은 지나갔어요`;
  } else {
    icon = 'search-outline';
    text = `${meal.label}에 맞는 메뉴를 근처에서 찾지 못했어요`;
    sub = meal.budgetKcal ? `${meal.label} 적정량 ${formatNumber(meal.budgetKcal)}kcal` : undefined;
  }
  return (
    <View style={styles.row} accessibilityLabel={sub ? `${text}. ${sub}` : text}>
      <Ionicons name={icon} size={20} color={meal.status === 'done' ? colors.primary : colors.ink3} />
      <View style={styles.flex}>
        <Text variant="bodyMedium" color={meal.status === 'done' ? 'ink' : 'ink3'} numberOfLines={1}>
          {text}
        </Text>
        {sub ? (
          <Text variant="small" color="ink3" numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function PlanCard({ meal, onRecord }: { meal: PlanMeal; onRecord?: () => void }) {
  const main = meal.main!;
  const extra = meal.extra;
  const verdict = main.judgement.verdict;
  const names = extra ? `${main.menu.name} + ${extra.menu.name}` : main.menu.name;
  return (
    <Card padding={spacing.xl} style={styles.card} accessibilityLabel={`${meal.label} 추천: ${names}, ${main.store.name}, ${formatNumber(meal.totalKcal ?? main.kcal)}kcal, ${VERDICT_LABEL[verdict]}`}>
      <View style={styles.cardHead}>
        <View style={styles.mealPill}>
          <Text variant="label" color="primaryText">
            {meal.label}
          </Text>
        </View>
        <Text variant="small" color="ink3" style={styles.flex}>
          {meal.timeHint}
        </Text>
        <VerdictBadge verdict={verdict} size="sm" />
      </View>

      <View style={styles.menuRow}>
        <MenuTile menu={main.menu} size={48} />
        <View style={styles.flex}>
          <Text variant="h3" numberOfLines={2}>
            {main.menu.name}
          </Text>
          {extra ? (
            <Text variant="caption" color="ink2" numberOfLines={1}>
              + {extra.menu.name}
            </Text>
          ) : null}
          <Text variant="small" color="ink3" numberOfLines={1} style={styles.storeLine}>
            {main.store.name} · {formatDistance(main.store.distanceM)}
          </Text>
        </View>
      </View>

      <View style={styles.kcalRow}>
        <Text variant="caption" color="ink2">
          <Text variant="numberSm">{formatNumber(meal.totalKcal ?? main.kcal)}</Text> kcal
        </Text>
        {meal.budgetKcal ? (
          <Text variant="small" color="ink3">
            {meal.label} 적정량 {formatNumber(meal.budgetKcal)}kcal
          </Text>
        ) : null}
      </View>

      {meal.reason ? (
        <View style={styles.reason}>
          <Ionicons name="sparkles-outline" size={14} color={colors.primaryText} />
          <Text variant="caption" color="ink2" style={styles.flex}>
            {meal.reason}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          title="매장 보기"
          variant="outline"
          height={44}
          style={styles.action}
          onPress={() => router.push({ pathname: '/store/[id]', params: { id: main.store.id } })}
        />
        {onRecord ? <Button title="이걸로 기록" variant="tint" height={44} style={styles.action} onPress={onRecord} /> : null}
      </View>
    </Card>
  );
}

function PlanCardSkeleton() {
  return (
    <Card padding={spacing.xl} style={styles.card}>
      <View style={styles.cardHead}>
        <Skeleton width={44} height={24} borderRadius={radius.pill} />
        <View style={styles.flex} />
        <Skeleton width={52} height={24} borderRadius={radius.pill} />
      </View>
      <View style={styles.menuRow}>
        <Skeleton width={48} height={48} borderRadius={24} />
        <View style={[styles.flex, styles.skelLines]}>
          <Skeleton width="70%" height={16} />
          <Skeleton width="45%" height={12} />
        </View>
      </View>
      <Skeleton width="90%" height={14} style={styles.skelReason} />
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.page, paddingBottom: spacing.xxxl },
  header: { paddingTop: spacing.lg, minHeight: size.header, justifyContent: 'center', marginBottom: spacing.lg },
  flex: { flex: 1, minWidth: 0 },
  note: { marginTop: spacing.sm, marginLeft: CHAT_INDENT },
  overLine: { marginTop: spacing.sm, marginLeft: CHAT_INDENT },
  list: { marginTop: spacing.xl, gap: spacing.md },
  card: { gap: spacing.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mealPill: { height: 24, paddingHorizontal: spacing.sm + 2, borderRadius: radius.pill, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  storeLine: { marginTop: 2 },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.section },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1, alignSelf: 'auto' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.section },
  reroll: { marginTop: spacing.xl },
  footnote: { marginTop: spacing.md },
  skelLines: { gap: spacing.sm },
  skelReason: { marginTop: spacing.xs },
});

