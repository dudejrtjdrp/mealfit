import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { colors } from '@/theme';

/**
 * OAuth 콜백 착지점 (mealfit://auth?code=... / #access_token=...)
 * - iOS: ASWebAuthenticationSession 이 URL 을 가로채 login 화면이 직접 처리하므로 여기로 오지 않는다
 * - Android: Custom Tabs 에서 돌아올 때 딥링크가 라우터에도 전달돼 이 화면이 한 번 열린다 → 바로 뒤로(로그인 화면)
 * 세션 생성은 services/auth.ts 의 oauthSignIn 이 맡는다.
 */
export default function AuthCallback() {
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (router.canGoBack()) router.back();
    else setFallback(true);
  }, []);

  if (fallback) return <Redirect href="/" />;
  return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
}
