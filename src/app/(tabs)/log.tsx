import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackIcon, BottomSheet, Button, Card, ChevronRightIcon, Chip, EmptyState, KcalRing, MenuTile, NutrientBar, Skeleton, Text, VerdictBadge, showToast, type NutrientKey } from '@/components';
import { QtyStepper } from '@/components/QtyStepper';
import { getMenu } from '@/data';
import { menuQtyUnit, qtyLabel, scaleNutrients } from '@/domain/qty';
import { formatNumber, overKcalText, summarizeDay, toDateKey } from '@/domain/summary';
import { MEAL_LABEL, VERDICT_LABEL, type DaySummary, type MealLog, type MealType, type MenuCategory } from '@/domain/types';
import { getCachedRemoteProduct } from '@/services/products';
import { getRepos } from '@/services/repo';
import { dominantVerdict, useDay, weekTally } from '@/state/day';
import { useProfile } from '@/state/profile';
import { colors, fonts, radius, size, spacing } from '@/theme';

const WEEK = ['월', '화', '수', '목', '금', '토', '일'];
const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
/** 기록의 제공 단위(개·잔·인분…) — 서버 제품은 세션 캐시에 있을 때만 알 수 있다 */
const logUnit = (log: MealLog) => menuQtyUnit(log.menuId ? getMenu(log.menuId) ?? getCachedRemoteProduct(log.menuId) : undefined);

function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // 월=0
  x.setDate(x.getDate() - dow);
  return x;
}
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 기록 제목 옆 문구 */
function progressCopy(s: DaySummary): string {
  switch (s.status) {
    case 'empty':
      return '오늘의 첫 끼를 기다려요';
    case 'room':
      return '잘 채워가고 있어요';
    case 'almost':
      return '오늘 거의 다 채웠어요';
    case 'over':
      // 넘은 양은 숨기지 않고 사실로 (빨강 — 2026-09-25 효님 결정). 지난 날짜도 그날 기준
      return overKcalText(s.over.kcal ?? 0);
  }
}

/** E1 기록 목록 — 주간 캘린더 스트립 · 하루 요약(링·미니바) · 끼니별 기록 */
export default function LogScreen() {
  const today = toDateKey();
  const targets = useProfile((s) => s.targets);
  const todaySummary = useDay((s) => s.summary);
  const todayStatus = useDay((s) => s.status);
  const { addLog, updateLog, removeLog, logsInRange } = useDay();

  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [selected, setSelected] = useState(today);
  const [other, setOther] = useState<{ date: string; logs: MealLog[] } | null>(null);
  /** 보고 있는 주의 날짜별 기록 (판정 점·주간 요약) — 한 주를 한 번에 읽는다 */
  const [week, setWeek] = useState<{ from: string; byDate: Record<string, MealLog[]> } | null>(null);
  const [editing, setEditing] = useState<MealLog | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const from = toDateKey(days[0]);
  const to = toDateKey(days[6]);

  const refreshWeek = useCallback(() => {
    let alive = true;
    void logsInRange(from, to).then((byDate) => alive && setWeek({ from, byDate }));
    return () => {
      alive = false;
    };
  }, [logsInRange, from, to]);

  useEffect(refreshWeek, [refreshWeek, todaySummary]);
  useFocusEffect(refreshWeek);

  const weekByDate = week?.from === from ? week.byDate : null;
  // 주간 요약: 이번 주면 일요일에, 지난 주를 넘겨 보면 언제나
  const thisMonday = toDateKey(mondayOf(new Date()));
  const isPastWeek = from < thisMonday;
  const showWeekly = !!weekByDate && (isPastWeek || (from === thisMonday && new Date().getDay() === 0));
  const tally = weekByDate ? weekTally(weekByDate) : null;

  // 오늘이 아닌 날을 고르면 저장소에서 따로 읽는다
  useEffect(() => {
    if (selected === today) return;
    let alive = true;
    getRepos()
      .logs.listByDate(selected)
      .then((logs) => alive && setOther({ date: selected, logs }))
      .catch(() => alive && setOther({ date: selected, logs: [] }));
    return () => {
      alive = false;
    };
  }, [selected, today, todaySummary]);

  const isToday = selected === today;
  const summary: DaySummary | null = isToday ? todaySummary : other && other.date === selected && targets ? summarizeDay(selected, other.logs, targets) : null;
  const loading = !summary && (isToday ? todayStatus !== 'ready' && todayStatus !== 'error' : true);

  const moveWeek = (n: number) => setWeekStart((w) => addDays(w, n * 7));
  const swipeRef = useRef(moveWeek);
  swipeRef.current = moveWeek;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -40) swipeRef.current(1);
          else if (g.dx > 40) swipeRef.current(-1);
        },
      }),
    [],
  );

  const bars = targets ? (targets.emphasis.filter((k) => k !== 'kcal') as NutrientKey[]).slice(0, 3) : [];
  const title = isToday ? '오늘' : `${Number(selected.slice(5, 7))}월 ${Number(selected.slice(8, 10))}일`;

  const applyEdit = async (patch: Partial<Pick<MealLog, 'mealType' | 'qty'>>) => {
    if (!editing) return;
    const base = editing.qty > 0 ? editing.qty : 1;
    const qty = patch.qty ?? editing.qty;
    const factor = qty / base;
    const scaled = scaleNutrients(editing.nutrients, factor);
    const next: MealLog = { ...editing, ...patch, qty, nutrients: scaled };
    setEditing(next);
    // 오늘이 아닌 기록도 스토어를 거친다 — 저장소 반영 + 주간 캐시 비우기
    await updateLog(next);
    if (next.date !== today) setOther((o) => (o ? { ...o, logs: o.logs.map((l) => (l.id === next.id ? next : l)) } : o));
  };

  /** 지우기 — 확인창 대신 토스트의 되돌리기(지운 기록을 그대로 다시 추가) */
  const remove = async (log: MealLog) => {
    if (editing?.id === log.id) setEditing(null);
    await removeLog(log.id);
    if (log.date !== today) setOther((o) => (o && o.date === log.date ? { ...o, logs: o.logs.filter((l) => l.id !== log.id) } : o));
    refreshWeek();
    showToast('기록을 지웠어요', 'info', {
      label: '되돌리기',
      onPress: () => {
        void addLog(log).then(() => {
          if (log.date !== today) setOther((o) => (o && o.date === log.date ? { ...o, logs: [...o.logs.filter((l) => l.id !== log.id), log].sort((a, b) => a.time.localeCompare(b.time)) } : o));
          refreshWeek();
        });
      },
    });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="h1" accessibilityRole="header">
              기록
            </Text>
            <Text variant="caption" color="ink3">
              오늘도 건강한 습관을 이어가요.
            </Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="기록 추가" onPress={() => router.push('/log/add')} style={styles.addBtn}>
            <Text variant="bodyMedium" color="primaryText" style={styles.addText}>
              추가
            </Text>
          </Pressable>
        </View>

        <View style={styles.week} {...pan.panHandlers}>
          <Pressable accessibilityRole="button" accessibilityLabel="이전 주" hitSlop={8} onPress={() => moveWeek(-1)} style={styles.weekNav}>
            <BackIcon size={16} color={colors.ink3} />
          </Pressable>
          {days.map((d, i) => {
            const key = toDateKey(d);
            const on = key === selected;
            const isT = key === today;
            const future = key > today;
            const dayLogs = weekByDate?.[key];
            const v = dayLogs?.length ? dominantVerdict(dayLogs) : undefined;
            const a11y = `${d.getMonth() + 1}월 ${d.getDate()}일${dayLogs?.length ? `, ${dayLogs.length}끼 기록${v ? `, 대부분 ${VERDICT_LABEL[v]}` : ''}` : ''}`;
            return (
              <Pressable key={key} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ selected: on }} disabled={future} onPress={() => setSelected(key)} style={styles.day}>
                <Text variant="small" color={isT ? 'primaryText' : 'ink3'} style={isT ? styles.todayLabel : undefined}>
                  {WEEK[i]}
                </Text>
                <View style={[styles.dayCircle, on && styles.dayOn]}>
                  <Text style={[styles.dayNum, { color: on ? colors.inkOnPrimary : future ? colors.border : colors.ink }]}>{d.getDate()}</Text>
                </View>
                <View style={[styles.dot, { opacity: dayLogs?.length ? 1 : 0, backgroundColor: v ? colors[v] : colors.border }]} />
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="button" accessibilityLabel="다음 주" hitSlop={8} onPress={() => moveWeek(1)} style={styles.weekNav}>
            <ChevronRightIcon size={16} color={colors.ink3} />
          </Pressable>
        </View>

        {showWeekly && tally && tally.days > 0 ? (
          <View style={styles.weekly} accessibilityRole="summary">
            <Ionicons name="leaf-outline" size={14} color={colors.primaryText} />
            <Text variant="caption" color="ink2" style={styles.weeklyText}>
              {weeklyCopy(isPastWeek ? (from === toDateKey(addDays(mondayOf(new Date()), -7)) ? '지난주' : '이 주') : '이번 주', tally)}
            </Text>
          </View>
        ) : null}

        <Card style={styles.card}>
          <View style={styles.cardHead}>
            <Text variant="h3">{title} 섭취 현황</Text>
            {summary ? (
              <Text variant="small" color={summary.status === 'over' ? 'over' : 'ink3'} numberOfLines={1} style={styles.cheerText}>
                {progressCopy(summary)}
              </Text>
            ) : null}
          </View>
          {loading ? (
            <View style={styles.gaugeRow}>
              <Skeleton width={120} height={120} borderRadius={60} />
              <View style={styles.bars}>
                <Skeleton height={12} />
                <Skeleton height={12} />
                <Skeleton height={12} />
              </View>
            </View>
          ) : summary && targets ? (
            <View style={styles.gaugeRow}>
              <KcalRing
                value={summary.consumed.kcal}
                over={summary.over.kcal}
                caption="kcal 먹었어요"
                progress={targets.kcal > 0 ? summary.consumed.kcal / targets.kcal : 0}
                target={targets.kcal}
                size={120}
                stroke={11}
                numberSize={summary.consumed.kcal >= 1000 ? 26 : 30}
              />
              <View style={styles.bars}>
                {bars.map((k) => (
                  <NutrientBar key={k} nutrient={k} value={Math.round((summary.consumed[k] ?? 0) * 10) / 10} max={targets[k]} over={k === 'protein' ? undefined : summary.over[k]} />
                ))}
              </View>
            </View>
          ) : (
            <EmptyState pose="sorry" title="목표량을 아직 계산하지 못했어요" description="마이 탭에서 신체 정보를 확인해 주세요." style={styles.emptyInner} />
          )}
        </Card>

        <Card padding={0} style={[styles.card, styles.logCard]}>
          <View style={styles.cardHead}>
            <Text variant="h3">{title} 식사 기록</Text>
            {summary && summary.logs.length > 0 ? (
              <Text variant="small" color="ink3">
                {summary.logs.length}끼 · {formatNumber(summary.consumed.kcal)} kcal
              </Text>
            ) : null}
          </View>
          {summary && summary.logs.length > 0 ? (
            <View style={styles.rows}>
              {summary.logs.map((l, i) => (
                <LogRow key={l.id} log={l} first={i === 0} onPress={() => setEditing(l)} onDelete={() => void remove(l)} />
              ))}
            </View>
          ) : loading ? (
            <View style={styles.rows}>
              <Skeleton height={56} borderRadius={radius.md} />
            </View>
          ) : (
            <EmptyState
              pose={isToday ? 'base' : 'sleep'}
              title={isToday ? '아직 기록이 없어요' : '이 날은 기록이 없어요'}
              description={isToday ? '먹은 메뉴를 가볍게 남겨 보세요.' : undefined}
              actionLabel={isToday ? '기록 추가' : undefined}
              onAction={isToday ? () => router.push('/log/add') : undefined}
              style={styles.emptyInner}
            />
          )}
        </Card>
      </ScrollView>

      <BottomSheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.name}
        subtitle={editing ? `${formatNumber(editing.nutrients.kcal)} kcal${editing.storeName ? ` · ${editing.storeName}` : ''}` : undefined}
        footer={
          <View style={styles.sheetFooter}>
            <Button title="지우기" variant="ghost" onPress={() => editing && void remove(editing)} style={styles.sheetBtn} />
            <Button title="완료" onPress={() => setEditing(null)} style={styles.sheetBtn} />
          </View>
        }
      >
        <Text variant="captionMedium" color="ink2">
          끼니
        </Text>
        <View style={styles.sheetChips}>
          {MEALS.map((m) => (
            <Chip key={m} label={MEAL_LABEL[m]} variant="option" selected={editing?.mealType === m} onPress={() => void applyEdit({ mealType: m })} />
          ))}
        </View>
        <Text variant="captionMedium" color="ink2" style={styles.sheetLabel}>
          수량
        </Text>
        {editing ? <QtyStepper value={editing.qty} onChange={(q) => void applyEdit({ qty: q })} unit={logUnit(editing)} size="lg" style={styles.stepper} /> : null}
      </BottomSheet>
    </SafeAreaView>
  );
}

/** "이번 주 좋음 9끼 · 기록 5일" — 좋음이 없으면 기록한 날만 (비교·비난 없이) */
function weeklyCopy(label: string, t: { good: number; days: number }): string {
  return [label, t.good > 0 ? `좋음 ${t.good}끼` : undefined].filter(Boolean).join(' ') + `${t.good > 0 ? ' · ' : ' '}기록 ${t.days}일`;
}

/** 왼쪽으로 밀면 나오는 지우기 — 끝까지 밀거나 눌러서 지운다 */
function DeleteAction({ onDelete }: { onDelete: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="기록 지우기" onPress={onDelete} style={styles.swipeAction}>
      <Ionicons name="trash-outline" size={20} color={colors.inkOnPrimary} />
      <Text variant="label" color="inkOnPrimary">
        지우기
      </Text>
    </Pressable>
  );
}

function LogRow({ log, first, onPress, onDelete }: { log: MealLog; first: boolean; onPress: () => void; onDelete: () => void }) {
  const swipe = useRef<SwipeableMethods>(null);
  return (
    <ReanimatedSwipeable
      ref={swipe}
      friction={1.6}
      rightThreshold={72}
      overshootRight={false}
      containerStyle={!first ? styles.rowLine : undefined}
      renderRightActions={() => <DeleteAction onDelete={onDelete} />}
      onSwipeableOpen={onDelete}
    >
      <LogRowBody log={log} onPress={onPress} onDelete={onDelete} />
    </ReanimatedSwipeable>
  );
}

function LogRowBody({ log, onPress, onDelete }: { log: MealLog; onPress: () => void; onDelete: () => void }) {
  const menu = log.menuId ? getMenu(log.menuId) : undefined;
  const tileMenu = menu ?? { name: log.name, category: 'meal' as MenuCategory };
  const sub = [`${MEAL_LABEL[log.mealType]} ${hhmm(log.time)}`, log.storeName, ...(log.optionLabels ?? []), log.qty !== 1 ? qtyLabel(log.qty, logUnit(log)) : undefined].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint="왼쪽으로 밀면 지울 수 있어요"
      accessibilityActions={[{ name: 'delete', label: '지우기' }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && onDelete()}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <MenuTile menu={tileMenu} size={44} />
      <View style={styles.rowBody}>
        <Text variant="body" numberOfLines={1} style={styles.rowName}>
          {log.name}
        </Text>
        <Text variant="small" color="ink3" numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text variant="caption" color="ink2">
          <Text variant="captionMedium" color="ink" style={styles.bold}>
            {formatNumber(log.nutrients.kcal)}
          </Text>{' '}
          kcal
        </Text>
        {log.verdict ? <VerdictBadge verdict={log.verdict} size="sm" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.page, paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.lg, minHeight: size.header },
  headerText: { flex: 1 },
  addBtn: { minHeight: size.touch, minWidth: size.touch, alignItems: 'flex-end', justifyContent: 'center' },
  addText: { fontSize: 14, fontFamily: fonts.semibold },
  week: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, marginHorizontal: -spacing.md },
  weekNav: { width: 20, alignItems: 'center' },
  day: { flex: 1, alignItems: 'center' },
  todayLabel: { fontFamily: fonts.semibold },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  dayOn: { backgroundColor: colors.primary },
  dayNum: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 20 },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  card: { marginTop: spacing.lg },
  logCard: { paddingTop: spacing.lg, paddingBottom: spacing.sm, paddingHorizontal: spacing.xl },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cheerText: { flexShrink: 1 },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, gap: spacing.xl },
  bars: { flex: 1, gap: 14, minWidth: 0 },
  emptyInner: { paddingVertical: spacing.lg },
  rows: { marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.surface },
  swipeAction: { width: 84, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: colors.ink2, borderRadius: radius.md, marginVertical: spacing.xs, marginLeft: spacing.sm },
  weekly: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: spacing.md, backgroundColor: colors.primaryTint, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  weeklyText: { fontFamily: fonts.medium },
  stepper: { marginTop: spacing.sm },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  bold: { fontFamily: fonts.bold },
  sheetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  sheetLabel: { marginTop: spacing.xl },
  sheetFooter: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  sheetBtn: { flex: 1 },
});
