/**
 * 식사 시간 알림 — 순수 부분 (React·expo 의존 없음, jest 테스트 대상).
 * 기기 로컬 예약 알림만 쓴다(서버 푸시 아님). 실제 예약·권한은 services/notifications.ts.
 */

export type MealSlot = 'lunch' | 'dinner';

export interface SlotSetting {
  on: boolean;
  hour: number;
  minute: number;
}

export interface MealReminderSettings {
  /** 전체 스위치 — 기본 꺼짐 (사용자가 직접 켠다) */
  enabled: boolean;
  lunch: SlotSetting;
  dinner: SlotSetting;
}

export const MEAL_SLOTS: MealSlot[] = ['lunch', 'dinner'];

export const SLOT_LABEL: Record<MealSlot, string> = { lunch: '점심', dinner: '저녁' };

/** 점심 11:40 · 저녁 17:40 — 줄 서기 전, 뭘 먹을지 정하기 직전 */
export const DEFAULT_REMINDER_SETTINGS: MealReminderSettings = {
  enabled: false,
  lunch: { on: true, hour: 11, minute: 40 },
  dinner: { on: true, hour: 17, minute: 40 },
};

export const REMINDER_STORAGE_KEY = 'mealfit.mealReminders.v1';

/** 예약 알림 식별자 — 같은 id 로 다시 예약하면 덮어써져 중복되지 않는다 */
export const REMINDER_ID: Record<MealSlot, string> = { lunch: 'meal-reminder-lunch', dinner: 'meal-reminder-dinner' };

/** 알림 data.kind — 누르면 밀리 탭으로 (밀리가 끼니 메뉴를 골라 두는 곳 — 알림 문구와 같은 화면) */
export const REMINDER_KIND = 'meal-reminder';
export const REMINDER_ROUTE = '/(tabs)/milly' as const;
export type ReminderRoute = typeof REMINDER_ROUTE;

/** 허용의 언어·해요체. 계산하지 않은 숫자("N개")는 쓰지 않는다 */
export const REMINDER_COPY: Record<MealSlot, { title: string; body: string }> = {
  lunch: { title: '점심 뭐 드실지 고민되면', body: '밀리가 근처에서 지금 먹기 좋은 점심 메뉴를 골라 뒀어요' },
  dinner: { title: '저녁 뭐 드실지 고민되면', body: '밀리가 오늘 드신 걸 보고 저녁 메뉴를 골라 뒀어요' },
};

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

function parseSlot(v: unknown, fallback: SlotSetting): SlotSetting {
  if (!v || typeof v !== 'object') return { ...fallback };
  const o = v as Record<string, unknown>;
  const timeOk = isInt(o.hour, 0, 23) && isInt(o.minute, 0, 59);
  return {
    on: typeof o.on === 'boolean' ? o.on : fallback.on,
    hour: timeOk ? (o.hour as number) : fallback.hour,
    minute: timeOk ? (o.minute as number) : fallback.minute,
  };
}

/** 저장된 JSON → 설정. 깨졌거나 없으면 기본값(꺼짐) */
export function parseReminderSettings(raw: string | null | undefined): MealReminderSettings {
  if (!raw) return cloneDefaults();
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return cloneDefaults();
  }
  if (!v || typeof v !== 'object') return cloneDefaults();
  const o = v as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    lunch: parseSlot(o.lunch, DEFAULT_REMINDER_SETTINGS.lunch),
    dinner: parseSlot(o.dinner, DEFAULT_REMINDER_SETTINGS.dinner),
  };
}

function cloneDefaults(): MealReminderSettings {
  const d = DEFAULT_REMINDER_SETTINGS;
  return { enabled: d.enabled, lunch: { ...d.lunch }, dinner: { ...d.dinner } };
}

export interface PlannedReminder {
  id: string;
  slot: MealSlot;
  hour: number;
  minute: number;
  title: string;
  body: string;
  data: { kind: typeof REMINDER_KIND; slot: MealSlot; url: typeof REMINDER_ROUTE };
}

/** 지금 설정으로 매일 예약해야 할 알림 목록 (전체가 꺼져 있으면 빈 목록) */
export function plannedReminders(s: MealReminderSettings): PlannedReminder[] {
  if (!s.enabled) return [];
  return MEAL_SLOTS.filter((slot) => s[slot].on).map((slot) => ({
    id: REMINDER_ID[slot],
    slot,
    hour: s[slot].hour,
    minute: s[slot].minute,
    ...REMINDER_COPY[slot],
    data: { kind: REMINDER_KIND, slot, url: REMINDER_ROUTE },
  }));
}

/** 11:40 → "오전 11:40", 17:40 → "오후 5:40", 0:05 → "오전 12:05" */
export function formatClock(hour: number, minute: number): string {
  const ampm = hour < 12 ? '오전' : '오후';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${ampm} ${h12}:${String(minute).padStart(2, '0')}`;
}

/** 알림을 눌렀을 때 갈 곳 — 우리 식사 알림이면 밀리 탭, 아니면 null */
export function routeForNotificationData(data: unknown): typeof REMINDER_ROUTE | null {
  if (!data || typeof data !== 'object') return null;
  return (data as Record<string, unknown>).kind === REMINDER_KIND ? REMINDER_ROUTE : null;
}
