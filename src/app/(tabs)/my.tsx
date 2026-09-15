import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, IconButton, ListRow, Text, showToast } from '@/components';
import { GOAL_DESCRIPTION, GOAL_LABEL, bmiInfo } from '@/data/labels';
import { DIET_TYPES } from '@/domain/diet';
import { useProfile } from '@/state/profile';
import { colors, fonts, radius, shadow, spacing } from '@/theme';

/** F1 마이 홈 — 시안 docs/design/F1-my.png */
export default function My() {
  const profile = useProfile((s) => s.profile);

  if (!profile) {
    return (
      <SafeAreaView edges={['top']} style={styles.root}>
        <EmptyState emoji="🌱" title="프로필을 불러오고 있어요" description="잠시만 기다려 주세요." actionLabel="처음으로" onAction={() => router.replace('/')} />
      </SafeAreaView>
    );
  }

  const { bmi, label: bmiLabel } = bmiInfo(profile.heightCm, profile.weightKg);
  const weightGoal = (profile.primaryGoal === 'lose' || profile.primaryGoal === 'gain') && profile.targetWeightKg != null;
  const diff = weightGoal ? Math.abs(Math.round((profile.weightKg - (profile.targetWeightKg ?? 0)) * 10) / 10) : 0;
  const diet = DIET_TYPES[profile.diet?.type ?? 'balanced'];
  const initial = profile.nickname.trim().slice(0, 1) || '나';

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="h1">마이</Text>
            <Text variant="body" color="ink2" style={styles.sub}>
              나의 건강한 변화를 위한 공간이에요.
            </Text>
          </View>
          <IconButton name="settings-outline" label="설정" size={28} onPress={() => router.push('/my/settings')} />
          <IconButton name="notifications-outline" label="알림" size={28} onPress={() => showToast('알림은 곧 열려요', 'info')} style={styles.bell} />
        </View>

        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={styles.profileText}>
            <Text style={styles.hello} numberOfLines={1}>
              {profile.nickname}님,
            </Text>
            <Text variant="body" color="ink2" style={styles.helloSub}>
              식사 습관을 천천히 다듬고 있어요.
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.push('/my/body')} style={({ pressed }) => [styles.editPill, pressed && { opacity: 0.8 }]}>
            <Text variant="captionMedium" color="ink2">
              프로필 수정
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.ink2} />
          </Pressable>
        </View>

        <View style={styles.tiles}>
          <InfoTile
            title="신체 정보"
            icon={<Ionicons name="body" size={17} color={colors.primary} />}
            iconBg={colors.primarySoft}
            onPress={() => router.push('/my/body')}
            pill={bmiLabel}
          >
            <KV k="키" v={`${profile.heightCm} cm`} />
            <KV k="몸무게" v={`${profile.weightKg} kg`} />
            <KV k="BMI" v={bmi.toFixed(1)} />
            <View style={styles.tileLine} />
          </InfoTile>

          <InfoTile
            title="목표"
            icon={<MaterialCommunityIcons name="bullseye-arrow" size={22} color={colors.protein} />}
            iconBg={colors.proteinBg}
            onPress={() => router.push('/my/goal')}
            pill={weightGoal ? '잘 하고 있어요 💚' : '꾸준히 함께해요 💚'}
          >
            <Text variant="caption" color="ink2">
              {weightGoal ? '목표 체중' : '주 목적'}
            </Text>
            <Text style={styles.tileBig} numberOfLines={1}>
              {weightGoal ? `${profile.targetWeightKg} kg` : GOAL_LABEL[profile.primaryGoal]}
            </Text>
            <Text variant="caption" color="ink2" style={styles.tileDesc}>
              {weightGoal
                ? diff > 0
                  ? `지금보다 ${diff} kg 더 건강한 나를 위해!`
                  : '목표에 거의 다 왔어요!'
                : GOAL_DESCRIPTION[profile.primaryGoal]}
            </Text>
          </InfoTile>

          <InfoTile
            title="식단 성향"
            icon={<Ionicons name="leaf" size={20} color={colors.primary} />}
            iconBg={colors.primarySoft}
            onPress={() => router.push('/my/diet')}
            pill="좋은 식습관이에요"
          >
            <Text style={styles.tileDiet} numberOfLines={1}>
              {diet.label}
            </Text>
            <Text variant="caption" color="ink2" numberOfLines={4} style={styles.tileDesc}>
              {diet.description}
            </Text>
          </InfoTile>
        </View>

        <View style={styles.listCard}>
          <ListRow title="내 정보" subtitle="키, 몸무게, 활동량을 관리해요." icon={<Ionicons name="person-outline" size={22} color={colors.ink2} />} iconBg={colors.sodiumBg} onPress={() => router.push('/my/body')} />
          <View style={styles.sep} />
          <ListRow title="목표 수정" subtitle="목적과 목표 체중, 기간을 수정할 수 있어요." icon={<MaterialCommunityIcons name="bullseye-arrow" size={22} color={colors.protein} />} iconBg={colors.proteinBg} onPress={() => router.push('/my/goal')} />
          <View style={styles.sep} />
          <ListRow title="식단 성향 수정" subtitle="나에게 맞는 식단을 다시 설정해요." icon={<Ionicons name="leaf" size={20} color={colors.primary} />} iconBg={colors.primarySoft} onPress={() => router.push('/my/diet')} />
          <View style={styles.sep} />
          <ListRow title="설정" subtitle="위치 권한, 데이터, 계정을 설정할 수 있어요." icon={<Ionicons name="settings-outline" size={22} color={colors.ink2} />} iconBg={colors.sodiumBg} onPress={() => router.push('/my/settings')} />
        </View>

        <Pressable accessibilityRole="button" onPress={() => router.push('/my/premium')} style={({ pressed }) => [styles.premium, pressed && { opacity: 0.9 }]}>
          <View style={styles.premiumText}>
            <View style={styles.premiumTop}>
              <Ionicons name="lock-closed" size={16} color={colors.primary} />
              <Text variant="bodyMedium" color="primaryText">
                프리미엄 미리보기
              </Text>
            </View>
            <Text style={styles.premiumTitle}>AI 종합 피드백</Text>
            <Text variant="caption" color="primaryText" style={styles.premiumSub}>
              지금보다 더 깊이 있는 분석을 경험해보세요.
            </Text>
          </View>
          <View style={styles.illo} pointerEvents="none">
            <View style={styles.illoCard}>
              {[14, 22, 30, 40].map((h, i) => (
                <View key={i} style={[styles.illoBar, { height: h, opacity: 0.45 + i * 0.18 }]} />
              ))}
            </View>
            <View style={styles.illoLock}>
              <Ionicons name="lock-closed" size={12} color={colors.primary} />
            </View>
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kv}>
      <Text variant="caption" color="ink2">
        {k}
      </Text>
      <Text variant="captionMedium">{v}</Text>
    </View>
  );
}

function InfoTile({ title, icon, iconBg, onPress, pill, children }: { title: string; icon: ReactNode; iconBg: string; onPress: () => void; pill: string; children: ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.9 }]}>
      <View style={styles.tileHead}>
        <View style={[styles.tileIcon, { backgroundColor: iconBg }]}>{icon}</View>
        <Text style={styles.tileTitle} numberOfLines={1}>
          {title}
        </Text>
        <Ionicons name="chevron-forward" size={12} color={colors.ink2} />
      </View>
      <View style={styles.tileBody}>{children}</View>
      <View style={styles.tilePill}>
        <Text style={styles.tilePillText} numberOfLines={1}>
          {pill}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.page, paddingBottom: spacing.xxxl },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.lg, gap: spacing.sm },
  headerText: { flex: 1 },
  sub: { marginTop: 0 },
  bell: { marginLeft: spacing.sm },
  profileRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 36, color: colors.primaryText },
  profileText: { flex: 1, marginLeft: spacing.lg },
  hello: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, color: colors.ink, marginRight: 112 },
  helloSub: { marginTop: 2, fontSize: 14 },
  editPill: { position: 'absolute', right: 0, top: 4, flexDirection: 'row', alignItems: 'center', gap: 2, height: 34, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surface, ...shadow.card },
  tiles: { flexDirection: 'row', gap: 5, marginTop: spacing.xl, marginHorizontal: -12 },
  tile: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 8, paddingTop: 12, paddingBottom: 10, ...shadow.card },
  tileHead: { flexDirection: 'row', alignItems: 'center' },
  tileIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  tileTitle: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, color: colors.ink, marginRight: 1 },
  tileBody: { flex: 1, marginTop: spacing.md },
  tileLine: { height: 1, backgroundColor: colors.lineSoft, marginTop: 6 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  tileBig: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, color: colors.ink, marginTop: 2 },
  tileDiet: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20, color: colors.ink },
  tileDesc: { marginTop: 6, fontSize: 12, lineHeight: 17 },
  tilePill: { marginTop: spacing.md, height: 28, borderRadius: radius.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tilePillText: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14, color: colors.primaryText },
  listCard: { marginTop: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, ...shadow.card },
  sep: { height: 1, backgroundColor: colors.lineSoft },
  premium: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, backgroundColor: colors.primarySoft, borderRadius: radius.lg, padding: spacing.lg + 2, overflow: 'hidden', minHeight: 110 },
  premiumText: { flex: 1 },
  premiumTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  premiumTitle: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 30, color: colors.ink, marginTop: 4 },
  premiumSub: { marginTop: 2 },
  illo: { width: 96, height: 76, alignItems: 'center', justifyContent: 'center' },
  illoCard: { width: 84, height: 60, borderRadius: 12, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 6, paddingBottom: 8, transform: [{ rotate: '-8deg' }], ...shadow.card },
  illoBar: { width: 10, borderRadius: 4, backgroundColor: colors.gaugeFill },
  illoLock: { position: 'absolute', top: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadow.card },
});
