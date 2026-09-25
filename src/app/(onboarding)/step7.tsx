import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, ChatFooter, ChatHeader, ChatScreen, ChoiceList, EmptyState, KcalRing, MeSay, MillySay, MillyTyping, NutrientBar, showToast, type NutrientKey } from '@/components';
import { formatNumber } from '@/domain/summary';
import { ChatHistory, useHistory, useNickname } from '@/onboarding/common';
import { SAY } from '@/onboarding/script';
import { useOnboarding } from '@/state/onboarding';
import { useProfile } from '@/state/profile';
import { useSession } from '@/state/session';
import { spacing } from '@/theme';

type Perm = 'idle' | 'asking' | 'granted' | 'denied' | 'later';
const BAR_KEYS: NutrientKey[] = ['carbs', 'protein', 'fat', 'sugar', 'sodium'];

/** B7 오늘 목표량 첫 소개 + 위치 권한 프라이밍 — 프로필 저장은 진입 시 1회 (기존과 같음) */
export default function Step7() {
  const draft = useOnboarding((s) => s.draft);
  const nickname = useNickname();
  const { targets, completeOnboarding } = useProfile();
  const [done, setDone] = useState(false);
  const [perm, setPerm] = useState<Perm>('idle');
  const history = useHistory(7);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { saved } = await completeOnboarding(draft, nickname);
      if (!saved) console.warn('[B7] 프로필 저장 실패 — 이번 실행 동안 메모리로 유지');
      if (alive) setDone(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const askLocation = async () => {
    setPerm('asking');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPerm(status === 'granted' ? 'granted' : 'denied');
      if (status === 'granted') showToast('위치를 허용했어요');
    } catch {
      setPerm('denied');
    }
  };

  /** 로그인은 온보딩 뒤로: 게스트면 로그인 권유 화면("나중에 할게요" 가능), 이미 로그인했으면 바로 오늘 탭 */
  const start = () => {
    useOnboarding.getState().reset();
    if (useSession.getState().session) router.replace('/(tabs)/today');
    else router.replace({ pathname: '/login', params: { from: 'onboarding' } });
  };

  // 강조 영양소 순서대로 바 3개 (emphasis 에 kcal 이 있으면 링이 대신하므로 제외)
  const bars = targets ? (targets.emphasis.filter((k) => k !== 'kcal') as NutrientKey[]).filter((k) => BAR_KEYS.includes(k)).slice(0, 3) : [];
  const answered = perm === 'granted' || perm === 'denied' || perm === 'later';

  return (
    <ChatScreen
      header={<ChatHeader step={7} />}
      bottom={
        <ChatFooter>
          <Button title="시작하기" disabled={!done} onPress={start} />
        </ChatFooter>
      }
    >
      <ChatHistory lines={history} />
      {!done ? (
        <MillyTyping />
      ) : targets ? (
        <MillySay pose="cheer" lines={[SAY.target(formatNumber(targets.kcal))]} tail={[SAY.targetSub]} animate>
          <Card padding={spacing.lg} style={styles.card}>
            <View style={styles.gaugeRow}>
              <KcalRing value={targets.kcal} progress={1} caption="kcal 목표" size={112} stroke={10} numberSize={24} />
              <View style={styles.bars}>
                {bars.map((k) => (
                  <NutrientBar key={k} nutrient={k} max={targets[k]} />
                ))}
              </View>
            </View>
          </Card>
        </MillySay>
      ) : (
        <EmptyState pose="sorry" title="목표량을 아직 계산하지 못했어요" description="오늘 탭에서 다시 계산해 보여드릴게요." style={styles.empty} />
      )}

      {done ? <MillySay lines={[SAY.location]} animate /> : null}
      {done && !answered ? (
        <ChoiceList
          items={[
            { key: 'yes', label: perm === 'asking' ? '확인하는 중…' : SAY.locationYes, primary: true },
            { key: 'later', label: SAY.locationLater },
          ]}
          onSelect={(k) => {
            if (perm !== 'idle') return;
            if (k === 'yes') void askLocation();
            else setPerm('later');
          }}
        />
      ) : null}
      {answered ? (
        <>
          <MeSay text={perm === 'later' ? SAY.locationLater : SAY.locationYes} animate />
          <MillySay pose={perm === 'granted' ? 'cheer' : 'base'} lines={[perm === 'granted' ? SAY.locationGranted : perm === 'denied' ? SAY.locationDenied : SAY.locationLaterReply]} animate />
        </>
      ) : null}
    </ChatScreen>
  );
}

const styles = StyleSheet.create({
  card: { maxWidth: 300, alignSelf: 'stretch' },
  gaugeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  bars: { flex: 1, gap: spacing.md, minWidth: 0 },
  empty: { paddingVertical: spacing.lg },
});
