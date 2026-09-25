import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Card, ChatFooter, ChatHeader, ChatScreen, ChoiceList, ListRow, MeSay, MillySay, MillyTyping, SproutIcon, Text, showToast } from '@/components';
import { DIET_TYPES } from '@/domain/diet';
import type { DietClassification, DietType } from '@/domain/types';
import { classifyDiet } from '@/services/ai/classifyDiet';
import { getRepos } from '@/services/repo';
import { ChatHistory, useAdvance, useHistory, useNickname } from '@/onboarding/common';
import { SAY } from '@/onboarding/script';
import { useOnboarding } from '@/state/onboarding';
import { fallbackDiet } from '@/state/profile';
import { colors, radius, spacing } from '@/theme';

/** 근거 제목 키워드로 회색 원 아이콘 고르기 */
function evidenceIcon(title: string): ReactNode {
  const c = colors.ink2;
  if (/카페|커피|음료/.test(title)) return <Ionicons name="cafe-outline" size={18} color={c} />;
  if (/단백질|고기|닭/.test(title)) return <MaterialCommunityIcons name="food-steak" size={18} color={c} />;
  if (/당|단 음식|디저트/.test(title)) return <Ionicons name="ice-cream-outline" size={18} color={c} />;
  if (/염|짠|국물|나트륨/.test(title)) return <Ionicons name="water-outline" size={18} color={c} />;
  if (/밥|면|빵|탄수/.test(title)) return <MaterialCommunityIcons name="barley" size={18} color={c} />;
  if (/편의점|간편/.test(title)) return <Ionicons name="storefront-outline" size={18} color={c} />;
  return <SproutIcon size={18} color={c} />;
}

/** 분석 중 연출 최소 시간 — 밀리가 생각하는 모습이 보이도록 */
const MIN_LOADING_MS = 1200;

/** B6 성향 분석 — 밀리 thinking → 결과 카드(근거 3줄) · 직접 선택 · AI 실패 시 규칙 폴백 */
export default function Step6() {
  const draft = useOnboarding((s) => s.draft);
  const set = useOnboarding((s) => s.set);
  const reached = useOnboarding((s) => s.reached);
  const nickname = useNickname();
  const { go, goSoon } = useAdvance(6, '/(onboarding)/step7');

  const [result, setResult] = useState<DietClassification | null>(draft.diet ?? null);
  const [picked, setPicked] = useState(false);
  const [accepted, setAccepted] = useState(reached >= 6 && !!draft.diet);
  const [sheet, setSheet] = useState(false);
  const toasted = useRef(false);
  const history = useHistory(6);

  useEffect(() => {
    if (draft.diet) return;
    let alive = true;
    const text = draft.dietDescription.trim();
    const started = Date.now();
    (async () => {
      let res: DietClassification;
      if (text.length === 0) {
        // 건너뛴 경우: 규칙 기반 (목적만 반영)
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
      }
      const wait = MIN_LOADING_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
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
    setPicked(true);
    setSheet(false);
  };

  const accept = () => {
    setAccepted(true);
    goSoon();
  };

  const info = result ? DIET_TYPES[result.type] : null;

  return (
    <ChatScreen
      header={<ChatHeader step={6} />}
      bottom={
        accepted ? (
          <ChatFooter>
            <Button title="다음" onPress={go} />
          </ChatFooter>
        ) : null
      }
    >
      <ChatHistory lines={history} />
      {!result || !info ? (
        <MillyTyping label={draft.dietDescription.trim() ? SAY.analyzing : undefined} />
      ) : (
        <>
          <MillySay pose="cheer" lines={[SAY.result(info.label, nickname)]} animate>
            <Card padding={spacing.lg} style={styles.card}>
              <Text variant="small" color="primaryText" style={styles.kicker}>
                {result.source === 'manual' ? '직접 고른 성향' : '식단 성향'}
              </Text>
              <Text variant="h2">{info.label}</Text>
              <Text variant="caption" color="ink2" style={styles.desc}>
                {info.description}
              </Text>
              {result.evidence.length > 0 ? (
                <View style={styles.evidence}>
                  {result.evidence.slice(0, 3).map((ev, i) => (
                    <ListRow key={i} variant="filled" chevron={false} iconSize={32} icon={evidenceIcon(ev.title)} iconBg={colors.surface} title={ev.title} subtitle={ev.detail} />
                  ))}
                </View>
              ) : null}
              <View style={styles.use}>
                {['오늘의 식사 메뉴를 내 성향에 맞게 추천해요.', '메뉴를 볼 때, 나에게 맞는지 함께 판단해드려요.'].map((b) => (
                  <View key={b} style={styles.bullet}>
                    <View style={styles.dot} />
                    <Text variant="small" color="ink2" style={styles.bulletText}>
                      {b}
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          </MillySay>
          {picked ? <MillySay lines={[SAY.resultPicked(info.label)]} animate /> : null}
          {accepted ? (
            <MeSay text={SAY.resultAccept} onPress={() => setAccepted(false)} animate />
          ) : (
            <ChoiceList
              items={[
                { key: 'ok', label: SAY.resultAccept, primary: true },
                { key: 'pick', label: SAY.resultPick },
              ]}
              onSelect={(k) => (k === 'ok' ? accept() : setSheet(true))}
            />
          )}
        </>
      )}

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} title="식단 성향 직접 선택" subtitle="나와 가장 가까운 유형을 골라주세요.">
        <View style={styles.sheetList}>
          {(Object.keys(DIET_TYPES) as DietType[]).map((t) => {
            const on = t === result?.type;
            return (
              <Card key={t} padding={spacing.md} onPress={() => pickManual(t)} style={on ? styles.sheetOn : undefined} accessibilityLabel={DIET_TYPES[t].label}>
                <ListRow
                  title={DIET_TYPES[t].label}
                  subtitle={DIET_TYPES[t].description}
                  chevron={false}
                  style={styles.sheetRow}
                  right={on ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
                />
              </Card>
            );
          })}
        </View>
      </BottomSheet>
    </ChatScreen>
  );
}

const styles = StyleSheet.create({
  card: { maxWidth: 300, alignSelf: 'stretch' },
  kicker: { marginBottom: 2 },
  desc: { marginTop: spacing.xs },
  evidence: { marginTop: spacing.md, gap: spacing.xs + 2 },
  use: { marginTop: spacing.md, gap: 4 },
  bullet: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary, marginRight: spacing.sm },
  bulletText: { flex: 1 },
  sheetList: { gap: spacing.sm, paddingBottom: spacing.sm },
  sheetOn: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: colors.primaryTint, borderRadius: radius.lg },
  sheetRow: { paddingVertical: 0, minHeight: 0 },
});
