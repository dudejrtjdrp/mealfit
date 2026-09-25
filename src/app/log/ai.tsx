import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheet, Button, Card, Chip, IconButton, MenuTile, MillyAvatar, Skeleton, Text, TrustBadge, showToast, type MillyPose } from '@/components';
import { QtyStepper } from '@/components/QtyStepper';
import { getBrand, normalizeName, searchMenus } from '@/data';
import { AI_MEAL_DAILY_LIMIT } from '@/domain/aiMeal';
import { applyOptions, judgeMenu } from '@/domain/judge';
import { scaleNutrients } from '@/domain/qty';
import { formatNumber, overToastSuffix, toDateKey } from '@/domain/summary';
import { MEAL_LABEL, type MealLog, type MealType, type MenuItem } from '@/domain/types';
import { aiMealQuotaLeft, analyzeMeal } from '@/services/ai/mealAnalyze';
import { matchFoods, matchLabel, withMenu, type MatchedFood } from '@/services/ai/mealMatch';
import { hasLLM } from '@/services/env';
import { newId } from '@/services/id';
import { pickMealPhoto } from '@/services/mealPhoto';
import { searchProductsRemote } from '@/services/products';
import { SPEECH_ERROR_TEXT, useSpeechInput } from '@/services/speech';
import { defaultMealType, useDay } from '@/state/day';
import { judgeContext } from '@/state/judgeContext';
import { useProfile } from '@/state/profile';
import { colors, radius, size, spacing, type } from '@/theme';

/**
 * E4 AI로 기록 — 사진·말·글로 먹은 걸 알려주면 밀리가 "무엇을, 대략 얼마나"로 정리하고,
 * 칼로리는 앱 데이터(식약처·브랜드)에서 찾아 확인 카드로 보여준다. 확인 → 한 번에 기록.
 * 진입: 오늘 탭 [사진·말로·글로] 버튼, 기록 추가(E2) 아래 입력줄. params.mode 로 시작 동작을 고른다.
 */

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
/** 사진에 덧붙이는 먹은 양 (선택) */
const EATEN = ['다 먹었어요', '반쯤 먹었어요', '조금 남겼어요', '조금만 먹었어요'] as const;

type Stage = 'input' | 'analyzing' | 'confirm';
type Photo = { uri: string; base64: string };
type Notice = { pose: MillyPose; text: string } | null;

export default function AILog() {
  const params = useLocalSearchParams<{ mode?: 'photo' | 'voice' | 'text'; text?: string }>();
  const profile = useProfile((s) => s.profile);
  const targets = useProfile((s) => s.targets);
  const summary = useDay((s) => s.summary);
  const addLog = useDay((s) => s.addLog);
  const remaining = summary?.remaining ?? targets;
  const aiOn = hasLLM();

  const [stage, setStage] = useState<Stage>('input');
  const [text, setText] = useState(params.text ?? '');
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [eaten, setEaten] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const [items, setItems] = useState<MatchedFood[]>([]);
  const [source, setSource] = useState<'ai' | 'cache' | 'rules'>('ai');
  const [meal, setMeal] = useState<MealType>(() => defaultMealType());
  const [saving, setSaving] = useState(false);
  /** 메뉴 바꾸기·추가 시트: key 가 있으면 그 줄 바꾸기, null 이면 새로 추가 */
  const [swap, setSwap] = useState<{ key: string | null; query: string } | null>(null);

  const inputRef = useRef<TextInput>(null);
  const baseText = useRef('');
  const submitRef = useRef<(t?: string) => void>(() => undefined);

  const speech = useSpeechInput({
    onText: (t) => setText(baseText.current ? `${baseText.current} ${t}` : t),
    onEnd: (t) => {
      const full = baseText.current ? `${baseText.current} ${t}`.trim() : t;
      // 사진이 없으면 말이 끝나자마자 정리 (한 번 덜 누르게)
      if (full && !photo) submitRef.current(full);
    },
  });

  const refreshQuota = () => void aiMealQuotaLeft().then(setLeft).catch(() => setLeft(0));

  useEffect(() => {
    refreshQuota();
    if (params.mode === 'photo') void takePhoto('camera');
    else if (params.mode === 'voice') void listen();
    else setTimeout(() => inputRef.current?.focus(), 350);
    return () => speech.cancel();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/today'));

  async function takePhoto(from: 'camera' | 'library') {
    if (!aiOn || left === 0) {
      setNotice({ pose: 'sorry', text: aiOn ? '오늘 사진 정리는 다 썼어요. 내일 다시 할 수 있고, 지금은 말이나 글로 알려 주세요.' : '사진 정리는 아직 준비 중이에요. 말이나 글로 알려 주세요.' });
      return;
    }
    speech.cancel();
    setPhotoBusy(true);
    const r = await pickMealPhoto(from);
    setPhotoBusy(false);
    if (r.ok) {
      setPhoto({ uri: r.uri, base64: r.base64 });
      setNotice(null);
    } else if (r.reason === 'denied') {
      setNotice({ pose: 'sorry', text: '카메라 권한을 켜 주시면 사진으로 기록할 수 있어요. 앨범에서 골라도 돼요.' });
    } else if (r.reason === 'failed') {
      setNotice({ pose: 'sorry', text: '사진을 불러오지 못했어요. 다시 한 번 해 주세요.' });
    }
  }

  async function listen() {
    if (speech.listening) return speech.stop();
    Keyboard.dismiss();
    baseText.current = text.trim();
    setNotice(null);
    await speech.start();
  }

  async function submit(override?: string) {
    const body = (override ?? text).trim();
    if (!body && !photo) return;
    if (speech.listening) speech.cancel();
    Keyboard.dismiss();
    setNotice(null);
    setStage('analyzing');
    const note = [eaten, body].filter(Boolean).join(', ');
    const r = photo ? await analyzeMeal({ kind: 'photo', base64: photo.base64, note }) : await analyzeMeal({ kind: 'text', text: body });
    setLeft(r.quotaLeft);
    if (!r.ok) {
      setStage('input');
      setNotice({
        pose: 'sorry',
        text:
          r.reason === 'nothing'
            ? photo
              ? '사진에서 음식을 찾지 못했어요. 음식이 잘 보이게 다시 찍거나 이름을 적어 주세요.'
              : '먹은 음식을 찾지 못했어요. "김밥 한 줄"처럼 음식 이름을 넣어 알려 주세요.'
            : r.reason === 'photo-unavailable'
              ? '오늘 사진 정리는 다 썼어요. 말이나 글로 알려 주세요.'
              : r.reason === 'failed'
                ? '사진을 정리하지 못했어요. 잠시 뒤에 다시 하거나 글로 알려 주세요.'
                : '먹은 걸 알려 주세요.',
      });
      return;
    }
    const matched = await matchFoods(r.meal.items);
    setItems(matched);
    setSource(r.meal.source);
    setMeal(r.meal.mealType ?? defaultMealType());
    setStage('confirm');
  }
  submitRef.current = (t) => void submit(t);

  const setQty = (key: string, qty: number) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, qty } : x)));
  const remove = (key: string) => setItems((xs) => xs.filter((x) => x.key !== key));
  const pickMenu = (menu: MenuItem) => {
    if (!swap) return;
    setItems((xs) => {
      if (swap.key) return xs.map((x) => (x.key === swap.key ? withMenu(x, menu) : x));
      const blank: MatchedFood = { key: `u${Date.now().toString(36)}`, name: menu.name, food: { name: menu.name, amount: 1 }, kind: 'none', base: null, trust: 'none', unit: '인분', qty: 1 };
      return [...xs, withMenu(blank, menu)];
    });
    setSwap(null);
  };

  const countable = items.filter((x) => x.base);
  const total = countable.reduce((s, x) => s + scaleNutrients(x.base!, x.qty).kcal, 0);
  const after = remaining ? remaining.kcal - total : null;

  async function save() {
    if (!countable.length || saving) return;
    setSaving(true);
    const now = new Date();
    const ctx = judgeContext(profile, useDay.getState().summary?.logs);
    const logs: MealLog[] = countable.map((x, i) => {
      const at = new Date(now.getTime() + i).toISOString();
      const j = x.menu && x.kind === 'exact' && remaining ? judgeMenu(x.menu, remaining, ctx) : null;
      return {
        id: newId(),
        date: toDateKey(now),
        mealType: meal,
        time: at,
        createdAt: at,
        qty: x.qty,
        name: x.name,
        ...(x.menu ? { brandId: x.menu.brandId, storeName: x.menu.maker ?? getBrand(x.menu.brandId)?.name, menuId: x.menu.id } : {}),
        nutrients: scaleNutrients(x.base!, x.qty),
        trust: x.trust,
        verdict: j && !j.unknown ? j.verdict : undefined,
      };
    });
    let ok = true;
    for (const l of logs) ok = (await addLog(l)) && ok;
    setSaving(false);
    const day = useDay.getState();
    const suffix = overToastSuffix(day.summary);
    const head = `${MEAL_LABEL[meal]}으로 ${logs.length === 1 ? '' : `${logs.length}개 `}기록했어요`;
    showToast(ok ? head + suffix : `${head} · 저장은 다음에 다시 시도할게요`, ok ? 'success' : 'info', {
      label: '되돌리기',
      onPress: () => logs.forEach((l) => void useDay.getState().removeLog(l.id)),
    });
    close();
  }

  const shownNotice: Notice = notice ?? (speech.error ? { pose: 'sorry', text: SPEECH_ERROR_TEXT[speech.error] } : null);

  const quotaText =
    !aiOn ? '지금은 글과 말로 알려 주시면 간단히 나눠 드려요' : left == null ? '' : left > 0 ? `오늘 밀리 정리 ${left}번 남았어요` : `오늘 밀리 정리 ${AI_MEAL_DAILY_LIMIT}번을 다 썼어요 · 글은 간단히 나눠 드려요`;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <View style={styles.handle} />
      <View style={styles.head}>
        {stage === 'confirm' ? (
          <Pressable accessibilityRole="button" accessibilityLabel="다시 알려주기" hitSlop={8} onPress={() => setStage('input')} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
        ) : null}
        <Text variant="h2" accessibilityRole="header" style={styles.headTitle}>
          {stage === 'confirm' ? '이렇게 기록할까요?' : '밀리에게 알려주기'}
        </Text>
        <IconButton name="close" label="닫기" color={colors.ink} onPress={close} />
      </View>

      {stage === 'analyzing' ? (
        <View style={styles.analyzing}>
          <MillyAvatar pose="thinking" size={72} />
          <Text variant="bodyMedium" color="ink2" align="center">
            {photo ? '밀리가 사진을 보고 있어요' : '밀리가 정리하고 있어요'}
          </Text>
          <Card padding={spacing.md} style={styles.skCard}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.skRow}>
                <Skeleton width={40} height={40} borderRadius={20} />
                <View style={styles.flex}>
                  <Skeleton width="55%" height={14} />
                  <Skeleton width="35%" height={12} style={styles.skGap} />
                </View>
              </View>
            ))}
          </Card>
        </View>
      ) : stage === 'input' ? (
        <>
          <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Bubble pose={shownNotice?.pose ?? 'base'} text={shownNotice?.text ?? (photo ? '얼마나 드셨는지 알려 주시면 더 정확해요.' : '뭐 드셨어요? 사진을 찍거나 말로 알려 주시면 제가 정리할게요.')} />

            {photo ? (
              <View style={styles.photoWrap}>
                <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" accessibilityLabel="찍은 음식 사진" />
                <Pressable accessibilityRole="button" accessibilityLabel="사진 빼기" hitSlop={8} onPress={() => setPhoto(null)} style={styles.photoX}>
                  <Ionicons name="close" size={18} color={colors.inkOnPrimary} />
                </Pressable>
              </View>
            ) : null}
            {photo ? (
              <View style={styles.eatenWrap}>
                <Text variant="captionMedium" color="ink2">
                  얼마나 드셨어요? <Text variant="caption" color="ink3">(선택)</Text>
                </Text>
                <View style={styles.chips}>
                  {EATEN.map((e) => (
                    <Chip key={e} label={e} variant="option" selected={eaten === e} onPress={() => setEaten((v) => (v === e ? null : e))} />
                  ))}
                </View>
              </View>
            ) : null}

            <View style={[styles.textBox, speech.listening && styles.textBoxOn]}>
              <TextInput
                ref={inputRef}
                accessibilityLabel="먹은 음식과 양"
                value={text}
                onChangeText={setText}
                multiline
                placeholder={photo ? '덧붙일 말 (예: 밥은 반만 먹었어요)' : '예: 점심에 김치찌개 한 그릇이랑 밥 반 공기'}
                placeholderTextColor={colors.ink3}
                style={styles.textInput}
                textAlignVertical="top"
                maxLength={300}
              />
              {speech.listening ? (
                <View style={styles.listening}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text variant="captionMedium" color="primaryText">
                    듣고 있어요 · 다 말하면 알아서 정리해요
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.tools}>
              <Tool icon="camera-outline" label="사진 찍기" onPress={() => void takePhoto('camera')} disabled={photoBusy} />
              <Tool icon="images-outline" label="앨범" onPress={() => void takePhoto('library')} disabled={photoBusy} />
              <Tool icon={speech.listening ? 'stop' : 'mic-outline'} label={speech.listening ? '그만 듣기' : '말하기'} onPress={() => void listen()} active={speech.listening} />
            </View>
          </ScrollView>
          <View style={styles.footer}>
            {quotaText ? (
              <Text variant="small" color="ink3" align="center" style={styles.quota}>
                {quotaText}
              </Text>
            ) : null}
            <Button title="밀리한테 정리 부탁하기" disabled={!text.trim() && !photo} onPress={() => void submit()} />
          </View>
        </>
      ) : (
        <>
          <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <Bubble
              pose="cheer"
              text={
                source === 'rules'
                  ? '말씀하신 걸 나눠 봤어요. 음식과 양이 맞는지 확인해 주세요.'
                  : '이렇게 드셨죠? 양이 다르면 − + 로 고쳐 주세요.'
              }
            />
            {items.length ? (
              <Card padding={spacing.xs}>
                {items.map((x, i) => (
                  <ItemRow key={x.key} item={x} last={i === items.length - 1} onQty={(q) => setQty(x.key, q)} onRemove={() => remove(x.key)} onSwap={() => setSwap({ key: x.key, query: x.food.name })} />
                ))}
              </Card>
            ) : (
              <Text variant="caption" color="ink3" align="center" style={styles.emptyItems}>
                기록할 음식이 없어요. 아래에서 추가해 주세요.
              </Text>
            )}
            <Pressable accessibilityRole="button" onPress={() => setSwap({ key: null, query: '' })} style={({ pressed }) => [styles.addMore, pressed && styles.pressed]}>
              <Ionicons name="add-circle-outline" size={18} color={colors.primaryText} />
              <Text variant="bodyMedium" color="primaryText">
                빠진 음식 추가
              </Text>
            </Pressable>

            <Text variant="captionMedium" color="ink2" style={styles.mealLabel}>
              끼니
            </Text>
            <View style={styles.meals}>
              {MEALS.map((m) => (
                <Chip key={m} label={MEAL_LABEL[m]} variant="option" selected={meal === m} onPress={() => setMeal(m)} style={styles.mealChip} />
              ))}
            </View>
          </ScrollView>
          <View style={styles.footer}>
            <View style={styles.totalRow}>
              <Text variant="bodyMedium">합계 {formatNumber(Math.round(total))} kcal</Text>
              {after == null ? null : after >= 0 ? (
                <Text variant="caption" color="ink2">
                  기록하면 오늘 {formatNumber(Math.round(after))} kcal 남아요
                </Text>
              ) : (
                <Text variant="caption" color="over">
                  기록하면 목표보다 {formatNumber(Math.round(-after))} kcal 넘어요
                </Text>
              )}
            </View>
            <Button title={countable.length > 1 ? `${countable.length}개 기록하기` : '기록하기'} disabled={!countable.length} loading={saving} onPress={() => void save()} />
          </View>
        </>
      )}

      <SwapSheet key={swap ? `${swap.key ?? 'new'}|${swap.query}` : 'closed'} state={swap} onClose={() => setSwap(null)} onPick={pickMenu} />
    </SafeAreaView>
  );
}

function Bubble({ pose, text }: { pose: MillyPose; text: string }) {
  return (
    <View style={styles.bubbleRow}>
      <MillyAvatar pose={pose} size={40} />
      <View style={styles.bubble}>
        <Text variant="body">{text}</Text>
      </View>
    </View>
  );
}

function Tool({ icon, label, onPress, disabled, active }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.tool, active && styles.toolOn, pressed && styles.pressed, disabled && styles.dim]}
    >
      <Ionicons name={icon} size={20} color={active ? colors.inkOnPrimary : colors.ink} />
      <Text variant="captionMedium" color={active ? 'inkOnPrimary' : 'ink'}>
        {label}
      </Text>
    </Pressable>
  );
}

function ItemRow({ item, last, onQty, onRemove, onSwap }: { item: MatchedFood; last: boolean; onQty: (q: number) => void; onRemove: () => void; onSwap: () => void }) {
  const kcal = item.base ? Math.round(scaleNutrients(item.base, item.qty).kcal) : null;
  return (
    <View style={[styles.item, !last && styles.itemLine]}>
      <View style={styles.itemTop}>
        <MenuTile menu={item.menu ?? { name: item.name, category: 'meal' }} size={40} />
        <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}, 다른 메뉴로 바꾸기`} onPress={onSwap} style={({ pressed }) => [styles.itemBody, pressed && styles.pressed]}>
          <View style={styles.itemTitle}>
            <Text variant="bodyMedium" numberOfLines={1} style={styles.flexText}>
              {item.name}
            </Text>
            <Ionicons name="swap-horizontal" size={14} color={colors.ink3} />
          </View>
          <View style={styles.itemSub}>
            {item.base ? <TrustBadge trust={item.trust} size="sm" explain={false} /> : null}
            <Text variant="small" color={item.base ? 'ink2' : 'notice'} numberOfLines={1} style={styles.flexText}>
              {matchLabel(item)}
            </Text>
          </View>
          {item.food.portion ? (
            <Text variant="small" color="ink3" numberOfLines={1}>
              말씀하신 양: {item.food.portion}
            </Text>
          ) : null}
        </Pressable>
        <IconButton name="close" label={`${item.name} 빼기`} color={colors.ink3} onPress={onRemove} />
      </View>
      {item.base ? (
        <View style={styles.itemBottom}>
          <QtyStepper value={item.qty} onChange={onQty} unit={item.unit} />
          <Text variant="caption" color="ink2">
            <Text variant="bodyMedium">{formatNumber(kcal ?? 0)}</Text> kcal
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** 메뉴 바꾸기·추가 — 앱 데이터 + 서버 제품 검색 */
function SwapSheet({ state, onClose, onPick }: { state: { key: string | null; query: string } | null; onClose: () => void; onPick: (m: MenuItem) => void }) {
  const [q, setQ] = useState(state?.query ?? '');
  const [remote, setRemote] = useState<{ q: string; items: MenuItem[] } | null>(null);
  useEffect(() => {
    if (!state || !normalizeName(q)) return;
    let alive = true;
    const t = setTimeout(async () => {
      const items = await searchProductsRemote(q, 20);
      if (alive) setRemote({ q, items: items ?? [] });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, state]);
  const results = useMemo(() => {
    if (!normalizeName(q)) return [];
    const local = searchMenus(q, 30);
    const seen = new Set(local.map((m) => m.id));
    const extra = remote?.q === q ? remote.items : [];
    return [...local, ...extra.filter((m) => !seen.has(m.id))].filter((m) => applyOptions(m)).slice(0, 40);
  }, [q, remote]);

  return (
    <BottomSheet visible={!!state} onClose={onClose} title={state?.key ? '다른 메뉴로 바꾸기' : '음식 추가'}>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.ink3} />
        <TextInput accessibilityLabel="메뉴 검색" value={q} onChangeText={setQ} autoFocus={!state?.query} placeholder="메뉴나 브랜드 이름" placeholderTextColor={colors.ink3} style={styles.searchInput} returnKeyType="search" />
      </View>
      <ScrollView style={styles.swapList} keyboardShouldPersistTaps="handled">
        {results.length === 0 ? (
          <Text variant="caption" color="ink3" align="center" style={styles.emptyItems}>
            {normalizeName(q) ? (remote?.q === q ? `‘${q.trim()}’에 맞는 메뉴가 없어요` : '찾고 있어요') : '먹은 메뉴 이름을 적어 주세요'}
          </Text>
        ) : (
          results.map((m) => {
            const n = applyOptions(m)!;
            const by = m.maker ?? getBrand(m.brandId)?.name;
            return (
              <Pressable key={m.id} accessibilityRole="button" onPress={() => onPick(m)} style={({ pressed }) => [styles.swapRow, pressed && styles.pressed]}>
                <MenuTile menu={m} size={36} />
                <View style={styles.flex}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {m.name}
                  </Text>
                  <Text variant="caption" color="ink2" numberOfLines={1}>
                    {[by, m.serving, `${formatNumber(n.kcal)} kcal`].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  flexText: { flexShrink: 1 },
  pressed: { opacity: 0.7 },
  dim: { opacity: 0.5 },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: radius.pill, backgroundColor: colors.border, marginTop: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.page, paddingRight: spacing.sm, minHeight: size.header },
  headTitle: { flex: 1 },
  backBtn: { marginLeft: -spacing.sm, width: size.touch, height: size.touch, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: spacing.page, paddingTop: spacing.sm, paddingBottom: spacing.xxxl, gap: spacing.lg },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  bubble: { flex: 1, backgroundColor: colors.section, borderRadius: radius.lg, borderTopLeftRadius: 4, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  photoWrap: { borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.section },
  photo: { width: '100%', aspectRatio: 4 / 3 },
  photoX: { position: 'absolute', top: spacing.sm, right: spacing.sm, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },
  eatenWrap: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  textBox: { borderRadius: radius.button, backgroundColor: colors.section, borderWidth: 1, borderColor: colors.section, padding: spacing.lg, minHeight: 120 },
  textBoxOn: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  textInput: { ...type.body, color: colors.ink, minHeight: 72, padding: 0, outlineStyle: 'none' } as never,
  listening: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  tools: { flexDirection: 'row', gap: spacing.sm },
  tool: { flex: 1, minHeight: 52, borderRadius: radius.button, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: spacing.sm },
  toolOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  footer: { paddingHorizontal: spacing.page, paddingTop: spacing.sm, paddingBottom: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line, gap: spacing.sm },
  quota: { marginBottom: 2 },
  analyzing: { flex: 1, alignItems: 'center', paddingTop: spacing.xxxl, paddingHorizontal: spacing.page, gap: spacing.lg },
  skCard: { alignSelf: 'stretch', marginTop: spacing.lg },
  skRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  skGap: { marginTop: 6 },
  item: { padding: spacing.md, gap: spacing.sm },
  itemLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  itemBody: { flex: 1, minWidth: 0, gap: 2 },
  itemTitle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemSub: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  itemBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 40 + spacing.md },
  emptyItems: { paddingVertical: spacing.xl },
  addMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: 48, borderRadius: radius.button, borderWidth: 1, borderColor: colors.line },
  mealLabel: { marginTop: spacing.xs },
  meals: { flexDirection: 'row', gap: spacing.sm, marginTop: -spacing.sm },
  mealChip: { flex: 1 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  search: { flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: radius.button, backgroundColor: colors.section, paddingHorizontal: spacing.lg, gap: spacing.sm, marginTop: spacing.md },
  searchInput: { flex: 1, height: '100%', ...type.body, color: colors.ink, outlineStyle: 'none' } as never,
  swapList: { maxHeight: 360, marginTop: spacing.sm },
  swapRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
});
