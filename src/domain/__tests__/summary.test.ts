import { afterEating, overKcalText, overToastSuffix, remainingMessage, summarizeDay } from '../summary';
import { log, TARGETS } from './fixtures';

const BANNED = ['제한', '초과', '남은 할당량', '금지', '나쁨', '위험'];

describe('summarizeDay', () => {
  it('기록이 없으면 empty, 여유는 목표 그대로', () => {
    const s = summarizeDay('2026-09-15', [], TARGETS);
    expect(s.status).toBe('empty');
    expect(s.remaining.kcal).toBe(1800);
    expect(s.consumed).toEqual({ kcal: 0 });
    expect(s.over).toEqual({});
  });

  it('합산: undefined 영양소는 제외', () => {
    const s = summarizeDay(
      '2026-09-15',
      [log({ id: 'a', nutrients: { kcal: 500, protein: 20 } }), log({ id: 'b', nutrients: { kcal: 458, sugar: 10 } })],
      TARGETS,
    );
    expect(s.status).toBe('room');
    expect(s.consumed).toEqual({ kcal: 958, protein: 20, sugar: 10 });
    expect(s.consumed.carbs).toBeUndefined();
    expect(s.remaining.kcal).toBe(842);
    expect(s.remaining.protein).toBe(70);
    expect(s.remaining.carbs).toBe(225);
  });

  it('80% 이상이면 almost, 넘기면 over (remaining 은 0 하한)', () => {
    expect(summarizeDay('d', [log({ id: 'a', nutrients: { kcal: 1440 } })], TARGETS).status).toBe('almost');
    const over = summarizeDay('d', [log({ id: 'a', nutrients: { kcal: 2000, sodium: 2500 } })], TARGETS);
    expect(over.status).toBe('over');
    expect(over.remaining.kcal).toBe(0);
    expect(over.remaining.sodium).toBe(0);
  });

  it('목표를 넘은 양을 영양소별로 싣는다 (양수만, 단백질 제외)', () => {
    const s = summarizeDay(
      'd',
      [log({ id: 'a', nutrients: { kcal: 2120, carbs: 200, protein: 130, fat: 72.4, sugar: 45, sodium: 2400 } })],
      TARGETS,
    );
    expect(s.over).toEqual({ kcal: 320, fat: 12.4, sodium: 400 });
    // 단백질은 목표(90)를 넘어도 초과로 치지 않는다 — 많을수록 좋은 쪽
    expect('protein' in s.over).toBe(false);
    // 딱 목표만큼(당 45)은 넘은 게 아니다
    expect(s.over.sugar).toBeUndefined();
    // remaining 은 판정 엔진용이라 계속 0 하한
    expect(s.remaining.kcal).toBe(0);
    expect(s.remaining.fat).toBe(0);
  });

  it('넘지 않았으면 over 는 비어 있다', () => {
    expect(summarizeDay('d', [log({ id: 'a', nutrients: { kcal: 1800, fat: 20 } })], TARGETS).over).toEqual({});
  });
});

describe('remainingMessage', () => {
  it('상태별 허용의 언어 문구', () => {
    const room = summarizeDay('d', [log({ id: 'a', nutrients: { kcal: 958 } })], TARGETS);
    expect(remainingMessage(room)).toEqual({ title: '지금도 여유가 있어요', sub: '842 kcal 더 드실 수 있어요' });
    expect(remainingMessage(summarizeDay('d', [], TARGETS))).toEqual({
      title: '오늘의 첫 끼를 기다리고 있어요',
      sub: '1,800 kcal 드실 수 있어요',
    });
    expect(remainingMessage(summarizeDay('d', [log({ id: 'a', nutrients: { kcal: 1500 } })], TARGETS))).toEqual({
      title: '오늘 거의 다 채웠어요',
      sub: '가볍게 마무리해도 좋아요',
    });
    // 넘었으면 넘은 양을 숨기지 않고 사실로 말한다 (2026-09-25 효님 결정)
    expect(remainingMessage(summarizeDay('d', [log({ id: 'a', nutrients: { kcal: 2120 } })], TARGETS))).toEqual({
      title: '목표보다 320kcal 더 드셨어요',
      sub: '내일 다시 채워져요',
    });
    expect(overKcalText(1234)).toBe('목표보다 1,234kcal 더 드셨어요');
  });

  it('금지어가 없다', () => {
    for (const kcal of [0, 500, 1500, 3000]) {
      const logs = kcal ? [log({ id: 'a', nutrients: { kcal } })] : [];
      const m = remainingMessage(summarizeDay('d', logs, TARGETS));
      for (const w of BANNED) expect(`${m.title} ${m.sub}`).not.toContain(w);
    }
  });
});

describe('afterEating (메뉴 상세 "먹으면 …")', () => {
  it('목표 안이면 남는 양', () => {
    expect(afterEating(958, 1800, 484)).toEqual({ kind: 'left', left: 358, text: '먹으면 358kcal 남아요' });
    expect(afterEating(1300, 1800, 500)).toMatchObject({ kind: 'left', left: 0 });
  });

  it('이번에 목표를 넘기면 넘는 양', () => {
    expect(afterEating(1500, 1800, 420)).toEqual({ kind: 'crosses', overBy: 120, text: '먹으면 목표보다 120kcal 넘어요' });
  });

  it('이미 넘었으면 지금 넘은 양 + 이 메뉴가 더할 양', () => {
    expect(afterEating(2120, 1800, 450)).toEqual({
      kind: 'already',
      alreadyOver: 320,
      adds: 450,
      text: '이미 목표보다 320kcal 더 드셨어요 · 먹으면 +450kcal',
    });
  });
});

describe('overToastSuffix (기록 직후 토스트)', () => {
  it('기록 뒤 목표를 넘었으면 넘은 양을 덧붙인다', () => {
    expect(overToastSuffix(summarizeDay('d', [log({ id: 'a', nutrients: { kcal: 1920 } })], TARGETS))).toBe(' · 오늘 목표보다 120kcal 넘었어요');
    expect(overToastSuffix(summarizeDay('d', [log({ id: 'a', nutrients: { kcal: 1800 } })], TARGETS))).toBe('');
    expect(overToastSuffix(null)).toBe('');
  });

  it('넘은 양 문구에도 금지어가 없다', () => {
    const texts = [overKcalText(320), afterEating(1500, 1800, 420).text, afterEating(2120, 1800, 450).text, overToastSuffix({ over: { kcal: 120 } })];
    for (const t of texts) for (const w of BANNED) expect(t).not.toContain(w);
  });
});
