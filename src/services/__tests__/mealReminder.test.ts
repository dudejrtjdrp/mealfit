import {
  DEFAULT_REMINDER_SETTINGS,
  REMINDER_COPY,
  REMINDER_ID,
  REMINDER_ROUTE,
  formatClock,
  parseReminderSettings,
  plannedReminders,
  routeForNotificationData,
  type MealReminderSettings,
} from '../mealReminder';

const on = (patch: Partial<MealReminderSettings> = {}): MealReminderSettings => ({
  ...parseReminderSettings(null),
  enabled: true,
  ...patch,
});

describe('parseReminderSettings', () => {
  it('없거나 깨졌으면 기본값 — 전체 꺼짐, 점심 11:40·저녁 17:40', () => {
    for (const raw of [null, undefined, '', '{', 'null', '3', '"x"']) {
      const s = parseReminderSettings(raw);
      expect(s).toEqual(DEFAULT_REMINDER_SETTINGS);
      expect(s.enabled).toBe(false);
    }
    expect(DEFAULT_REMINDER_SETTINGS.lunch).toMatchObject({ hour: 11, minute: 40 });
    expect(DEFAULT_REMINDER_SETTINGS.dinner).toMatchObject({ hour: 17, minute: 40 });
  });

  it('기본값 객체를 공유하지 않는다 (고쳐도 기본값이 바뀌지 않음)', () => {
    const s = parseReminderSettings(null);
    s.lunch.hour = 9;
    expect(DEFAULT_REMINDER_SETTINGS.lunch.hour).toBe(11);
  });

  it('저장값을 그대로 읽고, 이상한 시간은 기본 시간으로', () => {
    const s = parseReminderSettings(
      JSON.stringify({ enabled: true, lunch: { on: false, hour: 12, minute: 5 }, dinner: { on: true, hour: 25, minute: 0 } }),
    );
    expect(s).toEqual({ enabled: true, lunch: { on: false, hour: 12, minute: 5 }, dinner: { on: true, hour: 17, minute: 40 } });
  });

  it('enabled 는 true 일 때만 켜짐', () => {
    expect(parseReminderSettings(JSON.stringify({ enabled: 'yes' })).enabled).toBe(false);
  });
});

describe('plannedReminders', () => {
  it('전체가 꺼져 있으면 아무것도 예약하지 않는다', () => {
    expect(plannedReminders(DEFAULT_REMINDER_SETTINGS)).toEqual([]);
  });

  it('켜면 점심·저녁 두 개, 누르면 오늘 탭', () => {
    const list = plannedReminders(on());
    expect(list.map((r) => [r.id, r.hour, r.minute])).toEqual([
      [REMINDER_ID.lunch, 11, 40],
      [REMINDER_ID.dinner, 17, 40],
    ]);
    for (const r of list) expect(routeForNotificationData(r.data)).toBe(REMINDER_ROUTE);
    expect(list[0].title).toBe('점심 뭐 드실지 고민되면');
    expect(list[0].body).toBe('근처에서 지금 먹기 좋은 메뉴를 골라뒀어요');
  });

  it('끼니별로 끌 수 있다', () => {
    const s = on();
    s.lunch.on = false;
    expect(plannedReminders(s).map((r) => r.slot)).toEqual(['dinner']);
  });
});

describe('문구', () => {
  it('계산하지 않은 숫자·금지어를 쓰지 않는다', () => {
    for (const { title, body } of Object.values(REMINDER_COPY)) {
      const text = title + body;
      expect(text).not.toMatch(/\d/);
      expect(text).not.toMatch(/제한|초과|금지|나쁨|위험|다이어트/);
      expect(body).toMatch(/요$/);
    }
  });
});

describe('formatClock', () => {
  it('오전/오후 12시간제', () => {
    expect(formatClock(11, 40)).toBe('오전 11:40');
    expect(formatClock(17, 40)).toBe('오후 5:40');
    expect(formatClock(12, 0)).toBe('오후 12:00');
    expect(formatClock(0, 5)).toBe('오전 12:05');
  });
});

describe('routeForNotificationData', () => {
  it('식사 알림만 오늘 탭으로', () => {
    expect(routeForNotificationData({ kind: 'meal-reminder' })).toBe('/(tabs)/today');
    expect(routeForNotificationData({ kind: 'other' })).toBeNull();
    expect(routeForNotificationData(null)).toBeNull();
    expect(routeForNotificationData('meal-reminder')).toBeNull();
  });
});
