import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Input, LogoMark, Screen, Text, Wordmark, showToast } from '@/components';
import { isAppleSignInAvailable, PASSWORD_MIN } from '@/services/auth';
import { useDay } from '@/state/day';
import { useProfile } from '@/state/profile';
import { type AuthProvider, type AuthResult, useSession } from '@/state/session';
import { colors, fonts, spacing } from '@/theme';

const PROVIDER_TITLE: Record<AuthProvider, string> = {
  kakao: '카카오로 시작',
  apple: 'Apple로 계속',
  google: 'Google로 계속',
  email: '이메일로 시작',
};

/** 로그인 뒤: 프로필·오늘 기록을 새 저장소 기준으로 다시 읽고, 온보딩을 마쳤으면 오늘 탭으로 */
async function routeAfterLogin() {
  const profile = await useProfile.getState().load();
  void useDay.getState().load();
  router.replace(profile?.onboardingDone ? '/(tabs)/today' : '/(onboarding)/step1');
}

/**
 * A2 로그인 — 시안 docs/design/A2-login.png
 * - Supabase 미설정: 세 버튼 모두 닉네임 시트 → 이 기기에 세션 저장
 * - Supabase 설정: 카카오·Google 은 OAuth(시스템 브라우저), Apple 은 iOS 네이티브 시트 → signInWithIdToken,
 *   이메일은 이메일+비밀번호 가입/로그인 시트
 * - 버튼 순서: 카카오 → Apple(iOS 에서만) → Google → 이메일
 */
export default function LoginScreen() {
  const mode = useSession((s) => s.mode);
  const signIn = useSession((s) => s.signIn);
  const signUpEmail = useSession((s) => s.signUpEmail);
  const signInEmail = useSession((s) => s.signInEmail);
  const signInOAuth = useSession((s) => s.signInOAuth);
  const signInApple = useSession((s) => s.signInApple);
  const cloud = mode === 'supabase';

  const [provider, setProvider] = useState<AuthProvider | null>(null);
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  /** Supabase 이메일 시트: 가입 / 로그인 */
  const [emailMode, setEmailMode] = useState<'signup' | 'signin'>('signup');
  const [notice, setNotice] = useState<string | null>(null);
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
    setProvider(p);
  };

  const onSocial = async (p: 'kakao' | 'apple' | 'google') => {
    if (!cloud) return openSheet(p);
    if (oauthBusy) return;
    setOauthBusy(p);
    const res = p === 'apple' ? await signInApple() : await signInOAuth(p);
    setOauthBusy(null);
    if (res.ok) return routeAfterLogin();
    if (!res.cancelled) showToast(res.message, 'info');
  };

  const start = async () => {
    if (!provider || !canStart) return;
    setBusy(true);
    if (!cloudEmail) {
      await signIn(provider, nickname, provider === 'email' ? email : undefined);
      setBusy(false);
      setProvider(null);
      return routeAfterLogin();
    }
    const res: AuthResult = emailMode === 'signup' ? await signUpEmail(email, password, nickname) : await signInEmail(email, password);
    setBusy(false);
    if (res.ok) {
      setProvider(null);
      setPassword('');
      return routeAfterLogin();
    }
    if (res.needsConfirm) setEmailMode('signin');
    setNotice(res.message);
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

  return (
    <Screen>
      <View style={styles.brand}>
        <LogoMark size={48} />
        <Wordmark size={34} style={styles.wordmark} />
        <Text variant="body" color="ink2" style={styles.tagline}>
          오늘도, 나에게 맞는 한 끼
        </Text>
      </View>

      <Text variant="display" style={styles.headline}>
        건강한 한 끼를{'\n'}
        <Text variant="display" color="primaryText" style={styles.headlineText}>
          더 가볍게
        </Text>{' '}
        시작해요.
      </Text>

      <View style={[styles.illust, appleAvailable && styles.illustCompact]} accessibilityLabel="샐러드 일러스트">
        <View style={styles.illustCircle} />
        <Ionicons name="leaf" size={28} color={colors.gaugeFill} style={styles.leafA} />
        <Ionicons name="leaf" size={18} color={colors.primaryBorder} style={styles.leafB} />
        <Text style={styles.bowl}>🥗</Text>
        <View style={styles.caption}>
          <Text variant="caption" color="primaryText" style={styles.captionText}>
            좋은 식사가{'\n'}좋은 하루를 만들어요.
          </Text>
          <View style={styles.captionLine} />
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

      <View style={styles.terms}>
        <View style={styles.termsLine} />
        <Text variant="caption" color="ink2" align="center" style={styles.termsText}>
          시작하면 <Text variant="caption" color="ink2" style={styles.underline}>이용약관</Text>과{' '}
          <Text variant="caption" color="ink2" style={styles.underline}>개인정보처리방침</Text>에{'\n'}동의한 것으로 간주됩니다.
        </Text>
        <View style={styles.termsLine} />
      </View>

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
  brand: { marginTop: spacing.xxl, marginLeft: spacing.lg },
  wordmark: { marginTop: spacing.xs },
  tagline: { marginTop: 2, fontSize: 16 },
  headline: { marginTop: spacing.xxxl + spacing.xs, marginLeft: spacing.lg, fontSize: 30 },
  headlineText: { fontSize: 30 },
  illust: { flex: 1, minHeight: 170, maxHeight: 230, marginTop: spacing.md, alignItems: 'center', justifyContent: 'center' },
  /** 버튼이 4개일 때 일러스트가 줄어들어 390×844 에서 스크롤 없이 들어가게 */
  illustCompact: { minHeight: 120 },
  illustCircle: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: colors.primarySofter, left: '22%', top: '8%' },
  bowl: { fontSize: 120, lineHeight: 140, marginLeft: 30, marginTop: 20 },
  leafA: { position: 'absolute', left: '14%', top: '38%', transform: [{ rotate: '-20deg' }] },
  leafB: { position: 'absolute', left: '11%', top: '56%', transform: [{ rotate: '200deg' }] },
  caption: { position: 'absolute', right: 0, top: -4, transform: [{ rotate: '7deg' }] },
  captionText: { fontFamily: fonts.medium },
  captionLine: { width: 30, height: 2, borderRadius: 1, backgroundColor: colors.primary, marginTop: 10, marginLeft: 34 },
  buttons: { marginTop: spacing.lg, gap: spacing.md },
  terms: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xxl, marginBottom: spacing.lg },
  termsLine: { flex: 1, height: 1, backgroundColor: colors.line },
  termsText: { marginHorizontal: spacing.md },
  underline: { textDecorationLine: 'underline' },
  sheetBody: { gap: spacing.md },
  notice: { marginTop: -spacing.xs },
  switch: { paddingVertical: spacing.xs },
});
