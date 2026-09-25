import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, CHAT_INDENT, ChatFooter, ChatHeader, ChatInput, ChatScreen, Chip, ChoiceList, MeSay, MillySay, Text } from '@/components';
import { ChatHistory, useAdvance, useHistory } from '@/onboarding/common';
import { DIET_EXAMPLES, DIET_MAX, SAY, SKIP_DIET_LABEL, appendSentence } from '@/onboarding/script';
import { useOnboarding } from '@/state/onboarding';
import { spacing } from '@/theme';

/** B5 식단 성향 자유 서술 — 예시 칩으로 문장 채우기 · 건너뛰기 유지 */
export default function Step5() {
  const draft = useOnboarding((s) => s.draft);
  const reached = useOnboarding((s) => s.reached);
  const set = useOnboarding((s) => s.set);
  const { go, goSoon } = useAdvance(5, '/(onboarding)/step6');

  const [answered, setAnswered] = useState(reached >= 5);
  const [text, setText] = useState(draft.dietDescription);
  const history = useHistory(5);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    // 서술이 바뀌면 B6 에서 다시 분류하도록 결과를 비운다 (기존과 같음)
    if (t !== draft.dietDescription.trim() || !draft.diet) set({ dietDescription: t, diet: undefined });
    setAnswered(true);
    goSoon();
  };

  const skip = () => {
    set({ dietDescription: '', diet: undefined });
    setText('');
    setAnswered(true);
    goSoon();
  };

  const answer = draft.dietDescription.trim() || SKIP_DIET_LABEL;

  return (
    <ChatScreen
      header={<ChatHeader step={5} />}
      bottom={
        answered ? (
          <ChatFooter>
            <Button title="다음" onPress={go} />
          </ChatFooter>
        ) : (
          <ChatInput value={text} onChangeText={(t) => setText(t.slice(0, DIET_MAX))} onSend={send} multiline maxLength={DIET_MAX} placeholder="예) 아침은 가볍게, 점심은 든든하게 먹어요" />
        )
      }
    >
      <ChatHistory lines={history} />
      <MillySay lines={[SAY.diet, SAY.dietSub]} animate />
      {answered ? (
        <MeSay
          text={answer}
          onPress={() => {
            setText(draft.dietDescription);
            setAnswered(false);
          }}
          animate
        />
      ) : (
        <>
          <View style={styles.examples}>
            <Text variant="small" color="ink3">
              예시로 채워보세요
            </Text>
            <View style={styles.chips}>
              {DIET_EXAMPLES.map((e) => (
                <Chip key={e.label} variant="soft" size="sm" label={e.label} onPress={() => setText((t) => appendSentence(t, e.sentence))} />
              ))}
            </View>
          </View>
          <ChoiceList items={[{ key: 'skip', label: SKIP_DIET_LABEL }]} onSelect={skip} />
        </>
      )}
    </ChatScreen>
  );
}

const styles = StyleSheet.create({
  examples: { paddingLeft: CHAT_INDENT, gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
