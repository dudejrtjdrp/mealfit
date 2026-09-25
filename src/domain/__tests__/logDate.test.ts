import { clampLogDate, dateLabel, editedLogTime, logTimeFor, parseDateKey, recentDateChoices, recordedText } from '../logDate';
import { toDateKey } from '../summary';

// 2026-09-26(토) 13:05 로컬
const NOW = new Date(2026, 8, 26, 13, 5);

describe('logDate', () => {
  it('parseDateKey: 형식·실재하지 않는 날짜는 null', () => {
    expect(toDateKey(parseDateKey('2026-09-20')!)).toBe('2026-09-20');
    expect(parseDateKey('2026-02-30')).toBeNull();
    expect(parseDateKey('2026-9-2')).toBeNull();
    expect(parseDateKey(undefined)).toBeNull();
  });

  it('clampLogDate: 미래·잘못된 값은 오늘, 지난 날은 그대로', () => {
    expect(clampLogDate('2026-09-20', NOW)).toBe('2026-09-20');
    expect(clampLogDate('2026-09-27', NOW)).toBe('2026-09-26');
    expect(clampLogDate('어제', NOW)).toBe('2026-09-26');
    expect(clampLogDate(undefined, NOW)).toBe('2026-09-26');
  });

  it('dateLabel: 오늘·어제·그제·월일, 해가 다르면 연도까지', () => {
    expect(dateLabel('2026-09-26', NOW)).toBe('오늘');
    expect(dateLabel('2026-09-25', NOW)).toBe('어제');
    expect(dateLabel('2026-09-24', NOW)).toBe('그제');
    expect(dateLabel('2026-09-20', NOW)).toBe('9월 20일');
    expect(dateLabel('2025-12-30', NOW)).toBe('2025년 12월 30일');
    // 월이 바뀌는 경계
    expect(dateLabel('2026-09-30', new Date(2026, 9, 1, 9))).toBe('어제');
  });

  it('recentDateChoices: 오늘·어제·그제 + 넘긴 지난 날짜, 미래는 빼고 중복 없이', () => {
    expect(recentDateChoices(NOW).map((c) => c.label)).toEqual(['오늘', '어제', '그제']);
    expect(recentDateChoices(NOW, '2026-09-20').map((c) => c.key)).toEqual(['2026-09-26', '2026-09-25', '2026-09-24', '2026-09-20']);
    expect(recentDateChoices(NOW, '2026-09-25')).toHaveLength(3);
    expect(recentDateChoices(NOW, '2026-09-28')).toHaveLength(3);
  });

  it('logTimeFor: 오늘은 지금, 지난 날은 끼니 시각', () => {
    expect(logTimeFor('2026-09-26', 'dinner', NOW).getTime()).toBe(NOW.getTime());
    expect(logTimeFor('2026-09-26', 'dinner', NOW, 2).getTime()).toBe(NOW.getTime() + 2);
    const b = logTimeFor('2026-09-25', 'breakfast', NOW);
    expect([toDateKey(b), b.getHours(), b.getMinutes()]).toEqual(['2026-09-25', 8, 0]);
    const l = logTimeFor('2026-09-25', 'lunch', NOW);
    expect([l.getHours(), l.getMinutes()]).toEqual([12, 30]);
    const d = logTimeFor('2026-09-24', 'dinner', NOW);
    expect([d.getHours(), d.getMinutes()]).toEqual([18, 30]);
    const s = logTimeFor('2026-09-24', 'snack', NOW);
    expect([s.getHours(), s.getMinutes()]).toEqual([15, 30]);
  });

  it('editedLogTime: 날짜가 바뀌거나 지난 날 끼니가 바뀌면 끼니 시각, 오늘 끼니만 바꾸면 그대로', () => {
    const today = { date: '2026-09-26', mealType: 'lunch' as const, time: '2026-09-26T03:00:00.000Z' };
    expect(editedLogTime(today, { date: '2026-09-26', mealType: 'lunch' }, NOW)).toBe(today.time);
    expect(editedLogTime(today, { date: '2026-09-26', mealType: 'dinner' }, NOW)).toBe(today.time);
    const moved = new Date(editedLogTime(today, { date: '2026-09-25', mealType: 'dinner' }, NOW));
    expect([toDateKey(moved), moved.getHours(), moved.getMinutes()]).toEqual(['2026-09-25', 18, 30]);
    const past = { date: '2026-09-24', mealType: 'lunch' as const, time: new Date(2026, 8, 24, 12, 30).toISOString() };
    const re = new Date(editedLogTime(past, { date: '2026-09-24', mealType: 'breakfast' }, NOW));
    expect([toDateKey(re), re.getHours()]).toEqual(['2026-09-24', 8]);
    // 지난 날 → 오늘로 옮기면 지금
    expect(editedLogTime(past, { date: '2026-09-26', mealType: 'lunch' }, NOW)).toBe(NOW.toISOString());
  });

  it('recordedText: 오늘은 끼니만, 지난 날은 날짜를 앞에', () => {
    expect(recordedText('2026-09-26', 'lunch', 1, NOW)).toBe('점심으로 기록했어요');
    expect(recordedText('2026-09-25', 'lunch', 1, NOW)).toBe('어제 점심으로 기록했어요');
    expect(recordedText('2026-09-20', 'dinner', 3, NOW)).toBe('9월 20일 저녁으로 3개 기록했어요');
  });
});

describe('recentDateChoices 여러 개', () => {
  it('넘긴 지난 날짜 여러 개를 최근 순으로, 중복 없이', () => {
    expect(recentDateChoices(NOW, ['2026-09-18', '2026-09-20', '2026-09-20', undefined, '2026-09-26']).map((c) => c.label)).toEqual(['오늘', '어제', '그제', '9월 20일', '9월 18일']);
  });
});
