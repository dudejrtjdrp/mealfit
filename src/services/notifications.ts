import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { colors } from '@/theme';

import {
  MEAL_SLOTS,
  REMINDER_ID,
  REMINDER_STORAGE_KEY,
  parseReminderSettings,
  plannedReminders,
  routeForNotificationData,
  type MealReminderSettings,
  type ReminderRoute,
} from './mealReminder';

/**
 * 식사 시간 알림 — 기기 로컬 예약 알림(서버 푸시 아님).
 * "먹기 전에 앱을 열게 하는 유일한 방법"이라 점심·저녁 두 번만 보낸다.
 * 웹은 알림을 예약할 수 없으니 전부 조용히 아무 일도 하지 않는다.
 */

export const remindersSupported = Platform.OS !== 'web';

export type ReminderPermission = 'granted' | 'denied' | 'undetermined';

const CHANNEL_ID = 'meal-reminders';

function toPermission(p: Notifications.NotificationPermissionsStatus): ReminderPermission {
  if (p.granted) return 'granted';
  const ios = p.ios?.status;
  if (ios === Notifications.IosAuthorizationStatus.PROVISIONAL || ios === Notifications.IosAuthorizationStatus.EPHEMERAL) return 'granted';
  if (p.status === 'denied' || !p.canAskAgain) return 'denied';
  return 'undetermined';
}

/** 안드로이드 8+ 는 채널이 있어야 알림이 뜨고, 13+ 는 채널을 만든 뒤에 권한을 물을 수 있다 */
async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: '식사 시간 알림',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: colors.primary,
  });
}

export async function getReminderPermission(): Promise<ReminderPermission> {
  if (!remindersSupported) return 'denied';
  try {
    return toPermission(await Notifications.getPermissionsAsync());
  } catch {
    return 'undetermined';
  }
}

/** 이미 허용이면 그대로, 물을 수 있으면 묻는다. 거부된 상태면 다시 묻지 않고 'denied' */
export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (!remindersSupported) return 'denied';
  try {
    const now = await getReminderPermission();
    if (now !== 'undetermined') return now;
    await ensureChannel();
    return toPermission(
      await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }),
    );
  } catch {
    return 'denied';
  }
}

export async function loadReminderSettings(): Promise<MealReminderSettings> {
  if (!remindersSupported) return parseReminderSettings(null);
  try {
    return parseReminderSettings(await AsyncStorage.getItem(REMINDER_STORAGE_KEY));
  } catch {
    return parseReminderSettings(null);
  }
}

async function cancelOurs(): Promise<void> {
  await Promise.all(MEAL_SLOTS.map((slot) => Notifications.cancelScheduledNotificationAsync(REMINDER_ID[slot]).catch(() => {})));
}

/** 설정대로 매일 반복 알림을 다시 건다 (같은 id 라 여러 번 불러도 중복되지 않음). 권한이 없으면 걸지 않는다 */
export async function applyMealReminders(s: MealReminderSettings): Promise<void> {
  if (!remindersSupported) return;
  try {
    await cancelOurs();
    const plan = plannedReminders(s);
    if (plan.length === 0) return;
    if ((await getReminderPermission()) !== 'granted') return;
    await ensureChannel();
    for (const r of plan) {
      await Notifications.scheduleNotificationAsync({
        identifier: r.id,
        content: { title: r.title, body: r.body, data: r.data, sound: true },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: r.hour,
          minute: r.minute,
          channelId: CHANNEL_ID,
        },
      });
    }
  } catch {
    // 예약 실패는 조용히 — 설정 화면은 저장된 값대로 보이고, 다음 앱 시작 때 다시 건다
  }
}

/** 저장 + 예약 반영 */
export async function saveReminderSettings(s: MealReminderSettings): Promise<void> {
  if (!remindersSupported) return;
  try {
    await AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // 저장 실패해도 예약은 반영한다
  }
  await applyMealReminders(s);
}

/** 앱 시작 때 한 번: 저장된 설정대로 다시 건다 (업데이트·권한 변경 뒤에도 맞춰지게) */
export async function syncMealReminders(): Promise<void> {
  if (!remindersSupported) return;
  await applyMealReminders(await loadReminderSettings());
}

/** 로그아웃·탈퇴·이 기기 데이터 지우기: 예약을 모두 취소하고 스위치도 끈다 (다음 사람이 직접 켠다) */
export async function clearMealReminders(): Promise<void> {
  if (!remindersSupported) return;
  try {
    await cancelOurs();
    await AsyncStorage.removeItem(REMINDER_STORAGE_KEY);
  } catch {
    // 조용히
  }
}

let handlerSet = false;

/** 앱을 보고 있을 때 온 알림도 배너로 보여준다 (소리·배지 없이) */
export function initNotifications(): void {
  if (!remindersSupported || handlerSet) return;
  handlerSet = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
  } catch {
    // 조용히
  }
}

/**
 * 식사 알림을 눌렀을 때 갈 곳을 알려준다. 앱이 떠 있는 동안 누른 경우만 —
 * 꺼진 상태에서 눌러 열면 진입 게이트가 이미 오늘 탭으로 보낸다.
 */
export function addReminderTapListener(onRoute: (route: ReminderRoute) => void): () => void {
  if (!remindersSupported) return () => {};
  try {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const route = routeForNotificationData(res.notification.request.content.data);
      if (route) onRoute(route);
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
