import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, IconButton, Input, MenuTile, Skeleton, Text, TrustBadge, UnknownBadge, VerdictBadge } from '@/components';
import { QtyStepper } from '@/components/QtyStepper';
import { DateChips, MealChips, RecordSheet } from '@/components/RecordSheet';
import { getBrand, getMenu, normalizeName, searchMenus } from '@/data';
import { applyOptions, judgeMenu } from '@/domain/judge';
import { clampLogDate, dateLabel } from '@/domain/logDate';
import { menuQtyUnit, qtyLabel, scaleNutrients } from '@/domain/qty';
import { formatNumber, toDateKey } from '@/domain/summary';
import type { MealLog, MealType, MenuItem, Nutrients } from '@/domain/types';
import { analyzeMeal } from '@/services/ai/mealAnalyze';
import { matchFood } from '@/services/ai/mealMatch';
import { hasLLM } from '@/services/env';
import { findSimilarMenu, getCachedRemoteProduct, searchProductsRemote } from '@/services/products';
import { useJudgeContext } from '@/state/judgeContext';
import { defaultMealType, useDay } from '@/state/day';
import { ensureFavoritesLoaded, logKey, rankFrequent, useFavorites, type FrequentItem } from '@/state/favorites';
import { useProfile } from '@/state/profile';
import { recordItems, type RecordItem } from '@/state/recordItems';
import { colors, radius, size, spacing, type } from '@/theme';

/** "자주 먹어요"는 최근 30일, "최근"은 14일 */
const FREQUENT_DAYS = 30;
const RECENT_DAYS = 14;

const num = (s: string): number | undefined => {
  const v = Number(s);
  return s.trim() !== '' && Number.isFinite(v) ? v : undefined;
};

/** 다시 기록할 수 있는 것: 메뉴(카탈로그·서버 제품) 또는 전에 남긴 기록 */
type Source = { kind: 'menu'; menu: MenuItem } | { kind: 'log'; log: MealLog };

const findMenu = (id: string | undefined): MenuItem | undefined => (id ? getMenu(id) ?? getCachedRemoteProduct(id) : undefined);
const sourceName = (s: Source) => (s.kind === 'menu' ? s.menu.name : s.log.name);
const sourceUnit = (s: Source) => menuQtyUnit(s.kind === 'menu' ? s.menu : findMenu(s.log.menuId));
/** 1개 기준 영양 — 기록은 그때 수량이 곱해져 있으니 되돌린다 */
function baseNutrients(s: Source): Nutrients | null {
  if (s.kind === 'menu') return applyOptions(s.menu);
  const prev = s.log.qty > 0 ? s.log.qty : 1;
  return scaleNutrients(s.log.nutrients, 1 / prev);
}

/** 다시 기록할 원본 → 기록 항목. 전에 남긴 기록은 옵션·매장·영양을 그대로, 판정은 먹은 양 기준으로 다시 (없던 판정은 붙이지 않는다) */
function toRecordItem(s: Source, qty: number): RecordItem | null {
  const base = baseNutrients(s);
  if (!base) return null;
  if (s.kind === 'menu') return { name: s.menu.name, base, qty, trust: s.menu.trust, menu: s.menu };
  const l = s.log;
  return { name: l.name, base, qty, trust: l.trust, menu: findMenu(l.menuId), storeName: l.storeName, optionLabels: l.optionLabels, menuId: l.menuId, brandId: l.brandId, noVerdict: !l.verdict };
}

/**
 * E2 기록 추가 — 검색창 하나 · 자주 먹어요/최근(+ 한 번에 기록) · 검색 결과(판정 배지) · 맨 아래 직접 입력 · 하단 AI 입력줄(사진·글·말 → E4).
 * params.date 가 있으면 그날로 기록한다 (기록 탭에서 고른 지난 날). 시트에서 날짜를 바꿀 수 있다.
 */
export default function AddLog() {
  const params = useLocalSearchParams<{ name?: string; store?: string; tab?: string; date?: string }>();
  const summary = useDay((s) => s.summary);
  const targets = useProfile((s) => s.targets);
  const favorites = useFavorites((s) => s.items);
  const remaining = summary?.remaining ?? targets;

  // 정보 없는 메뉴·매장에서 '직접 입력'으로 왔으면(name 파라미터가 있으면, 빈 값이어도) 바로 입력 폼
  const [manual, setManual] = useState(params.name !== undefined);
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<{ frequent: MealLog[]; recent: MealLog[] } | null>(null);
  /** 이 화면에서 방금 기록한 행 → 기록 id (되돌리기 하면 빠진다) */
  const [added, setAdded] = useState<Record<string, string>>({});

  // 기록 확인 시트 (매장 담기와 같은 RecordSheet: 얼마나 + 끼니)
  const [picked, setPicked] = useState<{ key: string; source: Source } | null>(null);
  const [meal, setMeal] = useState<MealType>(() => defaultMealType());
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);
  /** 기록할 날짜 — 시트·직접 입력이 같이 쓴다 */
  const [date, setDate] = useState(() => clampLogDate(params.date));
  const isToday = date === toDateKey();
  const aiParams = (mode: 'photo' | 'voice' | 'text', extra?: { text: string }) => ({ mode, ...(isToday ? {} : { date }), ...extra });

  useEffect(ensureFavoritesLoaded, []);

  useEffect(() => {
    let alive = true;
    // 30일을 한 번만 읽고, "최근"은 그중 14일
    const now = new Date();
    const recentFrom = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (RECENT_DAYS - 1)));
    useDay
      .getState()
      .recentLogs(FREQUENT_DAYS)
      .then((frequent) => alive && setHistory({ frequent, recent: frequent.filter((l) => l.date >= recentFrom) }))
      .catch(() => alive && setHistory({ frequent: [], recent: [] }));
    return () => {
      alive = false;
    };
  }, []);

  /** 자주 먹어요(즐겨찾기 + 30일 빈도) · 최근(14일, 위와 겹치지 않게) */
  const lists = useMemo(() => {
    if (!history) return null;
    const frequent = rankFrequent(history.frequent, favorites, 8);
    const seen = new Set(frequent.map((f) => f.key));
    const recent: MealLog[] = [];
    for (const l of history.recent) {
      const k = logKey(l);
      if (seen.has(k)) continue;
      seen.add(k);
      recent.push(l);
      if (recent.length >= 10) break;
    }
    return { frequent, recent };
  }, [history, favorites]);

  // 서버 제품 검색 — 로컬 결과를 먼저 보여주고, 서버 결과가 오면 뒤에 합친다
  const [remote, setRemote] = useState<{ q: string; items: MenuItem[] } | null>(null);
  useEffect(() => {
    if (normalizeName(query) === '') {
      setRemote(null);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      const items = await searchProductsRemote(query, 40);
      if (alive) setRemote({ q: query, items: items ?? [] });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);
  const remoteLoading = normalizeName(query) !== '' && remote?.q !== query;

  const jctx = useJudgeContext();
  const results = useMemo(() => {
    const q = normalizeName(query);
    if (!q) return [];
    const local = searchMenus(q, 40);
    const seen = new Set(local.map((m) => m.id));
    const merged = [...local, ...(remote?.items ?? []).filter((m) => !seen.has(m.id))].slice(0, 60);
    return merged.map((m) => ({ menu: m, judgement: remaining ? judgeMenu(m, remaining, jctx) : null }));
  }, [query, remote, remaining, jctx]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/log'));

  /** 행의 + · 행 본문: 기록 확인 시트(얼마나 · 끼니)를 연다. 영양 정보가 없으면 직접 입력으로 */
  const pick = (key: string, source: Source) => {
    if (!baseNutrients(source)) return openManual(sourceName(source));
    setMeal(defaultMealType());
    setQty(1);
    setPicked({ key, source });
  };

  /** 시트에서 기록 → 이 화면에 남아 행에 ✓ (여러 개 연달아 담기). 되돌리기 하면 ✓ 도 빠진다 */
  const savePicked = async () => {
    if (!picked || saving) return;
    const { key, source } = picked;
    const item = toRecordItem(source, qty);
    if (!item) return;
    setSaving(true);
    try {
      const [log] = await recordItems([item], meal, {
        date,
        onUndo: () =>
          setAdded((a) => {
            if (a[key] !== log?.id) return a;
            const { [key]: _drop, ...rest } = a;
            return rest;
          }),
      });
      if (log) setAdded((a) => ({ ...a, [key]: log.id }));
      setPicked(null);
    } finally {
      setSaving(false);
    }
  };

  const openManual = (name?: string) => {
    setManualName(name ?? query);
    setManual(true);
  };

  // ── 직접 입력 ──
  const [manualName, setManualName] = useState(params.name ?? '');
  const [manualMeal, setManualMeal] = useState<MealType>(() => defaultMealType());
  /** 먹은 양 — 칸의 숫자는 1인분 기준, 저장할 때 곱한다 */
  const [manualQty, setManualQty] = useState(1);
  const [kcal, setKcal] = useState('');
  const [carbs, setCarbs] = useState('');
  const [protein, setProtein] = useState('');
  const [fat, setFat] = useState('');
  /** "잘 모르겠어요" 로 채운 근거 한 줄 — 칸을 직접 고치면 해제(내가 입력) */
  const [estimate, setEstimate] = useState<{ status: 'idle' | 'finding' | 'none' } | { status: 'found'; label: string; name: string }>({ status: 'idle' });
  const setField = (set: (v: string) => void) => (v: string) => {
    set(v);
    if (estimate.status === 'found') setEstimate({ status: 'idle' });
  };

  const guess = async () => {
    const name = manualName.trim();
    if (!name) return;
    setEstimate({ status: 'finding' });
    // AI 가 있으면 먼저 "무엇인지" 정리 → 앱 데이터의 같은 메뉴 / AI 1인분 어림. 없거나 못 찾으면 비슷한 메뉴
    let hit = hasLLM() ? await guessByAI(name) : null;
    if (!hit) {
      const m = await findSimilarMenu(name).catch(() => undefined);
      const n = m ? applyOptions(m) : null;
      if (m && n) hit = { base: n, label: `${estimateLabel(m)} 기준으로 채웠어요` };
    }
    if (!hit) {
      setEstimate({ status: 'none' });
      return;
    }
    const f = (v: number | undefined) => (v == null ? '' : String(Math.round(v)));
    setKcal(f(hit.base.kcal));
    setCarbs(f(hit.base.carbs));
    setProtein(f(hit.base.protein));
    setFat(f(hit.base.fat));
    setEstimate({ status: 'found', label: hit.label, name });
  };

  const manualOk = manualName.trim().length > 0 && (num(kcal) ?? -1) >= 0;
  const saveManual = async () => {
    if (!manualOk || saving) return;
    const n: Nutrients = { kcal: num(kcal)! };
    if (num(carbs) !== undefined) n.carbs = num(carbs);
    if (num(protein) !== undefined) n.protein = num(protein);
    if (num(fat) !== undefined) n.fat = num(fat);
    setSaving(true);
    try {
      await recordItems(
        [{ name: manualName.trim(), base: n, qty: manualQty, trust: estimate.status === 'found' ? 'estimated' : 'user', storeName: params.store || undefined }],
        manualMeal,
        { date },
      );
    } finally {
      setSaving(false);
    }
    close();
  };

  const pickedN = picked ? baseNutrients(picked.source) : null;
  const manualKcal = num(kcal);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <View style={styles.handle} />
      <View style={styles.head}>
        {manual ? (
          <Pressable accessibilityRole="button" accessibilityLabel="검색으로 돌아가기" hitSlop={8} onPress={() => setManual(false)} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
        ) : null}
        <View style={styles.headTitle}>
          <Text variant="h2" accessibilityRole="header">
            {manual ? '직접 입력' : '기록 추가'}
          </Text>
          {isToday ? null : (
            <Text variant="caption" color="primaryText">
              {dateLabel(date)} 기록으로 남겨요
            </Text>
          )}
        </View>
        <IconButton name="close" label="닫기" color={colors.ink} onPress={close} />
      </View>

      {manual ? (
        <>
          <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <View style={styles.form}>
              <Input label="메뉴 이름" kind="text" value={manualName} onChangeText={setField(setManualName)} placeholder="예: 닭가슴살 샐러드" autoCapitalize="sentences" />
              <View>
                <Input label="칼로리 (1인분)" value={kcal} onChangeText={setField(setKcal)} unit="kcal" placeholder="0" maxLength={5} />
                <Pressable
                  accessibilityRole="button"
                  disabled={!manualName.trim() || estimate.status === 'finding'}
                  onPress={() => void guess()}
                  hitSlop={6}
                  style={({ pressed }) => [styles.guessBtn, pressed && styles.pressed]}
                >
                  {estimate.status === 'finding' ? <ActivityIndicator size="small" color={colors.primaryText} /> : <Ionicons name="help-circle-outline" size={16} color={manualName.trim() ? colors.primaryText : colors.disabledInk} />}
                  <Text variant="captionMedium" color={manualName.trim() ? 'primaryText' : 'disabledInk'}>
                    잘 모르겠어요
                  </Text>
                </Pressable>
                {estimate.status === 'found' ? (
                  <View style={styles.estimate}>
                    <TrustBadge trust="estimated" size="sm" />
                    <Text variant="small" color="ink2" style={styles.flexText}>
                      {estimate.label}
                    </Text>
                  </View>
                ) : estimate.status === 'none' ? (
                  <Text variant="small" color="notice" style={styles.estimateNone}>
                    비슷한 메뉴를 찾지 못했어요. 이름을 조금 다르게 적거나 대략적인 칼로리를 적어 주세요.
                  </Text>
                ) : null}
              </View>
              <View>
                <Text variant="captionMedium" color="ink2">
                  탄·단·지 <Text variant="caption" color="ink3">(선택)</Text>
                </Text>
                <View style={styles.macros}>
                  <Input label="탄수화물" value={carbs} onChangeText={setField(setCarbs)} unit="g" maxLength={4} style={styles.macro} />
                  <Input label="단백질" value={protein} onChangeText={setField(setProtein)} unit="g" maxLength={4} style={styles.macro} />
                  <Input label="지방" value={fat} onChangeText={setField(setFat)} unit="g" maxLength={4} style={styles.macro} />
                </View>
              </View>
              <View>
                <Text variant="captionMedium" color="ink2">
                  얼마나 드셨어요?
                </Text>
                <View style={styles.qtyRow}>
                  <QtyStepper value={manualQty} onChange={setManualQty} unit="인분" />
                  {manualKcal !== undefined && manualKcal >= 0 ? (
                    <Text variant="caption" color="ink2">
                      <Text variant="bodyMedium">{formatNumber(Math.round(scaleNutrients({ kcal: manualKcal }, manualQty).kcal))}</Text> kcal
                    </Text>
                  ) : null}
                </View>
              </View>
              <DateChips value={date} onChange={setDate} extra={params.date} />
              <MealChips value={manualMeal} onChange={setManualMeal} />
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <Button title="기록하기" disabled={!manualOk} loading={saving} onPress={() => void saveManual()} />
          </View>
        </>
      ) : (
        <>
          <View style={styles.searchWrap}>
            <View style={styles.search}>
              <Ionicons name="search" size={18} color={colors.ink3} />
              <TextInput
                accessibilityLabel="메뉴·브랜드 검색"
                autoFocus={params.tab === 'search'}
                value={query}
                onChangeText={setQuery}
                placeholder="메뉴나 브랜드 이름 (예: 라떼, GS25)"
                placeholderTextColor={colors.ink3}
                returnKeyType="search"
                style={styles.searchInput}
              />
              {query ? (
                <Pressable accessibilityRole="button" accessibilityLabel="검색어 지우기" hitSlop={8} onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={18} color={colors.ink3} />
                </Pressable>
              ) : null}
            </View>
            {query.trim() === '' ? (
              <Text variant="small" color="ink3" style={styles.hint}>
                매장 메뉴부터 편의점·마트 제품까지 찾아드려요
              </Text>
            ) : null}
          </View>

          <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {normalizeName(query) === '' ? (
              !lists ? (
                <Card padding={spacing.md}>
                  {[0, 1, 2].map((i) => (
                    <View key={i} style={styles.skRow}>
                      <Skeleton width={44} height={44} borderRadius={radius.md} />
                      <View style={styles.flex}>
                        <Skeleton width="60%" height={14} />
                        <Skeleton width="35%" height={12} style={styles.skGap} />
                      </View>
                    </View>
                  ))}
                </Card>
              ) : lists.frequent.length === 0 && lists.recent.length === 0 ? (
                <View style={styles.emptyLists}>
                  <Ionicons name="time-outline" size={28} color={colors.ink3} />
                  <Text variant="bodyMedium" color="ink2" align="center" style={styles.emptyTitle}>
                    먹은 메뉴를 검색해서 남겨 보세요
                  </Text>
                  <Text variant="caption" color="ink3" align="center">
                    자주 먹는 메뉴는 여기에 모여서 한 번에 기록할 수 있어요.
                  </Text>
                </View>
              ) : (
                <>
                  {lists.frequent.length > 0 ? (
                    <Section title="자주 먹어요">
                      {lists.frequent.map((f) => {
                        const source = frequentSource(f);
                        if (!source) return null;
                        return <Row key={f.key} rowKey={f.key} source={source} favorite={!!f.favorite} added={!!added[f.key]} onPick={pick} onAdd={pick} />;
                      })}
                    </Section>
                  ) : null}
                  {lists.recent.length > 0 ? (
                    <Section title="최근">
                      {lists.recent.map((l) => {
                        const k = logKey(l);
                        return <Row key={k} rowKey={k} source={{ kind: 'log', log: l }} added={!!added[k]} onPick={pick} onAdd={pick} />;
                      })}
                    </Section>
                  ) : null}
                </>
              )
            ) : results.length === 0 ? (
              remoteLoading ? (
                <View style={styles.loading}>
                  <ActivityIndicator color={colors.ink3} />
                  <Text variant="caption" color="ink3">
                    찾고 있어요
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyLists}>
                  <Text variant="bodyMedium" color="ink2" align="center">
                    ‘{query.trim()}’에 맞는 메뉴가 없어요
                  </Text>
                  <Text variant="caption" color="ink3" align="center">
                    이름을 조금 다르게 적어 보거나 밀리에게 부탁해 보세요.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/log/ai', params: aiParams('text', { text: query.trim() }) })}
                    style={({ pressed }) => [styles.askMilly, pressed && styles.pressed]}
                  >
                    <Ionicons name="sparkles-outline" size={16} color={colors.primaryText} />
                    <Text variant="captionMedium" color="primaryText">
                      ‘{query.trim()}’ 밀리한테 정리 부탁하기
                    </Text>
                  </Pressable>
                </View>
              )
            ) : (
              <Card padding={spacing.xs}>
                {results.map(({ menu, judgement }) => (
                  <Row
                    key={menu.id}
                    rowKey={`m:${menu.id}`}
                    source={{ kind: 'menu', menu }}
                    badge={judgement && !judgement.unknown ? <VerdictBadge verdict={judgement.verdict} size="sm" /> : !applyOptions(menu) ? <UnknownBadge /> : null}
                    added={!!added[`m:${menu.id}`]}
                    onPick={pick}
                    onAdd={pick}
                  />
                ))}
                {remoteLoading ? <ActivityIndicator color={colors.ink3} style={styles.moreLoading} /> : null}
              </Card>
            )}

            <Pressable accessibilityRole="button" onPress={() => openManual()} style={({ pressed }) => [styles.manualLink, pressed && styles.pressed]}>
              <Ionicons name="create-outline" size={18} color={colors.ink2} />
              <Text variant="bodyMedium" color="ink2" style={styles.flexText}>
                찾는 게 없으면 직접 입력
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.ink3} />
            </Pressable>
          </ScrollView>

          {/* E4 AI로 기록 — 사진·말·글로 한 번에 */}
          <View style={styles.aiBar}>
            <Pressable accessibilityRole="button" accessibilityLabel="사진으로 기록" hitSlop={4} onPress={() => router.push({ pathname: '/log/ai', params: aiParams('photo') })} style={({ pressed }) => [styles.aiIcon, pressed && styles.pressed]}>
              <Ionicons name="camera-outline" size={22} color={colors.ink} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="글로 여러 개 한 번에 기록" onPress={() => router.push({ pathname: '/log/ai', params: aiParams('text') })} style={({ pressed }) => [styles.aiField, pressed && styles.pressed]}>
              <Text variant="body" color="ink3" numberOfLines={1}>
                김치찌개랑 밥 반 공기처럼 한 번에
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="말로 기록" hitSlop={4} onPress={() => router.push({ pathname: '/log/ai', params: aiParams('voice') })} style={({ pressed }) => [styles.aiMic, pressed && styles.pressed]}>
              <Ionicons name="mic" size={20} color={colors.inkOnPrimary} />
            </Pressable>
          </View>
        </>
      )}

      <RecordSheet
        visible={!!picked}
        onClose={() => setPicked(null)}
        items={
          picked && pickedN
            ? [{ key: picked.key, name: sourceName(picked.source), sub: sourceSub(picked.source), base: pickedN, unit: sourceUnit(picked.source), qty }]
            : []
        }
        onQty={(_key, q) => setQty(q)}
        meal={meal}
        onMeal={setMeal}
        date={date}
        onDate={setDate}
        dateExtra={params.date}
        remainingKcal={summary ? summary.remaining.kcal - (summary.over.kcal ?? 0) : remaining?.kcal ?? null}
        saving={saving}
        onSave={() => void savePicked()}
      />
    </SafeAreaView>
  );
}

/** 시트의 한 줄: 매장·브랜드 · 옵션 */
function sourceSub(s: Source): string | undefined {
  const store = s.kind === 'menu' ? s.menu.maker ?? getBrand(s.menu.brandId)?.name : s.log.storeName;
  const options = s.kind === 'log' ? s.log.optionLabels ?? [] : [];
  return [store, ...options].filter(Boolean).join(' · ') || undefined;
}

/**
 * "잘 모르겠어요" + AI: 이름을 밀리가 정리 → 앱 데이터의 같은 메뉴(또는 비슷한 메뉴) / AI 1인분 어림.
 * AI 없음·실패·못 찾음이면 null (호출 쪽이 비슷한 메뉴로 채운다)
 */
async function guessByAI(name: string): Promise<{ base: Nutrients; label: string } | null> {
  try {
    const r = await analyzeMeal({ kind: 'text', text: name });
    const food = r.ok ? r.meal.items[0] : undefined;
    if (!food) return null;
    const hit = await matchFood(food);
    if (!hit.base) return null;
    if ((hit.kind === 'exact' || hit.kind === 'similar') && hit.menu) return { base: hit.base, label: `${estimateLabel(hit.menu)} 기준으로 채웠어요` };
    if (hit.kind === 'ai') return { base: hit.base, label: hit.unit === '인분' ? '밀리가 1인분으로 어림했어요' : `밀리가 ${qtyLabel(1, hit.unit)} 기준으로 어림했어요` };
    return null;
  } catch {
    return null;
  }
}

/** "‘아메리카노’(스타벅스)" */
function estimateLabel(m: MenuItem): string {
  const by = m.maker ?? getBrand(m.brandId)?.name;
  return `‘${m.name}’${by ? `(${by})` : ''}`;
}

/** 자주 먹어요 항목 → 다시 기록할 원본: 최근 기록이 있으면 그대로(옵션·영양 포함), 없으면 메뉴 */
function frequentSource(f: FrequentItem): Source | null {
  if (f.lastLog) return { kind: 'log', log: f.lastLog };
  const menu = findMenu(f.menuId) ?? f.favorite?.menu;
  return menu ? { kind: 'menu', menu } : null;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="captionMedium" color="ink3" style={styles.sectionTitle}>
        {title}
      </Text>
      <Card padding={spacing.xs}>{children}</Card>
    </View>
  );
}

function Row({
  rowKey,
  source,
  badge,
  favorite,
  added,
  onPick,
  onAdd,
}: {
  rowKey: string;
  source: Source;
  badge?: ReactNode;
  favorite?: boolean;
  added: boolean;
  onPick: (key: string, s: Source) => void;
  onAdd: (key: string, s: Source) => void;
}) {
  const menu = source.kind === 'menu' ? source.menu : findMenu(source.log.menuId);
  const n = baseNutrients(source);
  const name = sourceName(source);
  const store = source.kind === 'menu' ? source.menu.maker ?? getBrand(source.menu.brandId)?.name : source.log.storeName;
  const options = source.kind === 'log' ? source.log.optionLabels ?? [] : [];
  const sub = [store, ...options, n ? `${formatNumber(n.kcal)} kcal` : '정보 없음'].filter(Boolean).join(' · ');
  const verdict = badge !== undefined ? badge : source.kind === 'log' && source.log.verdict ? <VerdictBadge verdict={source.log.verdict} size="sm" /> : null;
  const addPress = useRef(false);

  return (
    <View style={[styles.row, !n && styles.dim]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${name}, 양·끼니 정해서 기록`} onPress={() => onPick(rowKey, source)} style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
        <MenuTile menu={menu ?? { name, category: 'meal' }} size={44} />
        <View style={styles.rowBody}>
          <View style={styles.rowTitle}>
            <Text variant="bodyMedium" numberOfLines={1} style={styles.flexText}>
              {name}
            </Text>
            {favorite ? <Ionicons name="heart" size={12} color={colors.primary} accessibilityLabel="자주 먹는 메뉴" /> : null}
          </View>
          <Text variant="caption" color="ink2" numberOfLines={1}>
            {sub}
          </Text>
        </View>
        {verdict}
      </Pressable>
      {n ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={added ? `${name} 기록했어요` : `${name} 양·끼니 정해서 기록`}
          accessibilityState={{ disabled: added }}
          disabled={added}
          hitSlop={4}
          onPress={() => {
            if (addPress.current) return;
            addPress.current = true;
            onAdd(rowKey, source);
            setTimeout(() => (addPress.current = false), 400);
          }}
          style={({ pressed }) => [styles.addBtn, added && styles.addBtnDone, pressed && styles.pressed]}
        >
          <Ionicons name={added ? 'checkmark' : 'add'} size={22} color={added ? colors.primaryText : colors.inkOnPrimary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  flexText: { flexShrink: 1 },
  pressed: { opacity: 0.7 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: radius.pill, backgroundColor: colors.border, marginTop: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.page, paddingRight: spacing.sm, minHeight: size.header },
  headTitle: { flex: 1 },
  backBtn: { marginLeft: -spacing.sm, width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { paddingHorizontal: spacing.page },
  search: { flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: radius.button, backgroundColor: colors.section, paddingHorizontal: spacing.lg, gap: spacing.sm },
  searchInput: { flex: 1, height: '100%', ...type.body, color: colors.ink, outlineStyle: 'none' } as never,
  hint: { marginTop: spacing.sm, marginLeft: spacing.xs },
  scroll: { padding: spacing.page, paddingBottom: spacing.xxxl },
  section: { marginBottom: spacing.xl },
  sectionTitle: { marginBottom: spacing.sm, marginLeft: spacing.xs },
  skRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  skGap: { marginTop: 6 },
  emptyLists: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.lg, gap: spacing.xs },
  emptyTitle: { marginTop: spacing.sm },
  loading: { alignItems: 'center', paddingVertical: spacing.xxxl, gap: spacing.sm },
  moreLoading: { paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.sm },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', padding: spacing.sm + 2, borderRadius: radius.md, gap: spacing.md, minWidth: 0 },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.xs },
  addBtnDone: { backgroundColor: colors.primaryTint },
  dim: { opacity: 0.6 },
  manualLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, marginTop: spacing.lg, paddingHorizontal: spacing.lg, borderRadius: radius.button, borderWidth: 1, borderColor: colors.line },
  form: { gap: spacing.lg },
  askMilly: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, minHeight: 40, paddingHorizontal: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.primaryTint },
  aiBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.page, paddingTop: spacing.sm, paddingBottom: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.bg },
  aiIcon: { width: size.touch, height: size.touch, borderRadius: size.touch / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.section },
  aiField: { flex: 1, height: size.touch, borderRadius: radius.pill, backgroundColor: colors.section, justifyContent: 'center', paddingHorizontal: spacing.lg },
  aiMic: { width: size.touch, height: size.touch, borderRadius: size.touch / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  guessBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 36, marginTop: spacing.xs },
  estimate: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  estimateNone: { marginTop: spacing.xs },
  macros: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  macro: { flex: 1 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  footer: { paddingHorizontal: spacing.page, paddingTop: spacing.sm, paddingBottom: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line },
});
