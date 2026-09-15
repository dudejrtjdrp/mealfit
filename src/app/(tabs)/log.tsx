import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheet, Button, Card, Chip, EmptyState, KcalRing, MenuTile, NutrientBar, Skeleton, Text, VerdictBadge, showToast, type NutrientKey } from '@/components';
import { getMenu } from '@/data';
import { formatNumber, summarizeDay, toDateKey } from '@/domain/summary';
import { MEAL_LABEL, type DaySummary, type MealLog, type MealType, type MenuCategory } from '@/domain/types';
import { getRepos } from '@/services/repo';
import { useDay } from '@/state/day';
import { useProfile } from '@/state/profile';
import { colors, fonts, radius, spacing } from '@/theme';

const WEEK = ['월', '화', '수', '목', '금', '토', '일'];
const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const QTYS = [0.5, 1, 1.5, 2];

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
      return '목표까지 잘 하고 있어요!';
    case 'almost':
      return '오늘 거의 다 채웠어요';
    case 'over':
      return '내일 다시 채워져요';
  }
}

/** E1 기록 목록 — 시안 docs/design/E1-log.png */
export default function LogScreen() {
  const today = toDateKey();
  const targets = useProfile((s) => s.targets);
  const todaySummary = useDay((s) => s.summary);
  const todayStatus = useDay((s) => s.status);
  const { updateLog, removeLog, datesWithLogs } = useDay();

  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [selected, setSelected] = useState(today);
  const [other, setOther] = useState<{ date: string; logs: MealLog[] } | null>(null);
  const [dots, setDots] = useState<string[]>([]);
  const [editing, setEditing] = useState<MealLog | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const from = toDateKey(days[0]);
  const to = toDateKey(days[6]);

  const refreshDots = useCallback(() => {
    void datesWithLogs(from, to).then(setDots);
  }, [datesWithLogs, from, to]);

  useEffect(refreshDots, [refreshDots, todaySummary]);
  useFocusEffect(refreshDots);

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
    const scaled = Object.fromEntries(Object.entries(editing.nutrients).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * factor * 10) / 10 : v])) as MealLog['nutrients'];
    const next: MealLog = { ...editing, ...patch, qty, nutrients: scaled };
    setEditing(next);
    await persist(next);
  };

  const persist = async (log: MealLog) => {
    if (log.date === today) await updateLog(log);
    else {
      await getRepos().logs.update(log).catch(() => {});
      setOther((o) => (o ? { ...o, logs: o.logs.map((l) => (l.id === log.id ? log : l)) } : o));
    }
  };

  const remove = async () => {
    if (!editing) return;
    const id = editing.id;
    const date = editing.date;
    setEditing(null);
    if (date === today) await removeLog(id);
    else {
      await getRepos().logs.remove(id).catch(() => {});
      setOther((o) => (o ? { ...o, logs: o.logs.filter((l) => l.id !== id) } : o));
    }
    refreshDots();
    showToast('기록을 지웠어요', 'info');
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="h1" style={styles.title}>
              기록
            </Text>
            <Text variant="body" color="ink2" style={styles.sub}>
              오늘도 건강한 습관을 이어가요.
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push('/log/add')} style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}>
            <Ionicons name="add" size={22} color={colors.primaryText} />
            <Text variant="bodyMedium" color="primaryText">
              기록 추가
            </Text>
          </Pressable>
        </View>

        <View style={styles.week} {...pan.panHandlers}>
          <Pressable accessibilityRole="button" accessibilityLabel="이전 주" hitSlop={8} onPress={() => moveWeek(-1)} style={styles.weekNav}>
            <Ionicons name="chevron-back" size={16} color={colors.ink3} />
          </Pressable>
          {days.map((d, i) => {
            const key = toDateKey(d);
            const on = key === selected;
            const isT = key === today;
            const future = key > today;
            return (
              <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: on }} disabled={future} onPress={() => setSelected(key)} style={styles.day}>
                <Text variant="caption" color={isT ? 'primaryText' : 'ink2'}>
                  {WEEK[i]}
                </Text>
                <View style={[styles.dayCircle, on && styles.dayOn]}>
                  <Text style={[styles.dayNum, { color: on ? colors.primaryText : future ? colors.ink3 : colors.ink2 }]}>{d.getDate()}</Text>
                </View>
                <View style={[styles.dot, { opacity: dots.includes(key) ? 1 : 0 }]} />
              </Pressable>
            );
          })}
          <Pressable accessibilityRole="button" accessibilityLabel="다음 주" hitSlop={8} onPress={() => moveWeek(1)} style={styles.weekNav}>
            <Ionicons name="chevron-forward" size={16} color={colors.ink3} />
          </Pressable>
        </View>

        <Card padding={18} style={styles.card}>
          <View style={styles.cardHead}>
            <Pressable accessibilityRole="button" onPress={() => router.navigate('/(tabs)/today')} style={styles.cardTitle}>
              <Text style={styles.cardTitleText}>{title}의 섭취 현황</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.ink} />
            </Pressable>
            {summary ? (
              <View style={styles.cheer}>
                <Text variant="caption" color="ink2" numberOfLines={1} style={styles.cheerText}>
                  {progressCopy(summary)}
                </Text>
                <MaterialCommunityIcons name="sprout" size={20} color={summary.status === 'over' ? colors.ok : colors.primary} />
              </View>
            ) : null}
          </View>
          {loading ? (
            <View style={styles.gaugeRow}>
              <Skeleton width={128} height={128} borderRadius={64} />
              <View style={styles.bars}>
                <Skeleton height={14} />
                <Skeleton height={14} />
                <Skeleton height={14} />
              </View>
            </View>
          ) : summary && targets ? (
            <View style={styles.gaugeRow}>
              <KcalRing
                value={summary.consumed.kcal}
                progress={targets.kcal > 0 ? summary.consumed.kcal / targets.kcal : 0}
                target={targets.kcal}
                size={128}
                stroke={12}
                numberSize={summary.consumed.kcal >= 1000 ? 30 : 36}
                color={summary.status === 'over' ? colors.ok : undefined}
              />
              <View style={styles.bars}>
                {bars.map((k) => (
                  <NutrientBar key={k} nutrient={k} value={Math.round(summary.consumed[k] ?? 0)} max={targets[k]} compact style={styles.bar} />
                ))}
              </View>
            </View>
          ) : (
            <EmptyState emoji="🧮" title="목표량을 아직 계산하지 못했어요" description="마이 탭에서 신체 정보를 확인해 주세요." style={styles.emptyInner} />
          )}
        </Card>

        <Card padding={18} style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitleText}>{title}의 식사 기록</Text>
            {summary && summary.logs.length > 0 ? (
              <Text variant="body" color="ink2">
                총 {summary.logs.length} 끼 · {formatNumber(summary.consumed.kcal)} kcal
              </Text>
            ) : null}
          </View>
          {summary && summary.logs.length > 0 ? (
            <View style={styles.rows}>
              {summary.logs.map((l) => (
                <LogRow key={l.id} log={l} onPress={() => setEditing(l)} />
              ))}
            </View>
          ) : loading ? (
            <View style={styles.rows}>
              <Skeleton height={72} borderRadius={radius.md} />
            </View>
          ) : (
            <EmptyState
              emoji="🍽️"
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
            <Button title="삭제" variant="ghost" onPress={remove} style={styles.sheetBtn} />
            <Button title="완료" height={48} onPress={() => setEditing(null)} style={styles.sheetBtn} />
          </View>
        }
      >
        <Text variant="h3">끼니</Text>
        <View style={styles.sheetChips}>
          {MEALS.map((m) => (
            <Chip key={m} label={MEAL_LABEL[m]} variant="option" selected={editing?.mealType === m} onPress={() => void applyEdit({ mealType: m })} />
          ))}
        </View>
        <Text variant="h3" style={styles.sheetLabel}>
          수량
        </Text>
        <View style={styles.sheetChips}>
          {QTYS.map((q) => (
            <Chip key={q} label={`${q}인분`} variant="option" selected={editing?.qty === q} onPress={() => void applyEdit({ qty: q })} />
          ))}
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

function LogRow({ log, onPress }: { log: MealLog; onPress: () => void }) {
  const menu = log.menuId ? getMenu(log.menuId) : undefined;
  const tileMenu = menu ?? { name: log.name, category: 'meal' as MenuCategory };
  const sub = [log.storeName, ...(log.optionLabels ?? []), log.qty !== 1 ? `${log.qty}인분` : undefined].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
      <View style={styles.rowMeal}>
        <Text variant="bodyMedium">{MEAL_LABEL[log.mealType]}</Text>
        <Text variant="caption" color="ink2">
          {hhmm(log.time)}
        </Text>
      </View>
      <MenuTile menu={tileMenu} size={52} />
      <View style={styles.rowBody}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {log.name}
        </Text>
        {sub ? (
          <Text variant="caption" color="ink2" numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <View style={styles.rowRight}>
        <Text variant="bodyMedium">{formatNumber(log.nutrients.kcal)} kcal</Text>
        {log.verdict ? <VerdictBadge verdict={log.verdict} size="sm" style={styles.rowBadge} /> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.ink2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.page, paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.xl },
  headerText: { flex: 1 },
  title: { fontSize: 30, lineHeight: 38 },
  sub: { marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 38, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.primarySoft },
  week: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl, marginHorizontal: -spacing.md },
  weekNav: { width: 18, alignItems: 'center' },
  day: { flex: 1, alignItems: 'center' },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  dayOn: { backgroundColor: colors.primarySoft },
  dayNum: { fontFamily: fonts.medium, fontSize: 18, lineHeight: 22 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.dot, marginTop: 3 },
  card: { marginTop: spacing.lg },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  cardTitleText: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24, color: colors.ink },
  cheer: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
  cheerText: { flexShrink: 1 },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, gap: spacing.md },
  bars: { flex: 1, gap: spacing.lg },
  bar: {},
  emptyInner: { paddingVertical: spacing.lg },
  rows: { marginTop: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineSoft, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  rowMeal: { width: 42, marginRight: spacing.xs },
  rowBody: { flex: 1, marginLeft: spacing.sm, marginRight: spacing.xs },
  rowRight: { alignItems: 'flex-end', marginRight: spacing.xs },
  rowBadge: { marginTop: 4 },
  sheetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  sheetLabel: { marginTop: spacing.xl },
  sheetFooter: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  sheetBtn: { flex: 1 },
});
