import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Chip, OnboardingHeader, Screen, Text, TextArea } from '@/components';
import { useOnboarding } from '@/state/onboarding';
import { spacing } from '@/theme';

const MAX = 500;
const EXAMPLES: { emoji: string; label: string; sentence: string }[] = [
  { emoji: '☕', label: '아침은 간단히', sentence: '아침은 간단히 먹는 편이에요.' },
  { emoji: '🌶️', label: '매운 음식 좋아해요', sentence: '매운 음식을 좋아해요.' },
  { emoji: '🍚', label: '빵보다 밥', sentence: '빵보다 밥을 좋아해요.' },
  { emoji: '🍰', label: '단 음식은 적게', sentence: '단 음식은 적게 먹으려고 해요.' },
];

/** B5 식단 성향 자유 서술 — 시안 docs/design/B5-diet-text.png */
export default function Step5() {
  const { draft, set } = useOnboarding();
  const text = draft.dietDescription;

  const addSentence = (sentence: string) => {
    if (text.includes(sentence)) return;
    const joined = text.trim().length === 0 ? sentence : `${text.trimEnd()}\n${sentence}`;
    set({ dietDescription: joined.slice(0, MAX), diet: undefined });
  };

  const goNext = (skip: boolean) => {
    if (skip) set({ dietDescription: '', diet: undefined });
    router.push('/(onboarding)/step6');
  };

  return (
    <Screen
      scroll
      header={<OnboardingHeader step={5} layout="stacked" />}
      footer={
        <View>
          <Button variant="ghost" title="건너뛰기" onPress={() => goNext(true)} style={styles.skip} />
          <Button title="다음" disabled={text.trim().length === 0} onPress={() => goNext(false)} />
        </View>
      }
    >
      <Text variant="display" style={styles.title}>
        평소 식사는{'\n'}어떤 편인가요?
      </Text>
      <Text variant="body" color="ink2" style={styles.sub}>
        자유롭게 적어주시면 성향 분류에 참고할게요.
      </Text>

      <TextArea
        style={styles.area}
        value={text}
        maxLength={MAX}
        onChangeText={(t) => set({ dietDescription: t, diet: undefined })}
        placeholder={'예) 아침은 가볍게 먹고, 점심은 든든하게 먹는 편이에요.\n커피를 자주 마셔요.'}
        accessibilityLabel="평소 식사 서술"
      />

      <Text variant="body" color="ink2" style={styles.exTitle}>
        예시로 참고해보세요
      </Text>
      <View style={styles.chips}>
        {EXAMPLES.map((e) => (
          <Chip key={e.label} variant="soft" size="lg" left={e.emoji} label={e.label} onPress={() => addSentence(e.sentence)} style={styles.chip} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.xxxl + spacing.xs, fontSize: 30, lineHeight: 38 },
  sub: { marginTop: spacing.xs, fontSize: 16 },
  area: { marginTop: spacing.xxl + spacing.xs, marginHorizontal: -spacing.sm },
  exTitle: { marginTop: spacing.xxxl, marginLeft: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: {},
  skip: { marginBottom: spacing.md },
});
