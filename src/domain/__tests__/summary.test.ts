import { remainingMessage, summarizeDay } from '../summary';
import { log, TARGETS } from './fixtures';

const BANNED = ['제한', '초과', '남은 할당량', '금지', '나쁨', '위험'];

describe('summarizeDay', () => {
  it('기록이 없으면 empty, 여유는 목표 그대로', () => {
    const s = summarizeDay('2026-09-15', [], TARGETS);
    expect(s.status).toBe('empty');
    expect(s.remaining.kcal).toBe(1800);
    expect(s.consumed).toEqual({ kcal: 0 });
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
    expect(remainingMessage(summarizeDay('d', [log({ id: 'a', nutrients: { kcal: 2500 } })], TARGETS))).toEqual({
      title: '오늘은 여기까지',
      sub: '내일 다시 채워져요',
    });
  });

  it('금지어가 없다', () => {
    for (const kcal of [0, 500, 1500, 3000]) {
      const logs = kcal ? [log({ id: 'a', nutrients: { kcal } })] : [];
      const m = remainingMessage(summarizeDay('d', logs, TARGETS));
      for (const w of BANNED) expect(`${m.title} ${m.sub}`).not.toContain(w);
    }
  });
});
