import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Input, MillyAvatar, RichText, Screen, StackHeader, Text, showToast } from '@/components';
import { DEFAULT_NICKNAME } from '@/onboarding/script';
import { isAppleSignInAvailable, PASSWORD_MIN } from '@/services/auth';
import { reloadAfterLogin } from '@/state/bootstrap';
import { useOnboarding } from '@/state/onboarding';
import { useProfile } from '@/state/profile';
import { type AuthProvider, type AuthResult, useSession } from '@/state/session';
import { colors, radius, spacing } from '@/theme';

const PROVIDER_TITLE: Record<AuthProvider, string> = {
  kakao: '카카오로 시작',
  apple: 'Apple로 계속',
  google: 'Google로 계속',
  email: '이메일로 시작',
};

/**
 * 어디서 열렸나
 * - onboarding: 온보딩·첫 판정 체험을 마친 뒤 권유 (뒤로 가기 없음, "나중에 할게요" → 오늘 탭)
 * - returning: 온보딩 첫 화면의 "이미 계정이 있어요" (뒤로 가면 온보딩)
 * - 그 밖(마이·설정 등): 게스트가 연 로그인 (뒤로 가기 · "나중에 할게요" → 뒤로)
 */
type From = 'onboarding' | 'returning' | 'other';

const toFrom = (v: string | string[] | undefined): From => (v === 'onboarding' || v === 'returning' ? v : 'other');

const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

function goToday() {
  useOnboarding.getState().reset();
  if (router.canDismiss()) router.dismissAll();
  router.replace('/(tabs)/today');
}

/**
 * 로그인 뒤: 계정 저장소 기준으로 프로필·오늘 기록을 다시 읽는다(로컬 데이터는 로그인 때 이미 옮겨졌다).
 * 프로필이 있으면(재방문·방금 온보딩) 오늘 탭, 없으면 온보딩을 이어간다. 계정 프로필을 못 읽었으면 진입 게이트로.
 */
async function routeAfterLogin(from: From) {
  const { profile, loaded } = await reloadAfterLogin();
  if (!loaded) {
    // 계정 정보를 못 읽었다 — 온보딩으로 보내면 새로 만든 프로필이 계정 것을 덮을 수 있어 진입 게이트(다시 시도)로
    useOnboarding.getState().reset();
    if (router.canDismiss()) router.dismissAll();
    return router.replace('/');
  }
  if (profile?.onboardingDone) return goToday();
  if (from === 'returning' && router.canGoBack()) return router.back();
  router.replace('/(onboarding)/step1');
}

const COPY: Record<From, { headline: string; bubble: string }> = {
  onboarding: { headline: '지금까지 기록을\n**안전하게** 저장해 둘게요', bubble: '방금 정한 목표와\n앞으로의 기록을 지켜드릴게요.' },
  returning: { headline: '다시 만나서 반가워요\n**로그인**하고 이어서 써요', bubble: '계정에 있는 목표와\n기록을 불러올게요.' },
  other: { headline: '기록을 **안전하게**\n저장해 둘게요', bubble: '로그인하면 기록이\n계정에 남아요.' },
};

/**
 * A2 로그인 — 온보딩 뒤 권유 화면 겸 로그인. 해요체 헤드라인 · 밀리 · 로그인 버튼 · "나중에 할게요"
 * - Supabase 미설정: 버튼 모두 닉네임 시트 → 이 기기에 세션 저장 (기록은 계속 이 기기에만)
 * - Supabase 설정: 카카오·Google 은 OAuth(시스템 브라우저), Apple 은 iOS 네이티브 시트 → signInWithIdToken,
 *   이메일은 이메일+비밀번호 가입/로그인 시트. 로그인하면 이 기기 데이터가 계정으로 옮겨진다(session.activate)
 * - 버튼 순서: 카카오 → Apple(iOS 에서만) → Google → 이메일
 */
export default function LoginScreen() {
  const from = toFrom(useLocalSearchParams<{ from?: string }>().from);
  const mode = useSession((s) => s.mode);
  const profileName = useProfile((s) => s.profile?.nickname);
  const signIn = useSession((s) => s.signIn);
  const signUpEmail = useSession((s) => s.signUpEmail);
  const signInEmail = useSession((s) => s.signInEmail);
  const signInOAuth = useSession((s) => s.signInOAuth);
  const signInApple = useSession((s) => s.signInApple);
  const cloud = mode === 'supabase';

  const [provider, setProvider] = useState<AuthProvider | null>(null);
  const [nickname, setNickname] = useState(profileName && profileName !== DEFAULT_NICKNAME ? profileName : '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  /** Supabase 이메일 시트: 가입 / 로그인 (기존 사용자로 들어왔으면 로그인부터) */
  const [emailMode, setEmailMode] = useState<'signup' | 'signin'>(from === 'returning' ? 'signin' : 'signup');
  const [notice, setNotice] = useState<string | null>(null);
  /** 실패 원인 한 줄 (에러 이름·메시지 앞부분) — 토스트는 금방 사라지므로 캡션으로 남겨 스크린샷으로 원인을 특정한다 */
  const [failDetail, setFailDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<'kakao' | 'apple' | 'google' | null>(null);
  /** Sign in with Apple 은 iOS 에서만 (Android·웹은 버튼 숨김) */
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    let alive = true;
    void isAppleSignInAvailable().then((ok) => {
      if (alive) setAppleAvailable(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordOk = password.length >= PASSWORD_MIN;
  const cloudEmail = cloud && provider === 'email';
  const canStart = cloudEmail
    ? emailOk && passwordOk && (emailMode === 'signin' || nickname.trim().length > 0)
    : nickname.trim().length > 0 && (provider !== 'email' || emailOk);

  const openSheet = (p: AuthProvider) => {
    setNotice(null);
    setFailDetail(null);
    setProvider(p);
  };

  const onSocial = async (p: 'kakao' | 'apple' | 'google') => {
    if (!cloud) return openSheet(p);
    if (oauthBusy) return;
    setOauthBusy(p);
    setFailDetail(null);
    const res = p === 'apple' ? await signInApple() : await signInOAuth(p);
    setOauthBusy(null);
    if (res.ok) return routeAfterLogin(from);
    if (res.cancelled) return;
    showToast(res.message, 'info');
    setFailDetail(res.detail ?? null);
  };

  const start = async () => {
    if (!provider || !canStart) return;
    setBusy(true);
    setFailDetail(null);
    if (!cloudEmail) {
      await signIn(provider, nickname, provider === 'email' ? email : undefined);
      setBusy(false);
      setProvider(null);
      return routeAfterLogin(from);
    }
    const res: AuthResult = emailMode === 'signup' ? await signUpEmail(email, password, nickname) : await signInEmail(email, password);
    setBusy(false);
    if (res.ok) {
      setProvider(null);
      setPassword('');
      return routeAfterLogin(from);
    }
    if (res.needsConfirm) setEmailMode('signin');
    setNotice(res.message);
    setFailDetail(res.detail ?? null);
  };

  const sheetSubtitle = cloudEmail
    ? emailMode === 'signup'
      ? `닉네임과 이메일, 비밀번호(${PASSWORD_MIN}자 이상)를 정해주세요.`
      : '가입한 이메일과 비밀번호를 입력해주세요.'
    : provider === 'email'
      ? '닉네임과 이메일을 알려주세요.'
      : '앱에서 불러드릴 닉네임을 알려주세요.';
  const sheetTitle = cloudEmail ? (emailMode === 'signup' ? '이메일로 가입' : '이메일로 로그인') : provider ? PROVIDER_TITLE[provider] : undefined;
  const cta = cloudEmail ? (emailMode === 'signup' ? '가입하고 시작하기' : '로그인') : '시작하기';

  const copy = COPY[from];
  const sub = cloud
    ? from === 'returning'
      ? '가입했던 방법으로 로그인해 주세요.'
      : '계정에 저장하면 휴대폰을 바꿔도 이어서 볼 수 있어요.'
    : '지금은 이 기기에만 저장돼요.';

  return (
    <Screen
      header={from === 'onboarding' ? undefined : <StackHeader onBack={leave} />}
      footer={
        from === 'returning' ? undefined : (
          <View style={styles.later}>
            <Button variant="ghost" title="나중에 할게요" onPress={from === 'onboarding' ? goToday : leave} disabled={oauthBusy !== null || busy} />
          </View>
        )
      }
    >
      <RichText variant="display" text={cloud || from === 'returning' ? copy.headline : '로그인하고\n**이어서** 써요'} style={[styles.headline, from !== 'onboarding' && styles.headlineUnderHeader]} />
      <Text variant="body" color="ink2" style={styles.sub}>
        {sub}
      </Text>

      <View style={[styles.illust, appleAvailable && styles.illustCompact]}>
        <MillyAvatar pose="cheer" size={appleAvailable ? 88 : 104} />
        <View style={styles.bubble}>
          <Text variant="caption" color="ink">
            {cloud ? copy.bubble : '로그인하면 이름으로\n불러드릴게요.'}
          </Text>
        </View>
      </View>

      <View style={styles.buttons}>
        <Button variant="kakao" title="카카오로 시작" onPress={() => void onSocial('kakao')} loading={oauthBusy === 'kakao'} disabled={oauthBusy !== null} />
        {appleAvailable ? (
          <Button variant="apple" title="Apple로 계속" onPress={() => void onSocial('apple')} loading={oauthBusy === 'apple'} disabled={oauthBusy !== null} />
        ) : null}
        <Button variant="google" title="Google로 계속" onPress={() => void onSocial('google')} loading={oauthBusy === 'google'} disabled={oauthBusy !== null} />
        <Button variant="email" title="이메일로 시작" onPress={() => openSheet('email')} disabled={oauthBusy !== null} />
      </View>

      {failDetail && provider === null ? (
        <Text variant="small" color="ink3" align="center" numberOfLines={2} selectable style={styles.detail}>
          원인: {failDetail}
        </Text>
      ) : null}

      <Text variant="small" color="ink3" align="center" style={styles.terms}>
        로그인하면 <Text variant="small" color="ink2" style={styles.underline}>이용약관</Text>과{' '}
        <Text variant="small" color="ink2" style={styles.underline}>개인정보처리방침</Text>에 동의하는 것으로 봐요.
      </Text>

      <BottomSheet
        visible={provider !== null}
        onClose={() => setProvider(null)}
        title={sheetTitle}
        subtitle={sheetSubtitle}
        footer={<Button title={cta} onPress={start} disabled={!canStart} loading={busy} />}
      >
        <View style={styles.sheetBody}>
          {!cloudEmail || emailMode === 'signup' ? (
            <Input kind="text" label="닉네임" icon="person-outline" value={nickname} onChangeText={setNickname} placeholder="예: 지은" maxLength={12} />
          ) : null}
          {provider === 'email' ? (
            <Input
              kind="text"
              label="이메일"
              icon="mail-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="name@example.com"
              keyboardType="email-address"
              error={email.length > 0 && !emailOk ? '이메일 형식을 확인해주세요.' : undefined}
            />
          ) : null}
          {cloudEmail ? (
            <Input
              kind="text"
              label="비밀번호"
              icon="lock-closed-outline"
              value={password}
              onChangeText={setPassword}
              placeholder={`${PASSWORD_MIN}자 이상`}
              secureTextEntry
              error={password.length > 0 && !passwordOk ? `비밀번호는 ${PASSWORD_MIN}자 이상으로 정해주세요.` : undefined}
            />
          ) : null}
          {cloudEmail && notice ? (
            <Text variant="caption" color="primaryText" style={styles.notice}>
              {notice}
            </Text>
          ) : null}
          {cloudEmail && failDetail ? (
            <Text variant="small" color="ink3" numberOfLines={2} selectable style={styles.notice}>
              원인: {failDetail}
            </Text>
          ) : null}
          {cloudEmail ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setNotice(null);
                setEmailMode((m) => (m === 'signup' ? 'signin' : 'signup'));
              }}
              style={styles.switch}
            >
              <Text variant="caption" color="ink2" align="center">
                {emailMode === 'signup' ? '이미 계정이 있어요 · ' : '처음이에요 · '}
                <Text variant="caption" color="primaryText" style={styles.underline}>
                  {emailMode === 'signup' ? '로그인' : '가입하기'}
                </Text>
              </Text>
            </Pressable>
          ) : null}
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headline: { marginTop: spacing.xxl },
  headlineUnderHeader: { marginTop: spacing.md },
  sub: { marginTop: spacing.sm },
  later: { alignItems: 'stretch' },
  illust: { flex: 1, minHeight: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  /** 버튼이 4개일 때 일러스트가 줄어들어 390×844 에서 스크롤 없이 들어가게 */
  illustCompact: { minHeight: 110 },
  bubble: { backgroundColor: colors.section, borderRadius: radius.lg, borderTopLeftRadius: 4, paddingHorizontal: 14, paddingVertical: 12, marginBottom: spacing.xl },
  buttons: { gap: 10 },
  terms: { marginTop: spacing.lg, marginBottom: spacing.md },
  detail: { marginTop: spacing.md },
  underline: { textDecorationLine: 'underline' },
  sheetBody: { gap: spacing.lg },
  notice: { marginTop: -spacing.xs },
  switch: { paddingVertical: spacing.xs },
});
