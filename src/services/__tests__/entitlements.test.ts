import { DEV_UNLOCK_ALL, PREMIUM_FEATURES, isPremiumFeatureEnabled } from '../entitlements';

describe('entitlements', () => {
  it('개발 중에는 프리미엄 예정 기능이 전부 열려 있다', () => {
    expect(DEV_UNLOCK_ALL).toBe(true);
    expect(isPremiumFeatureEnabled('aiPhoto')).toBe(true);
    expect(isPremiumFeatureEnabled('assistantRequests')).toBe(true);
  });

  it('프리미엄 예정 목록에 두 기능이 다 있다', () => {
    expect(PREMIUM_FEATURES.map((f) => f.id).sort()).toEqual(['aiPhoto', 'assistantRequests']);
  });
});
