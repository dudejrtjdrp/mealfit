import { Redirect } from 'expo-router';

/** 진입 게이트 — 프로필/온보딩 상태에 따라 분기 (구현은 state/profile 연결 후) */
export default function Index() {
  return <Redirect href="/login" />;
}
