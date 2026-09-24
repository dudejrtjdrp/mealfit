import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Chip, EmptyState, IconButton, Input, MenuTile, Text, TrustBadge, UnknownBadge, VerdictBadge, showToast } from '@/components';
import { getBrand, getMenu, getMenus, getProductCount, normalizeName, searchMenus } from '@/data';
import { applyOptions, judgeMenu } from '@/domain/judge';
import { QTY_OPTIONS, menuQtyUnit, qtyLabel, scaleNutrients } from '@/domain/qty';
import { formatNumber, toDateKey } from '@/domain/summary';
import { MEAL_LABEL, type MealLog, type MealType, type MenuItem, type Nutrients } from '@/domain/types';
import { hasSupabase } from '@/services/env';
import { newId } from '@/services/id';
import { searchProductsRemote } from '@/services/products';
import { getRepos } from '@/services/repo';
import { judgeProfile } from '@/state/bootstrap';
import { defaultMealType, useDay } from '@/state/day';
import { useProfile } from '@/state/profile';
import { colors, fonts, radius, size, spacing, type } from '@/theme';

type Tab = 'recent' | 'search' | 'manual';
const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const TABS: { id: Tab; label: string }[] = [
  { id: 'recent', label: '최근' },
  { id: 'search', label: '검색' },
  { id: 'manual', label: '직접 입력' },
];

const num = (s: string): number | undefined => {
  const v = Number(s);
  return s.trim() !== '' && Number.isFinite(v) ? v : undefined;
};

/** E2 기록 추가 — 최근 / 검색 / 직접 입력 */
export default function AddLog() {
  const params = useLocalSearchParams<{ name?: string; store?: string; tab?: string }>();
  const profile = useProfile((s) => s.profile);
  const summary = useDay((s) => s.summary);
  const targets = useProfile((s) => s.targets);
  const addLog = useDay((s) => s.addLog);

  const [meal, setMeal] = useState<MealType>(() => defaultMealType());
  const [tab, setTab] = useState<Tab>(() => (params.tab === 'search' ? 'search' : params.name ? 'manual' : 'recent'));
  const [recent, setRecent] = useState<MealLog[] | null>(null);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<{ kind: 'menu'; menu: MenuItem } | { kind: 'recent'; log: MealLog } | null>(null);
  const [qty, setQty] = useState(1);
  // 고른 항목이 바뀌면 수량을 다시: 메뉴는 1, 최근 기록은 그때 먹은 양
  useEffect(() => {
    setQty(picked?.kind === 'recent' && picked.log.qty > 0 ? picked.log.qty : 1);
  }, [picked]);
  const pickedUnit = picked?.kind === 'menu' ? menuQtyUnit(picked.menu) : picked?.kind === 'recent' && picked.log.menuId ? menuQtyUnit(getMenu(picked.log.menuId)) : '인분';

  const [name, setName] = useState(params.name ?? '');
  const [kcal, setKcal] = useState('');
  const [carbs, setCarbs] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  const [saving, setSaving] = useState(false);

  // 최근 30일 기록에서 이름 중복 제거
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const repo = getRepos().logs;
        const end = new Date();
        const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 30);
        const dates = (await repo.datesWithLogs(toDateKey(start), toDateKey(end))).sort().reverse().slice(0, 14);
        const seen = new Set<string>();
        const out: MealLog[] = [];
        for (const d of dates) {
          const logs = (await repo.listByDate(d)).sort((a, b) => b.time.localeCompare(a.time));
          for (const l of logs) {
            const k = normalizeName(l.name);
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(l);
          }
          if (out.length >= 20) break;
        }
        if (alive) setRecent(out);
      } catch {
        if (alive) setRecent([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const remaining = summary?.remaining ?? targets;

  // 서버 제품 검색(식약처 전체 26만 개) — 로컬 결과를 먼저 보여주고, 서버 결과가 오면 뒤에 합친다
  const [remote, setRemote] = useState<MenuItem[]>([]);
  useEffect(() => {
    if (normalizeName(query) === '') {
      setRemote([]);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      const items = await searchProductsRemote(query, 40);
      if (alive) setRemote(items ?? []);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  const results = useMemo(() => {
    const q = normalizeName(query);
    if (!q) return [];
    const local = searchMenus(q, 40);
    const seen = new Set(local.map((m) => m.id));
    const merged = [...local, ...remote.filter((m) => !seen.has(m.id))].slice(0, 60);
    return merged.map((m) => ({ menu: m, judgement: remaining ? judgeMenu(m, remaining, { profile: judgeProfile(profile) }) : null }));
  }, [query, remote, remaining, profile]);

  const manualOk = name.trim().length > 0 && num(kcal) !== undefined && (num(kcal) ?? -1) >= 0;
  const canSave = tab === 'manual' ? manualOk : !!picked;

  const save = async () => {
    const now = new Date();
    const base = { id: newId(), date: toDateKey(now), mealType: meal, time: now.toISOString(), createdAt: now.toISOString(), qty: 1 };
    let log: MealLog | null = null;
    if (tab === 'manual') {
      if (!manualOk) return;
      const n: Nutrients = { kcal: num(kcal)! };
      if (num(carbs) !== undefined) n.carbs = num(carbs);
      if (num(protein) !== undefined) n.protein = num(protein);
      if (num(fat) !== undefined) n.fat = num(fat);
      log = { ...base, name: name.trim(), storeName: params.store || undefined, nutrients: n, trust: 'user' };
    } else if (picked?.kind === 'menu') {
      const n = applyOptions(picked.menu);
      if (!n) {
        setTab('manual');
        setName(picked.menu.name);
        showToast('정보가 없는 메뉴라 직접 입력으로 옮겼어요', 'info');
        return;
      }
      const j = remaining ? judgeMenu(picked.menu, remaining, { profile: judgeProfile(profile) }) : null;
      log = { ...base, qty, name: picked.menu.name, brandId: picked.menu.brandId, storeName: picked.menu.maker ?? getBrand(picked.menu.brandId)?.name, menuId: picked.menu.id, nutrients: scaleNutrients(n, qty), trust: picked.menu.trust, verdict: j && !j.unknown ? j.verdict : undefined };
    } else if (picked?.kind === 'recent') {
      const { id: _id, date: _d, mealType: _m, time: _t, createdAt: _c, ...rest } = picked.log;
      // 최근 기록의 영양은 그때 수량이 곱해진 값 → 1개 기준으로 되돌려 새 수량을 곱한다
      const prevQty = picked.log.qty > 0 ? picked.log.qty : 1;
      log = { ...rest, ...base, qty, nutrients: scaleNutrients(rest.nutrients, qty / prevQty) };
    }
    if (!log) return;
    setSaving(true);
    const ok = await addLog(log);
    setSaving(false);
    showToast(ok ? '기록했어요' : '기록했어요 · 저장은 다음에 다시 시도할게요', ok ? 'success' : 'info');
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/log');
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <View style={styles.handle} />
      <View style={styles.head}>
        <Text variant="h2" accessibilityRole="header">
          기록 추가
        </Text>
        <IconButton name="close" label="닫기" color={colors.ink} onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/log'))} />
      </View>

      <View style={styles.meals}>
        {MEALS.map((m) => (
          <Chip key={m} label={MEAL_LABEL[m]} variant="option" selected={meal === m} onPress={() => setMeal(m)} style={styles.mealChip} />
        ))}
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <Pressable key={t.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { setTab(t.id); setPicked(null); }} style={[styles.tab, on && styles.tabOn]}>
              <Text variant="captionMedium" color={on ? 'ink' : 'ink3'} style={on ? styles.tabTextOn : undefined}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {tab === 'recent' ? (
          recent && recent.length === 0 ? (
            <EmptyState pose="sleep" title="최근 기록이 아직 없어요" description="검색이나 직접 입력으로 남겨 보세요." actionLabel="메뉴 검색" onAction={() => setTab('search')} />
          ) : (
            <Card padding={spacing.xs}>
              {(recent ?? []).map((l) => {
                const on = picked?.kind === 'recent' && picked.log.id === l.id;
                return (
                  <Pressable key={l.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setPicked({ kind: 'recent', log: l })} style={[styles.row, on && styles.rowOn]}>
                    <MenuTile menu={(l.menuId && getMenu(l.menuId)) || { name: l.name, category: 'meal' }} size={44} />
                    <View style={styles.rowBody}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {l.name}
                      </Text>
                      <Text variant="caption" color="ink2" numberOfLines={1}>
                        {[l.storeName, `${formatNumber(l.nutrients.kcal)} kcal`].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {l.verdict ? <VerdictBadge verdict={l.verdict} size="sm" /> : null}
                    {on ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} style={styles.check} /> : null}
                  </Pressable>
                );
              })}
            </Card>
          )
        ) : null}

        {tab === 'search' ? (
          <>
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={colors.ink3} />
              <TextInput
                accessibilityLabel="메뉴·브랜드 검색"
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="메뉴나 브랜드 이름 (예: 라떼, GS25)"
                placeholderTextColor={colors.ink3}
                style={styles.searchInput}
              />
            </View>
            {query.trim() === '' ? (
              <Text variant="caption" color="ink3" style={styles.hint}>
                {hasSupabase()
                  ? '매장 메뉴와 시판 제품 전체(식약처 26만 개)에서 찾아드려요.'
                  : `매장 메뉴와 라면·과자 같은 시판 제품 ${formatNumber(getMenus().length + getProductCount())}개에서 찾아드려요.`}
              </Text>
            ) : results.length === 0 ? (
              <EmptyState pose="sorry" title="찾는 메뉴가 없어요" description="직접 입력으로 남길 수 있어요." actionLabel="직접 입력하기" onAction={() => { setName(query); setTab('manual'); }} />
            ) : (
              <Card padding={spacing.xs} style={styles.results}>
                {results.map(({ menu, judgement }) => {
                  const on = picked?.kind === 'menu' && picked.menu.id === menu.id;
                  const n = applyOptions(menu);
                  return (
                    <Pressable key={menu.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setPicked({ kind: 'menu', menu })} style={[styles.row, on && styles.rowOn, !n && styles.dim]}>
                      <MenuTile menu={menu} size={44} />
                      <View style={styles.rowBody}>
                        <Text variant="bodyMedium" numberOfLines={1}>
                          {menu.name}
                        </Text>
                        <Text variant="caption" color="ink2" numberOfLines={1}>
                          {menu.maker ?? getBrand(menu.brandId)?.name} · {n ? `${formatNumber(n.kcal)} kcal` : '정보 없음'}
                        </Text>
                      </View>
                      {judgement && !judgement.unknown ? <VerdictBadge verdict={judgement.verdict} size="sm" /> : !n ? <UnknownBadge /> : null}
                      {on ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} style={styles.check} /> : null}
                    </Pressable>
                  );
                })}
              </Card>
            )}
          </>
        ) : null}

        {tab === 'manual' ? (
          <View style={styles.form}>
            <Input label="메뉴 이름" kind="text" value={name} onChangeText={setName} placeholder="예: 닭가슴살 샐러드" autoCapitalize="sentences" />
            <Input label="칼로리" value={kcal} onChangeText={setKcal} unit="kcal" placeholder="0" maxLength={5} />
            <View>
              <Text variant="captionMedium" color="ink2">
                탄·단·지 <Text variant="caption" color="ink3">(선택)</Text>
              </Text>
              <View style={styles.macros}>
                <Input label="탄수화물" value={carbs} onChangeText={setCarbs} unit="g" maxLength={4} style={styles.macro} />
                <Input label="단백질" value={protein} onChangeText={setProtein} unit="g" maxLength={4} style={styles.macro} />
                <Input label="지방" value={fat} onChangeText={setFat} unit="g" maxLength={4} style={styles.macro} />
              </View>
            </View>
            <View style={styles.userHint}>
              <TrustBadge trust="user" size="sm" />
              <Text variant="small" color="ink3" style={styles.userHintText}>
                직접 입력한 기록은 이렇게 표시돼요.
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {tab !== 'manual' && picked ? (
          <View style={styles.qtys} accessibilityLabel="먹은 양">
            {QTY_OPTIONS.map((q) => (
              <Chip key={q} label={qtyLabel(q, pickedUnit)} variant="option" size="sm" selected={qty === q} onPress={() => setQty(q)} />
            ))}
          </View>
        ) : null}
        <Button title="저장" disabled={!canSave} loading={saving} onPress={save} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: radius.pill, backgroundColor: colors.border, marginTop: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: spacing.page, paddingRight: spacing.sm, minHeight: size.header },
  meals: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.page, marginTop: spacing.xs },
  mealChip: { flex: 1 },
  tabs: { flexDirection: 'row', marginHorizontal: spacing.page, marginTop: spacing.lg, backgroundColor: colors.line, borderRadius: radius.button, padding: 3 },
  tab: { flex: 1, height: 38, borderRadius: radius.xs + 2, alignItems: 'center', justifyContent: 'center' },
  tabOn: { backgroundColor: colors.surface },
  tabTextOn: { fontFamily: fonts.bold },
  scroll: { padding: spacing.page, paddingBottom: spacing.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm + 2, borderRadius: radius.md, gap: spacing.md },
  rowOn: { backgroundColor: colors.primaryTint },
  rowBody: { flex: 1, minWidth: 0 },
  check: { marginLeft: spacing.xs },
  dim: { opacity: 0.6 },
  search: { flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: radius.button, backgroundColor: colors.section, paddingHorizontal: spacing.lg, gap: spacing.sm },
  searchInput: { flex: 1, height: '100%', ...type.body, color: colors.ink, outlineStyle: 'none' } as never,
  hint: { marginTop: spacing.md, textAlign: 'center' },
  results: { marginTop: spacing.md },
  form: { gap: spacing.lg },
  macros: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  macro: { flex: 1 },
  userHint: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  userHintText: { flex: 1 },
  qtys: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  footer: { paddingHorizontal: spacing.page, paddingTop: spacing.sm, paddingBottom: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line },
});
