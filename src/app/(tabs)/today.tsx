import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, EmptyState, KcalRing, MenuTile, NutrientBar, RichText, Skeleton, Text, Wordmark, type NutrientKey } from '@/components';
import { RecommendCard, RecommendCardSkeleton } from '@/components/RecommendCard';
import { getMenu, getMenusByBrand } from '@/data';
import { REFERENCE_FOOD_SPECS, foodEquivalent, resolveReferenceFoods } from '@/domain/foodEquivalent';
import { formatNumber } from '@/domain/summary';
import { MEAL_LABEL, type DailyTargets, type DaySummary, type MenuCategory, type Profile } from '@/domain/types';
import * as location from '@/services/location';
import { judgeProfile } from '@/state/bootstrap';
import { useDay } from '@/state/day';
import { useNearby } from '@/state/nearby';
import { useProfile } from '@/state/profile';
import { collectCandidates, pickRecommendations } from '@/state/recommend';
import { colors, fonts, radius, size, spacing } from '@/theme';

const MAX_ROWS = 4;

/** 인사 헤드라인 — 허용의 언어만. 넘겼거나 여유가 0이면 "오늘은 여기까지, 내일 다시 채워져요" */
function headline(summary: DaySummary, nickname: string): string {
  if (summary.status === 'over' || summary.remaining.kcal <= 0) return `${nickname}님, 오늘은 여기까지\n**내일** 다시 채워져요`;
  return `${nickname}님, 오늘\n**${formatNumber(summary.remaining.kcal)}kcal** 더 먹을 수 있어요`;
}

/** C1 오늘 홈 — 2색 인사 헤드라인 + 칼로리 도넛 링·영양소 미니바 카드(누르면 기록 탭) + 오늘 기록 + 주변 메뉴 더 보기 CTA */
export default function Today() {
  const profile = useProfile((s) => s.profile);
  const targets = useProfile((s) => s.targets);
  const summary = useDay((s) => s.summary);
  const dayStatus = useDay((s) => s.status);

  const nickname = profile?.nickname ?? '회원';
  const loading = !summary && (dayStatus === 'idle' || dayStatus === 'loading' || useProfile.getState().status === 'loading');
  const bars = targets ? (targets.emphasis.filter((k) => k !== 'kcal') as NutrientKey[]).slice(0, 3) : [];
  const logs = summary?.logs ?? [];
  const over = !!summary && (summary.status === 'over' || summary.remaining.kcal <= 0);

  // 남은 kcal 을 음식으로 번역 — 기준 음식 kcal 은 앱 메뉴 데이터에서만. 못 맞추면 줄을 숨긴다
  const refFoods = useMemo(() => resolveReferenceFoods(REFERENCE_FOOD_SPECS, getMenu), []);
  const equivalent = useMemo(() => (summary && !over ? foodEquivalent(summary.remaining.kcal, refFoods) : null), [summary, over, refFoods]);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.topBar}>
        <Wordmark size={20} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.headSkel}>
            <Skeleton width="60%" height={24} />
            <Skeleton width="80%" height={24} />
          </View>
        ) : summary ? (
          <>
            <RichText variant="h1" text={headline(summary, nickname)} accessibilityRole="header" />
            {equivalent ? (
              <Text variant="caption" color="ink3" style={styles.equivalent}>
                {equivalent.text}
              </Text>
            ) : null}
          </>
        ) : (
          <Text variant="h1" accessibilityRole="header">
            {nickname}님, 반가워요
          </Text>
        )}

        {/* 다 먹은 날·목표량이 없는 경우엔 추천을 숨긴다 */}
        {over || (!loading && !(summary?.remaining ?? targets)) ? null : <NearbyPicks remaining={summary?.remaining ?? targets} profile={profile} />}

        <Card
          style={styles.gaugeCard}
          onPress={summary && targets ? () => router.navigate('/(tabs)/log') : undefined}
          accessibilityLabel={summary ? `오늘 ${formatNumber(Math.max(0, summary.remaining.kcal))}kcal 더 먹을 수 있어요. 누르면 기록으로 가요` : undefined}
        >
          {loading ? (
            <View style={styles.gaugeRow}>
              <Skeleton width={130} height={130} borderRadius={65} />
              <View style={styles.bars}>
                <Skeleton height={12} />
                <Skeleton height={12} />
                <Skeleton height={12} />
              </View>
            </View>
          ) : summary && targets ? (
            <View style={styles.gaugeRow}>
              <KcalRing value={summary.remaining.kcal} progress={targets.kcal > 0 ? summary.consumed.kcal / targets.kcal : 0} numberSize={summary.remaining.kcal >= 10000 ? 24 : undefined} />
              <View style={styles.bars}>
                {bars.map((k) => (
                  <NutrientBar key={k} nutrient={k} value={Math.round((summary.consumed[k] ?? 0) * 10) / 10} max={targets[k]} />
                ))}
              </View>
            </View>
          ) : (
            <EmptyState
              pose="sorry"
              title="목표량을 아직 계산하지 못했어요"
              description="마이 탭에서 신체 정보를 확인해 주세요."
              actionLabel="신체 정보 보기"
              onAction={() => router.push('/my/body')}
              style={styles.emptyInner}
            />
          )}
        </Card>

        <Card padding={0} style={styles.logCard}>
          <View style={styles.logHead}>
            <Text variant="h3">오늘 기록</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="기록 추가" hitSlop={8} onPress={() => router.push('/log/add')} style={styles.addBtn}>
              <Text variant="bodyMedium" color="primaryText" style={styles.addText}>
                추가
              </Text>
            </Pressable>
          </View>
          {loading ? (
            <View style={styles.rows}>
              <Skeleton height={44} borderRadius={radius.pill} />
            </View>
          ) : logs.length > 0 ? (
            <View style={styles.rows}>
              {logs.slice(0, MAX_ROWS).map((l) => (
                <Pressable key={l.id} accessibilityRole="button" onPress={() => router.navigate('/(tabs)/log')} style={({ pressed }) => [styles.logRow, pressed && { opacity: 0.7 }]}>
                  <MenuTile menu={(l.menuId && getMenu(l.menuId)) || { name: l.name, category: 'meal' as MenuCategory }} size={44} />
                  <Text variant="body" numberOfLines={1} style={styles.logName}>
                    {l.name}
                    <Text variant="body" color="ink3">
                      {' '}· {MEAL_LABEL[l.mealType]}
                    </Text>
                  </Text>
                  <Text variant="caption" color="ink2">
                    <Text variant="captionMedium" color="ink" style={styles.bold}>
                      {formatNumber(l.nutrients.kcal)}
                    </Text>{' '}
                    kcal
                  </Text>
                </Pressable>
              ))}
              {logs.length > MAX_ROWS ? (
                <Pressable accessibilityRole="button" onPress={() => router.navigate('/(tabs)/log')} style={styles.more}>
                  <Text variant="caption" color="ink3">
                    기록 {logs.length - MAX_ROWS}개 더 보기
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <Text variant="caption" color="ink3" style={styles.emptyLog}>
              아직 기록이 없어요. 먹기 전에 주변 메뉴부터 살펴볼까요?
            </Text>
          )}
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <Button title="주변 메뉴 더 보기" onPress={() => router.navigate('/(tabs)/nearby')} />
      </View>
    </SafeAreaView>
  );
}

/** 위치 허용 — 아직 안 물었으면 묻고, 이미 거절했으면 설정으로 */
async function allowLocation() {
  const status = await location.requestPermission();
  if (status === 'granted') void useNearby.getState().refresh();
  else Linking.openSettings().catch(() => undefined);
}

/**
 * "지금 근처 추천" — 주변 데이터 매장의 메뉴를 한 번에 판정해 서로 다른 매장 3곳의 메뉴를 보여준다.
 * 다 먹은 날(over)은 부모가 숨긴다.
 */
function NearbyPicks({ remaining, profile }: { remaining: DailyTargets | null; profile: Profile | null }) {
  const status = useNearby((s) => s.status);
  const stores = useNearby((s) => s.stores);

  // 홈에 들어올 때 아직 한 번도 안 찾았으면 찾는다
  useFocusEffect(
    useCallback(() => {
      const s = useNearby.getState();
      if (s.status === 'idle') void s.refresh();
    }, []),
  );

  const candidates = useMemo(
    () => (remaining && stores.length > 0 ? collectCandidates(stores, getMenusByBrand, remaining, { profile: judgeProfile(profile) }) : []),
    [stores, remaining, profile],
  );
  const picks = useMemo(() => pickRecommendations(candidates), [candidates]);

  const busy = status === 'idle' || status === 'locating' || status === 'loading';

  let body;
  if (status === 'denied') {
    body = (
      <View style={styles.pickNote}>
        <Text variant="caption" color="ink2" style={styles.pickNoteText}>
          위치를 허용하면 근처에서 먹기 좋은 메뉴를 골라 드려요
        </Text>
        <Pressable accessibilityRole="button" onPress={() => void allowLocation()} hitSlop={8} style={({ pressed }) => [styles.pickAction, pressed && styles.pickActionPressed]}>
          <Text variant="label" color="primaryText">
            위치 허용
          </Text>
        </Pressable>
      </View>
    );
  } else if (status === 'error') {
    body = (
      <View style={styles.pickNote}>
        <Text variant="caption" color="ink2" style={styles.pickNoteText}>
          근처 메뉴를 불러오지 못했어요
        </Text>
        <Pressable accessibilityRole="button" onPress={() => void useNearby.getState().refresh()} hitSlop={8} style={({ pressed }) => [styles.pickAction, pressed && styles.pickActionPressed]}>
          <Text variant="label" color="primaryText">
            다시 찾기
          </Text>
        </Pressable>
      </View>
    );
  } else if (!remaining || (busy && stores.length === 0)) {
    body = (
      <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false} style={styles.cardsWrap} contentContainerStyle={styles.cards}>
        {[0, 1, 2].map((i) => (
          <RecommendCardSkeleton key={i} />
        ))}
      </ScrollView>
    );
  } else if (picks.length === 0) {
    body = (
      <View style={styles.pickNote}>
        <Text variant="caption" color="ink2" style={styles.pickNoteText}>
          근처에 메뉴 정보가 있는 매장이 아직 없어요
        </Text>
      </View>
    );
  } else {
    body = (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cardsWrap} contentContainerStyle={styles.cards}>
        {picks.map(({ menu, judgement, store, kcal }) => (
          <RecommendCard
            key={menu.id}
            menu={menu}
            storeName={store.name}
            distanceM={store.distanceM}
            kcal={kcal}
            verdict={judgement.verdict}
            onPress={() => router.push({ pathname: '/menu/[id]', params: { id: menu.id, store: store.name } })}
          />
        ))}
      </ScrollView>
    );
  }

  return (
    <View style={styles.picks}>
      <Text variant="h3" accessibilityRole="header">
        지금 근처 추천
      </Text>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: { height: size.header, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: spacing.page, paddingRight: spacing.sm },
  scroll: { paddingHorizontal: spacing.page, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  headSkel: { gap: spacing.sm },
  equivalent: { marginTop: spacing.xs },
  picks: { marginTop: spacing.xl, gap: spacing.md },
  cardsWrap: { marginHorizontal: -spacing.page },
  cards: { paddingHorizontal: spacing.page, gap: spacing.md },
  pickNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.section },
  pickNoteText: { flex: 1 },
  pickAction: { minHeight: 32, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  pickActionPressed: { opacity: 0.7 },
  gaugeCard: { marginTop: spacing.xl, padding: spacing.xl },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xl },
  bars: { flex: 1, gap: 14, minWidth: 0 },
  emptyInner: { paddingVertical: spacing.lg },
  logCard: { marginTop: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, paddingHorizontal: spacing.xl },
  logHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: size.touch },
  addBtn: { minHeight: size.touch, minWidth: size.touch, paddingLeft: spacing.md, alignItems: 'flex-end', justifyContent: 'center' },
  addText: { fontSize: 14, fontFamily: fonts.semibold },
  rows: { gap: 4 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  logName: { flex: 1, fontSize: 14 },
  bold: { fontFamily: fonts.bold },
  more: { paddingVertical: spacing.sm, alignItems: 'center' },
  emptyLog: { paddingVertical: spacing.md },
  footer: { paddingHorizontal: spacing.page, paddingTop: spacing.sm, paddingBottom: spacing.lg, backgroundColor: colors.bg },
});
