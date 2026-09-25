jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// 이 모듈을 넣기 전 네이티브 빌드: import 하는 순간 "Cannot find native module" 로 던진다
jest.mock('expo-notifications', () => {
  throw new Error("Cannot find native module 'ExpoNotificationsEmitter'");
});

describe('expo-notifications 네이티브 모듈이 없는 빌드', () => {
  beforeEach(() => jest.spyOn(console, 'warn').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it('불러와도 던지지 않고 알림 기능 전체가 조용히 꺼진다', async () => {
    let api!: typeof import('../notifications');
    expect(() => {
      api = require('../notifications');
    }).not.toThrow();
    expect(api.remindersSupported).toBe(false);
    expect(() => api.initNotifications()).not.toThrow();
    const unsubscribe = api.addReminderTapListener(() => {});
    expect(() => unsubscribe()).not.toThrow();
    await expect(api.syncMealReminders()).resolves.toBeUndefined();
    await expect(api.clearMealReminders()).resolves.toBeUndefined();
    await expect(api.requestReminderPermission()).resolves.toBe('denied');
  });
});
