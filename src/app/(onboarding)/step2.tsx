import { useMemo, useState, type ReactNode } from 'react';

import { Button, ChatFooter, ChatHeader, ChatInput, ChatScreen, ChoiceList, MeSay, MillySay } from '@/components';
import type { Sex } from '@/domain/types';
import { ChatHistory, useAdvance, useNickname } from '@/onboarding/common';
import { SAY, SEX_OPTIONS, UNIT, answerText, checkNumber, historyBefore, matchOption, type NumberField } from '@/onboarding/script';
import { useOnboarding } from '@/state/onboarding';

type Q = 'sex' | 'birthYear' | 'heightCm' | 'weightKg';
const ORDER: Q[] = ['sex', 'birthYear', 'heightCm', 'weightKg'];
const PLACEHOLDER: Record<Exclude<Q, 'sex'>, string> = { birthYear: '예: 1990', heightCm: '예: 170', weightKg: '예: 60' };
const MAXLEN: Record<Exclude<Q, 'sex'>, number> = { birthYear: 4, heightCm: 5, weightKg: 5 };

type Answers = { sex?: Sex; birthYear?: number; heightCm?: number; weightKg?: number };

/** B2 기본 정보 — 성별(선택지) → 출생 연도 · 키 · 몸무게(입력바). 범위 검증은 기존과 같다 */
export default function Step2() {
  const draft = useOnboarding((s) => s.draft);
  const set = useOnboarding((s) => s.set);
  const nickname = useNickname();
  const { go, goSoon } = useAdvance(2, '/(onboarding)/step3');

  const [ans, setAns] = useState<Answers>(() => ({ sex: draft.sex, birthYear: draft.birthYear, heightCm: draft.heightCm, weightKg: draft.weightKg }));
  const cur = ORDER.find((q) => ans[q] == null);
  const [text, setText] = useState('');
  const [miss, setMiss] = useState(false);

  const history = useMemo(() => historyBefore(2, draft, { nickname }), [draft, nickname]);

  /** 다음 질문 입력칸에 전에 답했던 값을 채워 둔다 */
  const moveOn = (next: Answers) => {
    setAns(next);
    const after = ORDER.find((q) => next[q] == null);
    setText(after && after !== 'sex' && draft[after] != null ? String(draft[after]) : '');
    if (!after) goSoon();
  };

  const answerSex = (sex: Sex) => {
    setMiss(false);
    set({ sex });
    moveOn({ ...ans, sex });
  };

  const field = cur && cur !== 'sex' ? (cur as NumberField) : undefined;
  const check = field ? checkNumber(field, text) : undefined;

  const send = () => {
    if (!cur) return;
    if (cur === 'sex') {
      const sex = matchOption(text, SEX_OPTIONS);
      if (sex) {
        setText('');
        answerSex(sex);
      } else setMiss(true);
      return;
    }
    if (!check?.valid) return;
    const n = Number(text);
    set(cur === 'birthYear' ? { birthYear: n } : cur === 'heightCm' ? { heightCm: n } : { weightKg: n });
    moveOn({ ...ans, [cur]: n });
  };

  /** 답한 말풍선을 누르면 그 질문부터 다시 (이전 값은 입력칸에 채워 둔다) */
  const rewind = (q: Q) => {
    const i = ORDER.indexOf(q);
    const next: Answers = { ...ans };
    ORDER.slice(i).forEach((k) => {
      delete next[k];
    });
    setAns(next);
    setMiss(false);
    setText(q !== 'sex' && ans[q] != null ? String(ans[q]) : '');
  };

  const shown = cur ? ORDER.slice(0, ORDER.indexOf(cur) + 1) : ORDER;

  return (
    <ChatScreen
      header={<ChatHeader step={2} />}
      bottom={
        !cur ? (
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
            numeric={!!field}
            unit={field ? UNIT[field] : undefined}
            placeholder={field ? PLACEHOLDER[field as Exclude<Q, 'sex'>] : '직접 입력할 수도 있어요'}
            maxLength={field ? MAXLEN[field as Exclude<Q, 'sex'>] : 20}
            canSend={field ? !!check?.valid : text.trim().length > 0}
            hint={check?.hint}
          />
        )
      }
    >
      <ChatHistory lines={history} />
      {shown.map((q) => {
        const v = ans[q];
        return (
          <QA key={q} q={q} answer={v == null ? undefined : q === 'sex' ? SEX_OPTIONS.find((o) => o.value === v)?.label : answerText(q as NumberField, v as number)} onRewind={() => rewind(q)}>
            {q === 'sex' && v == null ? (
              <ChoiceList layout="wrap" items={SEX_OPTIONS.map((o) => ({ key: o.value, label: o.label }))} onSelect={(k) => answerSex(k as Sex)} />
            ) : null}
          </QA>
        );
      })}
      {miss ? <MillySay pose="sorry" lines={[SAY.notMatched]} animate /> : null}
    </ChatScreen>
  );
}

function QA({ q, answer, onRewind, children }: { q: Q; answer?: string; onRewind: () => void; children?: ReactNode }) {
  return (
    <>
      <MillySay lines={[SAY[q]]} animate />
      {children}
      {answer ? <MeSay text={answer} onPress={onRewind} animate /> : null}
    </>
  );
}
