import { useMemo, useState } from 'react';

import { Button, ChatFooter, ChatHeader, ChatInput, ChatScreen, ChoiceList, MeSay, MillySay } from '@/components';
import type { ActivityLevel } from '@/domain/types';
import { ChatHistory, useAdvance, useNickname } from '@/onboarding/common';
import { ACTIVITY_OPTIONS, SAY, historyBefore, matchOption } from '@/onboarding/script';
import { useOnboarding } from '@/state/onboarding';

/** B3 활동량 5단계 — 설명이 붙은 버튼 스택 */
export default function Step3() {
  const draft = useOnboarding((s) => s.draft);
  const set = useOnboarding((s) => s.set);
  const nickname = useNickname();
  const { go, goSoon } = useAdvance(3, '/(onboarding)/step4');

  const [answered, setAnswered] = useState(draft.activity != null);
  const [text, setText] = useState('');
  const [miss, setMiss] = useState(false);
  const history = useMemo(() => historyBefore(3, draft, { nickname }), [draft, nickname]);

  const pick = (level: ActivityLevel) => {
    set({ activity: level });
    setAnswered(true);
    setMiss(false);
    setText('');
    goSoon();
  };

  const send = () => {
    const level = matchOption(text, ACTIVITY_OPTIONS);
    if (level) pick(level);
    else setMiss(true);
  };

  const label = ACTIVITY_OPTIONS.find((o) => o.value === draft.activity)?.label;

  return (
    <ChatScreen
      header={<ChatHeader step={3} />}
      bottom={
        answered ? (
          <ChatFooter>
            <Button title="다음" onPress={go} />
          </ChatFooter>
        ) : (
          <ChatInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              setMiss(false);
            }}
            onSend={send}
            maxLength={30}
          />
        )
      }
    >
      <ChatHistory lines={history} />
      <MillySay lines={[SAY.activity, SAY.activitySub]} animate />
      {answered && label ? (
        <MeSay text={label} onPress={() => setAnswered(false)} animate />
      ) : (
        <ChoiceList
          items={ACTIVITY_OPTIONS.map((o) => ({ key: String(o.value), label: o.label, description: o.description, selected: draft.activity === o.value }))}
          onSelect={(k) => pick(Number(k) as ActivityLevel)}
        />
      )}
      {miss ? <MillySay pose="sorry" lines={[SAY.notMatched]} animate /> : null}
    </ChatScreen>
  );
}
