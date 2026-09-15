import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, KcalRing, NutrientBar, Screen, Skeleton, Text, VerdictBadge, type NutrientKey } from '@/components';
import { formatNumber, remainingMessage } from '@/domain/summary';
import { MEAL_LABEL, type DaySummary, type MealType } from '@/domain/types';
import { useDay } from '@/state/day';
import { useProfile } from '@/state/profile';
import { colors, radius, spacing } from '@/theme';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** 상태별 홈 문구 — 허용의 언어만 */
function homeCopy(summary: DaySummary): { title: string; sub: string } {
  if (summary.status === 'over') return { title: '오늘은 여기까지, 내일 다시 채워져요', sub: '충분히 잘 챙겨 드셨어요' };
  return remainingMessage(summary);
}

/** C1 오늘 홈 — 여유분 게이지 + 오늘 기록 요약 + 주변 찾기 CTA */
export default function Today() {
  const profile = useProfile((s) => s.profile);
  const targets = useProfile((s) => s.targets);
  const summary = useDay((s) => s.summary);
  const dayStatus = useDay((s) => s.status);

  const now = new Date();
  const dateLabel = `${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAY[now.getDay()]}요일`;
  const nickname = profile?.nickname ?? '회원';
  const loading = !summary && (dayStatus === 'idle' || dayStatus === 'loading' || useProfile.getState().status === 'loading');

  const over = summary?.status === 'over';
  const ringColor = over ? colors.ok : colors.gaugeFill;
  const bars = targets ? (targets.emphasis.filter((k) => k !== 'kcal') as NutrientKey[]).slice(0, 3) : [];
  const copy = summary ? homeCopy(summary) : null;

  return (
    <Screen scroll edges={['top']} contentStyle={styles.content}>
      <View style={styles.header}>
        <Text variant="h1">오늘</Text>
        <Text variant="body" color="ink2" style={styles.sub}>
          {dateLabel} · {nickname}님, 오늘도 가볍게
        </Text>
      </View>

      <Card padding={20} style={styles.card}>
        <View style={styles.cardTop}>
          <Text variant="h3" numberOfLines={1} style={styles.cardTitle}>
            오늘의 여유
          </Text>
          {summary ? (
            <View style={styles.hint}>
              <Text variant="caption" color={over ? 'ok' : 'primaryText'} numberOfLines={1} style={styles.hintText}>
                {remainingMessage(summary).title}
              </Text>
              <MaterialCommunityIcons name="sprout" size={18} color={over ? colors.ok : colors.primary} />
            </View>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.gaugeRow}>
            <Skeleton width={136} height={136} borderRadius={68} />
            <View style={styles.bars}>
              <Skeleton height={14} />
              <Skeleton height={14} />
              <Skeleton height={14} />
            </View>
          </View>
        ) : summary && targets ? (
          <>
            <View style={styles.gaugeRow}>
              <KcalRing
                value={summary.remaining.kcal}
                progress={over ? 1 : targets.kcal > 0 ? summary.remaining.kcal / targets.kcal : 0}
                target={targets.kcal}
                size={128}
                stroke={12}
                color={ringColor}
                numberSize={32}
              />
              <View style={styles.bars}>
                {bars.map((k) => (
                  <NutrientBar key={k} nutrient={k} value={Math.round(summary.consumed[k] ?? 0)} max={targets[k]} compact />
                ))}
              </View>
            </View>
            <View style={[styles.statusBox, over && styles.statusBoxOver]}>
              <Text variant="bodyMedium" color={over ? 'ok' : 'primaryText'}>
                {over ? copy?.title : copy?.sub}
              </Text>
              <Text variant="caption" color="ink2" style={styles.statusSub}>
                {over ? copy?.sub : summary.status === 'empty' ? '주변 매장의 메뉴를 먼저 판정해 드릴게요' : '지금 주변에서 잘 맞는 메뉴를 찾아볼까요?'}
              </Text>
            </View>
          </>
        ) : (
          <EmptyState emoji="🧮" title="목표량을 아직 계산하지 못했어요" description="마이 탭에서 신체 정보를 확인해 주세요." actionLabel="신체 정보 보기" onAction={() => router.push('/my/body')} style={styles.emptyInner} />
        )}
      </Card>

      <Card padding={20} style={styles.card}>
        <View style={styles.cardTop}>
          <Text variant="h3">오늘의 기록</Text>
          {summary && summary.logs.length > 0 ? (
            <Text variant="caption" color="ink2">
              총 {summary.logs.length}번 · {formatNumber(summary.consumed.kcal)} kcal
            </Text>
          ) : null}
        </View>
        {summary && summary.logs.length > 0 ? (
          <View style={styles.meals}>
            {MEAL_ORDER.map((m) => {
              const items = summary.logs.filter((l) => l.mealType === m);
              if (items.length === 0) return null;
              const kcal = items.reduce((s, l) => s + l.nutrients.kcal, 0);
              // 끼니 안 판정이 모두 같을 때만 배지 (섞여 있으면 숨김)
              const verdict = items.every((l) => l.verdict && l.verdict === items[0].verdict) ? items[0].verdict : undefined;
              return (
                <View key={m} style={styles.mealRow}>
                  <Text variant="bodyMedium" style={styles.mealLabel}>
                    {MEAL_LABEL[m]}
                  </Text>
                  <Text variant="body" color="ink2" numberOfLines={1} style={styles.mealNames}>
                    {items.map((l) => l.name).join(', ')}
                  </Text>
                  <Text variant="bodyMedium">{formatNumber(kcal)} kcal</Text>
                  {verdict ? <VerdictBadge verdict={verdict} size="sm" style={styles.mealBadge} /> : null}
                </View>
              );
            })}
          </View>
        ) : (
          <EmptyState emoji="🍽️" title="오늘의 첫 끼를 기다리고 있어요" description="먹기 전에 주변 메뉴부터 살펴보세요." style={styles.emptyInner} />
        )}
      </Card>

      <Button title="지금 주변에서 찾기" trailingChevron onPress={() => router.navigate('/(tabs)/nearby')} style={styles.cta} />
      <Button title="직접 기록" variant="ghost" onPress={() => router.push('/log/add')} style={styles.ghost} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxxl },
  header: { paddingTop: spacing.xl, paddingBottom: spacing.sm },
  sub: { marginTop: 2 },
  card: { marginTop: spacing.lg },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { flexShrink: 0 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  hintText: { flexShrink: 1 },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, gap: spacing.md },
  bars: { flex: 1, gap: spacing.lg },
  statusBox: { marginTop: spacing.lg, backgroundColor: colors.primarySofter, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  statusBoxOver: { backgroundColor: colors.okBg },
  statusSub: { marginTop: 2 },
  meals: { marginTop: spacing.sm },
  mealRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm + 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.lineSoft },
  mealLabel: { width: 40 },
  mealNames: { flex: 1, marginRight: spacing.sm },
  mealBadge: { marginLeft: spacing.sm },
  emptyInner: { paddingVertical: spacing.lg },
  cta: { marginTop: spacing.xxl },
  ghost: { marginTop: spacing.xs },
});
