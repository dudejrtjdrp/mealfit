import type * as NativeApi from './notifications';
import { parseReminderSettings } from './mealReminder';

/**
 * 웹: 로컬 예약 알림이 없으니 전부 조용히 no-op.
 * expo-notifications 를 아예 번들하지 않으려고 따로 둔다 (웹에서 import 만 해도 콘솔 경고가 난다).
 * 네이티브 파일과 같은 모양인지는 타입으로 확인한다.
 */
const api: typeof NativeApi = {
  remindersSupported: false,
  getReminderPermission: async () => 'denied',
  requestReminderPermission: async () => 'denied',
  loadReminderSettings: async () => parseReminderSettings(null),
  applyMealReminders: async () => {},
  saveReminderSettings: async () => {},
  syncMealReminders: async () => {},
  clearMealReminders: async () => {},
  initNotifications: () => {},
  addReminderTapListener: () => () => {},
};

export const {
  remindersSupported,
  getReminderPermission,
  requestReminderPermission,
  loadReminderSettings,
  applyMealReminders,
  saveReminderSettings,
  syncMealReminders,
  clearMealReminders,
  initNotifications,
  addReminderTapListener,
} = api;

export type { ReminderPermission } from './notifications';
