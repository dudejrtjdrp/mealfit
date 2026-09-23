import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BowlIcon, Button, ChatFooter, ChatHeader, ChatScreen, ChoiceList, MeSay, MillyAvatar, MillySay, PinIcon, Text, Wordmark } from '@/components';
import { useAdvance, useNickname } from '@/onboarding/common';
import { SAY } from '@/onboarding/script';
import { useOnboarding } from '@/state/onboarding';
import { colors, radius, spacing } from '@/theme';

const FEATURES = [
  { key: 'target', title: '오늘 목표량', desc: '오늘 더 먹을 수 있는 만큼', icon: <BowlIcon size={20} color={colors.ink2} /> },
  { key: 'nearby', title: '주변 메뉴 판정', desc: '먹기 전에 좋음·괜찮음·패스', icon: <PinIcon size={20} color={colors.ink2} /> },
  { key: 'log', title: '간편 기록', desc: '먹은 건 한 번에', icon: <Ionicons name="create-outline" size={20} color={colors.ink2} /> },
];

/** B1 인트로 — 밀리 첫인사 (건강관리 포지셔닝) */
export default function Step1() {
  const nickname = useNickname();
  const reached = useOnboarding((s) => s.reached);
  const { go, goSoon } = useAdvance(1, '/(onboarding)/step2');
  const [answered, setAnswered] = useState(reached >= 1);

  const start = () => {
    setAnswered(true);
    goSoon();
  };

  return (
    <ChatScreen
      header={<ChatHeader step={1} hideBack />}
      bottom={
        answered ? (
          <ChatFooter>
            <Button title="다음" onPress={go} />
          </ChatFooter>
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

      <MillySay pose="cheer" lines={[SAY.hello(nickname), SAY.intro]} tail={[SAY.introAsk]} animate>
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

      {answered ? <MeSay text={SAY.introReply} animate /> : <ChoiceList items={[{ key: 'start', label: SAY.introReply }]} onSelect={start} />}
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
