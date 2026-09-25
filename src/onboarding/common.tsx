import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { MeSay, MillySay } from '@/components';
import { useOnboarding } from '@/state/onboarding';
import { useSession } from '@/state/session';

import { DEFAULT_NICKNAME, groupLines, historyBefore, type ChatLine } from './script';

/** 지난 단계 대화 — 이번 화면 위에 그대로 쌓아 둔다 (애니메이션 없이) */
export function ChatHistory({ lines }: { lines: ChatLine[] }) {
  return (
    <>
      {groupLines(lines).map((g) =>
        g[0].from === 'milly' ? <MillySay key={g[0].id} lines={g.map((l) => l.text)} /> : g.map((l) => <MeSay key={l.id} text={l.text} />),
      )}
    </>
  );
}

/** 로그인 세션 이름 (기본값 "회원"이면 없음) — 이름을 묻기 전 첫인사에 쓴다 */
export function useGreetName(): string | undefined {
  const n = useSession((s) => s.session?.nickname);
  return n && n !== DEFAULT_NICKNAME ? n : undefined;
}

/** 부를 이름: B1 에서 답한 이름 → 없으면(건너뜀·아직) 로그인 세션 이름 */
export function useNickname(): string | undefined {
  const fromDraft = useOnboarding((s) => s.draft.nickname?.trim());
  const greet = useGreetName();
  return fromDraft || greet;
}

/** step 번째 화면 위에 쌓을 지난 대화 */
export function useHistory(step: number): ChatLine[] {
  const draft = useOnboarding((s) => s.draft);
  const nickname = useNickname();
  const greetName = useGreetName();
  return useMemo(() => historyBefore(step, draft, { nickname, greetName }), [step, draft, nickname, greetName]);
}

/**
 * 단계를 마치면 다음 화면으로. 답을 막 끝냈을 때는 말풍선이 보이도록 잠깐 뒤에 넘어가고(auto),
 * 이미 답해 둔 단계로 돌아왔을 때는 하단 "다음" 버튼으로 넘어간다.
 */
export function useAdvance(step: number, next: Href) {
  const markReached = useOnboarding((s) => s.markReached);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moving = useRef(false);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const go = useCallback(() => {
    if (moving.current) return;
    moving.current = true;
    markReached(step);
    router.push(next);
    // 돌아왔을 때 다시 넘어갈 수 있게
    setTimeout(() => {
      moving.current = false;
    }, 600);
  }, [markReached, next, step]);
  const goSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(go, 550);
  }, [go]);
  return { go, goSoon };
}
