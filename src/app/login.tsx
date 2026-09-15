import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Input, Screen, Sprout, Text } from '@/components';
import { type AuthProvider, useSession } from '@/state/session';
import { colors, fonts, spacing } from '@/theme';

const PROVIDER_TITLE: Record<AuthProvider, string> = {
  kakao: '카카오로 시작',
  apple: 'Apple로 계속',
  email: '이메일로 시작',
};

/** A2 로그인 — 시안 docs/design/A2-login.png */
export default function LoginScreen() {
  const signIn = useSession((s) => s.signIn);
  const [provider, setProvider] = useState<AuthProvider | null>(null);
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canStart = nickname.trim().length > 0 && (provider !== 'email' || emailOk);

  const start = async () => {
    if (!provider || !canStart) return;
    setBusy(true);
    await signIn(provider, nickname, provider === 'email' ? email : undefined);
    setBusy(false);
    setProvider(null);
    router.replace('/(onboarding)/step1');
  };

  return (
    <Screen>
      <View style={styles.brand}>
        <Sprout size={42} />
        <Text variant="display" style={styles.wordmark}>
          식사 개인화
        </Text>
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

      <View style={styles.illust} accessibilityLabel="샐러드 일러스트">
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
        <Button variant="kakao" title="카카오로 시작" onPress={() => setProvider('kakao')} />
        <Button variant="apple" title="Apple로 계속" onPress={() => setProvider('apple')} />
        <Button variant="email" title="이메일로 시작" onPress={() => setProvider('email')} />
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
        title={provider ? PROVIDER_TITLE[provider] : undefined}
        subtitle={provider === 'email' ? '닉네임과 이메일을 알려주세요.' : '앱에서 불러드릴 닉네임을 알려주세요.'}
        footer={<Button title="시작하기" onPress={start} disabled={!canStart} loading={busy} />}
      >
        <View style={styles.sheetBody}>
          <Input kind="text" label="닉네임" icon="person-outline" value={nickname} onChangeText={setNickname} placeholder="예: 지은" maxLength={12} />
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
});
