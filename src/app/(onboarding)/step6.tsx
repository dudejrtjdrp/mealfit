import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Card, ListRow, OnboardingHeader, Screen, Text, showToast } from '@/components';
import { DIET_TYPES } from '@/domain/diet';
import type { DietClassification, DietType } from '@/domain/types';
import { classifyDiet } from '@/services/ai/classifyDiet';
import { getRepos } from '@/services/repo';
import { useOnboarding } from '@/state/onboarding';
import { fallbackDiet } from '@/state/profile';
import { useSession } from '@/state/session';
import { colors, spacing } from '@/theme';

const DIET_EMOJI: Record<DietType, string> = {
  balanced: '🥗',
  low_carb_high_protein: '🍗',
  low_sugar: '🍓',
  low_sodium: '🥬',
  light_eater: '🍙',
  high_protein_bulk: '🥩',
  convenience: '🥪',
};

/** 근거 제목 키워드로 아이콘·배경 고르기 (없으면 순서대로) */
function evidenceIcon(title: string, i: number): { icon: ReactNode; bg: string } {
  if (/카페|커피|음료/.test(title)) return { icon: <Ionicons name="cafe" size={22} color={colors.kcal} />, bg: colors.kcalBg };
  if (/단백질|고기|닭/.test(title)) return { icon: <MaterialCommunityIcons name="food-steak" size={22} color={colors.protein} />, bg: colors.proteinBg };
  if (/당|단 음식|디저트/.test(title)) return { icon: <Ionicons name="ice-cream" size={20} color={colors.sugar} />, bg: colors.sugarBg };
  if (/염|짠|국물|나트륨/.test(title)) return { icon: <Ionicons name="water" size={20} color={colors.fat} />, bg: colors.fatBg };
  if (/밥|면|빵|탄수/.test(title)) return { icon: <MaterialCommunityIcons name="barley" size={22} color={colors.carbs} />, bg: colors.carbsBg };
  if (/편의점|간편/.test(title)) return { icon: <Ionicons name="storefront" size={20} color={colors.sodium} />, bg: colors.sodiumBg };
  const fallback = [
    { icon: <MaterialCommunityIcons name="sprout" size={24} color={colors.primary} />, bg: colors.primarySoft },
    { icon: <Ionicons name="cafe" size={22} color={colors.kcal} />, bg: colors.kcalBg },
    { icon: <MaterialCommunityIcons name="food-steak" size={22} color={colors.protein} />, bg: colors.proteinBg },
  ];
  if (/채소|가볍|깔끔|담백/.test(title)) return fallback[0];
  return fallback[i % 3];
}

const MIN_LOADING_MS = 700;

/** B6 성향 분석 결과 — 시안 docs/design/B6-diet-result.png */
export default function Step6() {
  const { draft, set } = useOnboarding();
  const nickname = useSession((s) => s.session?.nickname) ?? '회원';
  const [result, setResult] = useState<DietClassification | null>(draft.diet ?? null);
  const [sheet, setSheet] = useState(false);
  const toasted = useRef(false);

  useEffect(() => {
    if (draft.diet) return;
    let alive = true;
    const text = draft.dietDescription.trim();
    const started = Date.now();
    (async () => {
      let res: DietClassification;
      if (text.length === 0) {
        // 건너뛴 경우: 바로 규칙 기반
        res = fallbackDiet('', draft.primaryGoal);
      } else {
        try {
          res = await classifyDiet(text, { repos: getRepos(), primaryGoal: draft.primaryGoal });
        } catch (e) {
          console.warn('[B6] classifyDiet 실패 → 규칙 폴백', e);
          if (!toasted.current) {
            toasted.current = true;
            showToast('지금은 기본 분류로 정리했어요', 'info');
          }
          res = fallbackDiet(text, draft.primaryGoal);
        }
        const wait = MIN_LOADING_MS - (Date.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
      if (!alive) return;
      setResult(res);
      set({ diet: res });
    })();
    return () => {
      alive = false;
    };
    // 진입 시 1회
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickManual = (type: DietType) => {
    const manual: DietClassification = { type, evidence: result?.type === type ? result.evidence : [], source: 'manual' };
    setResult(manual);
    set({ diet: manual });
    setSheet(false);
  };

  if (!result) {
    return (
      <Screen header={<OnboardingHeader step={6} layout="inline" />}>
        <View style={styles.loading} accessibilityLiveRegion="polite">
          <View style={styles.loadingCircle}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
          <Text variant="h2" align="center" style={styles.loadingTitle}>
            식단 성향을 정리하고 있어요
          </Text>
          <Text variant="body" color="ink2" align="center" style={styles.loadingSub}>
            적어주신 내용을 살펴보는 중이에요.{'\n'}잠시만 기다려주세요.
          </Text>
        </View>
      </Screen>
    );
  }

  const info = DIET_TYPES[result.type];

  return (
    <Screen
      scroll
      header={<OnboardingHeader step={6} layout="inline" />}
      footer={
        <View style={styles.footer}>
          <Button title="이대로 시작" height={48} onPress={() => router.push('/(onboarding)/step7')} />
          <Button title="직접 선택" variant="outline" height={48} onPress={() => setSheet(true)} />
        </View>
      }
    >
      <Text variant="h1" style={styles.title}>
        식단 성향을 정리했어요
      </Text>
      <Text variant="body" color="ink2" style={styles.sub}>
        {nickname}님만의 식사 성향을 바탕으로{'\n'}더 적합한 메뉴를 추천해드릴게요.
      </Text>

      <Card padding={12} style={styles.resultCard}>
        <View style={styles.hero}>
          <View style={[styles.ray, styles.rayL1]} />
          <View style={[styles.ray, styles.rayL2]} />
          <View style={styles.heroCircle}>
            <Text style={styles.heroEmoji}>{DIET_EMOJI[result.type]}</Text>
          </View>
          <View style={[styles.ray, styles.rayR1]} />
          <View style={[styles.ray, styles.rayR2]} />
        </View>
        <Text variant="h1" align="center" style={styles.typeLabel}>
          {info.label}
        </Text>
        <Text variant="body" color="ink2" align="center" style={styles.typeDesc}>
          {info.description}
        </Text>
        {result.evidence.length > 0 ? (
          <View style={styles.evidence}>
            {result.evidence.slice(0, 3).map((ev, i) => {
              const ic = evidenceIcon(ev.title, i);
              return <ListRow key={i} variant="filled" title={ev.title} subtitle={ev.detail} icon={ic.icon} iconBg={ic.bg} />;
            })}
          </View>
        ) : (
          <View style={styles.evidenceSpacer} />
        )}
      </Card>

      <Card padding={16} style={styles.useCard}>
        <View style={styles.useRow}>
          <View style={styles.bulb}>
            <Ionicons name="bulb" size={22} color={colors.primary} />
          </View>
          <View style={styles.useBody}>
            <Text variant="h3">이렇게 활용돼요</Text>
            {['오늘의 식사 메뉴를 내 성향에 맞게 추천해요.', '메뉴를 볼 때, 나에게 맞는지 함께 판단해드려요.'].map((b) => (
              <View key={b} style={styles.bullet}>
                <View style={styles.dot} />
                <Text variant="caption" color="ink2" style={styles.bulletText}>
                  {b}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Card>

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="식단 성향 직접 선택" subtitle="나와 가장 가까운 유형을 골라주세요.">
        <View style={styles.sheetList}>
          {(Object.keys(DIET_TYPES) as DietType[]).map((t) => (
            <Card key={t} padding={4} onPress={() => pickManual(t)} style={t === result.type ? styles.sheetSelected : undefined} accessibilityLabel={DIET_TYPES[t].label}>
              <ListRow
                title={DIET_TYPES[t].label}
                subtitle={DIET_TYPES[t].description}
                icon={DIET_EMOJI[t]}
                iconBg={colors.primarySofter}
                chevron={false}
                style={styles.sheetRow}
                right={t === result.type ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
              />
            </Card>
          ))}
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  loadingCircle: { width: 128, height: 128, borderRadius: 64, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  loadingTitle: { marginTop: spacing.xxl },
  loadingSub: { marginTop: spacing.sm },
  title: { marginTop: spacing.xxl },
  sub: { marginTop: spacing.xs, fontSize: 16, lineHeight: 22 },
  resultCard: { marginTop: spacing.xl, marginHorizontal: -spacing.sm },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
  heroCircle: { width: 92, height: 92, borderRadius: 46, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginHorizontal: spacing.lg },
  heroEmoji: { fontSize: 52, lineHeight: 62 },
  ray: { position: 'absolute', width: 9, height: 2.5, borderRadius: 2, backgroundColor: colors.primary },
  rayL1: { left: '28%', top: 28, transform: [{ rotate: '30deg' }] },
  rayL2: { left: '27%', top: 50, transform: [{ rotate: '-8deg' }] },
  rayR1: { right: '28%', top: 28, transform: [{ rotate: '-30deg' }] },
  rayR2: { right: '27%', top: 50, transform: [{ rotate: '8deg' }] },
  typeLabel: { marginTop: spacing.md, fontSize: 28, lineHeight: 36 },
  typeDesc: { marginTop: spacing.xs },
  evidence: { marginTop: spacing.lg, gap: 8 },
  evidenceSpacer: { height: spacing.md },
  useCard: { marginTop: spacing.md, marginHorizontal: -spacing.sm },
  useRow: { flexDirection: 'row' },
  bulb: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySofter, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  useBody: { flex: 1 },
  bullet: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary, marginRight: spacing.sm + 2 },
  bulletText: { flex: 1 },
  footer: { gap: spacing.sm, marginHorizontal: -spacing.sm },
  sheetList: { gap: spacing.sm, paddingBottom: spacing.sm },
  sheetSelected: { borderWidth: 1.5, borderColor: colors.primaryBorder },
  sheetRow: { paddingHorizontal: spacing.md },
});
