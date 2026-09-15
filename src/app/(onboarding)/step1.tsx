import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Button, Card, OnboardingHeader, Screen, Text } from '@/components';
import { colors, spacing } from '@/theme';

function FeatureCard({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <Card padding={18} style={styles.feature}>
      <View style={styles.featureIcon}>{icon}</View>
      <Text variant="h3" style={styles.featureTitle}>
        {title}
      </Text>
    </Card>
  );
}

/** B1 인트로 — 시안 docs/design/B1-intro.png */
export default function Step1() {
  return (
    <Screen
      header={<OnboardingHeader step={1} layout="intro" />}
      footer={<Button title="시작하기" trailingChevron onPress={() => router.push('/(onboarding)/step2')} />}
    >
      <Text variant="display" align="center" style={styles.title}>
        먹기 전,{'\n'}더 가볍게 고르세요
      </Text>
      <Text variant="body" color="ink2" align="center" style={styles.sub}>
        남은 여유분과 주변 메뉴를 한눈에 보고,{'\n'}나에게 맞는 식사를 고를 수 있어요.
      </Text>

      <View style={styles.cards}>
        <FeatureCard
          title="오늘 목표량"
          icon={
            <View style={styles.ringIcon}>
              <Svg width={54} height={54} style={StyleSheet.absoluteFill}>
                <Circle cx={27} cy={27} r={23} stroke={colors.primarySoft} strokeWidth={5} fill="none" />
                <Circle cx={27} cy={27} r={23} stroke={colors.primary} strokeWidth={5} fill="none" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 23 * 0.72} 999`} transform="rotate(-90 27 27)" />
              </Svg>
              <MaterialCommunityIcons name="fire" size={22} color={colors.kcal} />
            </View>
          }
        />
        <FeatureCard title="주변 메뉴 판정" icon={<Ionicons name="location" size={40} color={colors.primary} />} />
        <FeatureCard
          title="간편 기록"
          icon={
            <View>
              <MaterialCommunityIcons name="file-document" size={40} color={colors.primary} />
              <View style={styles.plus}>
                <Ionicons name="add" size={14} color={colors.inkOnPrimary} />
              </View>
            </View>
          }
        />
      </View>

      <View style={styles.illust} accessibilityLabel="샐러드 일러스트">
        <View style={styles.illustCircle} />
        <View style={styles.illustBowl}>
          <Ionicons name="leaf" size={22} color={colors.primaryBorder} style={styles.leaf1} />
          <Ionicons name="leaf" size={14} color={colors.primaryBorder} style={styles.leaf2} />
          <Ionicons name="leaf" size={20} color={colors.primaryBorder} style={styles.leaf3} />
          <Text style={styles.bowl}>🥗</Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.xxl },
  sub: { marginTop: spacing.md, fontSize: 16, lineHeight: 25 },
  cards: { marginTop: spacing.xxl, gap: 10 },
  feature: { height: 108, flexDirection: 'row', alignItems: 'center', paddingVertical: 0 },
  featureIcon: { width: 74, height: 74, borderRadius: 37, backgroundColor: colors.primarySofter, alignItems: 'center', justifyContent: 'center' },
  featureTitle: { marginLeft: spacing.xl, fontSize: 18 },
  ringIcon: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center' },
  plus: { position: 'absolute', right: -6, bottom: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primaryDark, borderWidth: 2, borderColor: colors.primarySofter, alignItems: 'center', justifyContent: 'center' },
  illust: { flex: 1, minHeight: 90, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden', marginHorizontal: -spacing.page, marginBottom: -spacing.sm },
  illustCircle: { position: 'absolute', bottom: -150, width: 300, height: 260, borderRadius: 150, backgroundColor: colors.primarySofter },
  illustBowl: { width: 240, height: 90, alignItems: 'center' },
  bowl: { fontSize: 140, lineHeight: 160, marginTop: -8 },
  leaf1: { position: 'absolute', left: 6, top: 0, transform: [{ rotate: '-30deg' }] },
  leaf2: { position: 'absolute', left: -30, top: 50 },
  leaf3: { position: 'absolute', right: -10, top: 16, transform: [{ rotate: '40deg' }] },
});
