import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BowlIcon, Button, ChatFooter, ChatHeader, ChatInput, ChatScreen, ChoiceList, MeSay, MillyAvatar, MillySay, PinIcon, Text, Wordmark } from '@/components';
import { useAdvance, useGreetName } from '@/onboarding/common';
import { NAME_MAX, SAY, SKIP_NAME_LABEL, nicknameAnswer, normalizeNickname } from '@/onboarding/script';
import { useOnboarding } from '@/state/onboarding';
import { useSession } from '@/state/session';
import { colors, radius, spacing } from '@/theme';

const FEATURES = [
  { key: 'target', title: '오늘 목표량', desc: '오늘 더 먹을 수 있는 만큼', icon: <BowlIcon size={20} color={colors.ink2} /> },
  { key: 'nearby', title: '주변 메뉴 판정', desc: '먹기 전에 좋음·괜찮음·패스', icon: <PinIcon size={20} color={colors.ink2} /> },
  { key: 'log', title: '간편 기록', desc: '먹은 건 한 번에', icon: <Ionicons name="create-outline" size={20} color={colors.ink2} /> },
];

type Phase = 'intro' | 'name' | 'done';

/**
 * B1 인트로 — 밀리 첫인사 (건강관리 포지셔닝) → 부를 이름 묻기.
 * 로그인이 온보딩 뒤로 가서 여기서 이름을 묻는다(건너뛰면 '회원'). 새 기기의 기존 사용자는 "이미 계정이 있어요" → 로그인.
 */
export default function Step1() {
  const greetName = useGreetName();
  const signedIn = useSession((s) => !!s.session);
  const reached = useOnboarding((s) => s.reached);
  const draftName = useOnboarding((s) => s.draft.nickname);
  const set = useOnboarding((s) => s.set);
  const { go, goSoon } = useAdvance(1, '/(onboarding)/step2');
  const [phase, setPhase] = useState<Phase>(reached >= 1 ? 'done' : 'intro');
  const [text, setText] = useState(draftName ?? greetName ?? '');

  // 로그인하고 돌아왔는데(서버에 프로필 없음) 아직 이름을 안 적었으면 계정 이름을 채워 둔다
  useEffect(() => {
    if (phase === 'name' && !text && greetName) setText(greetName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greetName]);

  const start = () => setPhase('name');

  const answerName = (nickname: string) => {
    set({ nickname });
    setPhase('done');
    goSoon();
  };

  const send = () => {
    const n = normalizeNickname(text);
    if (n) answerName(n);
  };

  const skip = () => {
    setText('');
    answerName('');
  };

  return (
    <ChatScreen
      header={<ChatHeader step={1} hideBack />}
      bottom={
        phase === 'done' ? (
          <ChatFooter>
            <Button title="다음" onPress={go} />
          </ChatFooter>
        ) : phase === 'name' ? (
          <ChatInput value={text} onChangeText={setText} onSend={send} placeholder="예: 지은" maxLength={NAME_MAX} canSend={normalizeNickname(text).length > 0} autoFocus />
        ) : null
      }
    >
      <View style={styles.hero}>
        <MillyAvatar pose="cheer" size={88} />
        <Wordmark size={22} style={styles.word} />
        <Text variant="caption" color="ink3">
          먹기 전, 나에게 맞는 한 끼
        </Text>
      </View>

      <MillySay pose="cheer" lines={[SAY.hello(greetName), SAY.intro]} tail={[SAY.introAsk]} animate>
        <View style={styles.features}>
          {FEATURES.map((f, i) => (
            <View key={f.key} style={[styles.feature, i > 0 && styles.featureLine]}>
              <View style={styles.featureIcon}>{f.icon}</View>
              <View style={styles.featureText}>
                <Text variant="h3">{f.title}</Text>
                <Text variant="small" color="ink3">
                  {f.desc}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </MillySay>

      {phase === 'intro' ? (
        <ChoiceList
          items={[{ key: 'start', label: SAY.introReply, primary: true }, ...(signedIn ? [] : [{ key: 'account', label: SAY.haveAccount }])]}
          onSelect={(k) => (k === 'start' ? start() : router.push({ pathname: '/login', params: { from: 'returning' } }))}
        />
      ) : (
        <>
          <MeSay text={SAY.introReply} animate />
          <MillySay lines={[SAY.askName, SAY.askNameSub]} animate />
          {phase === 'name' ? (
            <ChoiceList items={[{ key: 'skip', label: SKIP_NAME_LABEL }]} onSelect={skip} />
          ) : (
            <>
              <MeSay
                text={nicknameAnswer(draftName)}
                onPress={() => {
                  setText(draftName ?? '');
                  setPhase('name');
                }}
                animate
              />
              <MillySay pose="cheer" lines={[SAY.nameThanks(draftName?.trim() || undefined)]} animate />
            </>
          )}
        </>
      )}
    </ChatScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: 2 },
  word: { marginTop: spacing.md },
  features: { alignSelf: 'stretch', maxWidth: 280, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, paddingHorizontal: 14 },
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  featureLine: { borderTopWidth: 1, borderTopColor: colors.line },
  featureIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  featureText: { flex: 1 },
});
