import { Fragment, useMemo, useState } from 'react';

import { Button, ChatFooter, ChatHeader, ChatInput, ChatScreen, ChoiceList, MeSay, MillySay } from '@/components';
import { GOAL_LABEL } from '@/data/labels';
import type { Goal } from '@/domain/types';
import { ChatHistory, useAdvance, useNickname } from '@/onboarding/common';
import {
  GOAL_OPTIONS,
  NO_SECONDARY_LABEL,
  SAY,
  SECONDARY_GOALS,
  UNIT,
  answerText,
  checkNumber,
  historyBefore,
  matchOption,
  secondaryAnswer,
  type Option,
} from '@/onboarding/script';
import { useOnboarding } from '@/state/onboarding';

type Q = 'goal' | 'targetWeightKg' | 'targetWeeks' | 'secondary';
type Done = Record<Q, boolean>;

/** B4 목적 — 주 목적(선택지) → (감량·증량이면) 목표 체중·기간(입력바) → 함께 챙길 것(복수 선택) */
export default function Step4() {
  const draft = useOnboarding((s) => s.draft);
  const reached = useOnboarding((s) => s.reached);
  const set = useOnboarding((s) => s.set);
  const nickname = useNickname();
  const { go, goSoon } = useAdvance(4, '/(onboarding)/step5');

  const primary = draft.primaryGoal;
  const needsTarget = primary === 'lose' || primary === 'gain';
  const order: Q[] = needsTarget ? ['goal', 'targetWeightKg', 'targetWeeks', 'secondary'] : ['goal', 'secondary'];

  const [done, setDone] = useState<Done>(() => ({
    goal: draft.primaryGoal != null,
    targetWeightKg: needsTarget && draft.targetWeightKg != null,
    targetWeeks: needsTarget && draft.targetWeeks != null,
    secondary: reached >= 4,
  }));
  const cur = order.find((q) => !done[q]);
  const [text, setText] = useState('');
  const [miss, setMiss] = useState(false);
  const history = useMemo(() => historyBefore(4, draft, { nickname }), [draft, nickname]);

  const secondaryOptions = SECONDARY_GOALS.filter((g) => g !== primary);
  const chosen = draft.secondaryGoals.filter((g) => g !== primary);

  const prefill = (q: Q | undefined, goal = primary) => {
    const lw = goal === 'lose' || goal === 'gain';
    if (q === 'targetWeightKg' && lw && draft.targetWeightKg != null) return String(draft.targetWeightKg);
    if (q === 'targetWeeks' && lw && draft.targetWeeks != null) return String(draft.targetWeeks);
    return '';
  };

  const pickGoal = (g: Goal) => {
    // 주 목적은 부 목적 목록에서 뺀다 (기존 B4 와 같음)
    set({ primaryGoal: g, secondaryGoals: draft.secondaryGoals.filter((s) => s !== g) });
    setDone((d) => ({ ...d, goal: true }));
    setMiss(false);
    setText(prefill(g === 'lose' || g === 'gain' ? 'targetWeightKg' : undefined, g));
  };

  const toggleSecondary = (g: Goal) => {
    const has = draft.secondaryGoals.includes(g);
    set({ secondaryGoals: has ? draft.secondaryGoals.filter((s) => s !== g) : [...draft.secondaryGoals, g] });
  };

  const finish = () => {
    // 감량·증량이 아니면 목표 체중·기간은 비운다 (기존 B4 와 같음)
    if (!needsTarget) set({ targetWeightKg: undefined, targetWeeks: undefined });
    setDone((d) => ({ ...d, secondary: true }));
    setMiss(false);
    setText('');
    goSoon();
  };

  const field = cur === 'targetWeightKg' || cur === 'targetWeeks' ? cur : undefined;
  const check = field ? checkNumber(field, text, { primaryGoal: primary, weightKg: draft.weightKg }) : undefined;

  const send = () => {
    if (field) {
      if (!check?.valid) return;
      const n = Number(text);
      set(field === 'targetWeightKg' ? { targetWeightKg: n } : { targetWeeks: n });
      setDone((d) => ({ ...d, [field]: true }));
      setText(field === 'targetWeightKg' ? prefill('targetWeeks') : '');
      return;
    }
    if (cur === 'goal') {
      const g = matchOption(text, GOAL_OPTIONS);
      if (g) pickGoal(g);
      else setMiss(true);
      return;
    }
    if (cur === 'secondary') {
      const opts: Option<Goal | 'none'>[] = [...GOAL_OPTIONS.filter((o) => secondaryOptions.includes(o.value)), { value: 'none', label: NO_SECONDARY_LABEL, aliases: ['없어', '없음', '충분', '괜찮'] }];
      const m = matchOption(text, opts);
      if (m === 'none') finish();
      else if (m) {
        if (!draft.secondaryGoals.includes(m)) toggleSecondary(m);
        setText('');
        setMiss(false);
      } else setMiss(true);
    }
  };

  const rewind = (q: Q) => {
    const i = order.indexOf(q);
    setDone((d) => {
      const next = { ...d };
      order.slice(i).forEach((k) => {
        next[k] = false;
      });
      return next;
    });
    setMiss(false);
    setText(prefill(q));
  };

  const shown = cur ? order.slice(0, order.indexOf(cur) + 1) : order;
  const answerOf = (q: Q): string | undefined => {
    if (!done[q]) return undefined;
    if (q === 'goal') return primary ? GOAL_LABEL[primary] : undefined;
    if (q === 'targetWeightKg') return draft.targetWeightKg != null ? answerText('targetWeightKg', draft.targetWeightKg) : undefined;
    if (q === 'targetWeeks') return draft.targetWeeks != null ? answerText('targetWeeks', draft.targetWeeks) : undefined;
    return secondaryAnswer(chosen);
  };

  return (
    <ChatScreen
      header={<ChatHeader step={4} />}
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
            placeholder={field === 'targetWeightKg' ? `예: ${draft.weightKg ? (primary === 'lose' ? draft.weightKg - 4 : draft.weightKg + 4) : 60}` : field === 'targetWeeks' ? '예: 12' : '직접 입력할 수도 있어요'}
            maxLength={field === 'targetWeeks' ? 3 : field ? 5 : 30}
            canSend={field ? !!check?.valid : text.trim().length > 0}
            hint={check?.hint}
          />
        )
      }
    >
      <ChatHistory lines={history} />
      {shown.map((q) => {
        const answer = answerOf(q);
        return (
          <Fragment key={q}>
            <MillySay lines={q === 'goal' ? [SAY.goal, SAY.goalSub] : [SAY[q]]} animate />
            {q === 'goal' && !answer ? <ChoiceList items={GOAL_OPTIONS.map((o) => ({ key: o.value, label: o.label, selected: primary === o.value }))} onSelect={(k) => pickGoal(k as Goal)} /> : null}
            {q === 'secondary' && !answer ? (
              <ChoiceList
                items={[
                  ...secondaryOptions.map((g) => ({ key: g, label: GOAL_LABEL[g], selected: chosen.includes(g) })),
                  chosen.length > 0 ? { key: 'done', label: `이렇게 할게요 (${chosen.length}개)`, primary: true } : { key: 'done', label: NO_SECONDARY_LABEL },
                ]}
                onSelect={(k) => (k === 'done' ? finish() : toggleSecondary(k as Goal))}
              />
            ) : null}
            {answer ? <MeSay text={answer} onPress={() => rewind(q)} animate /> : null}
          </Fragment>
        );
      })}
      {miss ? <MillySay pose="sorry" lines={[SAY.notMatched]} animate /> : null}
    </ChatScreen>
  );
}
